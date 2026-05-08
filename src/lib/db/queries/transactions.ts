// ─────────────────────────────────────────────
// Transaction queries — Activity feed
// ─────────────────────────────────────────────

import { prisma } from '@/lib/db/prisma'

// ─── Types ────────────────────────────────────

export type TransactionRow = Awaited<
  ReturnType<typeof getTransactions>
>['items'][number]

export type TransactionType =
  | 'SECURITY_BUY'
  | 'SECURITY_SELL'
  | 'DIVIDEND'
  | 'CASH_DEPOSIT'
  | 'CASH_WITHDRAWAL'

// ─── Queries ──────────────────────────────────

/**
 * Paginated transaction list for a portfolio.
 * Returns { items, total, hasMore }.
 */
export async function getTransactions(
  portfolioId: string,
  userId: string,
  opts: {
    page?: number
    pageSize?: number
    type?: TransactionType
    holdingId?: string
    from?: Date
    to?: Date
  } = {}
) {
  const { page = 1, pageSize = 50, type, holdingId, from, to } = opts
  const skip = (page - 1) * pageSize

  const where = {
    portfolioId,
    portfolio: { userId },
    ...(type && { type }),
    ...(holdingId && { holdingId }),
    ...(from || to
      ? {
          date: {
            ...(from && { gte: from }),
            ...(to && { lte: to }),
          },
        }
      : {}),
  }

  const [items, total] = await prisma.$transaction([
    prisma.transaction.findMany({
      where,
      orderBy: { date: 'desc' },
      skip,
      take: pageSize,
      include: {
        holding: { select: { tickerSymbol: true, name: true, exchange: true } },
        cashAccount: { select: { name: true, currency: true } },
      },
    }),
    prisma.transaction.count({ where }),
  ])

  return {
    items,
    total,
    page,
    pageSize,
    hasMore: skip + items.length < total,
  }
}

/**
 * Record a transaction.
 * amount is in agorot/cents (smallest unit).
 */
export async function createTransaction(
  portfolioId: string,
  userId: string,
  data: {
    type: TransactionType
    date: Date
    amount: bigint
    currency: string
    holdingId?: string
    lotId?: string
    cashAccountId?: string
    shares?: number
    pricePerShare?: bigint
    realizedGain?: bigint
    notes?: string
  }
) {
  // Ownership check
  const portfolio = await prisma.portfolio.findFirst({
    where: { id: portfolioId, userId },
    select: { id: true },
  })
  if (!portfolio) return null

  return prisma.transaction.create({
    data: {
      portfolioId,
      type: data.type,
      date: data.date,
      amount: data.amount,
      currency: data.currency,
      holdingId: data.holdingId,
      lotId: data.lotId,
      cashAccountId: data.cashAccountId,
      shares: data.shares != null
        ? data.shares.toString()  // Prisma Decimal accepts string
        : null,
      pricePerShare: data.pricePerShare,
      realizedGain: data.realizedGain,
      notes: data.notes,
    },
  })
}

/**
 * All dividend transactions for a holding, used for yield calculations.
 */
export async function getDividendsForHolding(
  holdingId: string,
  userId: string,
  since?: Date
) {
  return prisma.transaction.findMany({
    where: {
      holdingId,
      holding: { folder: { portfolio: { userId } } },
      type: 'DIVIDEND',
      ...(since && { date: { gte: since } }),
    },
    orderBy: { date: 'desc' },
    select: {
      id: true,
      date: true,
      amount: true,
      currency: true,
      shares: true,
    },
  })
}

/**
 * Summary totals per type — used for the Activity page stats bar.
 */
export async function getTransactionSummary(
  portfolioId: string,
  userId: string,
  from?: Date
) {
  const rows = await prisma.transaction.groupBy({
    by: ['type'],
    where: {
      portfolioId,
      portfolio: { userId },
      ...(from && { date: { gte: from } }),
    },
    _sum: { amount: true },
    _count: { id: true },
  })

  return rows.map((r) => ({
    type: r.type as TransactionType,
    totalAmount: r._sum.amount ?? 0n,
    count: r._count.id,
  }))
}
