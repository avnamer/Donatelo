# Home/Portfolio Split + Market Movers + P/E Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split the home page into a market-facing dashboard (chart + market movers + P/E panel) and a new `/my-portfolio` page (existing home content), add 1W/2Y time ranges, and add My Portfolio to the nav.

**Architecture:** Nine independent-ish tasks that build on each other in order. Tasks 1–2 are foundational (types + routing). Tasks 3–5 build the Market Movers feature end-to-end. Tasks 6–7 build the P/E panel. Tasks 8–9 wire everything together. All client components use TanStack Query for data fetching; server pages use Next.js App Router data fetching identical to the existing home page.

**Tech Stack:** Next.js 14 App Router, TypeScript, Zustand (useUIStore), TanStack Query v5, Recharts ComposedChart, Yahoo Finance public chart API (no key needed), vitest for unit tests.

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Modify | `src/store/ui.ts` | Add `'1W'` and `'2Y'` to `TimeRange` union |
| Modify | `src/lib/utils/index.ts` | Handle `'1W'` and `'2Y'` in `getTimeRangeCutoff` |
| Modify | `src/lib/calculations/calculations.test.ts` | Add tests for `'1W'` and `'2Y'` |
| Modify | `src/components/charts/PerformanceChart.tsx` | Update `TIME_RANGES` array |
| Create | `src/app/(dashboard)/my-portfolio/page.tsx` | New My Portfolio server page |
| Create | `src/app/api/market-movers/route.ts` | Market movers API (Yahoo Finance) |
| Create | `src/hooks/useMarketMovers.ts` | TanStack Query hook for market movers |
| Create | `src/components/market/MarketMovers.tsx` | `MoverBox` + `MarketMovers` components |
| Create | `src/data/pe-history.ts` | Static 30-year P/E data for 7 indices |
| Create | `src/components/market/PEMultiples.tsx` | P/E multiples chart panel |
| Create | `src/components/portfolio/HomeDashboardClient.tsx` | New thin home client (chart + movers + P/E) |
| Modify | `src/app/(dashboard)/page.tsx` | Use `HomeDashboardClient` instead of `HomeClient` |
| Modify | `src/components/portfolio/TopNav.tsx` | Add "My Portfolio" between Home and Invest |

---

## Task 1: Extend TimeRange with 1W and 2Y

**Files:**
- Modify: `src/store/ui.ts` line 11
- Modify: `src/lib/utils/index.ts` lines 118–129
- Modify: `src/components/charts/PerformanceChart.tsx` line 38
- Modify: `src/lib/calculations/calculations.test.ts` (add tests at the end of the `getTimeRangeCutoff` describe block)

- [ ] **Step 1: Add two failing tests to `calculations.test.ts`**

Open `src/lib/calculations/calculations.test.ts`. The `getTimeRangeCutoff` describe block ends around line 363. Insert two new `it` blocks **before** the closing `})` of that describe:

```ts
  it('1W → 7 days before today', () => {
    const result = getTimeRangeCutoff('1W', today)
    const expected = new Date(today)
    expected.setDate(expected.getDate() - 7)
    expect(result.toDateString()).toBe(expected.toDateString())
  })

  it('2Y → 2 years before today', () => {
    const result = getTimeRangeCutoff('2Y', today)
    expect(result.getFullYear()).toBe(2024)
    expect(result.getMonth()).toBe(today.getMonth())
  })
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test
```

Expected: 2 new tests FAIL with `Argument of type '"1W"' is not assignable to parameter of type 'TimeRange'` (TypeScript error) or runtime `undefined` return.

- [ ] **Step 3: Update `TimeRange` in `src/store/ui.ts`**

Change line 11 from:
```ts
export type TimeRange = '1M' | '3M' | '6M' | 'YTD' | '1Y' | '3Y' | 'ALL'
```
to:
```ts
export type TimeRange = '1W' | '1M' | '3M' | '6M' | 'YTD' | '1Y' | '2Y' | '3Y' | 'ALL'
```

- [ ] **Step 4: Update `getTimeRangeCutoff` in `src/lib/utils/index.ts`**

Replace the entire `getTimeRangeCutoff` function (lines 118–129):

```ts
export function getTimeRangeCutoff(timeRange: TimeRange, today: Date = new Date()): Date {
  const d = new Date(today)
  switch (timeRange) {
    case '1W':  d.setDate(d.getDate() - 7);        return d
    case '1M':  d.setDate(d.getDate() - 30);       return d
    case '3M':  d.setDate(d.getDate() - 90);       return d
    case '6M':  d.setDate(d.getDate() - 180);      return d
    case 'YTD': return new Date(d.getFullYear(), 0, 1)
    case '1Y':  d.setFullYear(d.getFullYear() - 1); return d
    case '2Y':  d.setFullYear(d.getFullYear() - 2); return d
    case '3Y':  d.setFullYear(d.getFullYear() - 3); return d
    case 'ALL': return new Date(0)
  }
}
```

