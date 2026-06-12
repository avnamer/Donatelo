'use client'

// ─────────────────────────────────────────────
// DrilldownChart — weighted performance chart for folder / holding level.
//
// For a folder: computes a value-weighted portfolio index across all holdings.
// For a single holding: simply indexes the holding's price series to 100.
//
// Period selector: 30D · 90D · 6M · YTD · 1Y · 3Y
// ─────────────────────────────────────────────

import { useState, useMemo } from 'react'
import {
  ComposedChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import { usePriceSeries, type SeriesPeriod } from '@/hooks/usePriceSeries'
import { cn, formatDate } from '@/lib/utils'

// ─── Types ────────────────────────────────────

export interface DrilldownHolding {
  tickerSymbol: string
  exchange: string
  activeShares: number
  // current value in portfolio currency (cents) — used to weight missing-data periods
  currentValue: number
  // cost basis in portfolio currency (cents/agorot) — used to compute anchor price
  // so the chart return matches the KPI unrealized return
  costBasis: number
  // ISO date of earliest lot purchase — chart will not show returns before this date
  earliestPurchaseDate?: string
}

interface DrilldownChartProps {
  holdings: DrilldownHolding[]
  fxRate?: number           // ILS per USD, used to convert mixed currencies
  portfolioCurrency?: string // 'ILS' | 'USD'
  label?: string            // chart title, e.g. "Israel" or "LUMI.TA"
}

// ─── Period config ────────────────────────────

const PERIODS: { id: SeriesPeriod; label: string }[] = [
  { id: '30d',  label: '30D' },
  { id: '90d',  label: '90D' },
  { id: '6m',   label: '6M' },
  { id: 'ytd',  label: 'YTD' },
  { id: '1y',   label: '1Y' },
  { id: '3y',   label: '3Y' },
]

// ─── Helpers ──────────────────────────────────

/**
 * Remove corrupted price data caused by unit-scale changes in the cache
 * (e.g. prices stored as ILS one day and agora the next, creating a 100x jump).
 *
 * Strategy: scan for consecutive price jumps > MAX_RATIO (5×). If found,
 * truncate everything BEFORE the last such jump — the later data is assumed
 * to be in the correct scale.
 */
const SCALE_JUMP_THRESHOLD = 5

function sanitizePriceSeries(
  points: { date: string; price: number }[]
): { date: string; price: number }[] {
  if (points.length < 2) return points
  let lastScaleShift = -1
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1].price
    const curr = points[i].price
    if (prev > 0 && (curr / prev > SCALE_JUMP_THRESHOLD || curr / prev < 1 / SCALE_JUMP_THRESHOLD)) {
      lastScaleShift = i
    }
  }
  return lastScaleShift >= 0 ? points.slice(lastScaleShift) : points
}

function getPeriodStartDate(period: SeriesPeriod): Date {
  const now = new Date()
  switch (period) {
    case '30d': return new Date(now.getTime() - 30 * 86400000)
    case '90d': return new Date(now.getTime() - 90 * 86400000)
    case '6m':  return new Date(now.getTime() - 180 * 86400000)
    case 'ytd': return new Date(now.getFullYear(), 0, 1)
    case '1y':  return new Date(now.getTime() - 365 * 86400000)
    case '3y':  return new Date(now.getTime() - 3 * 365 * 86400000)
  }
}

/**
 * Compute a cost-basis-weighted portfolio return index (indexed to 100 at start).
 *
 * Anchor strategy:
 *   - If the period was capped by earliestPurchaseDate (holding is newer than the
 *     period) → use cost-basis-equivalent anchor so the all-time return ≈ KPI.
 *   - Otherwise → use price at period start so the chart shows true period return.
 *
 * Weights = cost basis (ensures blended return = totalValue/totalCost = KPI).
 */
