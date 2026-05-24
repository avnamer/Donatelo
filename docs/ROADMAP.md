# Development Roadmap

## Guiding Principle
Build the minimum viable portfolio tracker first (Phase 1),
then layer on features. Each phase ships something usable.

---

## Phase 1 — Core Portfolio Tracker
**Goal:** You can enter your holdings and see your portfolio value and returns.
**Estimated effort:** 2-3 weeks

### 1.1 Project Setup
- [x] `npx create-next-app@latest` with TypeScript + Tailwind
- [x] Install dependencies: shadcn/ui, TanStack Query, Recharts, Prisma, Zustand
- [x] Supabase project setup (DB + Auth)
- [x] Prisma schema + first migration
- [x] Environment variables
- [x] Basic folder structure per CLAUDE.md

### 1.2 Authentication
- [x] Supabase Auth: Google OAuth + email/password
- [x] Protected routes middleware
- [x] User session handling

### 1.3 Data Layer
- [x] Prisma models: Portfolio, Folder, Holding, Lot (see DATA_MODEL.md)
- [x] Supabase RLS policies (users see own data only)
- [x] DB query functions in `src/lib/db/`
- [x] Zod schemas for all data inputs

### 1.4 Price Integration
- [x] `GET /api/prices` route — fetches and caches prices
- [x] Polygon.io client (`src/lib/api/polygon.ts`)
- [x] TASE DataWise client (`src/lib/api/tase.ts`)
- [x] `price_cache` table + TTL logic
- [x] USD/ILS exchange rate (`GET /api/fx`, `fx_rates` table)

### 1.5 Calculation Engine
- [x] All functions in `src/lib/calculations/`
- [x] Unit tests with Vitest (verify against Donatello values)
- [x] calcCurrentValue, calcCostBasis, calcUnrealizedGains
- [x] calcTotalReturn, calcActualAllocationPct, calcExpenseRatio

### 1.6 Home Page (Dashboard)
- [x] Folder tree component (recursive)
- [x] Holdings table (Name, Value, Gain/Return, Actual/Target)
- [x] KPI panel (Value, Return, Gain, Expense Ratio, Dividend Yield)
- [x] Donut chart (right panel, allocation breakdown)
- [x] Folder drill-down navigation with breadcrumb
- [x] "Last Updated" timestamp — derived from most recent price date

### 1.7 Portfolio Management (CRUD)
- [x] Add folder (modal)
- [x] Rename folder
- [x] Delete folder (with confirmation, checks if empty)
- [x] Move folder (drag & drop or modal)
- [x] Add holding to folder (search by ticker symbol)
- [x] Delete holding

### 1.8 Lot Management
- [x] Individual holding page (`/tickers/[symbol]`)
- [x] Lots table (date, shares, cost, account, folder)
- [x] Add new lot (inline form)
- [x] Delete lot
- [x] Mark lot as sold (partial or full)
- [x] Price chart for the holding (1Y, Recharts area chart)

### 1.9 Cash Accounts
- [x] Add ILS / USD cash account — AddCashDialog + /api/cash-accounts route
- [ ] Update balance (edit dialog)
- [x] Show in holdings table

---

## Phase 2 — Financial Features
**Goal:** Target allocations, auto-invest, dividends, and activity log.
**Estimated effort:** 2 weeks

### 2.1 Target Allocations Page
- [x] `/allocations` page
- [x] Edit target % per folder (inline, auto-save)
- [x] Visual: donut with current vs target rings
- [x] Validation: total must = 100%
- [x] Warning badge in nav when off-target — orange dot on Allocations tab

### 2.2 Auto-Invest Page
- [x] `/invest` page
- [x] Auto-invest algorithm (see CALCULATIONS.md §10)
- [x] Fractional shares toggle
- [x] Suggestions table
- [x] Manual override of allocations

### 2.3 Performance Chart
- [x] Indexed chart (normalized to 100) on Home page
- [x] Time ranges: 1W, 1M, 3M, 6M, YTD, 1Y, 2Y, 3Y, ALL (1W + 2Y added in Phase 6)
- [x] Benchmark comparison: S&P 500 (SPY), MSCI ACWI, TA-125
- [x] "Simulated performance" label
- [x] Recharts area chart with smooth curve
- [x] Dual-series tooltip — shows both portfolio and benchmark on every hover point
- [x] Period return calculated with linear interpolation (no historical portfolio prices)

