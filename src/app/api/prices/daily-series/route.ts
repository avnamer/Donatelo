// ─────────────────────────────────────────────
// GET /api/prices/daily-series
//
// Accepts: ?tickers=AAPL:US,LUMI.TA:TASE&from=2024-01-01
//
// Returns: { [symbol]: { date: string, close: number }[] }
//   close is in the ticker's native currency units (not agorot/cents)
//
// Strategy (per ticker):
//   1. Read stored DailyClose rows >= from date (fast, no network).
//   2. Find the last stored date; call Yahoo only for the gap (tail).
//      — Today's close is provisional so we only persist dates < today.
//   3. Upsert new points into daily_closes.
//   4. Merge stored + new and return.
//   5. Fallback: numeric TASE fund IDs → price_cache (unchanged).
// ─────────────────────────────────────────────

import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/db/supabase-server'
import { prisma } from '@/lib/db/prisma'

export interface DailyPoint { date: string; close: number }

// ─── Helpers ─────────────────────────────────

function toYahooTicker(symbol: string, exchange: string): string | null {
  if (/^\d+$/.test(symbol)) return null
  if (/^\d+\.TA$/i.test(symbol)) return null
  if (exchange === 'TASE') {
    return symbol.toUpperCase().endsWith('.TA') ? symbol : `${symbol}.TA`
  }
  return symbol
}

function todayDateString(): string {
  return new Date().toISOString().slice(0, 10)
}

async function fetchYahooDaily(yahooTicker: string, fromDate: Date): Promise<DailyPoint[]> {
  const period1 = Math.floor(fromDate.getTime() / 1000)
  const period2 = Math.floor(Date.now() / 1000)
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooTicker)}?interval=1d&period1=${period1}&period2=${period2}`

  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' },
      // No Next.js cache here — we manage freshness ourselves via daily_closes
    })
    if (!res.ok) return []

    const data = await res.json() as {
      chart?: {
        result?: Array<{
          timestamp?: number[]
          indicators?: { quote?: Array<{ close?: (number | null)[] }> }
        }>
        error?: unknown
      }
    }

    if (data.chart?.error) return []
    const result = data.chart?.result?.[0]
    if (!result) return []

    const timestamps = result.timestamp ?? []
    const closes = result.indicators?.quote?.[0]?.close ?? []

    const points: DailyPoint[] = []
    for (let i = 0; i < timestamps.length; i++) {
      const close = closes[i]
      if (typeof close !== 'number' || close <= 0) continue
      const d = new Date(timestamps[i] * 1000)
      points.push({ date: d.toISOString().slice(0, 10), close })
    }
    return points
  } catch {
    return []
  }
}

// Fallback for numeric TASE fund IDs that Yahoo doesn't support
async function fetchCacheDaily(symbol: string, fromDate: Date, exchange: string): Promise<DailyPoint[]> {
  const rows = await prisma.priceCache.findMany({
    where: {
      tickerSymbol: symbol,
      priceDate: { gte: fromDate },
    },
    orderBy: { priceDate: 'asc' },
    select: { priceDate: true, price: true },
  })
  // TASE prices are stored as agorot; US prices as cents (÷100 = USD)
  return rows.map((r) => ({
    date: r.priceDate.toISOString().slice(0, 10),
    close: exchange === 'TASE' ? Number(r.price) : Number(r.price) / 100,
  }))
}

// Persist new daily closes to DB (skip today's provisional close)
async function persistDailyCloses(
  symbol: string,
  exchange: string,
  points: DailyPoint[]
): Promise<void> {
  const today = todayDateString()
  const toStore = points.filter((p) => p.date < today)
  if (toStore.length === 0) return

  await prisma.$transaction(
    toStore.map((p) =>
      prisma.dailyClose.upsert({
        where: { tickerSymbol_closeDate: { tickerSymbol: symbol, closeDate: new Date(p.date) } },
        update: { close: p.close, exchange },
        create: { tickerSymbol: symbol, exchange, closeDate: new Date(p.date), close: p.close },
      })
    )
  )
}

// ─── Per-ticker fetch with tail-only strategy ─

async function fetchTickerSeries(
  symbol: string,
  exchange: string,
  fromDate: Date
): Promise<DailyPoint[]> {
  const yahooTicker = toYahooTicker(symbol, exchange)

  // Numeric TASE IDs: Yahoo unsupported → use price_cache directly, no persistence
  if (!yahooTicker) {
    return fetchCacheDaily(symbol, fromDate, exchange)
  }

  // 1. Read what we already have in daily_closes for the full requested range
  const stored = await prisma.dailyClose.findMany({
    where: {
      tickerSymbol: symbol,
      closeDate: { gte: fromDate },
    },
    orderBy: { closeDate: 'asc' },
    select: { closeDate: true, close: true },
  })

  const storedPoints: DailyPoint[] = stored.map((r) => ({
    date: r.closeDate.toISOString().slice(0, 10),
    close: Number(r.close),
  }))

  // 2. Determine the gap: fetch only from (lastStoredDate + 1 day) onward
  const lastStored = stored.at(-1)
  const gapStart = lastStored
    ? new Date(lastStored.closeDate.getTime() + 24 * 60 * 60 * 1000)
    : fromDate

  // No gap to fill (stored data is current as of yesterday)
  const today = todayDateString()
  const gapStartStr = gapStart.toISOString().slice(0, 10)
  if (gapStartStr >= today) {
    return storedPoints
  }

  // 3. Fetch the tail from Yahoo
  const freshPoints = await fetchYahooDaily(yahooTicker, gapStart)

  // 4. Persist the new non-provisional points
  if (freshPoints.length > 0) {
    await persistDailyCloses(symbol, exchange, freshPoints)
  }

  // 5. Merge stored + fresh (dedup by date, fresh wins)
  const merged = new Map<string, DailyPoint>()
  for (const p of storedPoints) merged.set(p.date, p)
  for (const p of freshPoints) merged.set(p.date, p)

  return Array.from(merged.values()).sort((a, b) => a.date.localeCompare(b.date))
}

// ─── Handler ──────────────────────────────────

export async function GET(request: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const tickers = request.nextUrl.searchParams.get('tickers')
  const from    = request.nextUrl.searchParams.get('from')

  if (!tickers || !from) {
    return NextResponse.json({ error: 'Missing params' }, { status: 400 })
  }

  const fromDate = new Date(from)
  if (isNaN(fromDate.getTime())) {
    return NextResponse.json({ error: 'Invalid from date' }, { status: 400 })
  }

  const tickerEntries = tickers.split(',').map((t) => {
    const [symbol, exchange = 'US'] = t.trim().split(':')
    return { symbol: symbol.toUpperCase(), exchange: exchange.toUpperCase() }
  })

  const settled = await Promise.allSettled(
    tickerEntries.map(async ({ symbol, exchange }) => {
      const data = await fetchTickerSeries(symbol, exchange, fromDate)
      return { symbol, data }
    })
  )

  const result: Record<string, DailyPoint[]> = {}
  for (const r of settled) {
    if (r.status === 'fulfilled') {
      result[r.value.symbol] = r.value.data
    }
  }

  return NextResponse.json(result)
}
