# Home/Portfolio Split + Market Movers — Design Spec
**Date:** 2026-05-20

## Overview

Two changes to the navigation and dashboard structure:

1. **Restructure home page** — keep the performance chart, replace everything below it with three "Market Movers" boxes (top 10 performers by period: Israel, US, International ETF).
2. **New "My Portfolio" page** (`/my-portfolio`) — exact content of today's home page (chart + KPIs + holdings tree + donut), accessible from the nav.

---

## Section 1 — Page Structure

### 1a — Home page (`/`)

**Before:** Chart + KPIs + holdings tree + donut

**After:**
- Row 1: `PerformanceChart` (unchanged — portfolio line + benchmark overlay)
- Row 2: Three `MoverBox` components side by side:
  - 🇮🇱 ישראל — TOP 10
  - 🇺🇸 ארה"ב — TOP 10
  - 🌍 ETF בינלאומי — TOP 10
- The selected time range (1M / 3M / … / ALL) controls **both** the chart **and** the market movers.

Server-side data fetching is identical to today (needs portfolio holdings to render the chart), so `page.tsx` stays largely the same. A new thin client component `HomeDashboardClient` replaces `HomeClient` for the home route.

### 1b — My Portfolio page (`/my-portfolio`)

New server page, same data fetching as current `page.tsx`. Renders the existing `HomeClient` component unchanged.

### 1c — Navigation

Add one item to `NAV_ITEMS` in `TopNav.tsx`:

```ts
{ href: '/my-portfolio', label: 'My Portfolio', icon: Briefcase }
```

Insert between "Home" and "Invest".

---

## Section 2 — Market Movers Feature

### 2a — Data source

Yahoo Finance public chart API (same source as benchmark):
```
GET https://query1.finance.yahoo.com/v8/finance/chart/{ticker}
    ?range={range}&interval=1d
```

Return = `(lastClose − firstClose) / firstClose × 100`

`range` mapping:

| TimeRange | Yahoo `range` |
|-----------|--------------|
| `1M`  | `1mo`  |
| `3M`  | `3mo`  |
| `6M`  | `6mo`  |
| `YTD` | `ytd`  |
| `1Y`  | `1y`   |
| `3Y`  | `3y`   |
| `ALL` | `1y`   ← fallback, most meaningful |

### 2b — Ticker universe

All three lists are hardcoded constants in the API route.

**Israel — TA-125 core (~35 tickers, `.TA` suffix)**
```
NICE.TA, ESLT.TA, ICL.TA, TEVA.TA, PERI.TA, NVMI.TA, HARL.TA,
FIBI.TA, LUMI.TA, MIFI.TA, SPNS.TA, ENLT.TA, TSEM.TA, BEZQ.TA,
CEVA.TA, RBSN.TA, TMLP.TA, GPRT.TA, SFET.TA, DLRL.TA, ELCO.TA,
AFIL.TA, KARE.TA, IGLD.TA, FTAL.TA, MGDL.TA, ANLT.TA, PMCN.TA,
SRAC.TA, ARPT.TA, ORLY.TA, BIRM.TA, SPEN.TA, ALHE.TA, MTDS.TA
```

**US — S&P 500 top 50 by market cap**
```
NVDA, AAPL, MSFT, AMZN, META, GOOGL, BRK-B, LLY, AVGO, TSLA,
JPM, UNH, V, XOM, MA, COST, HD, PG, ABBV, BAC, CVX, KO, NFLX,
AMD, CRM, WMT, ACN, MRK, ORCL, LIN, TMO, NOW, ADBE, IBM, GS,
PM, AXP, RTX, CAT, SPGI, BLK, NEE, ISRG, ETN, DE, GE, PANW,
UBER, MU, SCHW
```

**International ETFs (~30)**
```
VXUS, VEA, VWO, EEM, ACWI, IEFA, MCHI, EWJ, INDA, EWZ, GXC,
EWT, NORW, EWU, EWG, EWC, EWQ, EWL, URTH, DXJ, FXI, EWY, THD,
EPOL, ECH, EWS, EZA, EIMI, IEMG, HEDJ
```

### 2c — API route

**File:** `src/app/api/market-movers/route.ts`

```
GET /api/market-movers?period=1M
```

- Requires auth (`getCurrentUser()`)
- Validates `period` against allowed values
- Fetches all tickers in all three lists in parallel (`Promise.all`)
- Tickers that fail or return no data are silently skipped
- Sorts each list by return descending, returns top 10
- Response: `{ israel: Mover[], us: Mover[], etf: Mover[] }`
- Next.js cache: `revalidate: 3600` (1 hour)

```ts
interface Mover {
  ticker: string   // e.g. "NICE.TA", "NVDA", "QQQ"
  returnPct: number
}
```

Names are not fetched (would double the API calls). The UI shows ticker symbols only.

### 2d — Hook

**File:** `src/hooks/useMarketMovers.ts`

```ts
useMarketMovers(period: TimeRange): {
  data: { israel: Mover[]; us: Mover[]; etf: Mover[] } | null
  loading: boolean
  error: string | null
}
```

- Uses TanStack Query
- `queryKey: ['market-movers', period]`
- `staleTime: 60 * 60 * 1000` (1 hour, matches server cache)
- `enabled: true` always (market movers always shown)

