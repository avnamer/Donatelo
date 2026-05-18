# Chart Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the time range buttons on the performance chart (currently no-ops) and add a benchmark comparison line (S&P 500 default) with a chip selector and legend.

**Architecture:** Add `BenchmarkId` type and state to the Zustand store, create a `/api/benchmark` route that proxies Yahoo Finance, wire a `useBenchmark` hook in `HomeClient`, and update `PerformanceChart` to render a second dashed line with chips + legend.

**Tech Stack:** Next.js App Router, React, Recharts, Zustand, TanStack Query, Yahoo Finance public API, Vitest

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Modify | `src/store/ui.ts` | Add `BenchmarkId` type, `BENCHMARK_LABELS` map, `benchmark` state |
| Modify | `src/lib/utils/index.ts` | Add `getTimeRangeCutoff` helper |
| Modify | `src/lib/calculations/calculations.test.ts` | Tests for `getTimeRangeCutoff` |
| Create | `src/app/api/benchmark/route.ts` | Proxy Yahoo Finance, return normalized `PerformancePoint[]` |
| Create | `src/hooks/useBenchmark.ts` | TanStack Query hook calling `/api/benchmark` |
| Modify | `src/components/portfolio/HomeClient.tsx` | Fix time range filtering, wire `useBenchmark`, pass `benchmarkData` |
| Modify | `src/components/charts/PerformanceChart.tsx` | Benchmark chip row, merged chart data, dashed `<Line>`, legend |

---

## Task 1: Add BenchmarkId type and state to the store

**Files:**
- Modify: `src/store/ui.ts`

- [ ] **Step 1: Add `BenchmarkId` type and `BENCHMARK_LABELS` constant**

Open `src/store/ui.ts`. After the `TimeRange` type (line 12), add:

```typescript
export type BenchmarkId =
  | 'none'
  | '^GSPC'
  | 'URTH'
  | '^IXIC'
  | '^TA35.TA'
  | '^TA90.TA'
  | '^TA125.TA'

export const BENCHMARK_LABELS: Record<BenchmarkId, string> = {
  'none':      'ללא השוואה',
  '^GSPC':     'S&P 500',
  'URTH':      'MSCI World',
  '^IXIC':     'Nasdaq',
  '^TA35.TA':  'תל אביב 35',
  '^TA90.TA':  'תל אביב 90',
  '^TA125.TA': 'תל אביב 125',
}
```

- [ ] **Step 2: Add `benchmark` fields to `UIState` interface**

In `UIState` interface, after the `timeRange` block, add:

```typescript
  // Selected benchmark for performance chart
  benchmark: BenchmarkId
  setBenchmark: (b: BenchmarkId) => void
```

- [ ] **Step 3: Add `benchmark` to store implementation**

In the `create<UIState>()` call, after the `setTimeRange` line, add:

```typescript
      // ── Benchmark ─────────────────────────────
      benchmark: '^GSPC',
      setBenchmark: (benchmark) => set({ benchmark }),
```

- [ ] **Step 4: Persist `benchmark` alongside `timeRange`**

In the `partialize` function, add `benchmark`:

```typescript
      partialize: (state) => ({
        currency: state.currency,
        timeRange: state.timeRange,
        benchmark: state.benchmark,
      }),
```

- [ ] **Step 5: Commit**

```bash
git add src/store/ui.ts
git commit -m "feat: add BenchmarkId type and benchmark state to UI store"
```

---

## Task 2: Add `getTimeRangeCutoff` helper + tests

**Files:**
- Modify: `src/lib/utils/index.ts`
- Modify: `src/lib/calculations/calculations.test.ts`

- [ ] **Step 1: Write failing tests first**

Add to the end of `src/lib/calculations/calculations.test.ts`:

