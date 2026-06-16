'use client'

import { useEffect, useMemo, useCallback, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { usePortfolioMetrics } from '@/hooks/usePortfolio'
import { refreshPrices } from '@/hooks/usePrices'
import { useDailySeries } from '@/hooks/useDailySeries'
import { useFxRate } from '@/hooks/useFxRate'
import { buildIndexedPerformance } from '@/lib/utils/portfolio-chart'
import { InfoTooltip } from '@/components/ui/info-tooltip'
import { HoldingsTree } from './HoldingsTree'
import { StalePricesBanner } from './StalePricesBanner'
import { UnavailablePricesPanel } from './UnavailablePricesPanel'
import { PerformanceChart } from '@/components/charts/PerformanceChart'
import { AllocationDonut } from '@/components/charts/AllocationDonut'
import { formatCurrency, formatPercent } from '@/lib/calculations'
import { cn, getTimeRangeCutoff } from '@/lib/utils'
import { useUIStore, type TimeRange } from '@/store/ui'
import type { ServerHolding } from '@/hooks/usePortfolio'
import type { FolderRow } from '@/lib/db/queries'
import { useBenchmark } from '@/hooks/useBenchmark'
import { DipAlertsSection } from '@/components/dip-alerts/DipAlertsSection'

interface HomeClientProps {
  holdings: ServerHolding[]
  portfolioName: string
  portfolioId: string
  folders: FolderRow[]
}

// ─── Main component ───────────────────────────

export function HomeClient({ holdings, portfolioName, portfolioId, folders }: HomeClientProps) {
  const queryClient = useQueryClient()
  const metrics = usePortfolioMetrics(holdings)
  const currency = useUIStore((s) => s.currency)
  const setOffTarget = useUIStore((s) => s.setOffTarget)
  const timeRange = useUIStore((s) => s.timeRange)
  const benchmark = useUIStore((s) => s.benchmark)
  const { data: fxRate = 3.72 } = useFxRate()
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

  // Determine start date for the selected time range
  const fromDate = useMemo(() => {
    const today = new Date()
    if (timeRange === 'ALL') {
      const allLots = metrics.holdings.flatMap((h) => h.lots)
      if (allLots.length === 0) return getTimeRangeCutoff('1Y', today)
      return allLots.reduce((min, lot) => {
        const d = new Date(lot.purchaseDate)
        return d < min ? d : min
      }, today)
    }
    return getTimeRangeCutoff(timeRange, today)
  }, [timeRange, metrics.holdings])

  const tickers = useMemo(
    () => holdings.map((h) => `${h.tickerSymbol}:${h.exchange === 'TASE' ? 'TASE' : 'US'}`),
    [holdings]
  )

  const { data: seriesMap = {}, isLoading: seriesLoading } = useDailySeries(
    tickers,
    fromDate,
  )

  const performanceData = useMemo(() => {
    if (seriesLoading || Object.keys(seriesMap).length === 0) return []
    return buildIndexedPerformance(metrics.holdings, seriesMap, fxRate, currency, fromDate)
  }, [metrics.holdings, seriesLoading, seriesMap, fxRate, currency, fromDate])

  const chartFromDate = useMemo(() => {
    if (performanceData.length === 0) return new Date()
    return performanceData[0].date
  }, [performanceData])

  // Use raw fromDate so the benchmark request fires in parallel with the series,
  // rather than waiting for the series to resolve first.
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

  const watchlistPlannedTotals = useMemo(() => {
    const totals: Record<string, number> = {}
    for (const h of holdings) {
      if (h.plannedAmount != null) {
        const rootFolderId = h.folder.parentId ?? h.folderId
        totals[rootFolderId] = (totals[rootFolderId] ?? 0) + h.plannedAmount
      }
    }
    return totals
  }, [holdings])

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
            loading={metrics.pricesLoading || seriesLoading}
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
            tooltip="תשואה כוללת: (רווח/הפסד לא ממומש + רווח/הפסד ממומש) ÷ סך הון שנפרס. כולל גם תוצאות של פוזיציות שנמכרו בעבר — לכן עשוי להיות שונה מ-Performance בגרף שמציג רק פוזיציות פתוחות."
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
            watchlistPlannedTotals={watchlistPlannedTotals}
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
  label, value, positive, loading, tooltip,
}: {
  label: string
  value: string
  positive?: boolean
  loading: boolean
  tooltip?: string
}) {
  return (
    <div className="py-2 lg:py-3 border rounded-lg lg:rounded-none lg:border-0 lg:border-b last:border-0 px-3 lg:px-0 bg-card lg:bg-transparent">
      <span className="flex items-center gap-1 mb-0.5">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          {label}
        </p>
        {tooltip && <InfoTooltip text={tooltip} />}
      </span>
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
