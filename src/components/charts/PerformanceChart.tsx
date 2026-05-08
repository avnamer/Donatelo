'use client'

// ─────────────────────────────────────────────
// Performance Chart — area chart indexed to 100 at start of period
// Shows portfolio value growth over selected time range
// Uses Recharts
// ─────────────────────────────────────────────

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import { useUIStore, type TimeRange } from '@/store/ui'
import { formatDate } from '@/lib/utils'
import { cn } from '@/lib/utils'

// ─── Types ────────────────────────────────────

export interface PerformancePoint {
  date: Date
  index: number   // normalized to 100 at start of period
}

interface PerformanceChartProps {
  data: PerformancePoint[]
  loading?: boolean
}

// ─── Time range selector ──────────────────────

const TIME_RANGES: TimeRange[] = ['1M', '3M', '6M', 'YTD', '1Y', '3Y', 'ALL']

function TimeRangeSelector() {
  const { timeRange, setTimeRange } = useUIStore()

  return (
    <div className="flex items-center gap-1">
      {TIME_RANGES.map((r) => (
        <button
          key={r}
          onClick={() => setTimeRange(r)}
          className={cn(
            'px-2.5 py-1 rounded text-xs font-medium transition-colors',
            timeRange === r
              ? 'bg-primary text-primary-foreground'
              : 'text-muted-foreground hover:text-foreground hover:bg-muted'
          )}
        >
          {r}
        </button>
      ))}
    </div>
  )
}

// ─── Custom tooltip ───────────────────────────

interface TooltipProps {
  active?: boolean
  payload?: Array<{ value: number }>
  label?: string
}

function CustomTooltip({ active, payload, label }: TooltipProps) {
  if (!active || !payload?.length) return null

  const index = payload[0].value
  const change = index - 100
  const isPositive = change >= 0

  return (
    <div className="rounded-lg border bg-card px-3 py-2 text-sm shadow-sm">
      <p className="text-muted-foreground text-xs">{label}</p>
      <p className="font-semibold tabular-nums">
        {index.toFixed(2)}
      </p>
      <p className={cn('text-xs font-medium', isPositive ? 'text-gain' : 'text-loss')}>
        {isPositive ? '+' : ''}{change.toFixed(2)}%
      </p>
    </div>
  )
}

// ─── Main Component ───────────────────────────

export function PerformanceChart({ data, loading }: PerformanceChartProps) {
  if (loading) {
    return (
      <div className="rounded-xl border bg-card p-4">
        <div className="flex items-center justify-between mb-4">
          <div className="h-5 w-32 animate-pulse rounded bg-muted" />
          <div className="h-7 w-48 animate-pulse rounded bg-muted" />
        </div>
        <div className="h-[220px] animate-pulse rounded bg-muted" />
      </div>
    )
  }

  const isPositive = data.length < 2 || data[data.length - 1]?.index >= 100

  const chartData = data.map((p) => ({
    date: formatDate(p.date),
    index: p.index,
  }))

  const strokeColor = isPositive ? 'hsl(var(--gain))' : 'hsl(var(--loss))'
  const fillId = isPositive ? 'fillGain' : 'fillLoss'

  return (
    <div className="rounded-xl border bg-card p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div>
          <p className="text-sm font-medium text-muted-foreground">Performance</p>
          {data.length > 1 && (
            <p className={cn('text-lg font-bold', isPositive ? 'text-gain' : 'text-loss')}>
              {isPositive ? '+' : ''}
              {(data[data.length - 1]?.index - 100).toFixed(2)}%
            </p>
          )}
        </div>
        <TimeRangeSelector />
      </div>

      {/* Chart */}
      {data.length === 0 ? (
        <div className="h-[220px] flex items-center justify-center text-muted-foreground text-sm">
          No performance data for this period
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={220}>
          <AreaChart data={chartData} margin={{ top: 4, right: 0, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id="fillGain" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="hsl(var(--gain))" stopOpacity={0.15} />
                <stop offset="95%" stopColor="hsl(var(--gain))" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="fillLoss" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="hsl(var(--loss))" stopOpacity={0.15} />
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
              tickFormatter={(v) => `${v}`}
              domain={['auto', 'auto']}
            />
            <Tooltip content={<CustomTooltip />} />
            <Area
              type="monotone"
              dataKey="index"
              stroke={strokeColor}
              strokeWidth={2}
              fill={`url(#${fillId})`}
              dot={false}
              activeDot={{ r: 4, strokeWidth: 0, fill: strokeColor }}
            />
          </AreaChart>
        </ResponsiveContainer>
      )}

      {data.length > 0 && (
        <p className="text-xs text-muted-foreground mt-2 text-center">
          Simulated performance — indexed to 100 at start of period
        </p>
      )}
    </div>
  )
}
