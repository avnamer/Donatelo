'use client'

import { useEffect, useMemo, useCallback, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { usePortfolioMetrics } from '@/hooks/usePortfolio'
import { refreshPrices } from '@/hooks/usePrices'
import { HoldingsTree } from './HoldingsTree'
import { StalePricesBanner } from './StalePricesBanner'
import { UnavailablePricesPanel } from './UnavailablePricesPanel'
import { PerformanceChart } from '@/components/charts/PerformanceChart'
import { AllocationDonut } from '@/components/charts/AllocationDonut'
import { calcIndexedPerformance, formatCurrency, formatPercent } from '@/lib/calculations'
import { cn, getTimeRangeCutoff } from '@/lib/utils'
import { useUIStore, type TimeRange } from '@/store/ui'
import type { ServerHolding, HoldingMetrics } from '@/hooks/usePortfolio'
import type { FolderRow } from '@/lib/db/queries'
import { useBenchmark } from '@/hooks/useBenchmark'
import { DipAlertsSection } from '@/components/dip-alerts/DipAlertsSection'

interface HomeClientProps {
  holdings: ServerHolding[]
  portfolioName: string
  portfolioId: string
  folders: FolderRow[]
}

// ─── Performance data builder ─────────────────
//
// WITHOUT historical prices the only anchor points we have are:
//   • each lot's purchase date  →  its cost basis (value at purchase by definition)
//   • today                     →  current market value (totalValue)
//
// For ALL time: return those two endpoints directly.  The return shown is
// (totalValue / totalCostBasis − 1) which is the correct lifetime return.
//
// For period views (3M, YTD …): linearly interpolate along the all-time
// baseline to find the estimated portfolio value at the period cutoff, then
// return [cutoff → interpolatedValue, today → totalValue].  This distributes
// the all-time gain proportionally over time and avoids the capital-addition
// distortion that comes from comparing cost-basis partitions.

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

  // If the cutoff predates the oldest lot, fall back to the full history
  if (cutoff <= oldestDate) {
    return [
      { date: oldestDate, value: totalCostBasis },
      { date: today,      value: totalValue },
    ]
  }

  // Linear interpolation: value at cutoff = costBasis + gain × t
  // where t = (cutoff − oldest) / (today − oldest)
  const totalMs   = today.getTime() - oldestDate.getTime()
  const elapsedMs = cutoff.getTime() - oldestDate.getTime()
  const t         = elapsedMs / totalMs   // 0 < t < 1

  const gain            = totalValue - totalCostBasis
  const interpolatedGain = BigInt(Math.round(Number(gain) * t))
  const valueAtCutoff   = totalCostBasis + interpolatedGain

  return [
    { date: cutoff, value: valueAtCutoff },
    { date: today,  value: totalValue },
  ]
}

// ─── Main component ───────────────────────────

