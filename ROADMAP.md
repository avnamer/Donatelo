# Roadmap — Investment Tracker

## Legend
- ✅ Done
- 🚧 Partial / needs work
- ⬜ Not started

---

## Infrastructure & Auth
- ✅ Next.js 16 + Turbopack setup
- ✅ Supabase Auth (login, callback, session)
- ✅ Prisma + Supabase PostgreSQL
- ✅ TanStack React Query + Zustand store
- ✅ API keys: Polygon, FreeCurrencyAPI
- ⬜ `TASE_API_KEY` — still empty in `.env.local`
- ⬜ `ANTHROPIC_API_KEY` — still empty in `.env.local`
- ⬜ Fix deprecated `middleware.ts` → rename to `proxy.ts`
- ⬜ Remove `C:\Users\Avner\package-lock.json` (causes Turbopack workspace warning)

---

## Phase 1 — Core Portfolio Structure

### Portfolio / Folder / Holding CRUD
- ✅ Create / rename / delete portfolios
- ✅ Create / rename / delete folders (unlimited nesting)
- ✅ Add holdings (stocks, ETFs, mutual funds — IL + US)
- ✅ Add lots per holding (date, shares, cost, account type)
- ✅ Mark lots as sold (full or partial)
- ✅ Delete lots
- 🚧 Cash accounts — API exists, UI needs validation
- ⬜ Fixed assets (real estate, manual value)
- ⬜ Drag & drop to move items between folders

### Home Dashboard
- ✅ Holdings tree with folder drill-down
- ✅ KPI panel (Value, Return %, Gain, Expense Ratio, Dividend Yield)
- ✅ Allocation donut chart (right panel)
- ✅ Performance chart (indexed to 100)
- ⬜ Benchmark overlay on chart (S&P 500, MSCI ACWI)
- ⬜ Breadcrumb navigation (Home › ישראל › מדדים)
- ⬜ Warning badge when portfolio is significantly off-target
- ⬜ "Add ▼" dropdown (Folder | Holding | Cash | Fixed Asset)
- ⬜ Three-dot menu per row (Move | Edit Target | Rename | Hide | Delete)

### Individual Holding Page (`/holdings/[id]`)
- ✅ Lots table with add/edit/delete/sell
- 🚧 Stats panel (value, cost basis, unrealized/realized gains, avg cost)
- ⬜ Price chart (1Y default, from Polygon/TASE)
- ⬜ Link to external source (Bizportal for IL, TradingView for US)
- ⬜ "X% of portfolio" label

---

## Phase 2 — Key Features

### Target Allocations (`/allocations`)
- ✅ Set target % per folder, auto-save
- ✅ Total = 100% validation
- 🚧 Dual-ring donut (inner = current, outer = target)

### Auto-Invest (`/invest`)
- ✅ Enter new funds → suggested buy table
- ⬜ Fractional shares toggle
- ⬜ Per-holding drill-down within folders
- ⬜ Editable allocation inputs (manual tweaking)

### Dividends (`/dividends`)
- ✅ Annual summary panel
- ✅ Bar chart (quarterly/monthly/yearly)
- ✅ Recent & upcoming dividends table
- ⬜ Projected tax % input
- ⬜ "Ignore purchase dates" toggle
- ⬜ YoY growth calculation

