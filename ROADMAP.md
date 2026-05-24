# Donatelo — Roadmap

> **Status legend:** ✅ Done · 🔧 Partial / needs polish · ⬜ Not started · 🐛 Known bug

---

## Phase 1 — Core Portfolio (Done)

### Portfolio Structure
- ✅ Create / rename / delete folders (unlimited nesting)
- ✅ Add holdings to folders (stocks, ETFs, mutual funds — TASE + US)
- ✅ Add lots per holding: date, shares, cost per share, account type
- ✅ Mark lots as sold (partial or full)
- ✅ Add cash accounts (ILS and USD)
- ✅ Breadcrumb navigation through folder tree
- ✅ Sub-folder support with parent/child hierarchy
- ⬜ Fixed assets (real estate, manual value)
- ⬜ Drag & drop to move items between folders

### Home Dashboard
- ✅ KPI panel: Total Value, Return %, Gain, Expense Ratio, XIRR
- ✅ Portfolio performance indexed chart (normalized to 100)
  - ✅ Time ranges: 1M, 3M, 6M, YTD, 1Y, 3Y, ALL
  - ✅ Benchmark comparison: S&P 500, MSCI ACWI, TA-35, TA-90, TA-125
- ✅ Holdings tree with folders → value, gain/return, allocation %
- ✅ Target % per folder with gap indicator
- ✅ Donut chart: allocation by folder (with hover highlight)
- ✅ Drill down into folders — same layout per level

### Individual Holding Page
- ✅ Stats: Last Price, Return, Value, Unrealized/Realized Gains, Cost Basis, Shares, Avg Cost
- ✅ Lots table: Date, Shares, Cost, Account, Folder
- ✅ Add / edit / delete lots inline
- ✅ Sell lot (partial or full)
- ✅ Record dividend
- ✅ Expense ratio field

---

## Phase 2 — Analysis Tools (Done)

### Target Allocations Page
- ✅ Set target % per folder
- ✅ Visual: current % vs target % gap
- ✅ Total must equal 100% (validation)
- ✅ Auto-invest suggestion engine (bring underweight assets to target)

### Dividends Page
- ✅ Annual summary: yield TTM, yield on cost, trailing income, monthly avg
- ✅ Bar chart: quarterly / monthly / yearly breakdown
- ✅ Toggle: by folder / by asset / no breakdown
- ✅ Recent & upcoming dividends table
- ✅ Projected tax % input
- ✅ Toggle: ignore purchase dates

### Activity Log
- ✅ Summary panel: buys, sells, dividends, cash flows
- ✅ Year + action type filter
- ✅ Donut charts: inflows / outflows / dividends by folder
- ✅ Full activity log table with emoji-typed transactions

### Import / Export
- ✅ Import from CSV (Donatello format)
- ✅ Export to CSV + JSON backup

### Explore / Templates
- ✅ Public portfolio templates with descriptions
- ✅ "Use as template" to copy allocations

---

## Phase 3 — Intelligence & Visualization (In Progress)

### AI Agents ← 2026-05-24 (full 4-agent layer shipped)

> **To activate:** add `ANTHROPIC_API_KEY=sk-ant-...` to `.env.local` and restart
> Plan: `docs/superpowers/plans/2026-05-19-ai-agents.md`

#### Infrastructure
- ✅ DB: `holding_theses` table — stores user's thesis per holding (rawText, structured thesis, horizon, catalysts[], riskFactors[])
- ✅ DB: `agent_insights` table — type, severity, title, body, dismissed flag, FK cascade
- ✅ TypeScript types: `src/types/agents.ts`
- ✅ DB queries: `src/lib/db/queries/agents.ts`

#### Agent 1 — Orchestrator (`src/lib/agents/orchestrator.ts`)
- ✅ Coordinates all sub-agents — Market + Rebalancing in parallel, then Profile agent
- ✅ Synthesizes → `AgentInsight[]` + `portfolioHealth: 'good' | 'attention' | 'alert'`
- ✅ API: `GET /api/agents/insights?portfolioId=xxx&force=false` — 24h cache, force-refresh
- ✅ 9 Vitest unit tests passing

