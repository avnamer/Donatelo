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
- [ ] Show in holdings table

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
- [x] Time ranges: 3M, 6M, 9M, 1Y, All
- [x] Benchmark comparison: S&P 500 (SPY), MSCI ACWI
- [x] "Simulated performance" label
- [x] Recharts area chart with smooth curve

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
- [x] "Use as Template" functionality — POST /api/explore/[id]/use-template creates root folders with colors + target allocations

### 3.4 Production Hardening
- [x] Error boundary (`error.tsx`) — catches dashboard-level errors with friendly UI
- [x] Loading skeleton (`loading.tsx`) — matches dashboard layout
- [x] Empty states — HoldingsTree, PerformanceChart, AllocationDonut
- [x] Price unavailable fallback — stale multi-day cache + `unavailable` flag in API response
- [x] Rate limit handling for Polygon.io — retry with exponential backoff (1 s → 2 s → 4 s), respects Retry-After header
- [ ] Vercel deployment
- [ ] Basic monitoring (Vercel Analytics)

---

## Phase 4 — AI Agents
**Goal:** First AI-powered features.
**Estimated effort:** 1-2 weeks

### 4.1 Infrastructure
- [ ] Anthropic Claude API client (`src/lib/agents/`)
- [ ] Agent tool definitions (see ARCHITECTURE.md)
- [ ] Streaming response handling (Vercel AI SDK)
- [ ] Chat UI component (`src/components/agents/AgentPanel`)

### 4.2 Portfolio Analyzer Agent
- [ ] Endpoint: `POST /api/agents/analyzer`
- [ ] Tools: getPortfolioSummary, getFolderDetails, getHoldingDetails
- [ ] Explains current state in plain language
- [ ] Flags: concentration risk, underperforming holdings, high expense ratios

### 4.3 Rebalancing Advisor Agent
- [ ] Endpoint: `POST /api/agents/rebalancer`
- [ ] Tools: calculateRebalance, getMarketData
- [ ] Suggests specific trades to reach target allocations
- [ ] Considers tax implications (realized gains)

### 4.4 Dividend Coach Agent
- [ ] Endpoint: `POST /api/agents/dividends`
- [ ] Tools: getDividendHistory, getDividendForecast
- [ ] Analyzes dividend growth, coverage, diversification

### 4.5 Market Researcher Agent
- [ ] Endpoint: `POST /api/agents/researcher`
- [ ] Tools: getHoldingDetails, searchMarketData
- [ ] On-demand research about a specific holding

---

## Phase 5 — Visualize & Polish
**Goal:** Richer analytics and mobile-ready.
**Estimated effort:** 1-2 weeks

### 5.1 Visualize Page
- [ ] `/visualize` page
- [ ] Treemap component
- [ ] Sector/industry breakdown
- [ ] Geographic allocation

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

## Current Status

| Phase | Status |
|---|---|
| Phase 1 — Core Tracker | 🟢 Complete (~95%) |
| Phase 2 — Financial Features | 🟢 Complete (~95%) |
| Phase 3 — Data & Import | 🟡 Mostly done (~90%) |
| Phase 4 — AI Agents | 🔴 Not started |
| Phase 5 — Polish | 🔴 Not started |

### Remaining open items
**Phase 1:**
- [ ] Cash accounts: show balance in holdings table, allow balance update

**Phase 2:**
- [ ] Dividend Yield KPI on home page — requires annual dividend data per holding

**Phase 3 (remaining):**
- [ ] CSV parser for Donatello/broker bank statements
- [ ] Vercel deployment + basic monitoring (Vercel Analytics)

**Phase 4:** AI agents (infrastructure + 4 agents)

**Phase 5:** Visualize (treemap done, bubble/sector/geo missing), XIRR, mobile, dark mode, multi-portfolio

**Next action:** Phase 4 — AI agents
