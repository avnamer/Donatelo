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

/**
 * Ensure 52w price history is populated in the cache.
 * If we have fewer than MIN_52W_ENTRIES, fetch from external API and backfill.
 */
async function ensurePriceHistory(
  tickerSymbol: string,
  exchange: string,
  from: Date,
  to: Date
): Promise<void> {
  const existing = await getHistoricalPrices(tickerSymbol, from, to)
  if (existing.length >= MIN_52W_ENTRIES) return // cache is sufficient

  const history =
    exchange === 'TASE'
      ? await fetchTasePriceHistory(tickerSymbol, from, to)
      : await fetchUSPriceHistory(tickerSymbol, from, to)

  if (history.length === 0) return

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
}

export async function computePeaks(
  tickerSymbol: string,
  exchange: string
): Promise<PeakData | null> {
  const today = new Date()

  const from52w = new Date(today)
  from52w.setFullYear(from52w.getFullYear() - 1)

  // Backfill cache with 52w of data if needed
  await ensurePriceHistory(tickerSymbol, exchange, from52w, today)

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