#### Agent 2 — Market Research Agent (`src/lib/agents/market-agent.ts`)
- ✅ Fetches 30-day price history per holding (Polygon.io US / TASE)
- ✅ Calls Claude only for movers >3% — cost-efficient design
- ✅ Returns `MarketUpdate[]` with trend direction + 1-sentence reason per holding

#### Agent 3 — Investor Profile Agent (`src/lib/agents/profile-agent.ts`)
- ✅ **Analysis mode** — evaluates each stored thesis vs current market data
- ✅ **Chat mode** — streaming Hebrew/English conversation, auto-extracts theses via `<thesis>` JSON tags and saves to DB
- ✅ API: `POST /api/agents/chat` — SSE streaming (abort-safe, TCP line buffer, error handling)
- ✅ API: `GET/POST /api/agents/thesis?holdingId=xxx` — thesis CRUD

#### Agent 4 — Rebalancing Agent (`src/lib/agents/rebalancing-agent.ts`)
- ✅ Compares actual vs target folder allocations — warning ≥5%, alert ≥10%
- ✅ Pure sync function — no Claude call needed

#### UI — Floating Agent Panel (`src/components/agents/`)
- ✅ 🤖 button — fixed bottom-right, all dashboard pages
- ✅ **Insights tab** — auto-loads on open, severity cards (🔵 info / 🟡 warning / 🔴 alert), Refresh triggers fresh analysis
- ✅ **Chat tab** — streaming chat bubbles, Hebrew greeting, auto-resize textarea, abort-safe on panel close

#### Remaining AI Agent work
- ⬜ **Activate:** set `ANTHROPIC_API_KEY` in `.env.local`
- ⬜ Thesis card on `/holdings/[id]` page — view and edit stored thesis inline
- ⬜ Dismiss individual insight from the panel (per-card dismiss button)
- ⬜ Chat conversation resets when switching Insights↔Chat tabs — lift `messages` state to `AgentPanel`
- ⬜ Allocation drift uses cost-basis approximation — improve with live cached prices
- ⬜ Dividend Insights agent (trends, projections, yield-on-cost analysis)
- ⬜ Market Research: surface real news headlines (currently Claude-generated reasoning only)

### Visualize Page
- ✅ **Treemap** — holdings by current value
  - ✅ Block color = unrealized return %
  - ✅ Block label = security name (not ticker symbol) ← 2026-05-20
  - ✅ **Period filter**: Week · Month · 6M · Year · All Time ← 2026-05-20
    - Color = price change % over selected period (Yahoo Finance + DB cache)
    - All Time = total unrealized return since purchase
  - ✅ **Holding duration** in block: "2 years 4 months" ← 2026-05-20
  - ✅ **Annualized return (CAGR)** in block and tooltip: "+14.8%/yr" ← 2026-05-20
  - ✅ Tooltip: value, return %, duration, CAGR
- ✅ Rankings view — holdings sorted by unrealized return
- ✅ By Folder (sector) view — pie chart + table
- ✅ Geographic view — Israel vs USA vs Other
- ⬜ Bubble chart: return vs size
- ⬜ Sector / industry classification (beyond exchange-based geographic)

### Historical Price API (`/api/prices/history`) ← 2026-05-20
- ✅ Strategy 1: DB `price_cache` — works for ALL tickers incl. numeric TASE fund IDs
- ✅ Strategy 2: Yahoo Finance fallback for named tickers (US + `.TA` TASE)
- ✅ Bug fix: TASE tickers now correctly get `.TA` suffix in Yahoo Finance queries
- ✅ Bug fix: numeric TASE fund IDs (e.g. `5123179`) resolved via DB cache, not Yahoo

### Advanced Calculations
- ✅ XIRR (internal rate of return accounting for cash flow timing)
- ✅ Weighted expense ratio across portfolio
- ✅ Holding duration per security (full-word format: "2 years 4 months") ← 2026-05-20
- ✅ Annualized return / CAGR per security ← 2026-05-20
- ⬜ Benchmark-relative return (alpha vs S&P 500)
- ⬜ Sharpe ratio

