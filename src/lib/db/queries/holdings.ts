// ─────────────────────────────────────────────
// Holding & Lot queries
// ─────────────────────────────────────────────

import { prisma } from '@/lib/db/prisma'
import { Prisma } from '@prisma/client'

// ─── Types ────────────────────────────────────

export type HoldingWithLots = Awaited<ReturnType<typeof getHoldingWithLots>>

// ─── Holding queries ──────────────────────────

/**
 * All active holdings for a folder, including their lots.
 */
export async function getHoldingsForFolder(folderId: string, userId: string) {
  return prisma.holding.findMany({
    where: {
      folderId,
      folder: { portfolio: { userId } },
      isActive: true,
    },
    orderBy: { createdAt: 'asc' },
    include: {
      lots: { orderBy: { purchaseDate: 'asc' } },
    },
  })
}

/**
 * All active holdings for an entire portfolio, grouped with lots.
 * Used for the Home page summary and performance calculations.
 */
export async function getHoldingsForPortfolio(
  portfolioId: string,
  userId: string
) {
  return prisma.holding.findMany({
    where: {
      folder: { portfolioId, portfolio: { userId } },
      isActive: true,
    },
    orderBy: { createdAt: 'asc' },
    include: {
      lots: { orderBy: { purchaseDate: 'asc' } },
      folder: {
        select: { id: true, name: true, color: true, parentId: true },
      },
    },
  })
}

/**
 * Single holding with all lots (active + sold).
 */
export async function getHoldingWithLots(holdingId: string, userId: string) {
  return prisma.holding.findFirst({
    where: {
      id: holdingId,
      folder: { portfolio: { userId } },
    },
    include: {
      lots: { orderBy: { purchaseDate: 'asc' } },
      folder: { select: { id: true, name: true, portfolioId: true } },
    },
  })
}

/**
 * Create a new holding inside a folder.
 */
export async function createHolding(
  folderId: string,
  userId: string,
  data: {
    tickerSymbol: string
    exchange: string
    name: string
    expenseRatio?: number
    targetAllocationPct?: number
    targetFolderId?: string
  }
) {
  const folder = await prisma.folder.findFirst({
    where: { id: folderId, portfolio: { userId } },
    select: { id: true },
  })
  if (!folder) return null

  return prisma.holding.create({
    data: {
      folderId,
      tickerSymbol: data.tickerSymbol.toUpperCase(),
      exchange: data.exchange,
      name: data.name,
      expenseRatio: data.expenseRatio
        ? new Prisma.Decimal(data.expenseRatio)
        : null,
      targetAllocationPct: data.targetAllocationPct
        ? new Prisma.Decimal(data.targetAllocationPct)
        : null,
      targetFolderId: data.targetFolderId ?? null,
    },
  })
}

/**
 * Update holding metadata (name, expense ratio, target allocation).
 */
export async function updateHolding(
  holdingId: string,
  userId: string,
  data: {
    name?: string
    expenseRatio?: number | null
    targetAllocationPct?: number | null
    isActive?: boolean
    folderId?: string
  }
) {
  const holding = await prisma.holding.findFirst({
    where: { id: holdingId, folder: { portfolio: { userId } } },
    select: { id: true },
  })
  if (!holding) return null

  if (data.folderId) {
    const targetFolder = await prisma.folder.findFirst({
      where: { id: data.folderId, portfolio: { userId } },
      select: { id: true },
    })
    if (!targetFolder) return null
  }

  return prisma.holding.update({
    where: { id: holdingId },
    data: {
      ...data,
      expenseRatio:
        data.expenseRatio !== undefined
          ? data.expenseRatio !== null
            ? new Prisma.Decimal(data.expenseRatio)
            : null
          : undefined,
      targetAllocationPct:
        data.targetAllocationPct !== undefined
          ? data.targetAllocationPct !== null
            ? new Prisma.Decimal(data.targetAllocationPct)
            : null
          : undefined,
    },
  })
}

// ─── Lot queries ──────────────────────────────

/**
 * Add a purchase lot to a holding.
 * costPerShare is in the smallest unit (agorot or cents).
 */
