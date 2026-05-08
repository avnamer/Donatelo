'use client'

// ─────────────────────────────────────────────
// HomeClient — client shell for the home page
// Receives server-fetched holdings, computes metrics, renders UI
// ─────────────────────────────────────────────

import { useMemo } from 'react'
import { usePortfolioMetrics } from '@/hooks/usePortfolio'
import { KpiPanel } from './KpiPanel'
import { HoldingsTree } from './HoldingsTree'
import { PerformanceChart } from '@/components/charts/PerformanceChart'
import { calcIndexedPerformance } from '@/lib/calculations'
import { useUIStore } from '@/store/ui'
import type { ServerHolding } from '@/hooks/usePortfolio'

interface HomeClientProps {
  holdings: ServerHolding[]
  portfolioName: string
}

export function HomeClient({ holdings, portfolioName }: HomeClientProps) {
  const metrics = usePortfolioMetrics(holdings)
  const timeRange = useUIStore((s) => s.timeRange)

  // Build simulated performance chart from lot purchase dates + current value
  // This is a placeholder until we have historical price data
  const performanceData = useMemo(() => {
    if (metrics.pricesLoading || metrics.totalValue === 0n) return []

    // Build a simple index from oldest lot date → today
    // Real implementation will use historical prices from price_cache
    const allLots = holdings.flatMap((h) => h.lots)
    if (allLots.length === 0) return []

    const oldestDate = allLots.reduce((min, lot) => {
      const d = new Date(lot.purchaseDate)
      return d < min ? d : min
    }, new Date())

    const today = new Date()
    const days: Array<{ date: Date; value: bigint }> = [
      { date: oldestDate, value: metrics.totalCostBasis },
      { date: today, value: metrics.totalValue },
    ]

    return calcIndexedPerformance(days)
  }, [metrics, holdings])

  return (
    <div className="space-y-4">
      {/* Portfolio name */}
      <div>
        <h1 className="text-xl font-semibold">{portfolioName}</h1>
        <p className="text-sm text-muted-foreground">
          {holdings.length} holding{holdings.length !== 1 ? 's' : ''}
        </p>
      </div>

      {/* KPI Cards */}
      <KpiPanel metrics={metrics} />

      {/* Performance Chart */}
      <PerformanceChart data={performanceData} loading={metrics.pricesLoading} />

      {/* Holdings Tree */}
      <div>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-2">
          Holdings
        </h2>
        <HoldingsTree holdings={metrics.holdings} loading={metrics.pricesLoading} />
      </div>
    </div>
  )
}
