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
  | 'COMMISSION'
  | 'FX_CONVERSION'

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
        ? data.shares.toString()
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

// ─── Sync (dedup + backfill) ──────────────────

/**
 * Single entry-point called on every Activity page load.
 *
 * Does ONE fast query to decide if anything needs fixing:
 *   • Unlinked lots  → missing BUY/SELL transactions
 *   • Duplicate rows → same lotId appearing more than once
 *
 * If the data is already clean the function returns immediately with zero
 * writes. Otherwise it deduplicates first, then backfills missing records.
 */
export async function syncActivityData(
  portfolioId: string,
  userId: string,
): Promise<void> {
  const portfolio = await prisma.portfolio.findFirst({
    where: { id: portfolioId, userId },
    select: { id: true },
  })
  if (!portfolio) return

  // ── Quick dirty-check ─────────────────────────────────────────────────
  // Count lots with no linked BUY transaction AND count any lotId that
  // appears more than once — all in two cheap queries.
  const [unlinkedCount, dupCheck] = await Promise.all([
    // Lots without a BUY transaction linked to them
    prisma.lot.count({
      where: {
        holding: { folder: { portfolioId } },
        NOT: { transactions: { some: { type: 'SECURITY_BUY' } } },
      },
    }),
    // Any SECURITY_BUY with lotId that appears ≥2 times (indicates dupes)
    prisma.transaction.groupBy({
      by: ['lotId'],
      where: { portfolioId, type: 'SECURITY_BUY', lotId: { not: null } },
      _count: { id: true },
      having: { id: { _count: { gt: 1 } } },
    }),
  ])

  const hasDuplicates  = dupCheck.length > 0
  const hasUnlinked    = unlinkedCount > 0

  if (!hasDuplicates && !hasUnlinked) return  // ✓ everything is clean

  if (hasDuplicates)  await deduplicateTransactions(portfolioId, userId)
  if (hasUnlinked)    await backfillTransactionsFromLots(portfolioId, userId)
}

// ─── Deduplication ────────────────────────────

/**
 * Remove duplicate SECURITY_BUY / SECURITY_SELL transactions.
 *
 * Three classes of duplicates are handled:
 *
 * 1. Same lotId appears on multiple transactions of the same type
 *    (e.g. backfill ran several times before the idempotency fix).
 *    → Keep the oldest; delete the rest.
 *
 * 2. Unlinked transaction (lotId = null) whose (holdingId + date) is already
 *    covered by a lot-linked transaction.
 *    → Delete the unlinked one — the linked record is authoritative.
 *
 * 3. Multiple unlinked transactions for the same (holdingId + date).
 *    → Keep the oldest; delete the rest. (Backfill will link it later.)
 */
export async function deduplicateTransactions(
  portfolioId: string,
  userId: string,
): Promise<{ deleted: number }> {
  const portfolio = await prisma.portfolio.findFirst({
    where: { id: portfolioId, userId },
    select: { id: true },
  })
  if (!portfolio) return { deleted: 0 }

  const toDelete = new Set<string>()

  // ── 1. Duplicate-lotId rows (same lotId + type) ────────────────────────
  for (const txType of ['SECURITY_BUY', 'SECURITY_SELL'] as const) {
    const rows = await prisma.transaction.findMany({
      where: { portfolioId, type: txType, lotId: { not: null } },
      select: { id: true, lotId: true, createdAt: true },
      orderBy: { createdAt: 'asc' },  // oldest first → we keep the first
    })

    const seen = new Map<string, string>() // lotId → first (kept) id
    for (const row of rows) {
      if (!row.lotId) continue
      if (seen.has(row.lotId)) {
        toDelete.add(row.id)            // duplicate — delete
      } else {
        seen.set(row.lotId, row.id)     // first occurrence — keep
      }
    }
  }

  // ── 2 & 3. Unlinked BUY duplicates ────────────────────────────────────
  // Build a set of (holdingId:date) keys that already have a linked BUY.
  const linkedBuys = await prisma.transaction.findMany({
    where: { portfolioId, type: 'SECURITY_BUY', lotId: { not: null } },
    select: { holdingId: true, date: true },
  })
  const linkedKeys = new Set(
    linkedBuys.map(t => `${t.holdingId}:${new Date(t.date).toISOString().slice(0, 10)}`)
  )

  const unlinkedBuys = await prisma.transaction.findMany({
    where: { portfolioId, type: 'SECURITY_BUY', lotId: null },
    select: { id: true, holdingId: true, date: true },
    orderBy: { createdAt: 'asc' },
  })

  const unlinkedSeen = new Map<string, string>() // key → first kept id
  for (const row of unlinkedBuys) {
    if (!row.holdingId) continue
    const k = `${row.holdingId}:${new Date(row.date).toISOString().slice(0, 10)}`

    if (linkedKeys.has(k)) {
      // Class 2: a linked record already covers this slot — delete unlinked copy
      toDelete.add(row.id)
    } else if (unlinkedSeen.has(k)) {
      // Class 3: already keeping another unlinked row for this slot — delete this one
      toDelete.add(row.id)
    } else {
      unlinkedSeen.set(k, row.id)
    }
  }

  if (toDelete.size === 0) return { deleted: 0 }

  await prisma.transaction.deleteMany({ where: { id: { in: [...toDelete] } } })
  return { deleted: toDelete.size }
}

// ─── Backfill ─────────────────────────────────

/**
 * Quick check: are there any lots that don't yet have a linked SECURITY_BUY
 * transaction? Used to decide whether to run the full backfill.
 */
