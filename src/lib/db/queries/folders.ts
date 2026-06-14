// ─────────────────────────────────────────────
// Folder queries
// Folders form an adjacency list tree under each portfolio
// ─────────────────────────────────────────────

import { prisma } from '@/lib/db/prisma'
import { Prisma } from '@prisma/client'

// ─── Types ────────────────────────────────────

export type FolderRow = Awaited<ReturnType<typeof getFolders>>[number]

// ─── Queries ──────────────────────────────────

/**
 * All folders for a portfolio, flat list.
 * The caller assembles them into a tree (avoids recursive SQL).
 */
export async function getFolders(portfolioId: string, userId: string) {
  // Verify ownership via portfolio join
  return prisma.folder.findMany({
    where: {
      portfolioId,
      portfolio: { userId },
    },
    orderBy: [{ parentId: 'asc' }, { sortOrder: 'asc' }],
    select: {
      id: true,
      portfolioId: true,
      parentId: true,
      name: true,
      color: true,
      targetAllocationPct: true,
      sortOrder: true,
      isHiddenWhenShared: true,
      isWatchlist: true,
      createdAt: true,
    },
  })
}

/**
 * Create a folder. parentId = null → root folder.
 */
export async function createFolder(
  portfolioId: string,
  userId: string,
  data: {
    name: string
    parentId?: string | null
    color?: string
    targetAllocationPct?: number
    sortOrder?: number
    isWatchlist?: boolean
  }
) {
  // Verify portfolio ownership
  const portfolio = await prisma.portfolio.findFirst({
    where: { id: portfolioId, userId },
    select: { id: true },
  })
  if (!portfolio) return null

  return prisma.folder.create({
    data: {
      portfolioId,
      parentId: data.parentId ?? null,
      name: data.name,
      color: data.color,
      targetAllocationPct: data.targetAllocationPct
        ? new Prisma.Decimal(data.targetAllocationPct)
        : null,
      sortOrder: data.sortOrder ?? 0,
      isWatchlist: data.isWatchlist ?? false,
    },
  })
}

/**
 * Update folder metadata.
 */
export async function updateFolder(
  folderId: string,
  userId: string,
  data: {
    name?: string
    color?: string
    targetAllocationPct?: number | null
    sortOrder?: number
    isHiddenWhenShared?: boolean
  }
) {
  const folder = await prisma.folder.findFirst({
    where: { id: folderId, portfolio: { userId } },
    select: { id: true },
  })
  if (!folder) return null

  return prisma.folder.update({
    where: { id: folderId },
    data: {
      ...data,
      targetAllocationPct:
        data.targetAllocationPct !== undefined
          ? data.targetAllocationPct !== null
            ? new Prisma.Decimal(data.targetAllocationPct)
            : null
          : undefined,
    },
  })
}

/**
 * Delete a folder (cascades holdings & lots in DB).
 */
export async function deleteFolder(folderId: string, userId: string) {
  const folder = await prisma.folder.findFirst({
    where: { id: folderId, portfolio: { userId } },
    select: { id: true },
  })
  if (!folder) return null

  return prisma.folder.delete({ where: { id: folderId } })
}

/**
 * Get a single folder with parent info (for breadcrumb and folder page).
 */
export async function getFolderById(folderId: string, userId: string) {
  return prisma.folder.findFirst({
    where: { id: folderId, portfolio: { userId } },
    select: {
      id: true,
      portfolioId: true,
      parentId: true,
      name: true,
      color: true,
      targetAllocationPct: true,
      sortOrder: true,
      isHiddenWhenShared: true,
      isWatchlist: true,
      createdAt: true,
      parent: {
        select: { id: true, name: true, parentId: true },
      },
      children: {
        select: {
          id: true,
          name: true,
          color: true,
          targetAllocationPct: true,
          parentId: true,
          isWatchlist: true,
        },
        orderBy: { sortOrder: 'asc' },
      },
    },
  })
}

// ─── Tree assembler ───────────────────────────

export type FolderNode = FolderRow & { children: FolderNode[] }

/**
 * Converts a flat folder list (from getFolders) into a nested tree.
 * Runs entirely in JS — no extra DB round trips.
 */
export function buildFolderTree(folders: FolderRow[]): FolderNode[] {
  const map = new Map<string, FolderNode>()

  for (const f of folders) {
    map.set(f.id, { ...f, children: [] })
  }

  const roots: FolderNode[] = []

  for (const node of map.values()) {
    if (node.parentId && map.has(node.parentId)) {
      map.get(node.parentId)!.children.push(node)
    } else {
      roots.push(node)
    }
  }

  return roots
}