### 2.4 Dividends Page
- [x] `/dividends` page
- [x] Annual summary panel
- [x] Bar chart (quarterly/monthly/yearly)
- [x] Breakdown toggle (by folder / by asset)
- [x] Recent & upcoming dividends table
- [x] Date picker + tax % input
- [x] Upcoming dividends — projected from dividend cache (frequency + last ex-date)

### 2.5 Activity Log
- [x] Transaction model + API
- [x] `/activity` page
- [x] Summary panel (buys, sells, cash, dividends)
- [x] Year + action type filters
- [x] Three donut charts (inflows, outflows, dividends by folder)
- [x] Activity log table with all transaction types
- [x] Auto-create transactions when lots are added/sold

---

## Phase 3 — Data & Import
**Goal:** Full data import from Donatello. Production-ready.
**Estimated effort:** 1 week

### 3.1 Import
- [x] `/import` page — file drop zone + preview + confirm
- [x] JSON backup parser (full round-trip: folders → holdings → lots → cash accounts)
- [x] Preview step (shows counts before importing)
- [x] Error handling (bad format, invalid JSON)
- [ ] CSV parser for Donatello export format (bank/broker statements)

### 3.2 Export
- [x] `/export` page
- [x] JSON full backup (portfolio + folders + holdings + lots + cash accounts)
- [x] CSV: Holdings, Lots, Dividends
- [x] Import/Export links added to TopNav

### 3.3 Explore Profiles
- [x] `/explore` page
- [x] Seed noteworthy profiles (data from Donatello)
- [x] Profile detail view
- [x] "Use as Template" — POST /api/explore/[id]/use-template creates root folders with colors + target allocations

### 3.4 Production Hardening
- [x] Error boundary (`error.tsx`) — catches dashboard-level errors with friendly UI
- [x] Loading skeleton (`loading.tsx`) — matches dashboard layout
- [x] Empty states — HoldingsTree, PerformanceChart, AllocationDonut
- [x] Price unavailable fallback — stale multi-day cache + `unavailable` flag in API response
- [x] Rate limit handling for Polygon.io — retry with exponential backoff (1 s → 2 s → 4 s), respects Retry-After header
- [x] Vercel deployment — https://donatelo.vercel.app (deploy via `npx vercel --prod`)
- [x] RLS policies applied to all 10 tables in production DB
- [x] Google OAuth configured (Google Cloud Console + Supabase provider enabled)
- [x] All 11 env vars set in Vercel production environment
- [ ] Basic monitoring (Vercel Analytics)

---

## Phase 4 — AI Agents
**Goal:** First AI-powered features.
**Estimated effort:** 1-2 weeks

### 4.1 Infrastructure
- [x] Anthropic Claude API client (`src/lib/agents/`)
- [x] Streaming response handling (SSE via ReadableStream)
- [x] Floating AgentPanel UI (`src/components/agents/AgentPanel`)
- [x] `HoldingThesis` + `AgentInsight` DB tables (migration applied to production)
- [x] TypeScript types (`src/types/agents.ts`)
- [x] DB queries — thesis CRUD + insight persistence (`src/lib/db/queries/agents.ts`)

### 4.2 Market Research Agent
- [x] `src/lib/agents/market-agent.ts`
- [x] Fetches 30-day price history per holding (Polygon / TASE)
- [x] Calls Claude only for >3% movers (cost optimization)
- [x] Returns `MarketUpdate[]` with trend + reason

### 4.3 Investor Profile Agent (Rebalancing Advisor)
- [x] `src/lib/agents/profile-agent.ts`
- [x] Evaluates investment theses against market updates
- [x] Chat system prompt — extracts structured theses from conversation
- [x] `<thesis>` JSON block parsed and persisted automatically

### 4.4 Rebalancing / Strategy Agent
- [x] `src/lib/agents/rebalancing-agent.ts` (pure function, no API call)
- [x] Flags allocation drift ≥5% (warning) and ≥10% (alert)

### 4.5 Orchestrator
- [x] `src/lib/agents/orchestrator.ts` — coordinates all 3 agents in parallel
- [x] Vitest unit tests (mocked Claude + APIs, all passing)
- [x] Portfolio health: `good` / `attention` / `alert`

### 4.6 API Routes
- [x] `GET /api/agents/insights` — runs orchestrator, 24h cache, force-refresh option
- [x] `POST /api/agents/chat` — streaming SSE chat with Profile Agent
- [x] `GET|POST /api/agents/thesis` — thesis CRUD per holding

### 4.7 Agent Panel UI
- [x] Floating 🤖 button (bottom-right)
- [x] Insights tab — severity cards (info/warning/alert), Analyze Portfolio button
- [x] Chat tab — streaming chat, thesis auto-save, Hebrew/English
- [x] Mounted in dashboard layout (all pages)

