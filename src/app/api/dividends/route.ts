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
import { getTrailingDividends, upsertDividend } from '@/lib/db/queries'
import { fetchUSDividends } from '@/lib/api/polygon'
import { fetchTaseDividends } from '@/lib/api/tase'

const QuerySchema = z.object({
  ticker: z.string().min(1),
  exchange: z.enum(['US', 'TASE']).default('US'),
})

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

  // 1. Check DB cache — dividends are stable so we cache them all day
  const cached = await getTrailingDividends(symbol)
  if (cached.length > 0) {
    return NextResponse.json(
      cached.map((d) => ({
        exDate: d.exDate.toISOString().slice(0, 10),
        payDate: d.payDate?.toISOString().slice(0, 10),
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
        payDate: d.payDate?.toISOString().slice(0, 10),
        amountPerShare: d.amountPerShare.toString(),
        currency: d.currency,
        frequency: (d as any).frequency,
      }))
    )
  } catch (err) {
    console.error('[/api/dividends] Error:', err)
    return NextResponse.json({ error: 'Failed to fetch dividends' }, { status: 502 })
  }
}
