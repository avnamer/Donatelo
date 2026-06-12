# Donatelo — Project Roadmap

> Last updated: 2026-05-25

---

## Project Overview

A personal investment portfolio tracker for Israeli retail investors.
Tracks Israeli (TASE) and US securities in one place, with intelligent tools for rebalancing, dividend monitoring, and AI-powered insights.

---

## ✅ Completed

### Infrastructure & Auth
- [x] Next.js 15 (App Router) + TypeScript + Tailwind + shadcn/ui
- [x] Supabase Auth (Google OAuth + email/password)
- [x] Prisma ORM with PostgreSQL schema (portfolios, folders, holdings, lots, cash accounts, price cache, fx rates, agent tables)
- [x] Row Level Security (RLS) policies on all tables
- [x] Vercel deployment config
- [x] Price caching in `price_cache` table (daily TTL)
- [x] FX rate caching (USD/ILS via FreeCurrencyAPI)

### Data & APIs
- [x] Polygon.io integration — US stock prices (previous close + history)
- [x] TASE DataWise API integration — Israeli securities (via corsproxy.io from browser)
- [x] Yahoo Finance fallback for TASE `.TA` tickers not found on DataWise
- [x] Bizportal fallback for TASE bonds/stocks with numeric `.TA` tickers (e.g. `1380104.TA`) — tries `bonds → capitalmarket → mutualfunds` sections, parses `<dt>שער בסיס</dt>` — *fixed 2026-05-24*
- [x] `/api/prices` — batch price fetch (US + IL)
- [x] `/api/prices/history` — period return % per ticker (1w/1m/6m/1y)
- [x] `/api/prices/series` — price time series per ticker (30d/90d/6m/ytd/1y/3y) from price_cache
- [x] `/api/fx` — USD/ILS exchange rate
- [x] `/api/benchmark` — S&P 500 / MSCI ACWI benchmark data
- [x] `/api/market-movers` — top movers with company names (Yahoo Finance meta)
- [x] `/api/dividends` — dividend data via Polygon.io
- [x] `/api/export` — portfolio data export

### Portfolio Management
- [x] Create / rename / delete folders (nested)
- [x] Add holdings (Israeli + US stocks, ETFs, mutual funds)
- [x] Add lots (date, shares, cost, account type)
- [x] Edit lots inline
- [x] Sell lots (partial or full) — `SellLotDialog`
- [x] Delete lots (individual + Delete All)
- [x] Add cash accounts (ILS + USD)
- [x] Record dividends per holding — `RecordDividendDialog`
- [x] HoldingsTree with folder drill-down
- [x] Breadcrumb navigation through folder tree
- [x] Three-dot menu per row (Move, Edit Target, Rename, Delete, etc.)
- [x] Holding duration + annualized return (CAGR) displayed in folder view
- [x] **Multi-portfolio switcher** — portfolio selector in TopNav, cookie-based selection (`POST /api/portfolios/select`), all dashboard pages respect selection ← *2026-05-18*
- [x] **Dark mode** — next-themes, system preference detection, Sun/Moon toggle in TopNav ← *2026-05-18*
- [x] **Mobile-responsive layout** — hamburger menu, stacked home layout on mobile, KPI 3-column grid, HoldingsTree hides columns on `< sm` ← *2026-05-18*
- [x] **XIRR** — Newton-Raphson calculation in `calculations/index.ts`, cash-flow-timing-aware, shown in KPI panel ← *2026-05-18*

