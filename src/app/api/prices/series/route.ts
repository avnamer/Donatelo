// ─────────────────────────────────────────────
// GET /api/prices/series
//
// Accepts: ?tickers=AAPL:US,LUMI.TA:TASE&period=30d|90d|6m|ytd|1y|3y
//
// Returns: { [symbol]: { currency: string; points: { date: string; price: number }[] } }
//   price is in cents (same scale as price_cache.price)
//
// Anchor logic:
//   The first point in the series is always anchored to the period start date,
//   using the most-recent cached price AT OR BEFORE startDate (within 14 days).
//   This ensures the indexed return is measured from the actual start of the
//   period, not from the first cached price that happens to fall inside it.
// ─────────────────────────────────────────────

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getCurrentUser } from '@/lib/db/supabase-server'
import { prisma } from '@/lib/db/prisma'
import { fetchUSPriceHistory } from '@/lib/api/polygon'

const VALID_PERIODS = ['30d', '90d', '6m', 'ytd', '1y', '3y'] as const
type SeriesPeriod = (typeof VALID_PERIODS)[number]

const QuerySchema = z.object({
  tickers: z.string().min(1),
  period: z.enum(VALID_PERIODS),
  sinceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
})

// How many calendar days before startDate we'll search for an anchor price
const ANCHOR_LOOKBACK_DAYS = 14

function getPeriodStartDate(period: SeriesPeriod): Date {
  const now = new Date()
  switch (period) {
    case '30d': return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
    case '90d': return new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000)
    case '6m':  return new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000)
    case 'ytd': return new Date(now.getFullYear(), 0, 1)
    case '1y':  return new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000)
    case '3y':  return new Date(now.getTime() - 3 * 365 * 24 * 60 * 60 * 1000)
  }
}

export async function GET(request: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const raw = Object.fromEntries(request.nextUrl.searchParams)
  const parsed = QuerySchema.safeParse(raw)
  if (!parsed.success) return NextResponse.json({ error: 'Invalid params' }, { status: 400 })

  const { tickers, period, sinceDate } = parsed.data
  const periodStart = getPeriodStartDate(period)
  // Cap start to the earliest actual purchase date so the chart doesn't show
  // price history from before the user owned anything.
  const startDate = sinceDate
    ? new Date(Math.max(periodStart.getTime(), new Date(sinceDate).getTime()))
    : periodStart
  const anchorLookbackDate = new Date(startDate.getTime() - ANCHOR_LOOKBACK_DAYS * 24 * 60 * 60 * 1000)
  const startDateStr = startDate.toISOString().slice(0, 10)

  const symbolList = tickers.split(',').map((t) => {
    const [symbol, exchange = 'US'] = t.trim().split(':')
    return { symbol: symbol.toUpperCase(), exchange: exchange.toUpperCase() }
  })

  // For US stocks, backfill Polygon history if our cache doesn't go back far enough.
  // This runs once per symbol and stores results in price_cache for future use.
  const usSymbols = symbolList.filter(
    (s) => s.exchange !== 'TASE' && !/^\d+$/.test(s.symbol)
  )
  if (usSymbols.length > 0) {
    // Find the earliest cached date per US symbol
    const earliestRows = await prisma.priceCache.groupBy({
      by: ['tickerSymbol'],
      where: { tickerSymbol: { in: usSymbols.map((s) => s.symbol) } },
      _min: { priceDate: true },
    })
    const earliestBySymbol = new Map(
      earliestRows.map((r) => [r.tickerSymbol, r._min.priceDate])
    )

    await Promise.allSettled(
      usSymbols.map(async ({ symbol, exchange }) => {
        const earliestCached = earliestBySymbol.get(symbol)
        // Only backfill if we don't have data going back to anchorLookbackDate
        if (earliestCached && earliestCached <= anchorLookbackDate) return

        // Fetch from period start (or anchorLookback) to just before what we already have
        const fetchTo = earliestCached
          ? new Date(earliestCached.getTime() - 86400000)
          : new Date()
        const fetchFrom = anchorLookbackDate

        if (fetchFrom >= fetchTo) return

        const bars = await fetchUSPriceHistory(symbol, fetchFrom, fetchTo)
        if (bars.length === 0) return

        await prisma.priceCache.createMany({
          data: bars.map((b) => ({
            tickerSymbol: symbol,
            exchange,
            price: b.price,  // already in cents (bigint) from fetchUSPriceHistory
            currency: 'USD',
            priceDate: b.date,
            fetchedAt: new Date(),
          })),
          skipDuplicates: true,
        })
      })
    )
  }

  // Fetch series rows (startDate → today) and anchor candidates (anchorLookback → startDate) in parallel
  const [seriesRows, anchorRows] = await Promise.all([
    prisma.priceCache.findMany({
      where: {
        tickerSymbol: { in: symbolList.map((s) => s.symbol) },
        priceDate: { gte: startDate },
      },
      orderBy: { priceDate: 'asc' },
      select: { tickerSymbol: true, price: true, priceDate: true, currency: true },
    }),
    prisma.priceCache.findMany({
      where: {
        tickerSymbol: { in: symbolList.map((s) => s.symbol) },
        priceDate: { gte: anchorLookbackDate, lt: startDate },
      },
      orderBy: { priceDate: 'desc' },
      select: { tickerSymbol: true, price: true, priceDate: true, currency: true },
    }),
  ])

  // Build per-symbol anchor map: most recent row before startDate
  const anchorBySymbol = new Map<string, { price: number; currency: string }>()
  for (const row of anchorRows) {
    if (!anchorBySymbol.has(row.tickerSymbol)) {
      anchorBySymbol.set(row.tickerSymbol, {
        price: Number(row.price),
        currency: row.currency,
      })
    }
  }

  const grouped: Record<string, { currency: string; points: { date: string; price: number }[] }> = {}

  for (const { symbol, exchange } of symbolList) {
    const symbolRows = seriesRows.filter((r) => r.tickerSymbol === symbol)
    const currency = symbolRows[0]?.currency
      ?? anchorBySymbol.get(symbol)?.currency
      ?? (exchange === 'TASE' ? 'ILS' : 'USD')

    const points: { date: string; price: number }[] = []

    // Prepend the anchor point (period start) if we have a price before startDate
    // and the series doesn't already start at or before startDate.
    // Validate: discard anchors that differ from the first series price by more
    // than 10x — these indicate corrupted cache rows stored in the wrong scale.
    const anchor = anchorBySymbol.get(symbol)
    const firstSeriesPrice = symbolRows[0] ? Number(symbolRows[0].price) : null
    const seriesStartDate = symbolRows[0]?.priceDate?.toISOString().slice(0, 10)
    const anchorValid =
      anchor &&
      anchor.price > 0 &&
      (firstSeriesPrice === null ||
        firstSeriesPrice === 0 ||
        (anchor.price / firstSeriesPrice <= 10 && anchor.price / firstSeriesPrice >= 0.1))
    if (anchorValid && seriesStartDate !== startDateStr) {
      points.push({ date: startDateStr, price: anchor.price })
    }

    for (const r of symbolRows) {
      points.push({
        date: r.priceDate.toISOString().slice(0, 10),
        price: Number(r.price),
      })
    }

    grouped[symbol] = { currency, points }
  }

  return NextResponse.json(grouped)
}