function buildIndexedSeries(
  holdings: DrilldownHolding[],
  seriesData: Record<string, { currency: string; points: { date: string; price: number }[] }>,
  fxRate: number,
  _portfolioCurrency: string,
  period: SeriesPeriod,
): { date: string; index: number; price?: number; currency?: string }[] {
  if (holdings.length === 0) return []

  const activeHoldings = holdings.filter((h) => (seriesData[h.tickerSymbol]?.points.length ?? 0) >= 2)
  if (activeHoldings.length === 0) return []

  // Cost-basis weights so blended return = totalValue/totalCostBasis = KPI
  const totalCost = activeHoldings.reduce((s, h) => s + h.costBasis, 0)
  const weights: Record<string, number> = {}
  if (totalCost > 0) {
    for (const h of activeHoldings) weights[h.tickerSymbol] = h.costBasis / totalCost
  } else {
    const eq = 1 / activeHoldings.length
    for (const h of activeHoldings) weights[h.tickerSymbol] = eq
  }

  const periodStart = getPeriodStartDate(period)

  const priceMap: Record<string, Record<string, number>> = {}
  const anchorPrice: Record<string, number> = {}
  const dateSet = new Set<string>()

  for (const h of activeHoldings) {
    const s = seriesData[h.tickerSymbol]
    if (!s) continue
    const clean = sanitizePriceSeries(s.points)
    if (clean.length < 2) continue
    priceMap[h.tickerSymbol] = {}
    for (const p of clean) {
      priceMap[h.tickerSymbol][p.date] = p.price
      dateSet.add(p.date)
    }

    // If the period was capped to purchase date, use cost-basis-equivalent anchor
    // so the chart shows true lifetime return matching the KPI.
    // Otherwise use price at period start for a true period return.
    const periodCapped =
      h.earliestPurchaseDate != null &&
      new Date(h.earliestPurchaseDate) > periodStart
    if (periodCapped && h.costBasis > 0 && h.activeShares > 0) {
      const isUSD = s.currency === 'USD'
      anchorPrice[h.tickerSymbol] = isUSD
        ? h.costBasis / (fxRate * h.activeShares)
        : h.costBasis / h.activeShares
    } else {
      anchorPrice[h.tickerSymbol] = clean[0].price
    }
  }

  const dates = Array.from(dateSet).sort()

  // Walk dates, carry forward last known price per holding
  const isSingleHolding = activeHoldings.length === 1
  const singleCurrency = isSingleHolding ? seriesData[activeHoldings[0].tickerSymbol]?.currency : undefined

  const lastPrice: Record<string, number> = {}
  const result: { date: string; index: number; price?: number; currency?: string }[] = []

  for (const date of dates) {
    for (const h of activeHoldings) {
      const pm = priceMap[h.tickerSymbol]
      if (pm?.[date] !== undefined) lastPrice[h.tickerSymbol] = pm[date]
    }

    let idx = 0
    let weightSum = 0
    for (const h of activeHoldings) {
      const price = lastPrice[h.tickerSymbol]
      const anchor = anchorPrice[h.tickerSymbol]
      if (price === undefined || !anchor) continue
      idx += weights[h.tickerSymbol] * (price / anchor)
      weightSum += weights[h.tickerSymbol]
    }

    if (weightSum > 0) {
      const index = (idx / weightSum) * 100
      if (isFinite(index) && index > 0 && index < 100_000) {
        const entry: { date: string; index: number; price?: number; currency?: string } = { date, index }
        if (isSingleHolding) {
          const raw = lastPrice[activeHoldings[0].tickerSymbol]
          if (raw !== undefined) {
            // price_cache stores in cents/agorot — divide by 100 for display
            entry.price = raw / 100
            entry.currency = singleCurrency
          }
        }
        result.push(entry)
      }
    }
  }

  if (result.length < 2) return []
  return result
}

// ─── Tooltip ──────────────────────────────────

interface TooltipProps {
  active?: boolean
  payload?: Array<{ dataKey: string; value: number; color: string; payload: Record<string, unknown> }>
  label?: string
}

