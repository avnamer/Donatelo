// ─────────────────────────────────────────────
// GET /api/prices/daily-series
//
// Accepts: ?tickers=AAPL:US,LUMI.TA:TASE&from=2024-01-01
//
// Returns: { [symbol]: { date: string, close: number }[] }
//   close is in the ticker's native currency units (not agorot/cents)
//
// Strategy (per ticker):
//   1. Yahoo Finance — works for named tickers (AAPL, LUMI.TA, etc.)
//   2. DB price_cache fallback — for numeric TASE fund IDs
// ─────────────────────────────────────────────

import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/db/supabase-server'
import { prisma } from '@/lib/db/prisma'

export interface DailyPoint { date: string; close: number }

function toYahooTicker(symbol: string, exchange: string): string | null {
  if (/^\d+$/.test(symbol)) return null
  if (/^\d+\.TA$/i.test(symbol)) return null
  if (exchange === 'TASE') {
    return symbol.toUpperCase().endsWith('.TA') ? symbol : `${symbol}.TA`
  }
  return symbol
}

async function fetchYahooDaily(yahooTicker: string, fromDate: Date): Promise<DailyPoint[]> {
  const period1 = Math.floor(fromDate.getTime() / 1000)
  const period2 = Math.floor(Date.now() / 1000)
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooTicker)}?interval=1d&period1=${period1}&period2=${period2}`

  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' },
      next: { revalidate: 3600 },
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

async function fetchCacheDaily(symbol: string, fromDate: Date, exchange: string): Promise<DailyPoint[]> {
  const rows = await prisma.priceCache.findMany({
    where: {
      tickerSymbol: symbol,
      priceDate: { gte: fromDate },
    },
    orderBy: { priceDate: 'asc' },
    select: { priceDate: true, price: true },
  })
  // TASE prices are stored as agorot (matching Yahoo Finance's .TA format).
  // US prices are stored as USD×100 (cents); divide by 100 to get USD.
  return rows.map((r) => ({
    date: r.priceDate.toISOString().slice(0, 10),
    close: exchange === 'TASE' ? Number(r.price) : Number(r.price) / 100,
  }))
}

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
      const yahooTicker = toYahooTicker(symbol, exchange)
      if (yahooTicker) {
        const data = await fetchYahooDaily(yahooTicker, fromDate)
        if (data.length > 0) return { symbol, data }
      }
      const data = await fetchCacheDaily(symbol, fromDate, exchange)
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