### 2e — UI Components

**File:** `src/components/market/MarketMovers.tsx`

Two components in one file:

**`MoverBox`** — single market box:
- Header: flag emoji + market name + period label (e.g., "ישראל · 1M")
- List: 10 rows, each `ticker   +X.XX%`
- Loading: skeleton rows
- Colors: return positive → `text-gain`, negative → `text-loss`

**`MarketMovers`** — three boxes side by side:
- `flex-col lg:flex-row` layout
- Receives `{ israel, us, etf }` data + `loading` + current `period`

### 2f — Home page client

**File:** `src/components/portfolio/HomeDashboardClient.tsx` (new)

Thin component used only by the home page route. Receives same props as `HomeClient` (needed for the chart), renders:
1. `PerformanceChart` section (copy of the chart portion of `HomeClient`)
2. `MarketMovers` section

The `timeRange` and `benchmark` are read from `useUIStore` as usual. `fromDate` is derived from `performanceData` for the benchmark hook.

---

## Section 3 — Error Handling

- Individual ticker failures (404, timeout) are silently skipped — no crash, just fewer results
- If an entire market returns 0 results: show "No data available" in the box
- Benchmark fetch failure: existing behavior (no line on chart)

---

## Section 4 — Time Range Additions

Add two new values to the `TimeRange` type: `1W` (one week) and `2Y` (two years).

### 4a — Type change

**File:** `src/types/index.ts` (or wherever `TimeRange` is defined)

```ts
export type TimeRange = '1W' | '1M' | '3M' | '6M' | 'YTD' | '1Y' | '2Y' | '3Y' | 'ALL'
```

Order in the UI toggle: `1W · 1M · 3M · 6M · YTD · 1Y · 2Y · 3Y · ALL`

### 4b — Yahoo Finance mapping update

Add rows to the range mapping table:

| TimeRange | Yahoo `range` |
|-----------|--------------|
| `1W`  | `5d`   |
| `2Y`  | `2y`   |

(All existing rows unchanged.)

### 4c — Files to update

Every place that switches on `TimeRange` or maps it to a label/cutoff must be updated:

- `src/lib/utils/index.ts` — `getTimeRangeCutoff()`: add `'1W'` (subtract 7 days) and `'2Y'` (subtract 2 years)
- `src/hooks/useBenchmark.ts` — `rangeToYahoo` map
- `src/app/api/market-movers/route.ts` — `rangeToYahoo` map (new file, created in Section 2)
- `src/components/charts/PerformanceChart.tsx` — time range toggle button list
- Any other exhaustive `TimeRange` switch/map in the codebase

---

## Section 5 — P/E Multiples Panel

A new panel on the **home page** below the Market Movers row. Shows 30-year P/E history for 7 markets, with the current P/E prominently displayed.

### 5a — Indices covered

| Display name | Identifier | Index / proxy |
|---|---|---|
| S&P 500 | `sp500` | S&P 500 P/E (Shiller CAPE) |
| נאסדק | `nasdaq` | Nasdaq 100 P/E |
| הודו | `india` | NIFTY 50 P/E |
| ת"א 35 | `ta35` | TA-35 P/E |
| ת"א 90 | `ta90` | TA-90 P/E |
| ת"א 125 | `ta125` | TA-125 P/E |
| סין טכנולוגיה | `chinatech` | MSCI China Tech / CQQQ P/E |

### 5b — Data format

**File:** `src/data/pe-history.ts`

```ts
export interface PEDataPoint {
  year: number   // e.g. 1995
  pe: number     // e.g. 18.4
}

export interface PEIndex {
  id: string
  label: string          // display name (Hebrew ok)
  currentPE: number      // most recent value
  history: PEDataPoint[] // annual data points, ~30 years
}

export const PE_DATA: PEIndex[] = [
  {
    id: 'sp500',
    label: 'S&P 500',
    currentPE: 27.2,
    history: [
      { year: 1995, pe: 16.5 },
      // ... one entry per year through 2025
    ]
  },
  // ... remaining 6 indices
]
```

All values are **hardcoded static data** — annual P/E for each year from ~1995 to 2025 (30 years). Data does not need live updates; it is entered once and updated manually when the developer chooses.

### 5c — UI component

**File:** `src/components/market/PEMultiples.tsx`

**`PEMultiples`** component:

- Header: "מכפילי רווח — 30 שנה"
- Top row: 7 cards, one per index — shows `label` + `currentPE` + colored dot (green if below 20-year median, red if above)
- Selected index state (default: `sp500`): clicking a card selects it
- Chart: Recharts `LineChart` of `history` for the selected index
  - X-axis: year labels
  - Y-axis: P/E value
  - Horizontal reference line: 20-year median P/E (calculated at render time)
  - Tooltip: year + P/E value
- Layout: chart takes full width, index cards above it
- Colors: chart line `#3b82f6`, median line `#475569` dashed

### 5d — Home page placement

In `HomeDashboardClient`:
1. `PerformanceChart` section
2. `MarketMovers` section (3 boxes)
3. `PEMultiples` section (new, below market movers)

---

## Out of Scope

- Showing company names (avoids doubling API calls)
- Negative performers / bottom 10
- Clicking a ticker to open its detail page
- Caching market movers in a database
- Live/real-time P/E feeds (all P/E data is static)
