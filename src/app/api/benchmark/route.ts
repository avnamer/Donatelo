// ─────────────────────────────────────────────
// GET /api/benchmark
//
// Accepts: ?ticker=^GSPC&from=YYYY-MM-DD
// Returns: { data: Array<{ date: string; index: number }> }
//          Normalized to 100 at the first data point.
//
// Uses Yahoo Finance public chart endpoint (no API key).
// ─────────────────────────────────────────────

import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/db/supabase-server'

const VALID_TICKERS = new Set<string>([
  '^GSPC', 'URTH', '^IXIC', '^TA35.TA', '^TA90.TA', '^TA125.TA',
])

export async function GET(request: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const ticker = request.nextUrl.searchParams.get('ticker')
  const from   = request.nextUrl.searchParams.get('from')  // YYYY-MM-DD

  if (!ticker || !VALID_TICKERS.has(ticker)) {
    return NextResponse.json({ error: 'Invalid ticker' }, { status: 400 })
  }
  if (!from || !/^\d{4}-\d{2}-\d{2}$/.test(from)) {
    return NextResponse.json({ error: 'Invalid from date' }, { status: 400 })
  }

  const fromUnix = Math.floor(new Date(from).getTime() / 1000)
  if (isNaN(fromUnix)) {
    return NextResponse.json({ error: 'Invalid from date' }, { status: 400 })
  }
  const toUnix   = Math.floor(Date.now() / 1000)

  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1d&period1=${fromUnix}&period2=${toUnix}`

    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' },
      next: { revalidate: 3600 },  // cache 1 hour
    })

    if (!res.ok) return NextResponse.json({ data: [] })

    const json = await res.json() as {
      chart?: {
        result?: Array<{
          timestamp?: number[]
          indicators?: { quote?: Array<{ close?: (number | null)[] }> }
        }>
      }
    }

    const result = json.chart?.result?.[0]
    if (!result) return NextResponse.json({ data: [] })

    const timestamps = result.timestamp ?? []
    const closes     = result.indicators?.quote?.[0]?.close ?? []

    const points = timestamps
      .map((ts, i) => {
        const close = closes[i]
        if (!close) return null
        return { date: new Date(ts * 1000).toISOString().slice(0, 10), close }
      })
      .filter((p): p is { date: string; close: number } => p !== null)

    if (points.length === 0) return NextResponse.json({ data: [] })

    const startClose = points[0].close
    const data = points.map((p) => ({
      date:  p.date,
      index: (p.close / startClose) * 100,
    }))

    return NextResponse.json({ data })
  } catch {
    return NextResponse.json({ data: [] })
  }
}