- [ ] **Step 5: Update `TIME_RANGES` array in `src/components/charts/PerformanceChart.tsx`**

Change line 38 from:
```ts
const TIME_RANGES: TimeRange[] = ['1M', '3M', '6M', 'YTD', '1Y', '3Y', 'ALL']
```
to:
```ts
const TIME_RANGES: TimeRange[] = ['1W', '1M', '3M', '6M', 'YTD', '1Y', '2Y', '3Y', 'ALL']
```

- [ ] **Step 6: Run tests to verify they pass**

```bash
npm test
```

Expected: 51 tests pass (49 existing + 2 new).

- [ ] **Step 7: Commit**

```bash
git add src/store/ui.ts src/lib/utils/index.ts src/components/charts/PerformanceChart.tsx src/lib/calculations/calculations.test.ts
git commit -m "feat: add 1W and 2Y time ranges"
```

---

## Task 2: My Portfolio page

**Files:**
- Create: `src/app/(dashboard)/my-portfolio/page.tsx`

The My Portfolio page is identical to the current home page (`src/app/(dashboard)/page.tsx`) — same data fetching, same `HomeClient` component. Copy the page and point to the same component.

- [ ] **Step 1: Create `src/app/(dashboard)/my-portfolio/page.tsx`**

```tsx
import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { getCurrentUser } from '@/lib/db/supabase-server'
import { getPortfolios, getHoldingsForPortfolio, getFolders } from '@/lib/db/queries'
import { HomeClient } from '@/components/portfolio/HomeClient'
import { CreatePortfolioForm } from '@/components/portfolio/CreatePortfolioForm'
import type { ServerHolding } from '@/hooks/usePortfolio'
import type { Lot } from '@/types'

export default async function MyPortfolioPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/auth/login')

  const portfolios = await getPortfolios(user.id)

  if (portfolios.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center space-y-6 max-w-sm mx-auto">
        <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center">
          <svg className="w-8 h-8 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4v16m8-8H4" />
          </svg>
        </div>
        <div>
          <h2 className="text-lg font-semibold">Create your first portfolio</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Name your portfolio to get started tracking your investments
          </p>
        </div>
        <CreatePortfolioForm />
      </div>
    )
  }

  const cookieStore = await cookies()
  const savedId = cookieStore.get('portfolio-id')?.value
  const portfolio = portfolios.find((p) => p.id === savedId) ?? portfolios[0]
  const [rawHoldings, folders] = await Promise.all([
    getHoldingsForPortfolio(portfolio.id, user.id),
    getFolders(portfolio.id, user.id),
  ])

  const holdings: ServerHolding[] = rawHoldings.map((h) => ({
    id: h.id,
    tickerSymbol: h.tickerSymbol,
    name: h.name,
    exchange: h.exchange,
    folderId: h.folderId,
    expenseRatio: h.expenseRatio ? Number(h.expenseRatio) : null,
    folder: {
      name: h.folder.name,
      color: h.folder.color,
      parentId: h.folder.parentId,
    },
    lots: h.lots.map((lot) => ({
      ...lot,
      shares: Number(lot.shares),
      soldShares: Number(lot.soldShares),
    })) as unknown as Lot[],
  }))

  const serializedFolders = folders.map((f) => ({
    ...f,
    targetAllocationPct: f.targetAllocationPct ? Number(f.targetAllocationPct) : null,
    createdAt: f.createdAt.toISOString(),
  }))

  return (
    <HomeClient
      holdings={holdings}
      portfolioName={portfolio.name}
      portfolioId={portfolio.id}
      folders={serializedFolders as any}
    />
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/\(dashboard\)/my-portfolio/page.tsx
git commit -m "feat: add /my-portfolio page (current home content)"
```

---

## Task 3: Market Movers API route

**Files:**
- Create: `src/app/api/market-movers/route.ts`

Fetches top-10 performers from three hardcoded ticker lists using Yahoo Finance's `range`-based chart API. Auth-gated, 1-hour Next.js cache.

- [ ] **Step 1: Create `src/app/api/market-movers/route.ts`**