### Pages — Implemented
- [x] **Home (`/`)** — Market dashboard with Market Movers + P/E Multiples panel
- [x] **My Portfolio (`/my-portfolio`)** — Portfolio view with performance chart + KPI panel + holdings table + donut chart
- [x] **Folder page (`/folders/[id]`)** — Drill-down view with weighted performance chart, sub-folders table, holdings table
- [x] **Holding detail (`/holdings/[id]`)** — Price history chart (DrilldownChart), KPI stats, active/sold lots table, add/edit/sell lots
- [x] **Allocations (`/allocations`)** — Set target % per folder, live donut (inner=current, outer=target)
- [x] **Auto-Invest (`/invest`)** — Enter new funds, get suggested buys by folder
- [x] **Dividends (`/dividends`)** — Annual summary, bar chart (monthly/quarterly/yearly), recent/upcoming table
- [x] **Activity (`/activity`)** — Full transaction history, filters, 3 donut charts
- [x] **Explore (`/explore`)** — Public portfolio profiles, "Use as Template"
- [x] **Import (`/import`)** — Upload CSV, preview, confirm → create folders/holdings/lots
- [x] **Export (`/export`)** — Download JSON backup + CSV variants
- [x] **Auth pages** — Login + OAuth callback + error page

### Charts & Visualizations
- [x] **Performance Chart** — area chart indexed to 100, time ranges: 1W / 3M / 6M / 9M / 1Y / 2Y / ALL
- [x] **Benchmark comparison** — S&P 500 + MSCI ACWI overlay on performance chart, dual-series tooltip
- [x] **Allocation Donut** — current % vs target %, segmented by folder
- [x] **Market Movers** — top gainers/losers cards with company names
- [x] **P/E Multiples** — 30-year historical P/E chart for 7 major indices, average line + legend
- [x] **Visualize page (`/visualize`)** — Treemap / Rankings / By Folder / Geographic tabs
  - Treemap: block color = unrealized return %, period filter (Week/Month/6M/Year/All Time), holding duration + CAGR in block + tooltip
  - By Folder: pie chart + value/return table per root folder
  - Geographic: stacked bar + region cards (TASE = Israel, NYSE/NASDAQ = USA)

### AI Agents
- [x] **Portfolio Analyzer** — reads portfolio state, flags concentration risk
- [x] **Market Research Agent** — background on specific stock/ETF
- [x] **Rebalancing Agent** — suggests trades to reach target allocations (pure function)
- [x] **Investor Profile Agent** — investor profile analysis
- [x] **Orchestrator** — routes requests to the right agent (with Vitest tests)
- [x] `holding_theses` + `agent_insights` DB tables
- [x] `/api/agents/insights` — auto-load insights endpoint (SSE streaming)
- [x] `/api/agents/chat` — chat endpoint
- [x] `/api/agents/thesis` — thesis review endpoint
- [x] **AgentPanel UI** — InsightsTab (auto-loads on holding page) + ChatTab
- [x] Streaming responses, abort on unmount, SSE line buffer

---

## 🟡 In Progress / Needs Verification

- [ ] **TASE DataWise API from browser** — blocked by Incapsula WAF from scripts/curl. Need to verify it works from an actual browser session: open app → import CSV with Israeli ticker (e.g. LUMI.TA) → check F12 console for `[TASE]` log with correct price. Yahoo Finance fallback confirmed working (7368 ILA → ₪73.68).
- [ ] **Home vs My Portfolio split** — New homepage shows Market Movers + P/E panel. Portfolio moved to `/my-portfolio`. Navigation and routing need end-to-end verification.

---

## 🔴 Open / Not Yet Built

