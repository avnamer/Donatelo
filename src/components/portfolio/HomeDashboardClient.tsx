'use client'

// ─────────────────────────────────────────────
// HomeDashboardClient — home page client component
// Shows the performance chart + market movers + P/E panel.
// Portfolio holdings are passed from the server (needed for the chart).
// ─────────────────────────────────────────────

import { useMemo } from 'react'
import { usePortfolioMetrics } from '@/hooks/usePortfolio'
import { PerformanceChart } from '@/components/charts/PerformanceChart'
import { MarketMovers } from '@/components/market/MarketMovers'
import { PEMultiples } from '@/components/market/PEMultiples'
import { calcIndexedPerformance } from '@/lib/calculations'
import { getTimeRangeCutoff } from '@/lib/utils'
import { useUIStore, type TimeRange } from '@/store/ui'
import { useBenchmark } from '@/hooks/useBenchmark'
import { useMarketMovers } from '@/hooks/useMarketMovers'
import type { ServerHolding, HoldingMetrics } from '@/hooks/usePortfolio'

interface HomeDashboardClientProps {
  holdings: ServerHolding[]
}

// Identical linear-interpolation logic as HomeClient.
// See HomeClient.tsx comments for explanation.
function buildPeriodDailyValues(
  holdingMetrics: HoldingMetrics[],
  totalValue: bigint,
  timeRange: TimeRange,
): Array<{ date: Date; value: bigint }> {
  const today = new Date()

  const allLots = holdingMetrics.flatMap((h) => h.lots)
  if (allLots.length === 0) return []

  const oldestDate = allLots.reduce((min, lot) => {
    const d = new Date(lot.purchaseDate)
    return d < min ? d : min
  }, today)

  const totalCostBasis = holdingMetrics.reduce((sum, h) => sum + h.costBasis, 0n)

  if (timeRange === 'ALL' || totalCostBasis === 0n) {
    return [
      { date: oldestDate, value: totalCostBasis },
      { date: today,      value: totalValue },
    ]
  }

  const cutoff = getTimeRangeCutoff(timeRange, today)
  if (cutoff <= oldestDate) {
    return [
      { date: oldestDate, value: totalCostBasis },
      { date: today,      value: totalValue },
    ]
  }

  const totalMs        = today.getTime() - oldestDate.getTime()
  const elapsedMs      = cutoff.getTime() - oldestDate.getTime()
  const t              = elapsedMs / totalMs
  const gain           = totalValue - totalCostBasis
  const interpolated   = BigInt(Math.round(Number(gain) * t))
  const valueAtCutoff  = totalCostBasis + interpolated

  return [
    { date: cutoff, value: valueAtCutoff },
    { date: today,  value: totalValue },
  ]
}

export function HomeDashboardClient({ holdings }: HomeDashboardClientProps) {
  const metrics   = usePortfolioMetrics(holdings)
  const timeRange = useUIStore((s) => s.timeRange)
  const benchmark = useUIStore((s) => s.benchmark)

  const performanceData = useMemo(() => {
    if (metrics.pricesLoading || metrics.totalValue === 0n) return []
    const dailyValues = buildPeriodDailyValues(metrics.holdings, metrics.totalValue, timeRange)
    if (dailyValues.length === 0) return []
    return calcIndexedPerformance(dailyValues)
  }, [metrics, timeRange])

  const fromDate = useMemo(() => {
    if (performanceData.length === 0) return new Date()
    return performanceData[0].date
  }, [performanceData])

  const { data: benchmarkData } = useBenchmark(benchmark, fromDate)
  const { data: moversData, loading: moversLoading } = useMarketMovers(timeRange)

  return (
    <div className="space-y-6">
      {/* ── Performance chart ── */}
      <PerformanceChart
        data={performanceData}
        benchmarkData={benchmarkData}
        loading={metrics.pricesLoading}
      />

      {/* ── Market movers ── */}
      <MarketMovers
        israel={moversData?.israel ?? []}
        us={moversData?.us ?? []}
        etf={moversData?.etf ?? []}
        loading={moversLoading}
        period={timeRange}
      />

      {/* ── P/E multiples ── */}
      <PEMultiples />
    </div>
  )
}
