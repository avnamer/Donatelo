// ─────────────────────────────────────────────
// useFxRate — fetch USD/ILS exchange rate
// Cached in DB daily; stale time 24 hours on client
// ─────────────────────────────────────────────

import { useQuery } from '@tanstack/react-query'

async function fetchFxRate(): Promise<number> {
  const res = await fetch('/api/fx')
  if (!res.ok) throw new Error('Failed to fetch FX rate')
  const data = await res.json() as { rate: number }
  return data.rate
}

export function useFxRate() {
  return useQuery({
    queryKey: ['fx', 'USD', 'ILS'],
    queryFn: fetchFxRate,
    staleTime: 1000 * 60 * 60 * 24, // 24 hours
    placeholderData: 3.72,           // reasonable default while loading
  })
}
