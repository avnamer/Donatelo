// ─────────────────────────────────────────────
// GET /api/dividends
//
// Accepts: ?ticker=AAPL&exchange=US
// Returns: trailing 12-month dividend events for a ticker
//
// Caches in dividend_cache table.
// ─────────────────────────────────────────────

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getCurrentUser } from '@/lib/db/supabase-server'
import { getTrailingDividends, getDividendHistory, upsertDividend, createTransaction } from '@/lib/db/queries'
import { fetchUSDividends } from '@/lib/api/polygon'
import { fetchTaseDividends } from '@/lib/api/tase'

const QuerySchema = z.object({
  ticker: z.string().min(1),
  exchange: z.enum(['US', 'TASE']).default('US'),
})

const RecordDividendSchema = z.object({
  portfolioId: z.string().uuid(),
  holdingId: z.string().uuid(),
  date: z.string().date(),
  amount: z.number().positive(),     // in smallest unit (agorot/cents × 100 already applied by client)
  currency: z.enum(['ILS', 'USD']),
  shares: z.number().positive().optional(),
  amountPerShare: z.number().positive().optional(),
})

export async function POST(request: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const parsed = RecordDividendSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 })
  }

  const { portfolioId, holdingId, date, amount, currency, shares } = parsed.data

  const tx = await createTransaction(portfolioId, user.id, {
    type: 'DIVIDEND',
    date: new Date(date),
    amount: BigInt(amount),
    currency,
    holdingId,
    shares,
  })

  if (!tx) return NextResponse.json({ error: 'Portfolio not found' }, { status: 404 })

  return NextResponse.json({ id: tx.id }, { status: 201 })
}

export async function GET(request: NextRequest) {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const raw = Object.fromEntries(request.nextUrl.searchParams)
  const parsed = QuerySchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const { ticker, exchange } = parsed.data
  const symbol = ticker.toUpperCase()

  // 1. Check DB cache — stale if oldest entry is > 24h old
  const cached = await getDividendHistory(symbol)
  const isFresh = cached.length > 0 && cached.some(
    (d) => Date.now() - d.fetchedAt.getTime() < 24 * 60 * 60 * 1000
  )

  if (isFresh) {
    return NextResponse.json(
      cached.map((d) => ({
        exDate: d.exDate.toISOString().slice(0, 10),
        declareDate: d.declareDate?.toISOString().slice(0, 10) ?? null,
        payDate: d.payDate?.toISOString().slice(0, 10) ?? null,
        amountPerShare: d.amountPerShare.toString(),
        currency: d.currency,
        frequency: d.frequency,
      }))
    )
  }

  // 2. Fetch from external API
  try {
    const dividends =
      exchange === 'TASE'
        ? await fetchTaseDividends(symbol)
        : await fetchUSDividends(symbol)

    // Write to cache
    await Promise.allSettled(
      dividends.map((d) =>
        upsertDividend({
          tickerSymbol: symbol,
          exchange,
          exDate: d.exDate,
          declareDate: (d as any).declareDate,
          payDate: d.payDate,
          amountPerShare: d.amountPerShare,
          currency: d.currency,
          frequency: (d as any).frequency,
        })
      )
    )

    return NextResponse.json(
      dividends.map((d) => ({
        exDate: d.exDate.toISOString().slice(0, 10),
        declareDate: (d as any).declareDate?.toISOString().slice(0, 10) ?? null,
        payDate: d.payDate?.toISOString().slice(0, 10) ?? null,
        amountPerShare: d.amountPerShare.toString(),
        currency: d.currency,
        frequency: (d as any).frequency ?? null,
      }))
    )
  } catch (err) {
    console.error('[/api/dividends] Error:', err)
    return NextResponse.json({ error: 'Failed to fetch dividends' }, { status: 502 })
  }
}