export async function createLot(
  holdingId: string,
  userId: string,
  data: {
    purchaseDate: Date
    shares: number
    costPerShare: bigint       // agorot (ILS×100) or cents (USD×100)
    costCurrency: string
    accountType?: string
    notes?: string
  }
) {
  const holding = await prisma.holding.findFirst({
    where: { id: holdingId, folder: { portfolio: { userId } } },
    select: { id: true },
  })
  if (!holding) return null

  return prisma.lot.create({
    data: {
      holdingId,
      purchaseDate: data.purchaseDate,
      shares: new Prisma.Decimal(data.shares),
      costPerShare: data.costPerShare,
      costCurrency: data.costCurrency,
      accountType: data.accountType,
      notes: data.notes,
    },
  })
}

/**
 * Record a (partial or full) sale against a lot.
 * soldShares, soldPricePerShare, proceedsFromSale are in smallest unit.
 */
export async function sellLot(
  lotId: string,
  userId: string,
  data: {
    soldShares: number
    soldDate: Date
    soldPricePerShare: bigint
    proceedsFromSale: bigint
  }
) {
  const lot = await prisma.lot.findFirst({
    where: {
      id: lotId,
      holding: { folder: { portfolio: { userId } } },
    },
    select: { id: true, shares: true, soldShares: true },
  })
  if (!lot) return null

  return prisma.lot.update({
    where: { id: lotId },
    data: {
      soldShares: new Prisma.Decimal(lot.soldShares).plus(data.soldShares),
      soldDate: data.soldDate,
      soldPricePerShare: data.soldPricePerShare,
      proceedsFromSale: data.proceedsFromSale,
    },
  })
}

/**
 * Edit an existing lot's purchase details.
 */
export async function editLot(
  lotId: string,
  userId: string,
  data: {
    purchaseDate: Date
    shares: number
    costPerShare: bigint
    costCurrency: string
    accountType?: string
    notes?: string
  }
) {
  const lot = await prisma.lot.findFirst({
    where: {
      id: lotId,
      holding: { folder: { portfolio: { userId } } },
    },
    select: { id: true },
  })
  if (!lot) return null

  return prisma.lot.update({
    where: { id: lotId },
    data: {
      purchaseDate: data.purchaseDate,
      shares: new Prisma.Decimal(data.shares),
      costPerShare: data.costPerShare,
      costCurrency: data.costCurrency,
      accountType: data.accountType ?? null,
      notes: data.notes ?? null,
    },
  })
}

/**
 * Delete a lot (only allowed if no transactions reference it).
 */
export async function deleteLot(lotId: string, userId: string) {
  const lot = await prisma.lot.findFirst({
    where: {
      id: lotId,
      holding: { folder: { portfolio: { userId } } },
    },
    select: { id: true },
  })
  if (!lot) return null

  return prisma.lot.delete({ where: { id: lotId } })
}

/**
 * Atomically creates a lot and moves a watchlist holding to its targetFolder.
 * Also creates a SECURITY_BUY transaction.
 */
export async function purchaseWatchlistHolding(
  holdingId: string,
  userId: string,
  data: {
    purchaseDate: Date
    shares: number
    costPerShare: bigint
    costCurrency: string
    accountType?: string
    notes?: string
  }
) {
  const holding = await prisma.holding.findFirst({
    where: { id: holdingId, folder: { portfolio: { userId } } },
    select: { id: true, targetFolderId: true, folder: { select: { portfolioId: true } } },
  })
  if (!holding) return null
  if (!holding.targetFolderId) return null

  return prisma.$transaction(async (tx) => {
    const targetFolder = await tx.folder.findFirst({
      where: { id: holding.targetFolderId!, portfolio: { userId } },
      select: { id: true },
    })
    if (!targetFolder) throw new Error('Target folder not found or not owned by user')

    const lot = await tx.lot.create({
      data: {
        holdingId,
        purchaseDate: data.purchaseDate,
        shares: new Prisma.Decimal(data.shares),
        costPerShare: data.costPerShare,
        costCurrency: data.costCurrency,
        accountType: data.accountType ?? null,
        notes: data.notes ?? null,
      },
    })

    await tx.holding.update({
      where: { id: holdingId },
      data: { folderId: holding.targetFolderId!, targetFolderId: null },
    })

    const totalCost = BigInt(Math.round(data.shares * Number(data.costPerShare)))
    await tx.transaction.create({
      data: {
        portfolioId: holding.folder.portfolioId,
        type: 'SECURITY_BUY',
        date: data.purchaseDate,
        amount: totalCost,
        currency: data.costCurrency,
        holdingId,
        lotId: lot.id,
        shares: new Prisma.Decimal(data.shares),
        pricePerShare: data.costPerShare,
        notes: data.notes ?? null,
      },
    })

    return lot
  })
}