```typescript
import { getTimeRangeCutoff } from '@/lib/utils'
import type { TimeRange } from '@/store/ui'

describe('getTimeRangeCutoff', () => {
  const today = new Date('2026-05-18T12:00:00Z')

  it('1M → 30 days before today', () => {
    const result = getTimeRangeCutoff('1M', today)
    const expected = new Date('2026-04-18T12:00:00Z')
    expect(result.toDateString()).toBe(expected.toDateString())
  })

  it('3M → 90 days before today', () => {
    const result = getTimeRangeCutoff('3M', today)
    const expected = new Date(today)
    expected.setDate(expected.getDate() - 90)
    expect(result.toDateString()).toBe(expected.toDateString())
  })

  it('6M → 180 days before today', () => {
    const result = getTimeRangeCutoff('6M', today)
    const expected = new Date(today)
    expected.setDate(expected.getDate() - 180)
    expect(result.toDateString()).toBe(expected.toDateString())
  })

  it('YTD → Jan 1 of current year', () => {
    const result = getTimeRangeCutoff('YTD', today)
    expect(result.getFullYear()).toBe(2026)
    expect(result.getMonth()).toBe(0)
    expect(result.getDate()).toBe(1)
  })

  it('1Y → 1 year before today', () => {
    const result = getTimeRangeCutoff('1Y', today)
    expect(result.getFullYear()).toBe(2025)
    expect(result.getMonth()).toBe(today.getMonth())
  })

  it('3Y → 3 years before today', () => {
    const result = getTimeRangeCutoff('3Y', today)
    expect(result.getFullYear()).toBe(2023)
  })

  it('ALL → epoch (no cutoff)', () => {
    const result = getTimeRangeCutoff('ALL', today)
    expect(result.getTime()).toBe(0)
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd C:/Users/Avner/donatelo
npx vitest run src/lib/calculations/calculations.test.ts
```

Expected: FAIL — `getTimeRangeCutoff is not a function`

- [ ] **Step 3: Implement `getTimeRangeCutoff` in utils**

Add to the end of `src/lib/utils/index.ts`:

```typescript
import type { TimeRange } from '@/store/ui'

export function getTimeRangeCutoff(timeRange: TimeRange, today: Date = new Date()): Date {
  const d = new Date(today)
  switch (timeRange) {
    case '1M':  d.setDate(d.getDate() - 30);       return d
    case '3M':  d.setDate(d.getDate() - 90);       return d
    case '6M':  d.setDate(d.getDate() - 180);      return d
    case 'YTD': return new Date(d.getFullYear(), 0, 1)
    case '1Y':  d.setFullYear(d.getFullYear() - 1); return d
    case '3Y':  d.setFullYear(d.getFullYear() - 3); return d
    case 'ALL': return new Date(0)
  }
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npx vitest run src/lib/calculations/calculations.test.ts
```

Expected: all tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/utils/index.ts src/lib/calculations/calculations.test.ts
git commit -m "feat: add getTimeRangeCutoff utility with tests"
```

---

## Task 3: Create `/api/benchmark` route

**Files:**
- Create: `src/app/api/benchmark/route.ts`

- [ ] **Step 1: Create the file**

Create `src/app/api/benchmark/route.ts`:

```typescript
// ─────────────────────────────────────────────
// GET /api/benchmark
//
// Accepts: ?ticker=^GSPC&from=YYYY-MM-DD
// Returns: { data: Array<{ date: string; index: number }> }
//          Normalized to 100 at the first data point.
//
// Uses Yahoo Finance public chart endpoint (no API key).
// ─────────────────────────────────────────────

import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/db/supabase-server'
import type { BenchmarkId } from '@/store/ui'

const VALID_TICKERS = new Set<string>([
  '^GSPC', 'URTH', '^IXIC', '^TA35.TA', '^TA90.TA', '^TA125.TA',
])

