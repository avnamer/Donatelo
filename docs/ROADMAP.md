# Development Roadmap

## Guiding Principle
Build the minimum viable portfolio tracker first (Phase 1),
then layer on features. Each phase ships something usable.

---

## Phase 1 — Core Portfolio Tracker

### 1.1 Project Setup
- [x] `npx create-next-app@latest` with TypeScript + Tailwind
- [x] shadcn/ui, TanStack Query, Recharts, Prisma, Zustand
- [x] Supabase project setup (DB + Auth)
- [x] Prisma schema + first migration
- [x] Environment variables + folder structure per CLAUDE.md

### 1.2 Authentication
- [x] Supabase Auth: Google OAuth + email/password
- [x] Protected routes middleware + user session handling

### 1.3 Data Layer
- [x] Prisma models: Portfolio, Folder, Holding, Lot
- [x] Supabase RLS policies (users see own data only)
- [x] DB query functions in `src/lib/db/`
- [x] Zod schemas for all data inputs

### 1.4 Price Integration
- [x] `GET /api/prices` — fetches and caches prices
- [x] Polygon.io client (`src/lib/api/polygon.ts`)
- [x] TASE DataWise client (`src/lib/api/tase.ts`)
- [x] `price_cache` table + TTL logic
- [x] USD/ILS exchange rate (`GET /api/fx`, `fx_rates` table)

### 1.5 Calculation Engine
- [x] All functions in `src/lib/calculations/`
- [x] Unit tests with Vitest
- [x] calcCurrentValue, calcCostBasis, calcUnrealizedGains
- [x] calcTotalReturn, calcActualAllocationPct, calcExpenseRatio

### 1.6 My Portfolio Page (`/my-portfolio`)
- [x] Recursive folder tree component
- [x] Holdings table: Name, Value, Gain/Return, Actual/Target, Duration
- [x] KPI panel: Value, Return, Gain, Expense Ratio
- [x] Allocation donut chart (right panel)
- [x] Folder drill-down navigation with breadcrumb
- [x] "Last Updated" timestamp from most recent price date
- [x] Stale prices banner + unavailable prices panel

### 1.7 Portfolio Management (CRUD)
- [x] Add / Rename / Delete folder (modal + confirmation)
- [x] Add / Delete holding (search by ticker)

### 1.8 Lot Management
- [x] Individual holding page (`/holdings/[id]`)
- [x] Lots table: date, shares, cost, account, folder
- [x] Add / Edit / Delete lot
- [x] Mark lot as sold — partial or full (SellLotDialog)
- [x] Price chart: 1W, 1Y, Recharts area chart

### 1.9 Cash Accounts
- [x] Add ILS / USD cash account — AddCashDialog + `/api/cash-accounts`
- [ ] Update balance (edit dialog)
- [ ] Show cash balance in holdings table

---

## Phase 2 — Financial Features

### 2.1 Target Allocations Page (`/allocations`)
- [x] Edit target % per folder (inline, auto-save)
- [x] Donut: current vs target rings
- [x] Validation: total must equal 100%
- [x] Warning badge in nav when off-target
- [ ] **Drill-down tree** — expand folders → subfolders → holdings, set target % at every level
  - Plan written: `docs/superpowers/plans/2026-05-17-allocations-drilldown.md`
  - **NOT YET IMPLEMENTED**

### 2.2 Auto-Invest Page (`/invest`)
- [x] Auto-invest algorithm
- [x] Fractional shares toggle
- [x] Suggestions table + manual allocation override

### 2.3 Performance Chart
- [x] Indexed chart (normalized to 100) on home page
- [x] Time ranges: 1W, 3M, 6M, 9M, 1Y, 2Y, All
- [x] Benchmark comparison: SPY, MSCI ACWI
- [x] Dual-series tooltip (portfolio + benchmark on hover)
- [x] Period return with linear interpolation

### 2.4 Dividends Page (`/dividends`)
- [x] Annual summary panel
- [x] Bar chart: quarterly / monthly / yearly
- [x] Breakdown toggle: by folder / by asset
- [x] Recent and upcoming dividends table
- [x] Date picker + tax % input
- [x] Projected upcoming dividends from dividend cache

### 2.5 Activity Log (`/activity`)
- [x] Transaction model + API
- [x] Summary panel: buys, sells, cash, dividends
- [x] Year + action type filters
- [x] Three donut charts: inflows, outflows, dividends by folder
- [x] Full activity table with all transaction types
- [x] Auto-create transactions when lots are added/sold

---

## Phase 3 — Data & Import

### 3.1 Import (`/import`)
- [x] File drop zone + preview + confirm
- [x] JSON backup parser — full round-trip: folders, holdings, lots, cash accounts
- [x] Preview step (shows counts) + error handling
- [ ] CSV parser for broker/bank statement format

### 3.2 Export (`/export`)
- [x] JSON full backup
- [x] CSV: Holdings, Lots, Dividends
- [x] Import/Export links in TopNav

### 3.3 Explore Profiles (`/explore`)
- [x] Seed profiles + detail view
- [x] "Use as Template" — creates root folders with colors + target allocations

### 3.4 Production Hardening
- [x] Error boundary + loading skeleton + empty states
- [x] Price unavailable fallback + rate limit retry (Polygon.io)
- [x] Vercel deployment — https://donatelo.vercel.app
- [x] RLS policies on all tables in production
- [x] Google OAuth + all env vars configured on Vercel
- [ ] Vercel Analytics / basic monitoring

---

## Phase 4 — AI Agents
**Status: Mostly done (~85%)**

