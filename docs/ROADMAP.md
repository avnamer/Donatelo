# Development Roadmap

## Guiding Principle
Build the minimum viable portfolio tracker first (Phase 1),
then layer on features. Each phase ships something usable.

---

## Phase 1 — Core Portfolio Tracker
**Goal:** You can enter your holdings and see your portfolio value and returns.
**Estimated effort:** 2-3 weeks

### 1.1 Project Setup
- [ ] `npx create-next-app@latest` with TypeScript + Tailwind
- [ ] Install dependencies: shadcn/ui, TanStack Query, Recharts, Prisma, Zustand
- [ ] Supabase project setup (DB + Auth)
- [ ] Prisma schema + first migration
- [ ] Environment variables
- [ ] Basic folder structure per CLAUDE.md

### 1.2 Authentication
- [ ] Supabase Auth: Google OAuth + email/password
- [ ] Protected routes middleware
- [ ] User session handling

### 1.3 Data Layer
- [ ] Prisma models: Portfolio, Folder, Holding, Lot (see DATA_MODEL.md)
- [ ] Supabase RLS policies (users see own data only)
- [ ] DB query functions in `src/lib/db/`
- [ ] Zod schemas for all data inputs

### 1.4 Price Integration
- [ ] `GET /api/prices` route — fetches and caches prices
- [ ] Polygon.io client (`src/lib/api/polygon.ts`)
- [ ] TASE DataWise client (`src/lib/api/tase.ts`)
- [ ] `price_cache` table + TTL logic
- [ ] USD/ILS exchange rate (`GET /api/fx`, `fx_rates` table)

### 1.5 Calculation Engine
- [ ] All functions in `src/lib/calculations/`
- [ ] Unit tests with Vitest (verify against Donatello values)
- [ ] calcCurrentValue, calcCostBasis, calcUnrealizedGains
- [ ] calcTotalReturn, calcActualAllocationPct, calcExpenseRatio

### 1.6 Home Page (Dashboard)
- [ ] Folder tree component (recursive)
- [ ] Holdings table (Name, Value, Gain/Return, Actual/Target)
- [ ] KPI panel (Value, Return, Gain, Expense Ratio, Dividend Yield)
- [ ] Donut chart (right panel, allocation breakdown)
- [ ] Folder drill-down navigation with breadcrumb
- [ ] "Last Updated" timestamp

### 1.7 Portfolio Management (CRUD)
- [ ] Add folder (modal)
- [ ] Rename folder
- [ ] Delete folder (with confirmation, checks if empty)
- [ ] Move folder (drag & drop or modal)
- [ ] Add holding to folder (search by ticker symbol)
- [ ] Delete holding

### 1.8 Lot Management
- [ ] Individual holding page (`/tickers/[symbol]`)
- [ ] Lots table (date, shares, cost, account, folder)
- [ ] Add new lot (inline form)
- [ ] Delete lot
- [ ] Mark lot as sold (partial or full)
- [ ] Price chart for the holding (1Y, Recharts area chart)

### 1.9 Cash Accounts
- [ ] Add ILS / USD cash account
- [ ] Update balance
- [ ] Show in holdings table

---

## Phase 2 — Financial Features
**Goal:** Target allocations, auto-invest, dividends, and activity log.
**Estimated effort:** 2 weeks

### 2.1 Target Allocations Page
- [ ] `/allocations` page
- [ ] Edit target % per folder (inline, auto-save)
- [ ] Visual: donut with current vs target rings
- [ ] Validation: total must = 100%
- [ ] Warning badge in nav when off-target

### 2.2 Auto-Invest Page
- [ ] `/invest` page
- [ ] Auto-invest algorithm (see CALCULATIONS.md §10)
- [ ] Fractional shares toggle
- [ ] Suggestions table
- [ ] Manual override of allocations

### 2.3 Performance Chart
- [ ] Indexed chart (normalized to 100) on Home page
- [ ] Time ranges: 3M, 6M, 9M, 1Y, All
- [ ] Benchmark comparison: S&P 500 (SPY), MSCI ACWI
- [ ] "Simulated performance" label
- [ ] Recharts area chart with smooth curve

### 2.4 Dividends Page
- [ ] `/dividends` page
- [ ] Annual summary panel
- [ ] Bar chart (quarterly/monthly/yearly)
- [ ] Breakdown toggle (by folder / by asset)
- [ ] Recent & upcoming dividends table
- [ ] Date picker + tax % input
- [ ] Dividend eligibility calculation (ex-date vs purchase date)

### 2.5 Activity Log
- [ ] Transaction model + API
- [ ] `/activity` page
- [ ] Summary panel (buys, sells, cash, dividends)
- [ ] Year + action type filters
- [ ] Three donut charts (inflows, outflows, dividends by folder)
- [ ] Activity log table with all transaction types
- [ ] Auto-create transactions when lots are added/sold

---

## Phase 3 — Data & Import
**Goal:** Full data import from Donatello. Production-ready.
**Estimated effort:** 1 week

### 3.1 Import
- [ ] `/import` page
- [ ] CSV parser for Donatello export format
- [ ] Preview + confirm step
- [ ] Error handling (invalid tickers, unknown formats)
- [ ] Progress indicator for large imports

### 3.2 Export
- [ ] `/export` page
- [ ] JSON full backup
- [ ] CSV: Holdings, Lots, Dividends

### 3.3 Explore Profiles
- [ ] `/explore` page
- [ ] Seed noteworthy profiles (data from Donatello)
- [ ] Profile detail view
- [ ] "Use as Template" functionality

### 3.4 Production Hardening
- [ ] Error boundaries everywhere
- [ ] Loading skeletons for all data-heavy components
- [ ] Empty states (new user flow)
- [ ] Price unavailable fallback (show last known + warning)
- [ ] Rate limit handling for Polygon.io
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
| Phase 1 — Core Tracker | 🔴 Not started |
| Phase 2 — Financial Features | 🔴 Not started |
| Phase 3 — Data & Import | 🔴 Not started |
| Phase 4 — AI Agents | 🔴 Not started |
| Phase 5 — Polish | 🔴 Not started |

**Next action:** Start Phase 1.1 — Project Setup
