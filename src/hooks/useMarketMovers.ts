'use client'

import { useQuery } from '@tanstack/react-query'
import type { TimeRange } from '@/store/ui'
import type { Mover } from '@/app/api/market-movers/route'

interface MarketMoversData {
  israel: Mover[]
  us: Mover[]
  etf: Mover[]
}

export function useMarketMovers(period: TimeRange) {
  const { data, isLoading, error } = useQuery<MarketMoversData>({
    queryKey: ['market-movers', period],
    queryFn: async () => {
      const res = await fetch(`/api/market-movers?period=${period}`)
      if (!res.ok) throw new Error('Failed to fetch market movers')
      return res.json() as Promise<MarketMoversData>
    },
    staleTime: 60 * 60 * 1000,  // 1 hour — matches server cache
  })

  return {
    data:    data ?? null,
    loading: isLoading,
    error:   error ? String(error) : null,
  }
}