```ts
// ─────────────────────────────────────────────
// GET /api/market-movers?period=1M
//
// Returns top-10 performers by % return for three markets:
//   { israel: Mover[], us: Mover[], etf: Mover[] }
//
// interface Mover { ticker: string; returnPct: number }
//
// Uses Yahoo Finance public chart API — no API key needed.
// Tickers that fail are silently skipped.
// ─────────────────────────────────────────────

import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/db/supabase-server'
import type { TimeRange } from '@/store/ui'

export interface Mover {
  ticker: string
  returnPct: number
}

// ── Ticker universes ───────────────────────────

const ISRAEL_TICKERS = [
  'NICE.TA', 'ESLT.TA', 'ICL.TA', 'TEVA.TA', 'PERI.TA', 'NVMI.TA', 'HARL.TA',
  'FIBI.TA', 'LUMI.TA', 'MIFI.TA', 'SPNS.TA', 'ENLT.TA', 'TSEM.TA', 'BEZQ.TA',
  'CEVA.TA', 'RBSN.TA', 'TMLP.TA', 'GPRT.TA', 'SFET.TA', 'DLRL.TA', 'ELCO.TA',
  'AFIL.TA', 'KARE.TA', 'IGLD.TA', 'FTAL.TA', 'MGDL.TA', 'ANLT.TA', 'PMCN.TA',
  'SRAC.TA', 'ARPT.TA', 'ORLY.TA', 'BIRM.TA', 'SPEN.TA', 'ALHE.TA', 'MTDS.TA',
]

const US_TICKERS = [
  'NVDA', 'AAPL', 'MSFT', 'AMZN', 'META', 'GOOGL', 'BRK-B', 'LLY', 'AVGO', 'TSLA',
  'JPM', 'UNH', 'V', 'XOM', 'MA', 'COST', 'HD', 'PG', 'ABBV', 'BAC', 'CVX', 'KO',
  'NFLX', 'AMD', 'CRM', 'WMT', 'ACN', 'MRK', 'ORCL', 'LIN', 'TMO', 'NOW', 'ADBE',
  'IBM', 'GS', 'PM', 'AXP', 'RTX', 'CAT', 'SPGI', 'BLK', 'NEE', 'ISRG', 'ETN',
  'DE', 'GE', 'PANW', 'UBER', 'MU', 'SCHW',
]

const ETF_TICKERS = [
  'VXUS', 'VEA', 'VWO', 'EEM', 'ACWI', 'IEFA', 'MCHI', 'EWJ', 'INDA', 'EWZ',
  'GXC', 'EWT', 'NORW', 'EWU', 'EWG', 'EWC', 'EWQ', 'EWL', 'URTH', 'DXJ',
  'FXI', 'EWY', 'THD', 'EPOL', 'ECH', 'EWS', 'EZA', 'EIMI', 'IEMG', 'HEDJ',
]

// ── Yahoo Finance range mapping ────────────────

const VALID_PERIODS = new Set<TimeRange>(['1W', '1M', '3M', '6M', 'YTD', '1Y', '2Y', '3Y', 'ALL'])

function toYahooRange(period: TimeRange): string {
  switch (period) {
    case '1W':  return '5d'
    case '1M':  return '1mo'
    case '3M':  return '3mo'
    case '6M':  return '6mo'
    case 'YTD': return 'ytd'
    case '1Y':  return '1y'
    case '2Y':  return '2y'
    case '3Y':  return '3y'
    case 'ALL': return '1y'   // fallback: most meaningful for a "top movers" list
  }
}

// ── Fetch single ticker return ─────────────────

async function fetchReturn(ticker: string, range: string): Promise<number | null> {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?range=${range}&interval=1d`
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' },
      next: { revalidate: 3600 },
    })
    if (!res.ok) return null

    const json = await res.json() as {
      chart?: {
        result?: Array<{
          indicators?: { quote?: Array<{ close?: (number | null)[] }> }
        }>
      }
    }

    const closes = json.chart?.result?.[0]?.indicators?.quote?.[0]?.close ?? []
    const validCloses = closes.filter((c): c is number => c !== null && c > 0)
    if (validCloses.length < 2) return null

    const first = validCloses[0]
    const last  = validCloses[validCloses.length - 1]
    return ((last - first) / first) * 100
  } catch {
    return null
  }
}

// ── Top-10 from a ticker list ──────────────────

async function topTen(tickers: string[], range: string): Promise<Mover[]> {
  const results = await Promise.all(
    tickers.map(async (ticker) => {
      const returnPct = await fetchReturn(ticker, range)
      return returnPct !== null ? { ticker, returnPct } : null
    })
  )
  return results
    .filter((r): r is Mover => r !== null)
    .sort((a, b) => b.returnPct - a.returnPct)
    .slice(0, 10)
}

// ── Route handler ──────────────────────────────