### 4.1 Infrastructure
- [x] Anthropic Claude API client (`src/lib/agents/`)
- [x] Agent type definitions (`src/types/agents.ts`)
- [x] DB tables: `holding_theses`, `agent_insights` (with FK constraints)
- [x] DB queries: getAgentInsights, saveAgentInsights, getThesesForPortfolio, getLatestInsightAge
- [x] Orchestrator — runs all agents in parallel
- [x] Vitest tests for orchestrator

### 4.2 Market Research Agent (`src/lib/agents/market-agent.ts`)
- [x] Fetches price history from Polygon + TASE for all holdings
- [x] Sends significant movers (>3% change) to Claude for analysis
- [x] Returns structured `MarketUpdate[]` per holding

### 4.3 Rebalancing Agent (`src/lib/agents/rebalancing-agent.ts`)
- [x] Pure function — no API call
- [x] Detects drift vs target allocation per folder
- [x] Warning at 5%, alert at 10%
- [x] Returns `AllocationDrift[]` with severity

### 4.4 Investor Profile Agent (`src/lib/agents/profile-agent.ts`)
- [x] Evaluates user-written theses against market updates
- [x] Claude returns INTACT / REVIEW / BROKEN status per thesis

### 4.5 Agent API Routes
- [x] `GET /api/agents/insights` — orchestrator with 24h cache + `?force=true` refresh
- [x] `POST /api/agents/chat` — streaming chat with portfolio context (SSE)
- [x] `POST /api/agents/thesis` — save/update investment thesis for a holding

### 4.6 Agent UI
- [x] `AgentPanel` — side panel on `/my-portfolio`
- [x] `InsightsTab` — market updates, drift alerts, thesis evaluations
- [x] `ChatTab` — streaming Claude chat about the portfolio
- [x] SSE line buffer + abort on unmount

### 4.7 Remaining
- [ ] Dedicated Dividend Coach agent (growth, coverage, diversification analysis)
- [ ] Full Portfolio Analyzer agent with tool-use (concentration risk, expense ratio flags)

---

## Phase 5 — Visualize, Market Data & Polish
**Status: In progress (~50%)**

### 5.1 Home Page — Market Dashboard (`/`)
- [x] Home split: market dashboard (`/`) vs. portfolio view (`/my-portfolio`)
- [x] Performance chart + benchmark comparison
- [x] **Market Movers panel** — top performers for Israel 🇮🇱, US 🇺🇸, International ETFs
  - `/api/market-movers` + Yahoo Finance meta for names/flags
  - Time-range synced with performance chart
- [x] **P/E Multiples panel** — 30-year P/E history for 7 indices
  - Static data in `src/data/pe-history.ts`
  - Line chart per index + average reference line + legend

### 5.2 Visualize Page (`/visualize`)
- [x] 4 tabs: Treemap, Rankings, By Folder, Geographic
- [x] Treemap — holdings sized by value, colored by folder
- [x] Rankings — sorted holdings with return bars + period filter
- [x] By Folder — allocation donut per root folder
- [x] Geographic — Israel / US / International breakdown
- [x] Period filter: 1W, 1M, 6M, 1Y, All Time
- [ ] Sector/industry breakdown (requires metadata enrichment)

### 5.3 XIRR
- [ ] Time-weighted return calculation with cash flows
- [ ] Show alongside simple return on `/my-portfolio`

### 5.4 Mobile
- [ ] Responsive layout for all pages
- [ ] Touch-friendly charts + mobile navigation drawer

### 5.5 Dark Mode
- [ ] Tailwind dark mode classes throughout
- [ ] System preference detection (`prefers-color-scheme`)

### 5.6 Multi-Portfolio
- [ ] Portfolio switcher dropdown in nav (cookie logic exists; UI missing)
- [ ] Per-portfolio settings page

---

## Current Status

| Phase | Status | Completion |
|---|---|---|
| Phase 1 — Core Tracker | 🟢 Done | ~95% |
| Phase 2 — Financial Features | 🟡 Mostly done | ~90% |
| Phase 3 — Data & Import | 🟡 Mostly done | ~90% |
| Phase 4 — AI Agents | 🟡 Mostly done | ~85% |
| Phase 5 — Visualize & Polish | 🟡 In progress | ~50% |

---

## Open Items (prioritized)

### High priority
- [ ] **Allocations drill-down** — expand folders → subfolders → holdings in the allocations table, set target % at every level. Plan fully written, 3 files to modify, no schema changes: `docs/superpowers/plans/2026-05-17-allocations-drilldown.md`
- [ ] **Cash accounts** — show balance in holdings table + update balance dialog
- [ ] **Dividend Yield KPI** — annual dividend data per holding (available in dividend cache)

### Medium priority
- [ ] **XIRR** — time-weighted return with cash flows alongside simple return
- [ ] **Sector breakdown** — metadata enrichment from Polygon or static map
- [ ] **Dividend Coach agent** — growth, coverage, diversification analysis
- [ ] **CSV import** — broker/bank statement parsing
- [ ] **Vercel Analytics** — basic monitoring

### Lower priority
- [ ] **Mobile responsive** — all pages + touch charts + mobile nav
- [ ] **Dark mode** — Tailwind dark classes + system preference
- [ ] **Multi-portfolio switcher** — dropdown UI in nav
- [ ] **Full Portfolio Analyzer agent** — tool-use, concentration risk, expense ratio flags

---

## Next recommended action
**Allocations drill-down** — plan fully written, only 3 files to modify, no schema or type changes.
See: `docs/superpowers/plans/2026-05-17-allocations-drilldown.md`