export async function GET(request: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const ticker = request.nextUrl.searchParams.get('ticker')
  const from   = request.nextUrl.searchParams.get('from')  // YYYY-MM-DD

  if (!ticker || !VALID_TICKERS.has(ticker)) {
    return NextResponse.json({ error: 'Invalid ticker' }, { status: 400 })
  }
  if (!from || !/^\d{4}-\d{2}-\d{2}$/.test(from)) {
    return NextResponse.json({ error: 'Invalid from date' }, { status: 400 })
  }

  const fromUnix = Math.floor(new Date(from).getTime() / 1000)
  const toUnix   = Math.floor(Date.now() / 1000)

  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1d&period1=${fromUnix}&period2=${toUnix}`

    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' },
      next: { revalidate: 3600 },  // cache 1 hour
    })

    if (!res.ok) return NextResponse.json({ data: [] })

    const json = await res.json() as {
      chart?: {
        result?: Array<{
          timestamp?: number[]
          indicators?: { quote?: Array<{ close?: (number | null)[] }> }
        }>
      }
    }

    const result = json.chart?.result?.[0]
    if (!result) return NextResponse.json({ data: [] })

    const timestamps = result.timestamp ?? []
    const closes     = result.indicators?.quote?.[0]?.close ?? []

    const points = timestamps
      .map((ts, i) => {
        const close = closes[i]
        if (!close) return null
        return { date: new Date(ts * 1000).toISOString().slice(0, 10), close }
      })
      .filter((p): p is { date: string; close: number } => p !== null)

    if (points.length === 0) return NextResponse.json({ data: [] })

    const startClose = points[0].close
    const data = points.map((p) => ({
      date:  p.date,
      index: (p.close / startClose) * 100,
    }))

    return NextResponse.json({ data })
  } catch {
    return NextResponse.json({ data: [] })
  }
}
```

- [ ] **Step 2: Manual smoke test**

Start the dev server (`npm run dev`) and open in the browser:
```
http://localhost:3000/api/benchmark?ticker=%5EGSPC&from=2025-01-01
```

Expected: JSON response with `{ data: [...] }` containing ~100 objects with `date` and `index` fields. First `index` should be `100`.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/benchmark/route.ts
git commit -m "feat: add /api/benchmark route proxying Yahoo Finance"
```

---

## Task 4: Create `useBenchmark` hook

**Files:**
- Create: `src/hooks/useBenchmark.ts`

- [ ] **Step 1: Create the hook**

Create `src/hooks/useBenchmark.ts`:

```typescript
'use client'

import { useQuery } from '@tanstack/react-query'
import type { BenchmarkId } from '@/store/ui'
import type { PerformancePoint } from '@/components/charts/PerformanceChart'

export function useBenchmark(ticker: BenchmarkId, fromDate: Date) {
  const from = fromDate.toISOString().slice(0, 10)

  const { data = [], isLoading, error } = useQuery({
    queryKey: ['benchmark', ticker, from],
    queryFn: async (): Promise<PerformancePoint[]> => {
      const res = await fetch(
        `/api/benchmark?ticker=${encodeURIComponent(ticker)}&from=${from}`
      )
      if (!res.ok) return []
      const json = await res.json() as { data: Array<{ date: string; index: number }> }
      return json.data.map((p) => ({ date: new Date(p.date), index: p.index }))
    },
    enabled: ticker !== 'none',
    staleTime: 60 * 60 * 1000,  // 1 hour
  })

  return {
    data:    ticker === 'none' ? ([] as PerformancePoint[]) : data,
    loading: ticker !== 'none' && isLoading,
    error:   error ? String(error) : null,
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/hooks/useBenchmark.ts
git commit -m "feat: add useBenchmark hook"
```

---

## Task 5: Fix time range filtering in `HomeClient`

**Files:**
- Modify: `src/components/portfolio/HomeClient.tsx`

The current `performanceData` useMemo always uses the oldest lot date as start and `metrics.totalCostBasis` as the start value — producing the same chart regardless of selected time range. This task replaces it with a multi-point builder that respects `timeRange`.

- [ ] **Step 1: Add imports**

At the top of `HomeClient.tsx`, update the import from `@/lib/utils`:

```typescript
import { cn, getTimeRangeCutoff } from '@/lib/utils'
```

Update the `@/store/ui` import to include new types:

```typescript
import { useUIStore, type TimeRange } from '@/store/ui'
```

Add imports for the new hook and `HoldingMetrics`:

```typescript
import { useBenchmark } from '@/hooks/useBenchmark'
import type { ServerHolding, HoldingMetrics } from '@/hooks/usePortfolio'
```

(`ServerHolding` is already imported — add `HoldingMetrics` to that import line.)

- [ ] **Step 2: Add `buildPeriodDailyValues` helper above the component**

Add this function before `export function HomeClient`:

```typescript
function buildPeriodDailyValues(
  holdingMetrics: HoldingMetrics[],
  totalValue: bigint,
  timeRange: TimeRange,
): Array<{ date: Date; value: bigint }> {
  const today = new Date()
  const cutoff = getTimeRangeCutoff(timeRange, today)

  // For ALL, keep original two-point approach
  if (timeRange === 'ALL') {
    const allLots = holdingMetrics.flatMap((h) => h.lots)
    if (allLots.length === 0) return []
    const oldestDate = allLots.reduce((min, lot) => {
      const d = new Date(lot.purchaseDate)
      return d < min ? d : min
    }, today)
    const totalCostBasis = holdingMetrics.reduce((sum, h) => sum + h.costBasis, 0n)
    return [
      { date: oldestDate, value: totalCostBasis },
      { date: today,      value: totalValue },
    ]
  }

  // Build per-lot cost basis in display currency using proportional allocation
  type LotEntry = { purchaseDate: Date; displayCostBasis: bigint }
  const lotsWithCost: LotEntry[] = []

  for (const holding of holdingMetrics) {
    const nativeCosts = holding.lots.map(
      (lot) => lot.shares * Number(lot.costPerShare)
    )
    const totalNative = nativeCosts.reduce((a, b) => a + b, 0)
    if (totalNative === 0) continue

    for (let i = 0; i < holding.lots.length; i++) {
      const ratio = nativeCosts[i] / totalNative
      lotsWithCost.push({
        purchaseDate:    new Date(holding.lots[i].purchaseDate),
        displayCostBasis: BigInt(Math.round(Number(holding.costBasis) * ratio)),
      })
    }
  }

  if (lotsWithCost.length === 0) return []

  const priorLots  = lotsWithCost.filter((l) => l.purchaseDate < cutoff)
  const periodLots = lotsWithCost
    .filter((l) => l.purchaseDate >= cutoff)
    .sort((a, b) => a.purchaseDate.getTime() - b.purchaseDate.getTime())

  const priorCostBasis = priorLots.reduce((sum, l) => sum + l.displayCostBasis, 0n)

  if (priorCostBasis === 0n && periodLots.length === 0) return []

  const startDate  = priorCostBasis > 0n ? cutoff : periodLots[0].purchaseDate
  const startValue = priorCostBasis > 0n ? priorCostBasis : periodLots[0].displayCostBasis

  const points: Array<{ date: Date; value: bigint }> = [{ date: startDate, value: startValue }]

  let running = priorCostBasis
  const toAdd = priorCostBasis > 0n ? periodLots : periodLots.slice(1)

  for (const lot of toAdd) {
    running += lot.displayCostBasis
    points.push({ date: lot.purchaseDate, value: running })
  }

  points.push({ date: today, value: totalValue })
  return points
}
```

- [ ] **Step 3: Read `timeRange` and `benchmark` from store inside the component**

Inside `HomeClient`, update the `useUIStore` reads. Currently there's:
```typescript
const currency = useUIStore((s) => s.currency)
const setOffTarget = useUIStore((s) => s.setOffTarget)
```

Add below them:
```typescript
const timeRange = useUIStore((s) => s.timeRange)
const benchmark = useUIStore((s) => s.benchmark)
```

- [ ] **Step 4: Replace `performanceData` useMemo**

Replace the existing `performanceData` useMemo (lines 55–67) with:

```typescript
const performanceData = useMemo(() => {
  if (metrics.pricesLoading || metrics.totalValue === 0n) return []
  const dailyValues = buildPeriodDailyValues(metrics.holdings, metrics.totalValue, timeRange)
  if (dailyValues.length === 0) return []
  return calcIndexedPerformance(dailyValues)
}, [metrics, timeRange])
```

- [ ] **Step 5: Compute `fromDate` and call `useBenchmark`**

After the `performanceData` useMemo, add:

```typescript
const fromDate = useMemo(() => {
  if (performanceData.length === 0) return new Date()
  return performanceData[0].date
}, [performanceData])

const { data: benchmarkData } = useBenchmark(benchmark, fromDate)
```

- [ ] **Step 6: Pass `benchmarkData` to `PerformanceChart`**

Update the `<PerformanceChart>` JSX:

```tsx
<PerformanceChart
  data={performanceData}
  benchmarkData={benchmarkData}
  loading={metrics.pricesLoading}
/>
```

- [ ] **Step 7: Commit**

```bash
git add src/components/portfolio/HomeClient.tsx
git commit -m "feat: fix time range filtering and wire benchmark data in HomeClient"
```

---

## Task 6: Update `PerformanceChart` — chips, overlay line, legend

**Files:**
- Modify: `src/components/charts/PerformanceChart.tsx`

- [ ] **Step 1: Update imports**

Replace the existing recharts import with:

```typescript
import {
  AreaChart,
  Area,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
```

Update the store import to include benchmark types:

```typescript
import { useUIStore, type TimeRange, type BenchmarkId, BENCHMARK_LABELS } from '@/store/ui'
```

- [ ] **Step 2: Update `PerformanceChartProps`**

Replace the interface:

```typescript
interface PerformanceChartProps {
  data: PerformancePoint[]
  benchmarkData?: PerformancePoint[]
  loading?: boolean
}
```

- [ ] **Step 3: Add `mergeChartData` helper**

Add before the `PerformanceChart` function:

```typescript
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
```

- [ ] **Step 4: Add `BenchmarkSelector` component**

Add after the `TimeRangeSelector` component:

```typescript
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
```

- [ ] **Step 5: Replace the `PerformanceChart` function**

Replace the entire `export function PerformanceChart` with:

```typescript
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
              connectNulls
            />
            {benchmark !== 'none' && benchmarkData.length > 0 && (
              <Line
                type="monotone"
                dataKey="benchmarkIndex"
                stroke="#3b82f6"
                strokeWidth={1.5}
                strokeDasharray="4 2"
                dot={false}
                activeDot={false}
                connectNulls
              />
            )}
          </AreaChart>
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
```

- [ ] **Step 6: Run the TypeScript compiler to check for errors**

```bash
cd C:/Users/Avner/donatelo
npx tsc --noEmit
```

Expected: no errors. If errors appear, fix type mismatches before continuing.

- [ ] **Step 7: Run all tests**

```bash
npx vitest run
```

Expected: all tests PASS

- [ ] **Step 8: Commit**

```bash
git add src/components/charts/PerformanceChart.tsx
git commit -m "feat: add benchmark chip selector, overlay line, and legend to PerformanceChart"
```

---

## Task 7: End-to-end verification

- [ ] **Step 1: Start the dev server**

```bash
npm run dev
```

- [ ] **Step 2: Verify time range buttons**

Open http://localhost:3000. Click each time range button (1M, 3M, 6M, YTD, 1Y, 3Y, ALL).

✓ Each button produces a visually different chart (different start date, different slope)
✓ ALL shows the full history from earliest purchase
✓ YTD starts from Jan 1 of the current year

- [ ] **Step 3: Verify benchmark chips**

✓ S&P 500 is selected by default and shows a dashed blue line on the chart
✓ Clicking other benchmarks (MSCI World, Nasdaq, etc.) switches the overlay line
✓ Clicking "ללא השוואה" hides the overlay and legend
✓ Legend appears below the chart showing Portfolio + selected benchmark name in Hebrew
✓ Switching time range with a benchmark active re-fetches benchmark data for the new period

- [ ] **Step 4: Verify persistence**

✓ Reload the page — selected time range and benchmark are restored from localStorage

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "feat: chart improvements complete — time range fix + benchmark comparison"
```

---

## Roadmap (out of scope for this plan)

- **Dual-value tooltip (v2):** When a benchmark is selected, show both portfolio % change and benchmark % change in the tooltip for at-a-glance alpha comparison.
