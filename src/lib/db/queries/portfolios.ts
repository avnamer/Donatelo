// ─────────────────────────────────────────────
// Portfolio queries
// All functions receive userId from the caller (server action / route handler)
// Never trust client-supplied userId — always derive from session
// ─────────────────────────────────────────────

import { cache } from 'react'
import { prisma } from '@/lib/db/prisma'

// ─── Types ────────────────────────────────────

export type PortfolioRow = Awaited<ReturnType<typeof getPortfolios>>[number]

export type PortfolioWithStructure = Awaited<
  ReturnType<typeof getPortfolioWithStructure>
>

// ─── Queries ──────────────────────────────────

/**
 * All portfolios for a user, newest first.
 * cache() deduplicates calls within a single request (layout + page both call this).
 */
export const getPortfolios = cache(async function getPortfolios(userId: string) {
  return prisma.portfolio.findMany({
    where: { userId },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      name: true,
      baseCurrency: true,
      createdAt: true,
      updatedAt: true,
    },
  })
})

/**
 * Single portfolio + full tree (folders → holdings → lots).
 * Returns null if not found or not owned by userId.
 */
export async function getPortfolioWithStructure(
  portfolioId: string,
  userId: string
) {
  return prisma.portfolio.findFirst({
    where: { id: portfolioId, userId },
    include: {
      folders: {
        orderBy: [{ parentId: 'asc' }, { sortOrder: 'asc' }],
        include: {
          holdings: {
            where: { isActive: true },
            orderBy: { createdAt: 'asc' },
            include: {
              lots: {
                orderBy: { purchaseDate: 'asc' },
              },
            },
          },
        },
      },
      cashAccounts: {
        orderBy: { createdAt: 'asc' },
      },
    },
  })
}

/**
 * Create a new portfolio for a user.
 */
export async function createPortfolio(
  userId: string,
  data: { name: string; baseCurrency?: string }
) {
  return prisma.portfolio.create({
    data: {
      userId,
      name: data.name,
      baseCurrency: data.baseCurrency ?? 'ILS',
    },
  })
}

/**
 * Rename / update a portfolio.
 * Validates ownership before updating.
 */
export async function updatePortfolio(
  portfolioId: string,
  userId: string,
  data: { name?: string; baseCurrency?: string }
) {
  // Ownership check first
  const existing = await prisma.portfolio.findFirst({
    where: { id: portfolioId, userId },
    select: { id: true },
  })
  if (!existing) return null

  return prisma.portfolio.update({
    where: { id: portfolioId },
    data,
  })
}

/**
 * Flat list of active holdings for a portfolio (for chat context).
 */
export async function getPortfolioHoldingsSummary(portfolioId: string, userId: string) {
  const portfolio = await prisma.portfolio.findFirst({
    where: { id: portfolioId, userId },
    include: {
      folders: {
        include: {
          holdings: {
            where: { isActive: true },
            select: { id: true, name: true, tickerSymbol: true, exchange: true },
          },
        },
      },
    },
  })
  return portfolio?.folders.flatMap((f) => f.holdings) ?? []
}

/**
 * Delete a portfolio and all its children (cascade in DB).
 */
export async function deletePortfolio(portfolioId: string, userId: string) {
  const existing = await prisma.portfolio.findFirst({
    where: { id: portfolioId, userId },
    select: { id: true },
  })
  if (!existing) return null

  return prisma.portfolio.delete({ where: { id: portfolioId } })
}
