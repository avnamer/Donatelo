# Chart Improvements — Design Spec
**Date:** 2026-05-18

## Overview

Two improvements to the main page performance chart:
1. Fix time range filtering — the time range buttons currently have no effect on the chart data
2. Add benchmark comparison — overlay a selected market index on the portfolio chart

---

## Section 1 — Data Layer

### New API route: `/api/benchmark`

**File:** `src/app/api/benchmark/route.ts`

Query params: `ticker` (Yahoo Finance symbol), `from` (ISO date `YYYY-MM-DD`)

Fetches historical daily closes from Yahoo Finance (same source as `tase.ts`) and returns `{ date: string, close: number }[]`, normalized so the first data point = 100 (i.e., returns `PerformancePoint[]`).

### Ticker mapping

| Display name    | Yahoo ticker  |
|-----------------|---------------|
| S&P 500         | `^GSPC`       |
| MSCI World      | `URTH`        |
| Nasdaq          | `^IXIC`       |
| תל אביב 35      | `^TA35.TA`    |
| תל אביב 90      | `^TA90.TA`    |
| תל אביב 125     | `^TA125.TA`   |

### New hook: `useBenchmark`

**File:** `src/hooks/useBenchmark.ts`

Signature:
```ts
useBenchmark(ticker: BenchmarkId, from: Date): {
  data: PerformancePoint[]
  loading: boolean
  error: string | null
}
```

- Calls `/api/benchmark?ticker=...&from=...`
- Returns empty array when `ticker === 'none'`
- Re-fetches automatically when `ticker` or `from` changes

---

## Section 2 — State Management

### Changes to `src/store/ui.ts`

New `BenchmarkId` union type:
```ts
export type BenchmarkId =
  | 'none'
  | '^GSPC'
  | 'URTH'
  | '^IXIC'
  | '^TA35.TA'
  | '^TA90.TA'
  | '^TA125.TA'
```

New display name map (exported from `src/store/ui.ts` or a nearby constants file):
```ts
export const BENCHMARK_LABELS: Record<BenchmarkId, string> = {
  'none':       'ללא השוואה',
  '^GSPC':      'S&P 500',
  'URTH':       'MSCI World',
  '^IXIC':      'Nasdaq',
  '^TA35.TA':   'תל אביב 35',
  '^TA90.TA':   'תל אביב 90',
  '^TA125.TA':  'תל אביב 125',
}
```

New state fields added to `UIState`:
```ts
benchmark: BenchmarkId       // default: '^GSPC'
setBenchmark: (b: BenchmarkId) => void
```

Both `timeRange` and `benchmark` are persisted to localStorage.

---

## Section 3 — UI Changes

### 3a — Time range fix

**Where:** `src/components/portfolio/HomeClient.tsx`

Current behavior: `calcIndexedPerformance(dailyValues)` is called with all data; `timeRange` is never used to slice the data.

Fix: before calling `calcIndexedPerformance`, filter `dailyValues` to only include dates ≥ the cutoff date for the selected `timeRange`:

| timeRange | Cutoff |
|-----------|--------|
| `1M`  | 30 days before today |
| `3M`  | 90 days before today |
| `6M`  | 180 days before today |
| `YTD` | January 1 of current year |
| `1Y`  | 365 days before today |
| `3Y`  | 3 years before today |
| `ALL` | no filter |

`calcIndexedPerformance` already normalizes to 100 at the first point in the array, so re-normalization happens automatically after slicing. `HomeClient` must also read `timeRange` from `useUIStore` and re-derive `performanceData` via `useMemo` with `[holdings, timeRange]` as dependencies (currently it's computed once outside of any reactive context).

The computed `from` date (earliest date after slicing) is kept in `HomeClient` and passed to `useBenchmark` there — it does not need to be forwarded through `PerformanceChart`.

### 3b — Benchmark chip row

**Where:** `src/components/charts/PerformanceChart.tsx`

Add a second row of chips below the existing time range buttons. One chip per `BenchmarkId`. Active chip is visually highlighted (same style as active time range button). Clicking a chip calls `setBenchmark()`.

Chip order: `ללא השוואה | S&P 500 | MSCI World | Nasdaq | תל אביב 35 | תל אביב 90 | תל אביב 125`

### 3c — Chart overlay

**Where:** `src/components/charts/PerformanceChart.tsx`

`PerformanceChart` receives a new optional prop:
```ts
benchmarkData?: PerformancePoint[]
```

`HomeClient` calls `useBenchmark(benchmark, fromDate)` and passes the result to `PerformanceChart`.

When `benchmarkData` is non-empty, add a Recharts `<Line>` component (dashed, blue `#3b82f6`, no dot, `strokeDasharray="4 2"`) alongside the existing `<Area>`. Both series share the same X axis (date) and Y axis (index normalized to 100).

### 3d — Legend below chart

A small legend row rendered below the `<ResponsiveContainer>`:

```
■ Portfolio   - - <selected benchmark name>
```

Portfolio line color (green/red depending on gain/loss). Benchmark line color: `#3b82f6`. Legend is hidden when `benchmark === 'none'`.

### 3e — Tooltip

No change. Tooltip continues to show only portfolio index and % change.

---

## Roadmap

- **Dual-value tooltip (v2):** When a benchmark is selected, extend the tooltip to show both portfolio % change and benchmark % change side by side. This gives the user an at-a-glance alpha comparison without requiring them to visually trace two lines.

---

## Out of Scope

- Caching benchmark API responses (can be added later if performance is an issue)
- Benchmark data for periods before the benchmark's own inception date
- Mobile-specific chip overflow handling
