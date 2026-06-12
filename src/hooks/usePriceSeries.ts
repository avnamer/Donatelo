'use client'

import { useEffect, useState } from 'react'

export type SeriesPeriod = '30d' | '90d' | '6m' | 'ytd' | '1y' | '3y'

export interface PricePoint {
  date: string
  price: number // cents
}

export interface TickerSeries {
  currency: string
  points: PricePoint[]
}

export function usePriceSeries(tickers: string[], period: SeriesPeriod, sinceDate?: string) {
  const [data, setData] = useState<Record<string, TickerSeries>>({})
  const [loading, setLoading] = useState(false)

  const key = tickers.slice().sort().join(',')

  useEffect(() => {
    if (tickers.length === 0) return
    setLoading(true)
    const params = new URLSearchParams({ tickers: key, period })
    if (sinceDate) params.set('sinceDate', sinceDate)
    fetch(`/api/prices/series?${params}`)
      .then((r) => r.json())
      .then((d) => { setData(d); setLoading(false) })
      .catch(() => setLoading(false))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, period, sinceDate])

  return { data, loading }
}
