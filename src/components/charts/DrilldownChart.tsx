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
 * Given series data for multiple holdings, compute a value-weighted portfolio
 * index (indexed to 100 at the first available date).
 *
 * Algorithm:
 *  1. Collect all unique dates across all holdings that have price data.
 *  2. For each date, compute portfolio value = Σ(shares_i × price_i(date))
 *     using the last-known price for tickers missing that date.
 *  3. Index the value series so the first point = 100.
 */
function buildIndexedSeries(
  holdings: DrilldownHolding[],
  seriesData: Record<string, { currency: string; points: { date: string; price: number }[] }>,
  fxRate: number,
  portfolioCurrency: string,
): { date: string; index: number }[] {
  if (holdings.length === 0) return []

  // Collect all dates (sorted)
  const dateSet = new Set<string>()
  for (const h of holdings) {
    const s = seriesData[h.tickerSymbol]
    if (s) s.points.forEach((p) => dateSet.add(p.date))
  }
  const dates = Array.from(dateSet).sort()
  if (dates.length === 0) return []

  // Build last-known-price map per ticker per date
  // lastPrice[ticker] is updated as we walk through dates
  const lastPrice: Record<string, number> = {}
  // Pre-build a map: ticker → { date → price }
  const priceMap: Record<string, Record<string, number>> = {}
  for (const h of holdings) {
    const s = seriesData[h.tickerSymbol]
    if (!s) continue
    priceMap[h.tickerSymbol] = {}
    for (const p of s.points) {
      priceMap[h.tickerSymbol][p.date] = p.price
    }
  }

  // Walk dates and compute portfolio value at each date
  const values: number[] = []
  for (const date of dates) {
    let portValue = 0
    for (const h of holdings) {
      const pm = priceMap[h.tickerSymbol]
      if (!pm) continue
      if (pm[date] !== undefined) {
        lastPrice[h.tickerSymbol] = pm[date]
      }
      const price = lastPrice[h.tickerSymbol]
      if (price === undefined) continue

      const series = seriesData[h.tickerSymbol]
      const priceCurrency = series?.currency ?? (h.exchange === 'TASE' ? 'ILS' : 'USD')
      // Convert price (cents) to portfolio currency
      let priceInPortfolio = price
      if (priceCurrency !== portfolioCurrency) {
        priceInPortfolio = portfolioCurrency === 'ILS'
          ? price * fxRate
          : price / fxRate
      }
      portValue += h.activeShares * priceInPortfolio
    }
    values.push(portValue)
  }

  // Filter to dates where we have a non-zero portfolio value
  const validPairs = dates.map((d, i) => ({ date: d, value: values[i] }))
    .filter((p) => p.value > 0)
  if (validPairs.length < 2) return []

  const baseValue = validPairs[0].value
  return validPairs.map((p) => ({
    date: p.date,
    index: (p.value / baseValue) * 100,
  }))
}

// ─── Tooltip ──────────────────────────────────

interface TooltipProps {
  active?: boolean
  payload?: Array<{ dataKey: string; value: number; color: string }>
  label?: string
}

function CustomTooltip({ active, payload, label }: TooltipProps) {
  if (!active || !payload?.length) return null
  const point = payload.find((p) => p.dataKey === 'index')
  if (!point) return null
  const change = point.value - 100
  return (
    <div className="rounded-lg border bg-card px-3 py-2 text-sm shadow-sm min-w-[130px]">
      <p className="text-muted-foreground text-xs mb-0.5">{label}</p>
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

  const { data: seriesData, loading } = usePriceSeries(tickerKeys, period)

  const chartData = useMemo(() => {
    if (loading || Object.keys(seriesData).length === 0) return []
    const indexed = buildIndexedSeries(holdings, seriesData, fxRate, portfolioCurrency)
    // Format dates for display
    return indexed.map((p) => ({
      date: formatDate(new Date(p.date)),
      index: p.index,
    }))
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
