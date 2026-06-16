// ─────────────────────────────────────────────
// usePrices — fetch current prices for a list of tickers
// Polls every 5 minutes during market hours, stops on weekend
// ─────────────────────────────────────────────

import { useQuery, keepPreviousData } from '@tanstack/react-query'

export interface PriceData {
  price: bigint      // in agorot (ILS) or cents (USD)
  currency: string
  date: string
  stale: boolean
  unavailable?: boolean
}

export type PriceMap = Record<string, PriceData>

async function fetchPrices(tickers: string[], force = false): Promise<PriceMap> {
  if (tickers.length === 0) return {}

  const url = `/api/prices?tickers=${tickers.join(',')}${force ? '&force=true' : ''}`
  const res = await fetch(url)
  if (!res.ok) throw new Error('Failed to fetch prices')

  const raw = await res.json() as Record<string, {
    price: string
    currency: string
    date: string
    stale: boolean
    unavailable?: boolean
  }>

  const result: PriceMap = {}
  for (const [ticker, data] of Object.entries(raw)) {
    result[ticker] = { ...data, price: BigInt(data.price) }
  }
  return result
}

/**
 * Fetch and cache prices for a set of tickers.
 * tickers format: ["AAPL:US", "LUMI.TA:TASE"]
 */
export function usePrices(tickers: string[]) {
  return useQuery({
    queryKey: ['prices', ...tickers.sort()],
    queryFn: () => fetchPrices(tickers),
    enabled: tickers.length > 0,
    staleTime: 1000 * 60 * 5,
    refetchInterval: 1000 * 60 * 5,
    placeholderData: keepPreviousData,
  })
}

/**
 * Force-refresh prices for specific tickers (bypasses server-side cache).
 * Returns the fresh PriceMap.
 */
export async function refreshPrices(tickers: string[]): Promise<PriceMap> {
  return fetchPrices(tickers, true)
}