### Folder Tree View ← 2026-05-20
- ✅ Duration per holding shown as full words ("2 years 4 months")
- ✅ Annualized return (CAGR) next to duration: "+14.8%/yr"

---

## Phase 4 — Nice to Have (Not Started)

- ⬜ Price alerts (email / push when asset hits target price)
- ⬜ Tax report generation (capital gains summary)
- ⬜ Full mobile-responsive layout (basic responsiveness exists)
- ⬜ Multiple portfolios per user (data model supports it, UI partial)
- ⬜ Shared portfolio view (read-only link)
- ⬜ Automatic import from broker (IBI, Meitav, eToro, etc.)
- ⬜ Dark mode toggle
- ⬜ Crypto — manual entry only (no exchange integration planned)

---

## Data Sources

| Data | Source | Status |
|---|---|---|
| US stock prices (current) | Polygon.io | ✅ |
| US stock price history | Polygon.io + Yahoo Finance | ✅ |
| US dividends | Polygon.io | ✅ |
| US stock splits | Polygon.io | ✅ |
| TASE named stocks (current) | Yahoo Finance (`.TA` suffix) | ✅ |
| TASE numeric fund IDs (current) | Bizportal scraper | ✅ |
| TASE price history | Yahoo Finance + DB cache | ✅ |
| Currency rates (USD/ILS) | FreeCurrencyAPI | ✅ |
| Benchmark data | Yahoo Finance (public chart API) | ✅ |

---

## Bug Log

| # | Description | Status |
|---|---|---|
| 1 | Treemap showing ticker symbols instead of security names | 🟢 Fixed 2026-05-20 |
| 2 | Treemap period filter was hiding securities (filtered holdings instead of just colors) | 🟢 Fixed 2026-05-20 |
| 3 | Period return incorrect — TASE tickers missing `.TA` suffix, matched wrong US security on Yahoo Finance | 🟢 Fixed 2026-05-20 |
| 4 | Numeric TASE fund IDs (e.g. `5123179`) showed no period return (Yahoo Finance can't serve them) | 🟢 Fixed 2026-05-20 via DB cache |

---

## Session Log

### 2026-05-24
- **Full AI agents layer** — 4 agents + API routes + UI (12 commits)
- New DB tables: `holding_theses`, `agent_insights` (with FK constraints, migrations applied)
- New Anthropic SDK integration — Market Research + Investor Profile agents call `claude-sonnet-4-6`
- Orchestrator coordinates all agents in parallel, synthesizes `portfolioHealth` + `AgentInsight[]`
- Rebalancing agent: pure math, no Claude call — flags allocation drift ≥5% / ≥10%
- Profile agent: chat mode streams via SSE with `<thesis>` extraction + auto-save; analysis mode evaluates stored theses vs market data
- 3 new API routes: `GET /api/agents/insights`, `POST /api/agents/chat`, `GET/POST /api/agents/thesis`
- Floating 🤖 panel in dashboard layout with Insights tab (severity cards) and Chat tab (streaming)
- 9 Vitest tests for Orchestrator + Rebalancing agent
- Requires `ANTHROPIC_API_KEY` in `.env.local` to activate

### 2026-05-20
- Treemap: display security name instead of ticker symbol
- Treemap: period filter (Week / Month / 6M / Year / All Time)
  - Color = price-change % over period via Yahoo Finance (range param)
  - All Time = total unrealized return since purchase (no extra API call)
- New API route `GET /api/prices/history` with dual strategy:
  1. DB `price_cache` — works for every ticker the system has ever priced
  2. Yahoo Finance fallback for named tickers without DB history
- New hook `usePriceHistory`
- Fixed: TASE tickers missing `.TA` in Yahoo Finance history queries
- Fixed: numeric TASE fund IDs now correctly use DB cache
- New util `formatHoldingDurationLong()` — full-word duration string
- New util `calcAnnualizedReturn()` — CAGR from total return % + oldest lot date
- Folder tree view: duration + CAGR shown per holding row
- Treemap: duration + CAGR shown in blocks (when block is tall enough) and in tooltip