### Activity Log (`/activity`)
- ✅ Transaction log table
- ✅ Year filter + action type filter
- ⬜ Three donut charts (net inflows / outflows / dividends by folder)
- ⬜ Summary panel (# buys, # sells, net inflow, realized gains)

### Import / Export
- ✅ Import from JSON backup
- ✅ Export to JSON
- ⬜ Import from Donatello CSV format
- ⬜ Export to CSV (holdings summary, lots, dividends)

### Explore / Templates (`/explore`)
- ✅ List portfolio profiles
- ✅ "Use as Template" clones allocations
- ⬜ Profile detail page with allocation table + donut

### Settings (`/settings`)
- ⬜ Base currency (ILS / USD)
- ⬜ Default time range for charts
- ⬜ Tax rate for dividend projections
- ⬜ Manage custom account type names
- ⬜ Delete account

---

## Phase 3 — AI & Advanced Visualizations

### AI Agents Layer — 4-Agent Architecture
*(Requires `ANTHROPIC_API_KEY` — set in `.env.local`)*
*(Implementation plan: `docs/superpowers/plans/2026-05-19-ai-agents.md`)*

**Workflow:** User enters portfolio → Orchestrator fires sub-agents in parallel → insights surface in floating panel

#### Foundation (Task 1–3)
- ⬜ DB: `holding_theses` table — stores user's investment thesis per holding (rawText, structured thesis, horizon, catalysts, riskFactors)
- ⬜ DB: `agent_insights` table — cached orchestrator output (type, severity, title, body, dismissed)
- ⬜ TypeScript types: `src/types/agents.ts`
- ⬜ DB queries: `src/lib/db/queries/agents.ts`

#### Agent 1 — Orchestrator (`src/lib/agents/orchestrator.ts`)
- ⬜ Coordinates Market + Profile + Rebalancing agents
- ⬜ Synthesizes outputs → `AgentInsight[]` with `portfolioHealth` summary
- ⬜ Caches results to DB (24h TTL, force-refresh supported)
- ⬜ API: `GET /api/agents/insights?portfolioId=xxx&force=false`

#### Agent 2 — Market Research Agent (`src/lib/agents/market-agent.ts`)
- ⬜ Fetches 30-day price history per holding via Polygon.io (US) / TASE API
- ⬜ Computes price change % and trend direction
- ⬜ Calls Claude only for significant movers (>3% threshold) — minimizes API cost
- ⬜ Returns `MarketUpdate[]` with trend + 1-sentence reason

#### Agent 3 — Investor Profile Agent (`src/lib/agents/profile-agent.ts`)
- ⬜ **Analysis mode**: given market updates + stored theses → evaluates if each thesis is still intact
- ⬜ **Chat mode**: streaming conversation (Hebrew/English) that extracts structured theses from user
- ⬜ Auto-saves thesis to DB when Claude extracts it (via `<thesis>` JSON tag)
- ⬜ API: `POST /api/agents/chat` — SSE streaming
- ⬜ API: `GET/POST /api/agents/thesis` — thesis CRUD per holding

#### Agent 4 — Rebalancing/Strategy Agent (`src/lib/agents/rebalancing-agent.ts`)
- ⬜ Compares actual folder allocations vs target allocations
- ⬜ Flags drift ≥ 5% as warning, ≥ 10% as alert
- ⬜ Pure function — no Claude call needed (math-only)
- ⬜ Feeds drift results into Orchestrator insights

#### UI — Floating Agent Panel (`src/components/agents/`)
- ⬜ Floating 🤖 button (bottom-right, fixed position)
- ⬜ Panel with two tabs: **Insights** | **Chat**
- ⬜ Insights tab: severity-colored cards (info/warning/alert), Refresh button, portfolio health summary
- ⬜ Chat tab: streaming chat with Donatelo (Profile Agent), auto-saves thesis on extraction
- ⬜ Mounted in `src/app/(dashboard)/layout.tsx`

### Visualize (`/visualize`)
- 🚧 Page exists, content unclear
- ⬜ Treemap (holdings sized by value, colored by return)
- ⬜ Bubble chart (size = value, x = return, y = allocation)
- ⬜ Geographic allocation map
- ⬜ Sector / industry breakdown

### Advanced Calculations
- ⬜ XIRR (internal rate of return)
- ⬜ Benchmark-relative return (alpha vs S&P 500)
- ⬜ Sharpe ratio

---

## Phase 4 — Nice to Have
- ⬜ Price alerts (email/push)
- ⬜ Tax report (capital gains summary)
- ✅ Mobile-responsive layout
- ✅ Dark mode
- ⬜ Shared portfolio view (read-only link)
- ⬜ Automatic broker import (IBI, Meitav, eToro)

---

## Phase 5 — Visualize & Polish

### 5.1 Visualize Page
- ✅ `/visualize` page (Treemap + Rankings tabs)
- ✅ Treemap component (sized by value, colored by return %)
- ✅ Sector/industry breakdown (By Folder tab)
- ✅ Geographic allocation (TASE = Israel, NYSE/NASDAQ = USA)

### 5.2 XIRR
- ✅ XIRR calculation (Newton-Raphson, cash-flow timing-aware)
- ✅ Shown in KPI panel alongside simple return

### 5.3 Mobile
- ✅ Responsive layout — all pages stack on mobile
- ✅ Touch-friendly KPI grid on mobile
- ✅ Mobile hamburger navigation in TopNav
- ✅ HoldingsTree table hides non-essential columns on small screens

### 5.4 Dark Mode
- ✅ Tailwind dark mode CSS variables (already existed)
- ✅ next-themes integration with system preference detection
- ✅ Sun/Moon toggle in TopNav

### 5.5 Multi-Portfolio
- ✅ Portfolio switcher in nav (visible when user has >1 portfolio)
- ✅ Cookie-based selection — persisted across sessions
- ✅ All dashboard pages respect selected portfolio

---

## Known Issues / Tech Debt
- `middleware.ts` deprecated — Next.js 16 expects `proxy.ts`
- `C:\Users\Avner\package-lock.json` causes Turbopack workspace root warning
- TASE price fetching uses Yahoo Finance wrapper (not official TASE API) — fragile
- No error boundaries on dashboard pages — a single bad price fetch crashes the whole view
- XIRR geographic breakdown uses exchange as proxy — no real sector/country data from API yet
