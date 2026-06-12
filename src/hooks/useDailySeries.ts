'use client'

// ─────────────────────────────────────────────
// useDailySeries — fetch daily close prices per ticker for a date range
//
// tickers format: ["AAPL:US", "LUMI.TA:TASE"]
// fromDate:       start of the period
//
// Returns: Record<symbol, { date: string, close: number }[]>
// ─────────────────────────────────────────────

import { useQuery } from '@tanstack/react-query'
import type { DailyPoint } from '@/app/api/prices/daily-series/route'

export type DailySeriesMap = Record<string, DailyPoint[]>

async function fetchDailySeries(tickers: string[], fromDate: Date): Promise<DailySeriesMap> {
  if (tickers.length === 0) return {}
  const from = fromDate.toISOString().slice(0, 10)
  const url = `/api/prices/daily-series?tickers=${tickers.join(',')}&from=${from}`
  const res = await fetch(url)
  if (!res.ok) throw new Error('Failed to fetch daily series')
  return res.json() as Promise<DailySeriesMap>
}

export function useDailySeries(tickers: string[], fromDate: Date | null) {
  const fromKey = fromDate?.toISOString().slice(0, 10) ?? ''
  return useQuery({
    queryKey: ['daily-series', fromKey, ...tickers.sort()],
    queryFn: () => fetchDailySeries(tickers, fromDate!),
    enabled: tickers.length > 0 && fromDate !== null,
    staleTime: 1000 * 60 * 60,      // 1 hour — historical prices don't change
    refetchInterval: false,
  })
}