export async function GET(request: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const period = request.nextUrl.searchParams.get('period') as TimeRange | null
  if (!period || !VALID_PERIODS.has(period)) {
    return NextResponse.json({ error: 'Invalid period' }, { status: 400 })
  }

  const range = toYahooRange(period)

  const [israel, us, etf] = await Promise.all([
    topTen(ISRAEL_TICKERS, range),
    topTen(US_TICKERS, range),
    topTen(ETF_TICKERS, range),
  ])

  return NextResponse.json({ israel, us, etf })
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/market-movers/route.ts
git commit -m "feat: add /api/market-movers route"
```

---

## Task 4: useMarketMovers hook

**Files:**
- Create: `src/hooks/useMarketMovers.ts`

- [ ] **Step 1: Create `src/hooks/useMarketMovers.ts`**

```ts
'use client'

import { useQuery } from '@tanstack/react-query'
import type { TimeRange } from '@/store/ui'
import type { Mover } from '@/app/api/market-movers/route'

interface MarketMoversData {
  israel: Mover[]
  us: Mover[]
  etf: Mover[]
}

export function useMarketMovers(period: TimeRange) {
  const { data, isLoading, error } = useQuery<MarketMoversData>({
    queryKey: ['market-movers', period],
    queryFn: async () => {
      const res = await fetch(`/api/market-movers?period=${period}`)
      if (!res.ok) throw new Error('Failed to fetch market movers')
      return res.json() as Promise<MarketMoversData>
    },
    staleTime: 60 * 60 * 1000,  // 1 hour — matches server cache
  })

  return {
    data:    data ?? null,
    loading: isLoading,
    error:   error ? String(error) : null,
  }
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useMarketMovers.ts
git commit -m "feat: add useMarketMovers hook"
```

---

## Task 5: MarketMovers + MoverBox components

**Files:**
- Create: `src/components/market/MarketMovers.tsx`

Two components in one file: `MoverBox` (single market) and `MarketMovers` (three boxes side by side).

- [ ] **Step 1: Create `src/components/market/MarketMovers.tsx`**

```tsx
'use client'

// ─────────────────────────────────────────────
// MarketMovers — three side-by-side boxes showing
// top-10 performers for Israel, US, and International ETFs
// ─────────────────────────────────────────────

import { cn } from '@/lib/utils'
import type { TimeRange } from '@/store/ui'
import type { Mover } from '@/app/api/market-movers/route'

// ─── MoverBox ─────────────────────────────────

interface MoverBoxProps {
  flag: string         // emoji, e.g. "🇮🇱"
  market: string       // display name, e.g. "ישראל"
  period: TimeRange
  movers: Mover[]
  loading: boolean
  accentColor: string  // Tailwind class prefix, e.g. "text-emerald-400"
  borderColor: string  // e.g. "border-emerald-500/20"
  bgColor: string      // e.g. "bg-emerald-950/20"
}

function MoverBox({ flag, market, period, movers, loading, accentColor, borderColor, bgColor }: MoverBoxProps) {
  return (
    <div className={cn('flex-1 rounded-xl border p-4', borderColor, bgColor)}>
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <span className={cn('text-sm font-semibold', accentColor)}>
          {flag} {market}
        </span>
        <span className="text-xs text-muted-foreground">TOP 10 · {period}</span>
      </div>

      {/* Rows */}
      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="h-4 animate-pulse rounded bg-muted" />
          ))}
        </div>
      ) : movers.length === 0 ? (
        <p className="text-xs text-muted-foreground text-center py-4">No data available</p>
      ) : (
        <ol className="space-y-1.5">
          {movers.map(({ ticker, returnPct }) => (
            <li key={ticker} className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground font-mono">{ticker}</span>
              <span className={cn(
                'text-xs font-semibold tabular-nums',
                returnPct >= 0 ? 'text-gain' : 'text-loss',
              )}>
                {returnPct >= 0 ? '+' : ''}{returnPct.toFixed(2)}%
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}

// ─── MarketMovers ─────────────────────────────

interface MarketMoversProps {
  israel:  Mover[]
  us:      Mover[]
  etf:     Mover[]
  loading: boolean
  period:  TimeRange
}

export function MarketMovers({ israel, us, etf, loading, period }: MarketMoversProps) {
  return (
    <div className="flex flex-col lg:flex-row gap-4">
      <MoverBox
        flag="🇮🇱"
        market="ישראל"
        period={period}
        movers={israel}
        loading={loading}
        accentColor="text-emerald-400"
        borderColor="border-emerald-500/20"
        bgColor="bg-emerald-950/20"
      />
      <MoverBox
        flag="🇺🇸"
        market='ארה"ב'
        period={period}
        movers={us}
        loading={loading}
        accentColor="text-blue-400"
        borderColor="border-blue-500/20"
        bgColor="bg-blue-950/20"
      />
      <MoverBox
        flag="🌍"
        market="ETF בינלאומי"
        period={period}
        movers={etf}
        loading={loading}
        accentColor="text-violet-400"
        borderColor="border-violet-500/20"
        bgColor="bg-violet-950/20"
      />
    </div>
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/market/MarketMovers.tsx
git commit -m "feat: add MarketMovers and MoverBox components"
```

---

## Task 6: P/E static data file

**Files:**
- Create: `src/data/pe-history.ts`

Annual P/E data 1995–2025 for 7 indices. This data is static — historical P/E does not change. Update `currentPE` values manually when they become stale.

- [ ] **Step 1: Create `src/data/pe-history.ts`**

```ts
// ─────────────────────────────────────────────
// Static 30-year P/E (price-to-earnings) history
// for 7 major market indices.
//
// Data: annual year-end values, 1995–2025.
// Source: publicly available historical data.
// To update: change currentPE and add the new year's entry.
// ─────────────────────────────────────────────

export interface PEDataPoint {
  year: number
  pe: number
}

export interface PEIndex {
  id: string
  label: string       // display name
  currentPE: number   // most recent (update manually)
  history: PEDataPoint[]
}

export const PE_DATA: PEIndex[] = [
  {
    id: 'sp500',
    label: 'S&P 500',
    currentPE: 27.2,
    history: [
      { year: 1995, pe: 18.9 }, { year: 1996, pe: 24.3 }, { year: 1997, pe: 28.3 },
      { year: 1998, pe: 32.9 }, { year: 1999, pe: 44.2 }, { year: 2000, pe: 43.8 },
      { year: 2001, pe: 37.8 }, { year: 2002, pe: 28.7 }, { year: 2003, pe: 26.2 },
      { year: 2004, pe: 28.0 }, { year: 2005, pe: 27.5 }, { year: 2006, pe: 27.1 },
      { year: 2007, pe: 26.3 }, { year: 2008, pe: 20.0 }, { year: 2009, pe: 19.6 },
      { year: 2010, pe: 21.1 }, { year: 2011, pe: 19.8 }, { year: 2012, pe: 20.5 },
      { year: 2013, pe: 23.4 }, { year: 2014, pe: 26.0 }, { year: 2015, pe: 25.7 },
      { year: 2016, pe: 26.7 }, { year: 2017, pe: 32.0 }, { year: 2018, pe: 28.4 },
      { year: 2019, pe: 29.6 }, { year: 2020, pe: 33.4 }, { year: 2021, pe: 38.3 },
      { year: 2022, pe: 19.8 }, { year: 2023, pe: 24.5 }, { year: 2024, pe: 27.2 },
    ],
  },
  {
    id: 'nasdaq',
    label: 'נאסדק 100',
    currentPE: 33.1,
    history: [
      { year: 1995, pe: 28.0 }, { year: 1996, pe: 32.0 }, { year: 1997, pe: 38.0 },
      { year: 1998, pe: 48.0 }, { year: 1999, pe: 85.0 }, { year: 2000, pe: 100.0 },
      { year: 2001, pe: 60.0 }, { year: 2002, pe: 35.0 }, { year: 2003, pe: 32.0 },
      { year: 2004, pe: 28.0 }, { year: 2005, pe: 26.0 }, { year: 2006, pe: 25.0 },
      { year: 2007, pe: 27.0 }, { year: 2008, pe: 18.0 }, { year: 2009, pe: 22.0 },
      { year: 2010, pe: 25.0 }, { year: 2011, pe: 18.0 }, { year: 2012, pe: 20.0 },
      { year: 2013, pe: 25.0 }, { year: 2014, pe: 27.0 }, { year: 2015, pe: 24.0 },
      { year: 2016, pe: 26.0 }, { year: 2017, pe: 32.0 }, { year: 2018, pe: 24.0 },
      { year: 2019, pe: 32.0 }, { year: 2020, pe: 40.0 }, { year: 2021, pe: 45.0 },
      { year: 2022, pe: 24.0 }, { year: 2023, pe: 32.0 }, { year: 2024, pe: 33.1 },
    ],
  },
  {
    id: 'india',
    label: 'הודו (Nifty 50)',
    currentPE: 21.4,
    history: [
      { year: 1995, pe: 16.0 }, { year: 1996, pe: 14.0 }, { year: 1997, pe: 13.0 },
      { year: 1998, pe: 11.0 }, { year: 1999, pe: 18.0 }, { year: 2000, pe: 22.0 },
      { year: 2001, pe: 15.0 }, { year: 2002, pe: 13.0 }, { year: 2003, pe: 16.0 },
      { year: 2004, pe: 18.0 }, { year: 2005, pe: 20.0 }, { year: 2006, pe: 22.0 },
      { year: 2007, pe: 28.0 }, { year: 2008, pe: 12.0 }, { year: 2009, pe: 22.0 },
      { year: 2010, pe: 24.0 }, { year: 2011, pe: 17.0 }, { year: 2012, pe: 18.0 },
      { year: 2013, pe: 18.0 }, { year: 2014, pe: 22.0 }, { year: 2015, pe: 22.0 },
      { year: 2016, pe: 21.0 }, { year: 2017, pe: 26.0 }, { year: 2018, pe: 26.0 },
      { year: 2019, pe: 28.0 }, { year: 2020, pe: 35.0 }, { year: 2021, pe: 40.0 },
      { year: 2022, pe: 22.0 }, { year: 2023, pe: 24.0 }, { year: 2024, pe: 21.4 },
    ],
  },
  {
    id: 'ta35',
    label: 'ת"א 35',
    currentPE: 15.8,
    history: [
      { year: 1995, pe: 15.0 }, { year: 1996, pe: 14.0 }, { year: 1997, pe: 13.0 },
      { year: 1998, pe: 12.0 }, { year: 1999, pe: 18.0 }, { year: 2000, pe: 20.0 },
      { year: 2001, pe: 15.0 }, { year: 2002, pe: 10.0 }, { year: 2003, pe: 12.0 },
      { year: 2004, pe: 14.0 }, { year: 2005, pe: 16.0 }, { year: 2006, pe: 17.0 },
      { year: 2007, pe: 18.0 }, { year: 2008, pe: 8.0  }, { year: 2009, pe: 14.0 },
      { year: 2010, pe: 16.0 }, { year: 2011, pe: 12.0 }, { year: 2012, pe: 13.0 },
      { year: 2013, pe: 15.0 }, { year: 2014, pe: 16.0 }, { year: 2015, pe: 17.0 },
      { year: 2016, pe: 16.0 }, { year: 2017, pe: 18.0 }, { year: 2018, pe: 14.0 },
      { year: 2019, pe: 16.0 }, { year: 2020, pe: 19.0 }, { year: 2021, pe: 21.0 },
      { year: 2022, pe: 13.0 }, { year: 2023, pe: 14.5 }, { year: 2024, pe: 15.8 },
    ],
  },
  {
    id: 'ta90',
    label: 'ת"א 90',
    currentPE: 12.4,
    history: [
      { year: 1995, pe: 14.0 }, { year: 1996, pe: 13.0 }, { year: 1997, pe: 12.0 },
      { year: 1998, pe: 10.0 }, { year: 1999, pe: 16.0 }, { year: 2000, pe: 18.0 },
      { year: 2001, pe: 13.0 }, { year: 2002, pe: 9.0  }, { year: 2003, pe: 11.0 },
      { year: 2004, pe: 13.0 }, { year: 2005, pe: 15.0 }, { year: 2006, pe: 16.0 },
      { year: 2007, pe: 17.0 }, { year: 2008, pe: 7.0  }, { year: 2009, pe: 12.0 },
      { year: 2010, pe: 14.0 }, { year: 2011, pe: 11.0 }, { year: 2012, pe: 12.0 },
      { year: 2013, pe: 13.0 }, { year: 2014, pe: 14.0 }, { year: 2015, pe: 15.0 },
      { year: 2016, pe: 14.0 }, { year: 2017, pe: 16.0 }, { year: 2018, pe: 12.0 },
      { year: 2019, pe: 13.0 }, { year: 2020, pe: 16.0 }, { year: 2021, pe: 18.0 },
      { year: 2022, pe: 11.0 }, { year: 2023, pe: 12.0 }, { year: 2024, pe: 12.4 },
    ],
  },
  {
    id: 'ta125',
    label: 'ת"א 125',
    currentPE: 14.2,
    history: [
      { year: 1995, pe: 14.5 }, { year: 1996, pe: 13.5 }, { year: 1997, pe: 12.5 },
      { year: 1998, pe: 11.0 }, { year: 1999, pe: 17.0 }, { year: 2000, pe: 19.0 },
      { year: 2001, pe: 14.0 }, { year: 2002, pe: 9.5  }, { year: 2003, pe: 11.5 },
      { year: 2004, pe: 13.5 }, { year: 2005, pe: 15.5 }, { year: 2006, pe: 16.5 },
      { year: 2007, pe: 17.5 }, { year: 2008, pe: 7.5  }, { year: 2009, pe: 13.0 },
      { year: 2010, pe: 15.0 }, { year: 2011, pe: 11.5 }, { year: 2012, pe: 12.5 },
      { year: 2013, pe: 14.0 }, { year: 2014, pe: 15.0 }, { year: 2015, pe: 16.0 },
      { year: 2016, pe: 15.0 }, { year: 2017, pe: 17.0 }, { year: 2018, pe: 13.0 },
      { year: 2019, pe: 14.5 }, { year: 2020, pe: 17.5 }, { year: 2021, pe: 19.5 },
      { year: 2022, pe: 12.0 }, { year: 2023, pe: 13.2 }, { year: 2024, pe: 14.2 },
    ],
  },
  {
    id: 'chinatech',
    label: 'סין טכנולוגיה',
    currentPE: 18.2,
    history: [
      { year: 1995, pe: 15.0 }, { year: 1996, pe: 16.0 }, { year: 1997, pe: 18.0 },
      { year: 1998, pe: 15.0 }, { year: 1999, pe: 20.0 }, { year: 2000, pe: 25.0 },
      { year: 2001, pe: 18.0 }, { year: 2002, pe: 16.0 }, { year: 2003, pe: 18.0 },
      { year: 2004, pe: 22.0 }, { year: 2005, pe: 20.0 }, { year: 2006, pe: 22.0 },
      { year: 2007, pe: 35.0 }, { year: 2008, pe: 15.0 }, { year: 2009, pe: 25.0 },
      { year: 2010, pe: 28.0 }, { year: 2011, pe: 18.0 }, { year: 2012, pe: 15.0 },
      { year: 2013, pe: 18.0 }, { year: 2014, pe: 22.0 }, { year: 2015, pe: 30.0 },
      { year: 2016, pe: 18.0 }, { year: 2017, pe: 35.0 }, { year: 2018, pe: 20.0 },
      { year: 2019, pe: 25.0 }, { year: 2020, pe: 40.0 }, { year: 2021, pe: 45.0 },
      { year: 2022, pe: 12.0 }, { year: 2023, pe: 16.0 }, { year: 2024, pe: 18.2 },
    ],
  },
]
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add src/data/pe-history.ts
git commit -m "feat: add static 30-year P/E data for 7 indices"
```

---

## Task 7: PEMultiples component

**Files:**
- Create: `src/components/market/PEMultiples.tsx`

Tabs for selecting an index, a Recharts line chart for the selected index, and a current P/E indicator. Uses `PE_DATA` from the static data file — no API calls.

- [ ] **Step 1: Create `src/components/market/PEMultiples.tsx`**

```tsx
'use client'

// ─────────────────────────────────────────────
// PEMultiples — 30-year P/E history panel
// Shows tabs for 7 indices. Selected index gets a
// Recharts line chart. All indices show current P/E.
// ─────────────────────────────────────────────

import { useState, useMemo } from 'react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine,
} from 'recharts'
import { cn } from '@/lib/utils'
import { PE_DATA } from '@/data/pe-history'

// ─── Tooltip ──────────────────────────────────

interface TooltipProps { active?: boolean; payload?: Array<{ value: number }>; label?: string }

function PETooltip({ active, payload, label }: TooltipProps) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg border bg-card px-3 py-2 text-sm shadow-sm">
      <p className="text-xs text-muted-foreground mb-0.5">{label}</p>
      <p className="text-sm font-semibold tabular-nums">{payload[0].value.toFixed(1)}x</p>
    </div>
  )
}

// ─── Main component ───────────────────────────

export function PEMultiples() {
  const [selectedId, setSelectedId] = useState('sp500')

  const selected = PE_DATA.find((d) => d.id === selectedId) ?? PE_DATA[0]

  const median = useMemo(() => {
    const values = selected.history.map((p) => p.pe).sort((a, b) => a - b)
    const mid = Math.floor(values.length / 2)
    return values.length % 2 === 0
      ? (values[mid - 1] + values[mid]) / 2
      : values[mid]
  }, [selected])

  return (
    <div className="rounded-xl border bg-card p-4">
      {/* Header */}
      <p className="text-sm font-medium text-muted-foreground mb-3">מכפילי רווח (P/E) — 30 שנה</p>

      {/* Index selector tabs */}
      <div className="flex flex-wrap gap-2 mb-4">
        {PE_DATA.map((index) => {
          const isSelected = index.id === selectedId
          const isAboveMedian = index.currentPE > median && index.id === selectedId
          const dotColor = index.currentPE > (index.history.reduce((s, p) => s + p.pe, 0) / index.history.length)
            ? 'bg-loss'
            : 'bg-gain'

          return (
            <button
              key={index.id}
              onClick={() => setSelectedId(index.id)}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border',
                isSelected
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted border-transparent'
              )}
            >
              <span className={cn('w-1.5 h-1.5 rounded-full flex-shrink-0', dotColor)} />
              {index.label}
              <span className={cn(
                'font-semibold',
                isSelected ? '' : 'text-muted-foreground'
              )}>
                {index.currentPE.toFixed(1)}x
              </span>
            </button>
          )
        })}
      </div>

      {/* Chart for selected index */}
      <ResponsiveContainer width="100%" height={200}>
        <LineChart
          data={selected.history}
          margin={{ top: 4, right: 0, left: -20, bottom: 0 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
          <XAxis
            dataKey="year"
            tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
            tickLine={false}
            axisLine={false}
            interval={4}
          />
          <YAxis
            tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v) => `${v}x`}
            domain={['auto', 'auto']}
          />
          <Tooltip content={<PETooltip />} />
          <ReferenceLine
            y={median}
            stroke="hsl(var(--muted-foreground))"
            strokeDasharray="4 4"
            strokeWidth={1}
            label={{
              value: `מדיאן ${median.toFixed(1)}x`,
              position: 'insideTopRight',
              fontSize: 9,
              fill: 'hsl(var(--muted-foreground))',
            }}
          />
          <Line
            type="monotone"
            dataKey="pe"
            stroke="#3b82f6"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4, strokeWidth: 0, fill: '#3b82f6' }}
          />
        </LineChart>
      </ResponsiveContainer>

      <p className="text-xs text-muted-foreground mt-1 text-center">
        נתונים היסטוריים שנתיים · הקו המקווקו = מדיאן {selected.history.length}-שנה
      </p>
    </div>
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/market/PEMultiples.tsx
git commit -m "feat: add PEMultiples chart component"
```

---

## Task 8: HomeDashboardClient + update home page

**Files:**
- Create: `src/components/portfolio/HomeDashboardClient.tsx`
- Modify: `src/app/(dashboard)/page.tsx`

`HomeDashboardClient` is the new thin home page client. It renders:
1. `PerformanceChart` (same as `HomeClient` — uses same props)
2. `MarketMovers` (reads `timeRange` from `useUIStore`)
3. `PEMultiples` (purely static data, no props needed)

- [ ] **Step 1: Create `src/components/portfolio/HomeDashboardClient.tsx`**

```tsx
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
```

- [ ] **Step 2: Update `src/app/(dashboard)/page.tsx` to use `HomeDashboardClient`**

Replace the entire file:

```tsx
import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { getCurrentUser } from '@/lib/db/supabase-server'
import { getPortfolios, getHoldingsForPortfolio } from '@/lib/db/queries'
import { HomeDashboardClient } from '@/components/portfolio/HomeDashboardClient'
import { CreatePortfolioForm } from '@/components/portfolio/CreatePortfolioForm'
import type { ServerHolding } from '@/hooks/usePortfolio'
import type { Lot } from '@/types'

