// ─────────────────────────────────────────────
// GET /api/prices
//
// Accepts: ?tickers=AAPL,MSFT,1082209:TASE
// Format:  <symbol>:<exchange>  (exchange = US or TASE)
//
// Returns: { [ticker]: { price, currency, date, stale } }
//
// Flow:
//   1. Check DB price_cache (< 60 min old)
//   2. If stale/missing → fetch from Polygon / TASE
//   3. Write to cache, return result
// ─────────────────────────────────────────────

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getCurrentUser } from '@/lib/db/supabase-server'
import { getCachedPrices, upsertPrice } from '@/lib/db/queries'
import { fetchLatestUSPrice } from '@/lib/api/polygon'
import { fetchLatestTasePrice } from '@/lib/api/tase'

// ─── Validation ───────────────────────────────

const QuerySchema = z.object({
  tickers: z.string().min(1),
  force: z.enum(['true', 'false']).optional(),
})

// ─── Types ────────────────────────────────────

interface PriceResult {
  price: string    // string because JSON can't hold BigInt
  currency: string
  date: string
  stale: boolean   // true if older than 60 min
  unavailable?: boolean  // true if no price found at all
}

// ─── Handler ──────────────────────────────────

export async function GET(request: NextRequest) {
  // Auth check
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Parse + validate query
  const raw = Object.fromEntries(request.nextUrl.searchParams)
  const parsed = QuerySchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Missing tickers param' }, { status: 400 })
  }

  // Parse ticker list: "AAPL:US,1082209:TASE" → [{symbol, exchange}]
  const tickerEntries = parsed.data.tickers.split(',').map((t) => {
    const [symbol, exchange = 'US'] = t.trim().split(':')
    return { symbol: symbol.toUpperCase(), exchange: exchange.toUpperCase() }
  })

  const symbols = tickerEntries.map((t) => t.symbol)
  const forceRefresh = parsed.data.force === 'true'

  // 1. Check cache (60-min TTL) — skip when force=true
  const cached = forceRefresh ? new Map() : await getCachedPrices(symbols, 60)

  // 2. Find what's missing / stale
  const toFetch = tickerEntries.filter((t) => !cached.has(t.symbol))

  // 3. Fetch missing prices in parallel
  if (toFetch.length > 0) {
    await Promise.allSettled(
      toFetch.map(async ({ symbol, exchange }) => {
        const result =
          exchange === 'TASE'
            ? await fetchLatestTasePrice(symbol)
            : await fetchLatestUSPrice(symbol)

        if (result) {
          await upsertPrice({
            tickerSymbol: symbol,
            exchange,
            price: result.price,
            currency: result.currency,
            priceDate: result.date,
          })
          cached.set(symbol, {
            price: result.price,
            currency: result.currency,
            priceDate: result.date,
            fetchedAt: new Date(),
          })
        }
      })
    )
  }

  // 4. Fallback: for symbols still missing, try any cached price regardless of age
  const stillMissing = tickerEntries.filter((t) => !cached.has(t.symbol))
  if (stillMissing.length > 0) {
    const anyCached = await getCachedPrices(stillMissing.map((t) => t.symbol), 60 * 24 * 30)
    for (const [symbol, entry] of anyCached) {
      cached.set(symbol, entry)
    }
  }

  // 5. Build response
  const now = Date.now()
  const STALE_MS = 60 * 60 * 1000  // 60 minutes

  const result: Record<string, PriceResult> = {}
  for (const { symbol } of tickerEntries) {
    const entry = cached.get(symbol)
    if (entry) {
      result[symbol] = {
        price: entry.price.toString(),
        currency: entry.currency,
        date: entry.priceDate.toISOString(),
        stale: now - entry.fetchedAt.getTime() > STALE_MS,
      }
    } else {
      // No price anywhere — signal to the client so it can show "—" instead of a wrong value
      result[symbol] = {
        price: '0',
        currency: 'ILS',
        date: new Date().toISOString(),
        stale: true,
        unavailable: true,
      }
    }
  }

  return NextResponse.json(result)
}
