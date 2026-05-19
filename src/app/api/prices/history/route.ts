// ─────────────────────────────────────────────
// GET /api/prices/history
//
// Accepts: ?tickers=AAPL:US,LUMI.TA:TASE,5123179:TASE&period=1m
// Period:  1w | 1m | 6m | 1y
//
// Returns: { [symbol]: periodReturnPct | null }
//   periodReturnPct = (currentPrice / periodStartPrice - 1) × 100
//
// Strategy (per ticker):
//   1. DB price_cache  — works for ALL tickers (incl. numeric TASE funds).
//      The cache accumulates historical rows each time prices are fetched,
//      so we look for the price closest to the start of the requested period.
//   2. Yahoo Finance   — fallback when the DB has no row that old.
//      Only works for named tickers (AAPL, LUMI.TA, etc.), not numeric IDs.
// ─────────────────────────────────────────────

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getCurrentUser } from '@/lib/db/supabase-server'
import { prisma } from '@/lib/db/prisma'

// ─── Validation ───────────────────────────────

const VALID_PERIODS = ['1w', '1m', '6m', '1y'] as const
type HistoryPeriod = (typeof VALID_PERIODS)[number]

const QuerySchema = z.object({
  tickers: z.string().min(1),
  period: z.enum(VALID_PERIODS),
})

// How many calendar days back each period represents
const PERIOD_DAYS: Record<HistoryPeriod, number> = {
  '1w': 7,
  '1m': 30,
  '6m': 180,
  '1y': 365,
}

// Yahoo Finance range strings (fallback path)
const YAHOO_RANGE: Record<HistoryPeriod, string> = {
  '1w': '5d',
  '1m': '1mo',
  '6m': '6mo',
  '1y': '1y',
}

// ─── Strategy 1: DB price_cache ───────────────

/**
 * Look up two prices in price_cache:
 *   - "current"  = most-recent row for the ticker
 *   - "past"     = the row whose priceDate is closest to periodStartDate
 *                  (within a ±7-day window so weekends / missing days don't break it)
 *
 * Returns (current / past − 1) × 100, or null if either price is missing.
 */
async function periodReturnFromCache(
  symbol: string,
  periodStartDate: Date
): Promise<number | null> {
  // Search window: [periodStart − 7d, periodStart + 7d]
  const windowStart = new Date(periodStartDate.getTime() - 7 * 24 * 60 * 60 * 1000)
  const windowEnd   = new Date(periodStartDate.getTime() + 7 * 24 * 60 * 60 * 1000)

  const [currentRow, pastRows] = await Promise.all([
    // Most recent price
    prisma.priceCache.findFirst({
      where:   { tickerSymbol: symbol },
      orderBy: { priceDate: 'desc' },
      select:  { price: true },
    }),
    // All rows near the period start — we'll pick the closest one
    prisma.priceCache.findMany({
      where: {
        tickerSymbol: symbol,
        priceDate: { gte: windowStart, lte: windowEnd },
      },
      orderBy: { priceDate: 'asc' },
      select:  { price: true, priceDate: true },
    }),
  ])

  if (!currentRow || pastRows.length === 0) return null

  // Pick the past row whose date is closest to periodStartDate
  const target = periodStartDate.getTime()
  const pastRow = pastRows.reduce((best, row) =>
    Math.abs(row.priceDate.getTime() - target) <
    Math.abs(best.priceDate.getTime() - target)
      ? row
      : best
  )

  const current = Number(currentRow.price)
  const past    = Number(pastRow.price)
  if (past === 0) return null

  return (current / past - 1) * 100
}

// ─── Strategy 2: Yahoo Finance fallback ───────

/**
 * Convert a stored ticker symbol + exchange to a Yahoo Finance ticker.
 * Returns null for securities not available on Yahoo Finance.
 */
function toYahooTicker(symbol: string, exchange: string): string | null {
  if (/^\d+$/.test(symbol))    return null  // numeric TASE fund ID
  if (/^\d+\.TA$/i.test(symbol)) return null  // numeric.TA variant

  if (exchange === 'TASE') {
    // Yahoo Finance requires .TA suffix for Israeli securities
    return symbol.toUpperCase().endsWith('.TA') ? symbol : `${symbol}.TA`
  }

  return symbol  // US tickers as-is
}

/**
 * Fetch period return % via Yahoo Finance chart API.
 * Returns (last close / first close − 1) × 100, or null on failure.
 */
async function periodReturnFromYahoo(
  yahooTicker: string,
  period: HistoryPeriod
): Promise<number | null> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooTicker)}?interval=1d&range=${YAHOO_RANGE[period]}`

  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' },
      next: { revalidate: 300 },
    })
    if (!res.ok) return null

    const data = await res.json() as {
      chart?: {
        result?: Array<{
          indicators?: { quote?: Array<{ close?: (number | null)[] }> }
        }>
        error?: unknown
      }
    }

    if (data.chart?.error) return null

    const closes = (data.chart?.result?.[0]?.indicators?.quote?.[0]?.close ?? [])
      .filter((c): c is number => typeof c === 'number' && c > 0)

    if (closes.length < 2) return null

    return (closes[closes.length - 1] / closes[0] - 1) * 100
  } catch {
    return null
  }
}

// ─── Handler ──────────────────────────────────

export async function GET(request: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const raw = Object.fromEntries(request.nextUrl.searchParams)
  const parsed = QuerySchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid params' }, { status: 400 })
  }

  const { tickers, period } = parsed.data

  const periodStartDate = new Date(
    Date.now() - PERIOD_DAYS[period] * 24 * 60 * 60 * 1000
  )

  const tickerEntries = tickers.split(',').map((t) => {
    const [symbol, exchange = 'US'] = t.trim().split(':')
    return { symbol: symbol.toUpperCase(), exchange: exchange.toUpperCase() }
  })

  const results = await Promise.allSettled(
    tickerEntries.map(async ({ symbol, exchange }) => {
      // Strategy 1: DB cache (works for ALL tickers, incl. numeric TASE funds)
      const fromCache = await periodReturnFromCache(symbol, periodStartDate)
      if (fromCache !== null) return { symbol, pct: fromCache }

      // Strategy 2: Yahoo Finance (named tickers only)
      const yahooTicker = toYahooTicker(symbol, exchange)
      if (!yahooTicker) return { symbol, pct: null }

      const fromYahoo = await periodReturnFromYahoo(yahooTicker, period)
      return { symbol, pct: fromYahoo }
    })
  )

  const result: Record<string, number | null> = {}
  for (const r of results) {
    if (r.status === 'fulfilled') {
      result[r.value.symbol] = r.value.pct
    }
  }

  return NextResponse.json(result)
}
