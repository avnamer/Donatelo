'use client'

import { useQuery } from '@tanstack/react-query'
import type { BenchmarkId } from '@/store/ui'
import type { PerformancePoint } from '@/components/charts/PerformanceChart'

export function useBenchmark(ticker: BenchmarkId, fromDate: Date) {
  const from = fromDate.toISOString().slice(0, 10)

  const { data = [], isLoading, error } = useQuery({
    queryKey: ['benchmark', ticker, from],
    queryFn: async (): Promise<PerformancePoint[]> => {
      const res = await fetch(
        `/api/benchmark?ticker=${encodeURIComponent(ticker)}&from=${from}`
      )
      if (!res.ok) return []
      const json = await res.json() as { data: Array<{ date: string; index: number }> }
      return json.data.map((p) => ({ date: new Date(p.date), index: p.index }))
    },
    enabled: ticker !== 'none',
    staleTime: 60 * 60 * 1000,  // 1 hour
  })

  return {
    data:    ticker === 'none' ? ([] as PerformancePoint[]) : data,
    loading: ticker !== 'none' && isLoading,
    error:   error ? String(error) : null,
  }
}