export async function hasUnlinkedLots(
  portfolioId: string,
  userId: string
): Promise<boolean> {
  const portfolio = await prisma.portfolio.findFirst({
    where: { id: portfolioId, userId },
    select: { id: true },
  })
  if (!portfolio) return false

  const count = await prisma.lot.count({
    where: {
      holding: { folder: { portfolioId } },
      // No SECURITY_BUY transaction is linked to this lot
      NOT: { transactions: { some: { type: 'SECURITY_BUY' } } },
    },
  })
  return count > 0
}

/**
 * Backfill SECURITY_BUY and SECURITY_SELL transactions from existing lots.
 *
 * Idempotent — safe to run multiple times:
 * • Lots already linked to a buy transaction are skipped.
 * • Existing SECURITY_BUY transactions with no lotId that match on
 *   (holdingId + purchaseDate) are *linked* to the lot instead of
 *   duplicated; exact-match duplicates within that group are deleted.
 * • SECURITY_SELL is handled independently from BUY so a lot that already
 *   has a buy transaction will still get a sell created if one is missing.
 */
export async function backfillTransactionsFromLots(
  portfolioId: string,
  userId: string
): Promise<{ created: number; linked: number; deduplicated: number }> {
  const portfolio = await prisma.portfolio.findFirst({
    where: { id: portfolioId, userId },
    select: { id: true },
  })
  if (!portfolio) return { created: 0, linked: 0, deduplicated: 0 }

  const lots = await prisma.lot.findMany({
    where: { holding: { folder: { portfolioId } } },
    orderBy: { purchaseDate: 'asc' },
  })
  if (lots.length === 0) return { created: 0, linked: 0, deduplicated: 0 }

  // ── Which lots already have a linked BUY / SELL? ──────────────────────
  const lotTxs = await prisma.transaction.findMany({
    where: { portfolioId, lotId: { not: null } },
    select: { lotId: true, type: true },
  })
  const hasBuyForLot  = new Set<string>()
  const hasSellForLot = new Set<string>()
  for (const t of lotTxs) {
    if (!t.lotId) continue
    if (t.type === 'SECURITY_BUY')  hasBuyForLot.add(t.lotId)
    if (t.type === 'SECURITY_SELL') hasSellForLot.add(t.lotId)
  }

  // ── Orphaned BUY transactions (no lotId) keyed by holdingId:dateStr ───
  // Sorted by createdAt asc so the oldest one is "kept" and newer ones deleted.
  const unlinked = await prisma.transaction.findMany({
    where: { portfolioId, type: 'SECURITY_BUY', lotId: null },
    select: { id: true, holdingId: true, date: true, amount: true },
    orderBy: { createdAt: 'asc' },
  })
  // key → [id, id, ...] — first entry is the candidate to keep
  const orphansByKey = new Map<string, string[]>()
  for (const t of unlinked) {
    if (!t.holdingId) continue
    const k = `${t.holdingId}:${new Date(t.date).toISOString().slice(0, 10)}`
    const arr = orphansByKey.get(k) ?? []
    arr.push(t.id)
    orphansByKey.set(k, arr)
  }

  let created = 0, linked = 0, deduplicated = 0

  for (const lot of lots) {
    const dateStr  = new Date(lot.purchaseDate).toISOString().slice(0, 10)
    const totalCost = BigInt(Math.round(Number(lot.shares) * Number(lot.costPerShare)))

    // ─── BUY ──────────────────────────────────────────────────────────
    if (!hasBuyForLot.has(lot.id)) {
      const k       = `${lot.holdingId}:${dateStr}`
      const orphans = orphansByKey.get(k)

      if (orphans && orphans.length > 0) {
        // Link the oldest orphan to this lot and update its fields to match
        const [keep, ...dupes] = orphans
        await prisma.transaction.update({
          where: { id: keep },
          data: {
            lotId:         lot.id,
            shares:        lot.shares,
            pricePerShare: lot.costPerShare,
            amount:        totalCost,
            currency:      lot.costCurrency ?? 'ILS',
          },
        })
        linked++

        // Delete the remaining exact duplicates for this slot
        if (dupes.length > 0) {
          await prisma.transaction.deleteMany({ where: { id: { in: dupes } } })
          deduplicated += dupes.length
        }
        orphansByKey.delete(k)
      } else {
        await prisma.transaction.create({
          data: {
            portfolioId,
            type:          'SECURITY_BUY',
            date:          lot.purchaseDate,
            amount:        totalCost,
            currency:      lot.costCurrency ?? 'ILS',
            holdingId:     lot.holdingId,
            lotId:         lot.id,
            shares:        lot.shares,
            pricePerShare: lot.costPerShare,
            notes:         lot.notes ?? null,
          },
        })
        created++
      }
    }

    // ─── SELL ─────────────────────────────────────────────────────────
    // Check independently from BUY — a lot that already has a BUY may
    // still be missing its SELL if it was sold after the last backfill.
    const soldShares = Number(lot.soldShares ?? 0)
    if (
      soldShares > 0 &&
      lot.soldPricePerShare &&
      lot.soldDate &&
      lot.proceedsFromSale &&
      !hasSellForLot.has(lot.id)
    ) {
      await prisma.transaction.create({
        data: {
          portfolioId,
          type:          'SECURITY_SELL',
          date:          lot.soldDate,
          amount:        lot.proceedsFromSale,
          currency:      lot.costCurrency ?? 'ILS',
          holdingId:     lot.holdingId,
          lotId:         lot.id,
          shares:        lot.soldShares,
          pricePerShare: lot.soldPricePerShare,
        },
      })
      created++
    }
  }

  return { created, linked, deduplicated }
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
