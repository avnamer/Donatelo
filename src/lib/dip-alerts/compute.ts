import { getHistoricalPrices } from '@/lib/db/queries'

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

export async function computePeaks(
  tickerSymbol: string
): Promise<PeakData | null> {
  const today = new Date()

  const from52w = new Date(today)
  from52w.setFullYear(from52w.getFullYear() - 1)

  // Fetch 52w history (covers 90d as a subset)
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
  // Best-effort historical high from all cached data — may not be true ATH
  const highATH = pricesAll.length > 0 ? Math.max(...pricesAll) : null

  const dropFrom52w = (currentPrice - high52w) / high52w
  const dropFrom90d = (currentPrice - high90d) / high90d
  const dropFromATH = highATH != null ? (currentPrice - highATH) / highATH : null

  // Build 90-day sparkline data
  const priceHistory90d = history52w
    .filter((r) => r.priceDate >= cutoff90d)
    .map((r) => ({
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