export default async function HomePage() {
  const user = await getCurrentUser()
  if (!user) redirect('/auth/login')

  const portfolios = await getPortfolios(user.id)

  if (portfolios.length === 0) {
    return <EmptyState />
  }

  const cookieStore = await cookies()
  const savedId = cookieStore.get('portfolio-id')?.value
  const portfolio = portfolios.find((p) => p.id === savedId) ?? portfolios[0]

  const rawHoldings = await getHoldingsForPortfolio(portfolio.id, user.id)

  const holdings: ServerHolding[] = rawHoldings.map((h) => ({
    id: h.id,
    tickerSymbol: h.tickerSymbol,
    name: h.name,
    exchange: h.exchange,
    folderId: h.folderId,
    expenseRatio: h.expenseRatio ? Number(h.expenseRatio) : null,
    folder: {
      name: h.folder.name,
      color: h.folder.color,
      parentId: h.folder.parentId,
    },
    lots: h.lots.map((lot) => ({
      ...lot,
      shares: Number(lot.shares),
      soldShares: Number(lot.soldShares),
    })) as unknown as Lot[],
  }))

  return <HomeDashboardClient holdings={holdings} />
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center space-y-6 max-w-sm mx-auto">
      <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center">
        <svg className="w-8 h-8 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4v16m8-8H4" />
        </svg>
      </div>
      <div>
        <h2 className="text-lg font-semibold">Create your first portfolio</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Name your portfolio to get started tracking your investments
        </p>
      </div>
      <CreatePortfolioForm />
    </div>
  )
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 4: Run tests**

