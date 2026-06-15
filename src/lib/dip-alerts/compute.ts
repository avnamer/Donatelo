import { getHistoricalPrices, upsertPrice } from '@/lib/db/queries'
import { fetchUSPriceHistory } from '@/lib/api/polygon'
import { fetchTasePriceHistory } from '@/lib/api/tase'

export interface PeakData {
  high52w: number
  high90d: number
  highATH: number | null
  currentPrice: number
  dropFrom52w: number
  dropFromATH: number | null
  dropFrom90d: number
  priceHistory90d: Array<{ date: string; price: number }>
}

// Minimum trading days expected in 52 weeks (accounting for weekends/holidays)
const MIN_52W_ENTRIES = 180
// Minimum trading days expected in 5 years (for ATH computation)
const MIN_5Y_ENTRIES = 900

// Polygon.io free tier: 5 req/min → 1 request per 13s to be safe
const POLYGON_RATE_DELAY_MS = 13_000

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/**
 * Ensure 52w price history is populated in the cache.
 * If we have fewer than MIN_52W_ENTRIES, fetch from external API and backfill.
 * Returns true if a fetch was performed (caller should delay before next US stock).
 */
export async function ensurePriceHistory(
  tickerSymbol: string,
  exchange: string,
  from: Date,
  to: Date
): Promise<boolean> {
  const existing = await getHistoricalPrices(tickerSymbol, from, to)
  if (existing.length >= MIN_52W_ENTRIES) return false // cache is sufficient

  const history =
    exchange === 'TASE'
      ? await fetchTasePriceHistory(tickerSymbol, from, to)
      : await fetchUSPriceHistory(tickerSymbol, from, to)

  if (history.length === 0) return true // fetch attempted but empty

  // Store all fetched entries in PriceCache (upsert = no duplicates)
  await Promise.allSettled(
    history.map((entry) =>
      upsertPrice({
        tickerSymbol,
        exchange,
        price: entry.price,
        currency: entry.currency,
        priceDate: entry.date,
      })
    )
  )
  return true
}

/**
 * Backfill 52w price history for all holdings that need it, sequentially
 * with rate-limit delay between US stocks to respect Polygon.io free tier.
 */
export async function backfillPriceHistories(
  holdings: Array<{ ticker: string; exchange: string }>,
  from: Date,
  to: Date
): Promise<void> {
  for (const holding of holdings) {
    const fetched = await ensurePriceHistory(holding.ticker, holding.exchange, from, to)
    // Only delay after US stocks (Polygon) — TASE uses Yahoo (no strict rate limit)
    if (fetched && holding.exchange !== 'TASE') {
      await sleep(POLYGON_RATE_DELAY_MS)
    }
  }
}

/**
 * Backfill 5-year price history for TASE holdings so ATH reflects real historical peaks.
 * Yahoo Finance has no rate limit, so we can safely fetch more data.
 * Skipped if the cache already has sufficient entries for the 5y window.
 * Returns true if any ticker actually had new data fetched (cache was incomplete).
 */
export async function backfillATHHistoriesForTase(
  holdings: Array<{ ticker: string; exchange: string }>,
  from5y: Date,
  to: Date
): Promise<boolean> {
  const taseHoldings = holdings.filter((h) => h.exchange === 'TASE')
  let anyFetched = false
  for (const holding of taseHoldings) {
    const existing = await getHistoricalPrices(holding.ticker, from5y, to)
    if (existing.length >= MIN_5Y_ENTRIES) continue // already have enough data
    const history = await fetchTasePriceHistory(holding.ticker, from5y, to)
    if (history.length === 0) continue
    anyFetched = true
    await Promise.allSettled(
      history.map((entry) =>
        upsertPrice({
          tickerSymbol: holding.ticker,
          exchange: holding.exchange,
          price: entry.price,
          currency: entry.currency,
          priceDate: entry.date,
        })
      )
    )
  }
  return anyFetched
}

export async function computePeaks(
  tickerSymbol: string,
  exchange: string
): Promise<PeakData | null> {
  const today = new Date()

  const from52w = new Date(today)
  from52w.setFullYear(from52w.getFullYear() - 1)

  const history52w = await getHistoricalPrices(tickerSymbol, from52w, today)
  if (history52w.length === 0) return null

  // Fetch all available cache history for "historical high"
  const epochStart = new Date('1970-01-01')
  const historyAll = await getHistoricalPrices(tickerSymbol, epochStart, today)

  const cutoff90d = new Date(today)
  cutoff90d.setDate(cutoff90d.getDate() - 90)

  const toFloat = (p: bigint) => Number(p) / 100

  const prices52w = history52w.map((r) => toFloat(r.price))
  const prices90d = history52w
    .filter((r) => r.priceDate >= cutoff90d)
    .map((r) => toFloat(r.price))
  const pricesAll = historyAll.map((r) => toFloat(r.price))

  if (prices52w.length === 0) return null

  const currentPrice = prices52w[prices52w.length - 1]
  const high52w = Math.max(...prices52w)
  const high90d = prices90d.length > 0 ? Math.max(...prices90d) : high52w
  const highATH = pricesAll.length > 0 ? Math.max(...pricesAll) : null

  const dropFrom52w = (currentPrice - high52w) / high52w
  const dropFrom90d = (currentPrice - high90d) / high90d
  const dropFromATH = highATH != null ? (currentPrice - highATH) / highATH : null

  // Store full 52w price history — modal/card filter to 90d subset client-side
  const priceHistory90d = history52w.map((r) => ({
    date: r.priceDate.toISOString().split('T')[0],
    price: toFloat(r.price),
  }))

  return {
    high52w,
    high90d,
    highATH,
    currentPrice,
    dropFrom52w,
    dropFrom90d,
    dropFromATH,
    priceHistory90d,
  }
}