### High Priority
- [x] **Activity — fix missing transactions** — ✅ done 2026-05-25 — `backfillTransactionsFromLots()` runs on every Activity page load (skips lots already linked); synthesizes `SECURITY_BUY` + `SECURITY_SELL` rows from all existing lots. Server-driven filtering via `?type=` URL param + pagination (`?page=`). ActivityClient: filter tabs, 3 donut summary charts (Trades / Dividends / Cash flows), Total Invested card, realized-gain sub-row on sells, price-per-share sub-row on shares column.
- [ ] **Import — verify broker CSV** — לבדוק את זרימת הייבוא של טבלת תנועות מחשבון ברוקר; לאמת מיפוי עמודות, טיפול בתאריכים, ושמירת lots נכונה לאחר ייבוא
- [ ] **Home — costs summary panel** — להוסיף לעמוד הבית סיכום עלויות: מיסים ששולמו, עמלות קנייה/מכירה, דמי ניהול תיק; ייתכן שדורש שדות חדשים בטבלת lots / transactions
- [ ] **Home — deposits summary panel** — להוסיף לעמוד הבית סיכום הפקדות: סך הכסף שהוכנס לתיק לאורך זמן (net cash in), פירוט לפי חודש / שנה
- [ ] **Settings page (`/settings`)** — Base currency, default time range, tax rate, account types, delete account
- [ ] **Drag & drop** — move holdings/folders between positions in the tree
- [ ] **Fixed assets** — add real estate / manual-value assets to portfolio
- [ ] **Total allocation validation** — warning when folder targets don't sum to 100%
- [ ] **Stale prices logic** — `StalePricesBanner` exists but "market closed" detection logic needs review

### Medium Priority
- [x] **XIRR calculation** — ✅ done 2026-05-18
- [x] **Multiple portfolios per user** — ✅ done 2026-05-18
- [ ] **Benchmark-relative return (alpha)** — portfolio return vs S&P 500
- [ ] **Sharpe ratio** — where data is available
- [ ] **Visualize — Bubble Chart** — size = value, x = return %, y = allocation %
- [ ] **Shared portfolio view** — read-only link for sharing with others

### Lower Priority (Phase 4)
- [ ] **Price alerts** — email/push notification when asset hits target price
- [ ] **Tax report** — capital gains summary export
- [x] **Mobile-responsive layout** — ✅ done 2026-05-18
- [x] **Dark mode** — ✅ done 2026-05-18
- [ ] **Automatic broker import** — IBI, Meitav, eToro API integration
- [ ] **Dividend Coach agent** — dividend trends, projections, yield analysis (defined in architecture but not yet implemented)
- [ ] **Folder-level agent chat** — agents currently focused on individual holdings; extend to folder context
- [ ] **Thesis card on `/holdings/[id]`** — view / edit stored thesis inline
- [ ] **Dismiss individual insight** — per-card dismiss button in AgentPanel
- [ ] **Chat tab state** — lift `messages` state to `AgentPanel` (currently resets on tab switch)

---

## 🐛 Known Bugs

See [`bugs.md`](./bugs.md) for the live bug tracker.

### Fixed This Session

| Date | Bug | Fix |
|------|-----|-----|
| 2026-05-24 | `1380104.TA` (ארזים אגח 4) — "Price unavailable ₪0" shown in portfolio | Added `fetchBizportalSecurityPrice()` in `src/lib/api/tase.ts`; numeric-base `.TA` tickers now fall through to Bizportal after Yahoo Finance fails. |
| 2026-05-25 | Activity page shows "No transactions recorded yet" even though portfolio has lots | `backfillTransactionsFromLots()` runs on every page load (idempotent); server-driven filter+pagination via URL searchParams; `ActivityClient` upgraded with donuts, filter tabs, realized-gain display, pagination bar. |
| 2026-05-18 | Pre-existing Next.js 16 type error in `/api/explore/[id]/use-template` | Fixed: `params` must be `Promise<{ id: string }>` in Next.js 16 dynamic routes |

### Still Open

| Issue | Details |
|-------|---------|
| TASE DataWise API blocked by WAF | Incapsula blocks server-side requests. Workaround: Yahoo Finance + Bizportal scraper. |
| "Market closed" detection | `StalePricesBanner` exists but the logic for detecting market hours and invalidating cache accordingly needs review. |

---

## Session Log

