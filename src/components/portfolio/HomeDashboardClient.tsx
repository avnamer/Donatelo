'use client'

// ─────────────────────────────────────────────
// HomeDashboardClient — home page client component
// Shows the performance chart + market movers + P/E panel.
// Portfolio holdings are passed from the server (needed for the chart).
// ─────────────────────────────────────────────

import { useMemo } from 'react'
import { usePortfolioMetrics } from '@/hooks/usePortfolio'
import { useDailySeries } from '@/hooks/useDailySeries'
import { buildIndexedPerformance } from '@/lib/utils/portfolio-chart'
import { PerformanceChart } from '@/components/charts/PerformanceChart'
import { MarketMovers } from '@/components/market/MarketMovers'
import { PEMultiples } from '@/components/market/PEMultiples'
import { getTimeRangeCutoff } from '@/lib/utils'
import { useUIStore, type TimeRange } from '@/store/ui'
import { useBenchmark } from '@/hooks/useBenchmark'
import { useMarketMovers } from '@/hooks/useMarketMovers'
import { useFxRate } from '@/hooks/useFxRate'
import type { ServerHolding } from '@/hooks/usePortfolio'

interface HomeDashboardClientProps {
  holdings: ServerHolding[]
}

export function HomeDashboardClient({ holdings }: HomeDashboardClientProps) {
  const metrics   = usePortfolioMetrics(holdings)
  const timeRange = useUIStore((s) => s.timeRange)
  const benchmark = useUIStore((s) => s.benchmark)
  const currency  = useUIStore((s) => s.currency)
  const { data: fxRate = 3.72 } = useFxRate()

  // Determine the start date for the selected time range
  const fromDate = useMemo(() => {
    const today = new Date()
    if (timeRange === 'ALL') {
      // Use the oldest lot purchase date
      const allLots = metrics.holdings.flatMap((h) => h.lots)
      if (allLots.length === 0) return getTimeRangeCutoff('1Y', today)
      return allLots.reduce((min, lot) => {
        const d = new Date(lot.purchaseDate)
        return d < min ? d : min
      }, today)
    }
    return getTimeRangeCutoff(timeRange, today)
  }, [timeRange, metrics.holdings])

  // Fetch daily close price series for all holdings
  const tickers = useMemo(
    () => holdings.map((h) => `${h.tickerSymbol}:${h.exchange === 'TASE' ? 'TASE' : 'US'}`),
    [holdings]
  )

  const { data: seriesMap = {}, isLoading: seriesLoading } = useDailySeries(
    tickers,
    metrics.pricesLoading ? null : fromDate,
  )

  const performanceData = useMemo(() => {
    if (metrics.pricesLoading || seriesLoading || Object.keys(seriesMap).length === 0) return []
    return buildIndexedPerformance(metrics.holdings, seriesMap, fxRate, currency, fromDate)
  }, [metrics.holdings, metrics.pricesLoading, seriesLoading, seriesMap, fxRate, currency, fromDate])

  const chartFromDate = useMemo(() => {
    if (performanceData.length === 0) return new Date()
    return performanceData[0].date
  }, [performanceData])

  const { data: benchmarkData } = useBenchmark(benchmark, chartFromDate)
  const { data: moversData, loading: moversLoading } = useMarketMovers(timeRange)

  const isLoading = metrics.pricesLoading || seriesLoading

  return (
    <div className="space-y-6">
      {/* ── Performance chart ── */}
      <PerformanceChart
        data={performanceData}
        benchmarkData={benchmarkData}
        loading={isLoading}
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
