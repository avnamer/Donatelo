'use client'

// ─────────────────────────────────────────────
// usePriceHistory — fetch period return % for a list of tickers
//
// tickers format: ["AAPL:US", "LUMI.TA:TASE"]
// period:         "1w" | "1m" | "6m" | "1y"
//
// Returns: Record<tickerSymbol, periodReturnPct | null>
//   null = no historical data available (e.g. numeric TASE mutual funds)
// ─────────────────────────────────────────────

import { useQuery } from '@tanstack/react-query'

export type PriceHistoryMap = Record<string, number | null>

async function fetchPriceHistory(
  tickers: string[],
  period: string
): Promise<PriceHistoryMap> {
  if (tickers.length === 0) return {}
  const url = `/api/prices/history?tickers=${tickers.join(',')}&period=${period}`
  const res = await fetch(url)
  if (!res.ok) throw new Error('Failed to fetch price history')
  return res.json() as Promise<PriceHistoryMap>
}

export function usePriceHistory(tickers: string[], period: string | null) {
  return useQuery({
    queryKey: ['price-history', period, ...tickers.sort()],
    queryFn: () => fetchPriceHistory(tickers, period!),
    enabled: tickers.length > 0 && period !== null,
    staleTime: 1000 * 60 * 5,      // 5 minutes
    refetchInterval: 1000 * 60 * 5,
  })
}
