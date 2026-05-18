'use client'

// ─────────────────────────────────────────────
// Performance Chart — area chart indexed to 100 at start of period
// Shows portfolio value growth over selected time range
// Uses Recharts
// ─────────────────────────────────────────────

import {
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import { useUIStore, type TimeRange, type BenchmarkId, BENCHMARK_LABELS } from '@/store/ui'
import { formatDate } from '@/lib/utils'
import { cn } from '@/lib/utils'

// ─── Types ────────────────────────────────────

export interface PerformancePoint {
  date: Date
  index: number   // normalized to 100 at start of period
}

interface PerformanceChartProps {
  data: PerformancePoint[]
  benchmarkData?: PerformancePoint[]
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

interface TooltipPayloadItem {
  dataKey: string
  value: number
  color: string
}

interface TooltipProps {
  active?: boolean
  payload?: TooltipPayloadItem[]
  label?: string
}

function TooltipRow({ color, label, change }: { color: string; label: string; change: number }) {
  return (
    <div className="flex items-center justify-between gap-4 mt-1">
      <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <span className="inline-block w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
        {label}
      </span>
      <span
        className="text-xs font-semibold tabular-nums"
        style={{ color }}
      >
        {change >= 0 ? '+' : ''}{change.toFixed(2)}%
      </span>
    </div>
  )
}

function CustomTooltip({ active, payload, label }: TooltipProps) {
  if (!active || !payload?.length) return null

  const portfolio  = payload.find((p) => p.dataKey === 'index')
  const benchmark  = payload.find((p) => p.dataKey === 'benchmarkIndex')

  if (!portfolio) return null

  return (
    <div className="rounded-lg border bg-card px-3 py-2 text-sm shadow-sm min-w-[140px]">
      <p className="text-muted-foreground text-xs mb-0.5">{label}</p>
      <TooltipRow
        color={portfolio.color}
        label="Portfolio"
        change={portfolio.value - 100}
      />
      {benchmark != null && (
        <TooltipRow
          color={benchmark.color}
          label="Benchmark"
          change={benchmark.value - 100}
        />
      )}
    </div>
  )
}

// ─── Merge chart data ─────────────────────────

type ChartRow = { date: string; index: number | null; benchmarkIndex: number | null }

function mergeChartData(
  portfolioData: PerformancePoint[],
  benchmarkData: PerformancePoint[],
): ChartRow[] {
  const map = new Map<string, ChartRow>()

  for (const p of portfolioData) {
    const iso = p.date.toISOString().slice(0, 10)
    map.set(iso, { date: formatDate(p.date), index: p.index, benchmarkIndex: null })
  }
  for (const p of benchmarkData) {
    const iso = p.date.toISOString().slice(0, 10)
    const row = map.get(iso)
    if (row) {
      row.benchmarkIndex = p.index
    } else {
      map.set(iso, { date: formatDate(p.date), index: null, benchmarkIndex: p.index })
    }
  }

  return Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, row]) => row)
}

// ─── Benchmark selector ───────────────────────

const BENCHMARK_IDS: BenchmarkId[] = [
  'none', '^GSPC', 'URTH', '^IXIC', '^TA35.TA', '^TA90.TA', '^TA125.TA',
]

function BenchmarkSelector() {
  const { benchmark, setBenchmark } = useUIStore()

  return (
    <div className="flex items-center gap-1 flex-wrap">
      <span className="text-xs text-muted-foreground mr-1">vs:</span>
      {BENCHMARK_IDS.map((id) => (
        <button
          key={id}
          onClick={() => setBenchmark(id)}
          className={cn(
            'px-2.5 py-1 rounded text-xs font-medium transition-colors',
            benchmark === id
              ? 'bg-primary text-primary-foreground'
              : 'text-muted-foreground hover:text-foreground hover:bg-muted'
          )}
        >
          {BENCHMARK_LABELS[id]}
        </button>
      ))}
    </div>
  )
}

// ─── Main Component ───────────────────────────

export function PerformanceChart({ data, benchmarkData = [], loading }: PerformanceChartProps) {
  const { benchmark } = useUIStore()

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
  const strokeColor = isPositive ? 'hsl(var(--gain))' : 'hsl(var(--loss))'
  const fillId      = isPositive ? 'fillGain' : 'fillLoss'

  const chartData = mergeChartData(data, benchmarkData)

  return (
    <div className="rounded-xl border bg-card p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
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

      {/* Benchmark chips */}
      <div className="mb-3">
        <BenchmarkSelector />
      </div>

      {/* Chart */}
      {data.length === 0 ? (
        <div className="h-[220px] flex items-center justify-center text-muted-foreground text-sm">
          No performance data for this period
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={220}>
          <ComposedChart data={chartData} margin={{ top: 4, right: 0, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id="fillGain" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="hsl(var(--gain))" stopOpacity={0.25} />
                <stop offset="95%" stopColor="hsl(var(--gain))" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="fillLoss" x1="0" y1="0" x2="0" y2="1">
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
              tickFormatter={(v) => `${v}`}
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
            {benchmark !== 'none' && benchmarkData.length > 0 && (
              <Line
                type="monotone"
                dataKey="benchmarkIndex"
                stroke="#3b82f6"
                strokeWidth={2}
                strokeDasharray="5 3"
                dot={false}
                activeDot={{ r: 4, strokeWidth: 0, fill: '#3b82f6' }}
                connectNulls
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      )}

      {/* Legend */}
      {data.length > 0 && benchmark !== 'none' && benchmarkData.length > 0 && (
        <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span
              className="inline-block w-3 h-0.5 rounded"
              style={{ backgroundColor: strokeColor }}
            />
            Portfolio
          </span>
          <span className="flex items-center gap-1.5">
            <span
              className="inline-block w-3 h-0.5"
              style={{
                backgroundColor: '#3b82f6',
                backgroundImage:
                  'repeating-linear-gradient(90deg,#3b82f6 0px,#3b82f6 4px,transparent 4px,transparent 6px)',
              }}
            />
            {BENCHMARK_LABELS[benchmark]}
          </span>
        </div>
      )}

      {data.length > 0 && (
        <p className="text-xs text-muted-foreground mt-1 text-center">
          Simulated performance — indexed to 100 at start of period
        </p>
      )}
    </div>
  )
}
