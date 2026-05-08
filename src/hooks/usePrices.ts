// ─────────────────────────────────────────────
// usePrices — fetch current prices for a list of tickers
// Polls every 5 minutes during market hours, stops on weekend
// ─────────────────────────────────────────────

import { useQuery } from '@tanstack/react-query'

export interface PriceData {
  price: bigint      // in agorot (ILS) or cents (USD)
  currency: string
  date: string
  stale: boolean
}

export type PriceMap = Record<string, PriceData>

async function fetchPrices(tickers: string[]): Promise<PriceMap> {
  if (tickers.length === 0) return {}

  const res = await fetch(`/api/prices?tickers=${tickers.join(',')}`)
  if (!res.ok) throw new Error('Failed to fetch prices')

  const raw = await res.json() as Record<string, {
    price: string
    currency: string
    date: string
    stale: boolean
  }>

  // Convert string prices back to bigint
  const result: PriceMap = {}
  for (const [ticker, data] of Object.entries(raw)) {
    result[ticker] = { ...data, price: BigInt(data.price) }
  }
  return result
}

/**
 * Fetch and cache prices for a set of tickers.
 * tickers format: ["AAPL:US", "1082209:TASE"]
 */
export function usePrices(tickers: string[]) {
  return useQuery({
    queryKey: ['prices', ...tickers.sort()],
    queryFn: () => fetchPrices(tickers),
    enabled: tickers.length > 0,
    staleTime: 1000 * 60 * 5,      // 5 minutes
    refetchInterval: 1000 * 60 * 5, // auto-refetch every 5 min
  })
}
