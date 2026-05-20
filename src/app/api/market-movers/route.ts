// ─────────────────────────────────────────────
// GET /api/market-movers?period=1M
//
// Returns top-10 performers by % return for three markets:
//   { israel: Mover[], us: Mover[], etf: Mover[] }
//
// interface Mover { ticker: string; returnPct: number }
//
// Uses Yahoo Finance public chart API — no API key needed.
// Tickers that fail are silently skipped.
// ─────────────────────────────────────────────

import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/db/supabase-server'
import type { TimeRange } from '@/store/ui'

export interface Mover {
  ticker: string
  returnPct: number
}

// ── Ticker universes ───────────────────────────

const ISRAEL_TICKERS = [
  'NICE.TA', 'ESLT.TA', 'ICL.TA', 'TEVA.TA', 'PERI.TA', 'NVMI.TA', 'HARL.TA',
  'FIBI.TA', 'LUMI.TA', 'MIFI.TA', 'SPNS.TA', 'ENLT.TA', 'TSEM.TA', 'BEZQ.TA',
  'CEVA.TA', 'RBSN.TA', 'TMLP.TA', 'GPRT.TA', 'SFET.TA', 'DLRL.TA', 'ELCO.TA',
  'AFIL.TA', 'KARE.TA', 'IGLD.TA', 'FTAL.TA', 'MGDL.TA', 'ANLT.TA', 'PMCN.TA',
  'SRAC.TA', 'ARPT.TA', 'ORLY.TA', 'BIRM.TA', 'SPEN.TA', 'ALHE.TA', 'MTDS.TA',
]

const US_TICKERS = [
  'NVDA', 'AAPL', 'MSFT', 'AMZN', 'META', 'GOOGL', 'BRK-B', 'LLY', 'AVGO', 'TSLA',
  'JPM', 'UNH', 'V', 'XOM', 'MA', 'COST', 'HD', 'PG', 'ABBV', 'BAC', 'CVX', 'KO',
  'NFLX', 'AMD', 'CRM', 'WMT', 'ACN', 'MRK', 'ORCL', 'LIN', 'TMO', 'NOW', 'ADBE',
  'IBM', 'GS', 'PM', 'AXP', 'RTX', 'CAT', 'SPGI', 'BLK', 'NEE', 'ISRG', 'ETN',
  'DE', 'GE', 'PANW', 'UBER', 'MU', 'SCHW',
]

const ETF_TICKERS = [
  'VXUS', 'VEA', 'VWO', 'EEM', 'ACWI', 'IEFA', 'MCHI', 'EWJ', 'INDA', 'EWZ',
  'GXC', 'EWT', 'NORW', 'EWU', 'EWG', 'EWC', 'EWQ', 'EWL', 'URTH', 'DXJ',
  'FXI', 'EWY', 'THD', 'EPOL', 'ECH', 'EWS', 'EZA', 'EIMI', 'IEMG', 'HEDJ',
]

// ── Yahoo Finance range mapping ────────────────

const VALID_PERIODS = new Set<TimeRange>(['1W', '1M', '3M', '6M', 'YTD', '1Y', '2Y', '3Y', 'ALL'])

function toYahooRange(period: TimeRange): string {
  switch (period) {
    case '1W':  return '5d'
    case '1M':  return '1mo'
    case '3M':  return '3mo'
    case '6M':  return '6mo'
    case 'YTD': return 'ytd'
    case '1Y':  return '1y'
    case '2Y':  return '2y'
    case '3Y':  return '3y'
    case 'ALL': return '1y'   // fallback: most meaningful for a "top movers" list
  }
}

// ── Fetch single ticker return ─────────────────

async function fetchReturn(ticker: string, range: string): Promise<number | null> {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?range=${range}&interval=1d`
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' },
      next: { revalidate: 3600 },
    })
    if (!res.ok) return null

    const json = await res.json() as {
      chart?: {
        result?: Array<{
          indicators?: { quote?: Array<{ close?: (number | null)[] }> }
        }>
      }
    }

    const closes = json.chart?.result?.[0]?.indicators?.quote?.[0]?.close ?? []
    const validCloses = closes.filter((c): c is number => c !== null && c > 0)
    if (validCloses.length < 2) return null

    const first = validCloses[0]
    const last  = validCloses[validCloses.length - 1]
    return ((last - first) / first) * 100
  } catch {
    return null
  }
}

// ── Top-10 from a ticker list ──────────────────

async function topTen(tickers: string[], range: string): Promise<Mover[]> {
  const results = await Promise.all(
    tickers.map(async (ticker) => {
      const returnPct = await fetchReturn(ticker, range)
      return returnPct !== null ? { ticker, returnPct } : null
    })
  )
  return results
    .filter((r): r is Mover => r !== null)
    .sort((a, b) => b.returnPct - a.returnPct)
    .slice(0, 10)
}

// ── Route handler ──────────────────────────────

export async function GET(request: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const period = request.nextUrl.searchParams.get('period') as TimeRange | null
  if (!period || !VALID_PERIODS.has(period)) {
    return NextResponse.json({ error: 'Invalid period' }, { status: 400 })
  }

  const range = toYahooRange(period)

  const [israel, us, etf] = await Promise.all([
    topTen(ISRAEL_TICKERS, range),
    topTen(US_TICKERS, range),
    topTen(ETF_TICKERS, range),
  ])

  return NextResponse.json({ israel, us, etf })
}