### 2026-05-18 — Phase 5: Polish & Multi-Portfolio
- **Dark mode**: installed `next-themes`, wired `ThemeProvider` in providers.tsx, Sun/Moon toggle in TopNav with `mounted` guard to avoid hydration flicker
- **Mobile layout**: hamburger menu slides down on `< sm`; home dashboard rows stack on `< lg`; KPI panel becomes 3-column grid on mobile; HoldingsTree hides Gain/Alloc columns on `< sm`
- **XIRR**: Newton-Raphson solver in `calculations/index.ts` + `buildXirrCashFlows()` helper; wired into `usePortfolioMetrics`, displayed as new KPI row
- **Visualize**: added By Folder tab (pie chart + table) and Geographic tab (stacked bar + region cards)
- **Multi-portfolio**: `POST /api/portfolios/select` sets `httpOnly` cookie; TopNav shows switcher when user has > 1 portfolio; all 7 dashboard pages read `portfolio-id` cookie
- **Bug fix**: Next.js 16 `params` type error in `/api/explore/[id]/use-template`
- Clean build with `pnpm run build` ✓

### 2026-05-24 — AI Agents Layer
- Full 4-agent system: Orchestrator + Market Research + Investor Profile + Rebalancing
- New DB tables: `holding_theses`, `agent_insights`
- 3 new API routes: `GET /api/agents/insights`, `POST /api/agents/chat`, `GET/POST /api/agents/thesis`
- Floating 🤖 AgentPanel in dashboard layout (Insights tab + streaming Chat tab)
- 9 Vitest unit tests passing
- Requires `ANTHROPIC_API_KEY` in `.env.local`

### 2026-05-25 — Activity Page Fix & Upgrade
- **Root cause**: `transactions` table was empty — lots added before auto-transaction code had no DB rows
- Added `backfillTransactionsFromLots(portfolioId, userId)` in `queries/transactions.ts`
  - Runs on **every** Activity page load (idempotent — skips lots already linked to a transaction)
  - Creates `SECURITY_BUY` for every lot; creates `SECURITY_SELL` for sold lots
- **Server-driven filtering**: `?type=SECURITY_BUY` etc. URL param → passed to `getTransactions()`; no client-side array filtering
- **Server-driven pagination**: `?page=N` URL param, 50 rows per page, `totalPages` computed server-side
- New `POST /api/lots/backfill` endpoint for manual triggering
- `ActivityClient` upgraded:
  - Filter tabs (All / Buys / Sells / Dividends / Deposits / Withdrawals) — navigate via URL, tab filtered out when count=0
  - 3 donut summary charts (Trades buy vs sell, Dividends, Cash flows deposit vs withdrawal) + Total Invested KPI card
  - Realized-gain sub-row displayed under sell amount
  - Price-per-share sub-row under shares count
  - Pagination bar with prev/next and `showing X–Y of N` label
  - Responsive: holding name hidden on `< sm`, Shares column hidden on `< sm`, Notes column hidden on `< md`
- Clean build ✓

### 2026-05-20 — Visualize Enhancements
- Treemap: security full name instead of ticker; period filter (Week/Month/6M/Year/All Time)
- New `GET /api/prices/history` — DB cache first, Yahoo Finance fallback
- New hook `usePriceHistory`
- Bug fixes: TASE `.TA` suffix in Yahoo Finance history; numeric TASE fund IDs use DB cache
- New utils: `formatHoldingDurationLong()`, `calcAnnualizedReturn()`
- Folder tree + Treemap: holding duration + CAGR per row/block

---

## Architecture Summary

| Layer | Technology |
|---|---|
| Frontend | Next.js 15 (App Router), React 19, TypeScript, Tailwind, shadcn/ui |
| State | TanStack Query (server state), Zustand (UI state) |
| Charts | Recharts |
| Backend | Next.js API Routes |
| Database | Supabase PostgreSQL via Prisma ORM |
| Auth | Supabase Auth (Google OAuth + email) |
| US Prices | Polygon.io |
| IL Prices | TASE DataWise API + Yahoo Finance fallback |
| FX Rates | FreeCurrencyAPI |
| AI Agents | Anthropic Claude API (SSE streaming) |
| Deployment | Vercel (frontend + API) + Supabase (DB + Auth) |