export function HomeClient({ holdings, portfolioName, portfolioId, folders }: HomeClientProps) {
  const queryClient = useQueryClient()
  const metrics = usePortfolioMetrics(holdings)
  const currency = useUIStore((s) => s.currency)
  const setOffTarget = useUIStore((s) => s.setOffTarget)
  const timeRange = useUIStore((s) => s.timeRange)
  const benchmark = useUIStore((s) => s.benchmark)
  const [hoveredFolderId, setHoveredFolderId] = useState<string | null>(null)

  // Force-refresh prices for unavailable holdings, then invalidate React Query cache
  const handleRefreshUnavailable = useCallback(async () => {
    const tickers = metrics.unavailableHoldings.map(
      (h) => `${h.tickerSymbol}:${h.exchange === 'TASE' ? 'TASE' : 'US'}`
    )
    if (tickers.length === 0) return
    await refreshPrices(tickers)
    await queryClient.invalidateQueries({ queryKey: ['prices'] })
  }, [metrics.unavailableHoldings, queryClient])

  // Update off-target badge whenever metrics are fresh
  useEffect(() => {
    if (metrics.pricesLoading) return
    const offTarget = folders.some((f) => {
      if (!f.targetAllocationPct) return false
      const actual = metrics.holdings
        .filter((h) => h.rootFolderId === f.id)
        .reduce((sum, h) => sum + h.allocationPct, 0)
      return Math.abs(actual - Number(f.targetAllocationPct)) > 2
    })
    setOffTarget(offTarget)
  }, [metrics, folders, setOffTarget])

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

  // Build allocation segments for donut
  const donutSegments = useMemo(() => {
    const map = new Map<string, { name: string; color: string | null; value: bigint; targetPct: number | null }>()

    for (const h of metrics.holdings) {
      const rootFolderId = h.rootFolderId ?? h.folderId
      if (!map.has(rootFolderId)) {
        const folderData = folders.find((f) => f.id === rootFolderId)
        map.set(rootFolderId, {
          name: h.rootFolderName ?? h.folderName,
          color: h.rootFolderColor ?? h.folderColor,
          value: 0n,
          targetPct: folderData?.targetAllocationPct
            ? Number(folderData.targetAllocationPct)
            : null,
        })
      }
      map.get(rootFolderId)!.value += h.currentValue
    }

    return Array.from(map.entries()).map(([folderId, data]) => ({
      folderId,
      folderName: data.name,
      folderColor: data.color,
      value: Number(data.value),
      actualPct: metrics.totalValue > 0n
        ? (Number(data.value) / Number(metrics.totalValue)) * 100
        : 0,
      targetPct: data.targetPct,
    }))
  }, [metrics, folders])

  const returnPct = formatPercent(metrics.totalReturnPct, 2)
  const isPositive = metrics.totalReturnPct >= 0

  return (
    <div className="space-y-6">
      {/* ── Stale prices warning banner ── */}
      <StalePricesBanner
        unavailableHoldings={metrics.unavailableHoldings}
        onRefresh={handleRefreshUnavailable}
        loading={metrics.pricesLoading}
      />

      {/* ── Row 1: Chart (left) + KPIs (right) ── */}
      <div className="flex flex-col lg:flex-row gap-4 lg:gap-6 items-start">
        {/* Performance chart — takes the bulk of the width */}
        <div className="flex-1 min-w-0 w-full">
          <PerformanceChart
            data={performanceData}
            benchmarkData={benchmarkData}
            loading={metrics.pricesLoading}
          />
          <DipAlertsSection portfolioId={portfolioId} />
        </div>

        {/* KPI list — horizontal row on mobile, vertical on desktop */}
        <div className="w-full lg:w-52 lg:shrink-0 lg:space-y-0 lg:pt-1">
          <div className="grid grid-cols-3 gap-2 lg:block lg:gap-0">
          <KpiRow
            label="VALUE"
            value={formatCurrency(metrics.totalValue, currency, { compact: true })}
            loading={metrics.pricesLoading}
          />
          <KpiRow
            label="RETURN"
            value={returnPct}
            positive={isPositive}
            loading={metrics.pricesLoading}
          />
          <KpiRow
            label="GAIN"
            value={formatCurrency(metrics.totalUnrealizedGains, currency, { compact: true })}
            positive={metrics.totalUnrealizedGains >= 0n}
            loading={metrics.pricesLoading}
          />
          <KpiRow
            label="XIRR"
            value={metrics.xirr !== null
              ? `${metrics.xirr >= 0 ? '+' : ''}${metrics.xirr.toFixed(1)}%`
              : '—'}
            positive={metrics.xirr !== null ? metrics.xirr >= 0 : undefined}
            loading={metrics.pricesLoading}
          />
          <KpiRow
            label="EXPENSE RATIO"
            value={metrics.totalExpenseRatio > 0
              ? `${(metrics.totalExpenseRatio * 100).toFixed(2)}%`
              : '—'}
            loading={metrics.pricesLoading}
          />
          <KpiRow
            label="DIVIDEND YIELD"
            value="—"
            loading={false}
          />
          <KpiRow
            label="LAST UPDATED"
            value={metrics.lastUpdated
              ? metrics.lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
              : '—'}
            loading={metrics.pricesLoading}
          />
          </div>
        </div>
      </div>

      {/* ── Row 2: Tree (left) + Donut (right) ── */}
      <div className="flex flex-col lg:flex-row gap-4 lg:gap-6 items-start">
        {/* Holdings tree */}
        <div className="flex-1 min-w-0 w-full">
          <HoldingsTree
            holdings={metrics.holdings}
            folders={folders}
            portfolioId={portfolioId}
            sectionTitle={portfolioName}
            loading={metrics.pricesLoading}
            onFolderHover={setHoveredFolderId}
          />
        </div>

        {/* Allocation donut */}
        <div className="w-full lg:w-72 lg:shrink-0">
          <AllocationDonut
            segments={donutSegments}
            centerLabel={returnPct}
            highlightedId={hoveredFolderId}
          />
        </div>
      </div>

      {/* ── Row 3: Unavailable prices panel ── */}
      {!metrics.pricesLoading && (
        <UnavailablePricesPanel
          holdings={metrics.unavailableHoldings}
          onRefresh={handleRefreshUnavailable}
        />
      )}
    </div>
  )
}

// ─── KPI Row ──────────────────────────────────

function KpiRow({
  label, value, positive, loading,
}: {
  label: string
  value: string
  positive?: boolean
  loading: boolean
}) {
  return (
    <div className="py-2 lg:py-3 border rounded-lg lg:rounded-none lg:border-0 lg:border-b last:border-0 px-3 lg:px-0 bg-card lg:bg-transparent">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-0.5">
        {label}
      </p>
      {loading ? (
        <div className="h-6 lg:h-7 w-20 animate-pulse rounded bg-muted" />
      ) : (
        <p className={cn(
          'text-lg lg:text-2xl font-bold tabular-nums',
          positive === true && 'text-gain',
          positive === false && 'text-loss',
        )}>
          {value}
        </p>
      )}
    </div>
  )
}
