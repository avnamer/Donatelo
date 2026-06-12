// ─────────────────────────────────────────────
// GET /api/prices/series
//
// Accepts: ?tickers=AAPL:US,LUMI.TA:TASE&period=30d|90d|6m|ytd|1y|3y
//
// Returns: { [symbol]: { currency: string; points: { date: string; price: number }[] } }
//   price is stored in cents (BigInt), returned as number
// ─────────────────────────────────────────────

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getCurrentUser } from '@/lib/db/supabase-server'
import { prisma } from '@/lib/db/prisma'

const VALID_PERIODS = ['30d', '90d', '6m', 'ytd', '1y', '3y'] as const
type SeriesPeriod = (typeof VALID_PERIODS)[number]

const QuerySchema = z.object({
  tickers: z.string().min(1),
  period: z.enum(VALID_PERIODS),
})

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

  const { tickers, period } = parsed.data
  const startDate = getPeriodStartDate(period)

  const symbols = tickers.split(',').map((t) => {
    const [symbol, exchange = 'US'] = t.trim().split(':')
    return { symbol: symbol.toUpperCase(), exchange: exchange.toUpperCase() }
  })

  const rows = await prisma.priceCache.findMany({
    where: {
      tickerSymbol: { in: symbols.map((s) => s.symbol) },
      priceDate: { gte: startDate },
    },
    orderBy: { priceDate: 'asc' },
    select: { tickerSymbol: true, price: true, priceDate: true, currency: true },
  })

  const grouped: Record<string, { currency: string; points: { date: string; price: number }[] }> = {}

  for (const { symbol, exchange } of symbols) {
    const symbolRows = rows.filter((r) => r.tickerSymbol === symbol)
    grouped[symbol] = {
      currency: symbolRows[0]?.currency ?? (exchange === 'TASE' ? 'ILS' : 'USD'),
      points: symbolRows.map((r) => ({
        date: r.priceDate.toISOString().slice(0, 10),
        price: Number(r.price),
      })),
    }
  }

  return NextResponse.json(grouped)
}
