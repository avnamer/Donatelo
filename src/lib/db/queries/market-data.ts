// ─────────────────────────────────────────────
// Market data queries — Price cache, Dividend cache, FX rates
// These are shared (no userId) — cached per ticker, not per user
// ─────────────────────────────────────────────

import { prisma } from '@/lib/db/prisma'

// ─── Price cache ──────────────────────────────

/**
 * Latest cached price for a ticker.
 * Returns null if not cached or older than maxAgeMinutes.
 */
export async function getCachedPrice(
  tickerSymbol: string,
  maxAgeMinutes = 60
) {
  const cutoff = new Date(Date.now() - maxAgeMinutes * 60 * 1000)
  return prisma.priceCache.findFirst({
    where: {
      tickerSymbol,
      fetchedAt: { gte: cutoff },
    },
    orderBy: { priceDate: 'desc' },
  })
}

/**
 * Batch-fetch latest cached prices for multiple tickers.
 * Returns a Map<tickerSymbol, PriceCache>.
 */
export async function getCachedPrices(
  tickers: string[],
  maxAgeMinutes = 60
): Promise<Map<string, { price: bigint; currency: string; priceDate: Date }>> {
  if (tickers.length === 0) return new Map()

  const cutoff = new Date(Date.now() - maxAgeMinutes * 60 * 1000)

  // Get the most recent cached entry per ticker
  const rows = await prisma.priceCache.findMany({
    where: {
      tickerSymbol: { in: tickers },
      fetchedAt: { gte: cutoff },
    },
    orderBy: { priceDate: 'desc' },
    distinct: ['tickerSymbol'],
    select: {
      tickerSymbol: true,
      price: true,
      currency: true,
      priceDate: true,
    },
  })

  return new Map(rows.map((r) => [r.tickerSymbol, r]))
}

/**
 * Upsert (insert or update) a price entry.
 * price is in agorot (TASE) or cents (US).
 */
export async function upsertPrice(data: {
  tickerSymbol: string
  exchange: string
  price: bigint
  currency: string
  priceDate: Date
}) {
  return prisma.priceCache.upsert({
    where: {
      tickerSymbol_priceDate: {
        tickerSymbol: data.tickerSymbol,
        priceDate: data.priceDate,
      },
    },
    update: {
      price: data.price,
      currency: data.currency,
      fetchedAt: new Date(),
    },
    create: {
      tickerSymbol: data.tickerSymbol,
      exchange: data.exchange,
      price: data.price,
      currency: data.currency,
      priceDate: data.priceDate,
    },
  })
}

/**
 * Historical prices for a ticker between two dates.
 * Used for performance chart calculations.
 */
export async function getHistoricalPrices(
  tickerSymbol: string,
  from: Date,
  to: Date
) {
  return prisma.priceCache.findMany({
    where: {
      tickerSymbol,
      priceDate: { gte: from, lte: to },
    },
    orderBy: { priceDate: 'asc' },
    select: { priceDate: true, price: true, currency: true },
  })
}

// ─── Dividend cache ───────────────────────────

/**
 * Dividend events for a ticker in the trailing 12 months.
 * Used for dividend yield calculations.
 */
export async function getTrailingDividends(tickerSymbol: string) {
  const oneYearAgo = new Date()
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1)

  return prisma.dividendCache.findMany({
    where: {
      tickerSymbol,
      exDate: { gte: oneYearAgo },
    },
    orderBy: { exDate: 'desc' },
    select: {
      exDate: true,
      payDate: true,
      amountPerShare: true,
      currency: true,
      frequency: true,
    },
  })
}

/**
 * Upsert dividend event.
 */
export async function upsertDividend(data: {
  tickerSymbol: string
  exchange: string
  exDate: Date
  declareDate?: Date
  payDate?: Date
  amountPerShare: bigint
  currency: string
  frequency?: string
}) {
  return prisma.dividendCache.upsert({
    where: {
      tickerSymbol_exDate: {
        tickerSymbol: data.tickerSymbol,
        exDate: data.exDate,
      },
    },
    update: {
      amountPerShare: data.amountPerShare,
      currency: data.currency,
      frequency: data.frequency,
      fetchedAt: new Date(),
    },
    create: {
      tickerSymbol: data.tickerSymbol,
      exchange: data.exchange,
      exDate: data.exDate,
      declareDate: data.declareDate,
      payDate: data.payDate,
      amountPerShare: data.amountPerShare,
      currency: data.currency,
      frequency: data.frequency,
    },
  })
}

// ─── FX Rates ─────────────────────────────────

/**
 * Most recent FX rate. Returns null if not cached today.
 */
export async function getFxRate(
  from: string,
  to: string
): Promise<number | null> {
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const row = await prisma.fxRate.findFirst({
    where: {
      fromCurrency: from,
      toCurrency: to,
      rateDate: { gte: today },
    },
    orderBy: { rateDate: 'desc' },
    select: { rate: true },
  })

  if (!row) return null
  return Number(row.rate)
}

/**
 * Upsert a FX rate.
 */
export async function upsertFxRate(data: {
  fromCurrency: string
  toCurrency: string
  rate: number
  rateDate: Date
}) {
  return prisma.fxRate.upsert({
    where: {
      fromCurrency_toCurrency_rateDate: {
        fromCurrency: data.fromCurrency,
        toCurrency: data.toCurrency,
        rateDate: data.rateDate,
      },
    },
    update: { rate: data.rate, fetchedAt: new Date() },
    create: {
      fromCurrency: data.fromCurrency,
      toCurrency: data.toCurrency,
      rate: data.rate,
      rateDate: data.rateDate,
    },
  })
}