---

## Phase 5 — Visualize & Polish
**Goal:** Richer analytics and mobile-ready.
**Estimated effort:** 1-2 weeks

### 5.1 Visualize Page
- [x] `/visualize` page
- [x] Treemap component
- [x] Bubble chart (return vs size)
- [x] Sector/industry breakdown
- [ ] Geographic allocation map

### 5.2 XIRR
- [ ] XIRR calculation (time-weighted with cash flows)
- [ ] Show alongside simple return

### 5.3 Mobile
- [ ] Responsive layout for all pages
- [ ] Touch-friendly charts
- [ ] Mobile navigation

### 5.4 Dark Mode
- [ ] Tailwind dark mode classes
- [ ] System preference detection

### 5.5 Multi-Portfolio
- [ ] Portfolio switcher in nav
- [ ] Per-portfolio settings

---

---

## Phase 6 — Home / Market Overview
**Goal:** Separate the home page into a market-oriented dashboard, add market data panels.
**Completed:** 2026-05-20

### 6.1 Home / Portfolio Split
- [x] `/my-portfolio` — dedicated portfolio view (everything that was on the home page)
- [x] `/` (Home) → `HomeDashboardClient` — market overview + performance chart
- [x] My Portfolio added to TopNav (between Home and Invest)

### 6.2 Extended Time Ranges
- [x] Add `'1W'` and `'2Y'` to `TimeRange` union (`src/store/ui.ts`)
- [x] `getTimeRangeCutoff` handles both new values (`src/lib/utils/index.ts`)
- [x] `PerformanceChart` time-range buttons updated
- [x] Unit tests added (51 total, all passing)

### 6.3 Market Movers Panel
- [x] `GET /api/market-movers?period=<TimeRange>` — Yahoo Finance public chart API, no API key
- [x] Three ticker universes: 35 Israel (TASE), 50 US, 30 International ETFs
- [x] Top-10 by % return per period, parallel fetch, cached 1h
- [x] Company/index name extracted from `meta.shortName` — no extra API calls
- [x] `useMarketMovers` hook (TanStack Query, staleTime 1h)
- [x] `MarketMovers` + `MoverBox` components — Israel 🇮🇱 (emerald), US 🇺🇸 (blue), International 🌍 (violet)
- [x] Loading skeletons (10 rows), empty state, gain/loss color coding

### 6.4 P/E Multiples Panel
- [x] `src/data/pe-history.ts` — 30 years of annual P/E data for 7 indices:
  S&P 500, Nasdaq, India Nifty 50, TA-35, TA-90, TA-125, China Tech (CSI Tech)
- [x] `PEMultiples` component — tab selector, Recharts `LineChart`
- [x] Average reference line (amber `#f59e0b`, dashed) — computed in `useMemo`
- [x] Median reference line (slate `#94a3b8`, dotted) — computed in `useMemo`
- [x] Color dot on each tab: green if current P/E < historical average, red if above
- [x] Legend row (P/E / ממוצע / מדיאן)

---

## Current Status

| Phase | Status |
|---|---|
| Phase 1 — Core Tracker | 🟢 Complete (~98%) |
| Phase 2 — Financial Features | 🟢 Complete (~95%) |
| Phase 3 — Data & Import | 🟡 Mostly done (~90%) |
| Phase 4 — AI Agents | 🟢 Complete |
| Phase 5 — Visualize & Polish | 🟡 Partial (~50%) |
| Phase 6 — Home / Market Overview | 🟢 Complete |

---

### Open Items

**Phase 1:**
- [ ] Cash accounts: allow balance update (edit dialog)

**Phase 2:**
- [ ] Dividend Yield KPI on home page — requires annual dividend data per holding

**Phase 3:**
- [ ] CSV parser for Donatello/broker bank statements
- [ ] Vercel Analytics (basic monitoring)

**Phase 5:**
- [ ] Geographic allocation map (`/visualize`)
- [ ] XIRR calculation
- [ ] Mobile-responsive layout
- [ ] Dark mode
- [ ] Multi-portfolio switcher + management page

**Tech debt:**
- [ ] `buildPeriodDailyValues` duplicated in `HomeDashboardClient` and `HomeClient` — extract to shared util
- [ ] P/E `currentPE` values are hardcoded — need periodic manual update when new annual data is published
- [ ] Activity Log: add year filter + 3 donut summary charts (currently basic feed only)