function formatPrice(price: number, currency: string) {
  if (currency === 'ILS') return `₪${price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  return `$${price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function CustomTooltip({ active, payload, label }: TooltipProps) {
  if (!active || !payload?.length) return null
  const point = payload.find((p) => p.dataKey === 'index')
  if (!point) return null
  const change = point.value - 100
  const price = point.payload.price as number | undefined
  const currency = point.payload.currency as string | undefined

  return (
    <div className="rounded-lg border bg-card px-3 py-2 text-sm shadow-sm min-w-[140px]">
      <p className="text-muted-foreground text-xs mb-1">{label}</p>
      {price !== undefined && currency && (
        <p className="text-xs font-medium tabular-nums mb-0.5">
          {formatPrice(price, currency)}
        </p>
      )}
      <p
        className="text-xs font-semibold tabular-nums"
        style={{ color: point.color }}
      >
        {change >= 0 ? '+' : ''}{change.toFixed(2)}%
      </p>
    </div>
  )
}

// ─── Main Component ───────────────────────────

export function DrilldownChart({
  holdings,
  fxRate = 3.72,
  portfolioCurrency = 'ILS',
  label = 'Performance',
}: DrilldownChartProps) {
  const [period, setPeriod] = useState<SeriesPeriod>('1y')

  const tickerKeys = useMemo(
    () => holdings.map((h) => `${h.tickerSymbol}:${h.exchange === 'TASE' ? 'TASE' : 'US'}`),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [holdings.map((h) => `${h.tickerSymbol}:${h.exchange}`).join(',')]
  )

  // Earliest lot date across all holdings — cap the chart so it never shows
  // returns from before the user actually owned any position.
  const earliestDate = useMemo(() => {
    const dates = holdings
      .map((h) => h.earliestPurchaseDate)
      .filter((d): d is string => !!d)
    return dates.length > 0 ? dates.sort()[0] : undefined
  }, [holdings.map((h) => h.earliestPurchaseDate ?? '').join(',')])  // eslint-disable-line react-hooks/exhaustive-deps

  const { data: seriesData, loading } = usePriceSeries(tickerKeys, period, earliestDate)

  const chartData = useMemo((): { date: string; index: number; price?: number; currency?: string }[] => {
    if (loading || Object.keys(seriesData).length === 0) return []
    const indexed = buildIndexedSeries(holdings, seriesData, fxRate, portfolioCurrency, period)
    return indexed.map((p) => {
      const entry: { date: string; index: number; price?: number; currency?: string } = {
        date: formatDate(new Date(p.date)),
        index: p.index,
      }
      if (p.price !== undefined) { entry.price = p.price; entry.currency = p.currency }
      return entry
    })
  }, [seriesData, loading, holdings, fxRate, portfolioCurrency])

  const lastIndex = chartData[chartData.length - 1]?.index ?? 100
  const isPositive = lastIndex >= 100
  const returnPct = lastIndex - 100
  const strokeColor = isPositive ? 'hsl(var(--gain))' : 'hsl(var(--loss))'
  const fillId = isPositive ? 'ddFillGain' : 'ddFillLoss'

  if (loading) {
    return (
      <div className="rounded-xl border bg-card p-4">
        <div className="flex items-center justify-between mb-4">
          <div className="h-5 w-28 animate-pulse rounded bg-muted" />
          <div className="h-7 w-44 animate-pulse rounded bg-muted" />
        </div>
        <div className="h-[200px] animate-pulse rounded bg-muted" />
      </div>
    )
  }

  return (
    <div className="rounded-xl border bg-card p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div>
          <p className="text-sm font-medium text-muted-foreground">{label}</p>
          {chartData.length > 1 && (
            <p className={cn('text-lg font-bold', isPositive ? 'text-gain' : 'text-loss')}>
              {isPositive ? '+' : ''}{returnPct.toFixed(2)}%
            </p>
          )}
        </div>
        {/* Period selector */}
        <div className="flex items-center gap-1">
          {PERIODS.map((p) => (
            <button
              key={p.id}
              onClick={() => setPeriod(p.id)}
              className={cn(
                'px-2.5 py-1 rounded text-xs font-medium transition-colors',
                period === p.id
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted'
              )}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Chart */}
      {chartData.length < 2 ? (
        <div className="h-[200px] flex items-center justify-center text-muted-foreground text-sm">
          No price history for this period
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={200}>
          <ComposedChart data={chartData} margin={{ top: 4, right: 0, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id="ddFillGain" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="hsl(var(--gain))" stopOpacity={0.25} />
                <stop offset="95%" stopColor="hsl(var(--gain))" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="ddFillLoss" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="hsl(var(--loss))" stopOpacity={0.25} />
                <stop offset="95%" stopColor="hsl(var(--loss))" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
              tickLine={false}
              axisLine={false}
              interval="preserveStartEnd"
            />
            <YAxis
              tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
              tickLine={false}
              axisLine={false}
              domain={['auto', 'auto']}
            />
            <Tooltip content={<CustomTooltip />} />
            <Area
              type="monotone"
              dataKey="index"
              stroke={strokeColor}
              strokeWidth={2.5}
              fill={`url(#${fillId})`}
              dot={false}
              activeDot={{ r: 4, strokeWidth: 0, fill: strokeColor }}
              connectNulls
            />
          </ComposedChart>
        </ResponsiveContainer>
      )}

      {chartData.length >= 2 && (
        <p className="text-xs text-muted-foreground mt-1 text-center">
          Indexed to 100 at start of period
        </p>
      )}
    </div>
  )
}