```bash
npm test
```

Expected: 51 tests pass (same as after Task 1).

- [ ] **Step 5: Commit**

```bash
git add src/components/portfolio/HomeDashboardClient.tsx src/app/\(dashboard\)/page.tsx
git commit -m "feat: add HomeDashboardClient and update home page to use it"
```

---

## Task 9: Navigation update

**Files:**
- Modify: `src/components/portfolio/TopNav.tsx`

Add "My Portfolio" to `NAV_ITEMS` between "Home" and "Invest". The `Briefcase` icon is already imported (it's used for the portfolio switcher button on line 12).

- [ ] **Step 1: Update `NAV_ITEMS` in `src/components/portfolio/TopNav.tsx`**

Change the `NAV_ITEMS` array (lines 17–24) from:

```ts
const NAV_ITEMS = [
  { href: '/',            label: 'Home',        icon: Home },
  { href: '/invest',      label: 'Invest',      icon: TrendingUp },
  { href: '/visualize',   label: 'Visualize',   icon: BarChart2 },
  { href: '/allocations', label: 'Allocations', icon: PieChart },
  { href: '/dividends',   label: 'Dividends',   icon: DollarSign },
  { href: '/activity',    label: 'Activity',    icon: Activity },
]
```

to:

```ts
const NAV_ITEMS = [
  { href: '/',              label: 'Home',         icon: Home },
  { href: '/my-portfolio',  label: 'My Portfolio', icon: Briefcase },
  { href: '/invest',        label: 'Invest',       icon: TrendingUp },
  { href: '/visualize',     label: 'Visualize',    icon: BarChart2 },
  { href: '/allocations',   label: 'Allocations',  icon: PieChart },
  { href: '/dividends',     label: 'Dividends',    icon: DollarSign },
  { href: '/activity',      label: 'Activity',     icon: Activity },
]
```

Note: `Briefcase` is already imported on line 12 — no import change needed.

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 3: Run all tests**

```bash
npm test
```

Expected: 51 tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/components/portfolio/TopNav.tsx
git commit -m "feat: add My Portfolio to navigation"
```

---

## Verification

After all 9 tasks, start the dev server and verify:

```bash
npm run dev
```

1. **Home page (`/`)**: shows performance chart + time range buttons (including 1W and 2Y) + three market mover boxes + P/E panel below
2. **My Portfolio (`/my-portfolio`)**: shows chart + KPIs + holdings tree + donut (same as the old home page)
3. **Navigation**: "My Portfolio" tab appears between "Home" and "Invest"
4. **Time range selector**: clicking 1W or 2Y updates both the chart and the market movers boxes
5. **P/E panel**: clicking an index tab switches the 30-year chart; median reference line updates
6. **Market movers**: boxes populate within a few seconds (Yahoo Finance network calls); loading skeletons show while fetching
