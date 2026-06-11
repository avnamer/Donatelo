# Architecture

> Last updated: 2026-06-11

---

## System Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                            Browser                              │
│   Next.js App (React 19, TypeScript, Tailwind CSS, shadcn/ui)  │
│   TanStack Query (server state)  ←→  Zustand (UI state)        │
└──────────────────┬──────────────────────────────────────────────┘
                   │  HTTP / Server Components / Server Actions
┌──────────────────▼──────────────────────────────────────────────┐
│                  Next.js API Routes (Server)                    │
│  /api/prices          /api/prices/history   /api/fx             │
│  /api/dividends       /api/benchmark        /api/market-movers  │
│  /api/portfolios      /api/folders          /api/holdings       │
│  /api/lots            /api/lots/backfill    /api/cash-accounts  │
│  /api/import                                                    │
│  /api/export          /api/agents/insights  /api/agents/chat    │
│  /api/agents/thesis   /api/portfolios/select                    │
│  /api/dip-alerts                                                │
└───┬──────────┬──────────────┬──────────────┬────────────────────┘
    │          │              │              │
┌───▼────┐ ┌──▼──────┐ ┌─────▼──────┐ ┌────▼──────────┐
│Supabase│ │Polygon  │ │Yahoo Fin.  │ │Anthropic API  │
│Postgres│ │  .io    │ │(fallback + │ │(claude-sonnet)│
│  Auth  │ │  (US)   │ │ benchmark) │ │               │
└────────┘ └─────────┘ └────────────┘ └───────────────┘
                              │
                        ┌─────▼──────┐
                        │ Bizportal  │
                        │ (TASE nums)│
                        └────────────┘
```

---

## Technology Choices

### Next.js 16 (App Router)
**Why:** Full-stack framework — one codebase for frontend + API.
- Server Components → fast initial load, no client bundle bloat
- API Routes → proxy external APIs (hide keys, add caching)
- Server Actions → form mutations without separate endpoints
- Excellent TypeScript support, deploys to Vercel with zero config

### Supabase (PostgreSQL)
**Why over Firebase/MongoDB:**
- Relational DB — portfolio data is highly relational (portfolios → folders → holdings → lots)
- Row Level Security (RLS) — users can only see their own data, enforced at DB level
- Built-in Auth — Google OAuth + email/password
- Prisma connects directly via connection string

### Prisma ORM
**Why:** Type-safe DB queries — the schema generates TypeScript types automatically.
No raw SQL, auto-complete on all queries, easy migrations.

### TanStack Query
**Why:** Server state management — caching, background refetching, loading/error states.
Financial data needs careful cache invalidation (prices stale after market close).

### Zustand
**Why:** Lightweight global state for UI state (selected currency, time range, expanded folders).
Not for server data (that's TanStack Query).
Persists: `currency`, `timeRange` to localStorage.

### Recharts
**Why:** Flexible, composable, good TypeScript support.
Used for: area chart (performance), donut (allocations), bar (dividends), line (P/E), treemap (visualize).

### shadcn/ui
**Why:** Components you own, not a dependency. Built on Radix UI (accessible), styled with Tailwind.

### next-themes
**Why:** Manages `dark` class on `<html>` with system preference detection and no hydration flicker.

---

## Data Flow

### Home Page (`/`)
```
1. Server Component: fetches holdings for selected portfolio (via cookie)
2. Passes holdings to HomeDashboardClient
3. Client fetches prices → GET /api/prices
4. Client fetches benchmark → GET /api/benchmark?ticker=^GSPC&from=...
5. Client fetches market movers → GET /api/market-movers
6. Performance chart rendered with benchmark overlay
7. Market Movers + P/E Multiples panels rendered below
```

### My Portfolio (`/my-portfolio`)
```
1. Server Component: fetches holdings + folders for selected portfolio
2. Client fetches prices → GET /api/prices (batched)
3. Calculations run client-side in src/lib/calculations/
4. KPI panel, HoldingsTree, AllocationDonut rendered
5. XIRR calculated client-side from lot cash flows + current value
```

### Price Fetching Strategy
```
For each ticker:
  1. Check price_cache table in DB (TTL: same calendar day)
  2. Cache hit → return immediately
  3. Cache miss → fetch from source:
     US tickers:         Polygon.io /v2/aggs/ticker/{t}/prev
     TASE named (.TA):   Yahoo Finance /v7/finance/quote
     TASE numeric IDs:   Bizportal scraper (parses "שער בסיס" from HTML)
  4. Write to price_cache, return result
```

### Price History Strategy (`/api/prices/history`)
```
For each ticker + period:
  1. DB price_cache — works for ALL tickers including numeric TASE fund IDs
     Query: last N days of cached prices, sorted by date
  2. Yahoo Finance fallback — for tickers with insufficient DB history
     US:   {ticker} as-is
     TASE: {ticker}.TA suffix appended
     TASE numeric IDs: skip Yahoo (not supported) → use DB only
```

### Currency Rates
```
- USD/ILS rate fetched daily at midnight
- Stored in fx_rates table
- All cross-currency calculations use this rate
- API: FreeCurrencyAPI (free tier: 1500 req/month)
```

### Multi-Portfolio Selection
```
1. User clicks portfolio in TopNav switcher
2. POST /api/portfolios/select → sets httpOnly cookie "portfolio-id" (1 year TTL)
3. All server-rendered pages read cookies() to determine active portfolio
4. TopNav layout re-renders with router.refresh()
```

### Activity Page (`/activity`)
```
On every page load:
  1. backfillTransactionsFromLots() — idempotent, creates SECURITY_BUY / SECURITY_SELL
     rows for any lot that doesn't already have a linked transaction.
     Handles lots added before auto-transaction recording was in place.
  2. getTransactions(portfolioId, userId, { page, type }) — paginated (50/page),
     filtered by ?type= URL param (SECURITY_BUY | SECURITY_SELL | DIVIDEND | …)
  3. getTransactionSummary() — count + total amount per type (for donut charts)
  4. ActivityClient renders:
     - Filter tab bar (type counts from summary; tabs with 0 hidden)
     - 3 donut charts: Trades (buy vs sell), Dividends, Cash flows (deposit vs withdrawal)
     - Total Invested KPI card
     - Transaction table with realized-gain sub-row on SELL rows
     - Pagination bar (prev / next / showing X–Y of N)
```

---

## AI Agents Architecture

### Design Principles
- Agents are **read-only** — they can analyze portfolio data but cannot modify it
- Streaming responses via Server-Sent Events (SSE) — no Vercel AI SDK dependency
- Claude API used directly via `@anthropic-ai/sdk`
- Cost-efficient: Market agent only calls Claude for holdings with > 3% price change

### Agent System (`src/lib/agents/`)

```
┌─────────────────────────────────────────────────────────┐
│                    Orchestrator                         │
│  (src/lib/agents/orchestrator.ts)                       │
│                                                         │
│  ┌─────────────────┐    ┌──────────────────────────┐   │
│  │  Market Agent   │    │   Rebalancing Agent      │   │
│  │  (async, Claude)│    │   (sync, pure math)      │   │
│  └────────┬────────┘    └──────────────┬───────────┘   │
│           │ parallel                   │               │
│           └──────────┬─────────────────┘               │
│                      ▼                                  │
│           ┌──────────────────────┐                     │
│           │   Profile Agent      │                     │
│           │   (async, Claude)    │                     │
│           └──────────────────────┘                     │
│                      ▼                                  │
│           AgentInsight[] + portfolioHealth              │
└─────────────────────────────────────────────────────────┘
```

| Agent | File | Does | Claude? |
|---|---|---|---|
| Orchestrator | `orchestrator.ts` | Coordinates all agents, synthesizes insights | No |
| Market Research | `market-agent.ts` | 30-day price history per holding, trend detection | Yes (movers > 3% only) |
| Rebalancing | `rebalancing-agent.ts` | Compares actual vs target allocation, flags drift ≥ 5% / ≥ 10% | No |
| Investor Profile | `profile-agent.ts` | Evaluates stored theses vs market data; streaming chat | Yes |

### API Routes
```
GET  /api/agents/insights?portfolioId=xxx&force=false
     → runs Orchestrator, returns AgentInsight[] + portfolioHealth
     → 24h cache in agent_insights table, force=true skips cache

POST /api/agents/chat
     Body: { portfolioId, messages[] }
     → SSE streaming chat with Profile Agent
     → auto-extracts <thesis> JSON tags and saves to DB

GET  /api/agents/thesis?holdingId=xxx
POST /api/agents/thesis
     Body: { holdingId, rawText }
     → extract + store investment thesis for a holding
```

### DB Tables
```sql
holding_theses  — rawText, thesis, horizon, catalysts[], riskFactors[]
agent_insights  — type, severity, title, body, dismissed, portfolioId FK
```

### UI — AgentPanel (`src/components/agents/`)
```
Fixed 🤖 button (bottom-right, all dashboard pages)
  → Insights tab: auto-loads on open, severity cards (info/warning/alert), Refresh
  → Chat tab: streaming SSE chat, Hebrew greeting, abort-safe on close
```

---

## External APIs

### Polygon.io
```
Base: https://api.polygon.io
Used for:
  Current price:  GET /v2/aggs/ticker/{ticker}/prev
  Price history:  GET /v2/aggs/ticker/{ticker}/range/1/day/{from}/{to}
  Dividends:      GET /v3/reference/dividends?ticker={ticker}
  Splits:         GET /v3/reference/splits?ticker={ticker}
  Ticker search:  GET /v3/reference/tickers?search={q}
Auth: apiKey query param
Rate limit: 5 req/min (free tier)
Cache: 24h for dividends/splits, 1 calendar day for prices
```

### Yahoo Finance (public, no API key)
```
Used for:
  TASE named stocks:    /v7/finance/quote?symbols={ticker}.TA
  US stock prices:      /v7/finance/quote?symbols={ticker}
  Price history:        /v8/finance/chart/{ticker}?range={1wk|1mo|6mo|1y}
  Benchmark data:       /v8/finance/chart/^GSPC (S&P 500, MSCI, TA indices)
  Market movers:        Yahoo Finance screener API
Limitation: No API key → may rate-limit under heavy load
            Cannot serve numeric TASE fund IDs (e.g. 5123179)
```

### Bizportal (scraper, no API key)
```
Used for: Numeric TASE fund IDs that Yahoo Finance cannot serve
Strategy: Try bonds → capitalmarket → mutualfunds sections
Parses:   <dt>שער בסיס</dt> HTML pattern
Example:  1380104 → fetches bizportal.co.il/funds/bonds/1380104
```

### FreeCurrencyAPI
```
Used for: USD/ILS exchange rate
Endpoint: /latest?base_currency=USD&currencies=ILS
Cached:   Daily in fx_rates table
Free tier: 1500 req/month (sufficient for daily refresh)
```

### Anthropic Claude API
```
Used for: AI agents (Market Research + Investor Profile)
Model:    claude-sonnet-4-6 (latest Sonnet)
Mode:     Standard completions + SSE streaming (chat)
Key:      ANTHROPIC_API_KEY (server-side only)
```

---

## Calculations Engine (`src/lib/calculations/index.ts`)

All financial calculations run **client-side** in the browser after prices are fetched.
Values stored as **BigInt in agorot/cents** (×100) to avoid floating-point errors.

| Function | What it does |
|---|---|
| `calcCurrentValue()` | shares × price, with FX conversion |
| `calcCostBasis()` | cost of currently-held shares (active lots only) |
| `calcUnrealizedGains()` | currentValue − costBasis |
| `calcUnrealizedReturnPct()` | unrealizedGains / costBasis × 100 |
| `calcRealizedGains()` | proceeds − cost for sold lots |
| `calcTotalReturnPct()` | (unrealized + realized) / totalDeployed × 100 |
| `calcActualAllocationPct()` | itemValue / totalPortfolioValue × 100 |
| `calcWeightedExpenseRatio()` | value-weighted average of expense ratios |
| `calcXIRR()` | Newton-Raphson IRR, timing-aware cash flows |
| `buildXirrCashFlows()` | builds cash flow list from lots + current value |
| `calcAutoInvest()` | suggests buys to close allocation gaps |
| `calcIndexedPerformance()` | normalizes value series to 100 at start |
| `formatCurrency()` | bigint → formatted string (ILS/USD, compact) |
| `formatPercent()` | number → "+12.34%" string |

---

## Security

### Authentication
- Supabase Auth with JWT tokens
- All API routes validate session via `getCurrentUser()` server-side
- RLS on all DB tables — users can only access rows where `user_id = auth.uid()`

### API Key Protection
- All keys (Polygon, Anthropic, FreeCurrency) stored server-side in environment variables
- Never exposed to client
- All external API calls proxied through Next.js API routes

### Multi-Portfolio Isolation
- `POST /api/portfolios/select` verifies the requested portfolio belongs to the authenticated user before setting the cookie
- Every query that accepts a `portfolioId` also checks `userId` ownership

---

## Deployment

### Vercel (Frontend + API)
- Automatic deploys from `main` branch
- Preview deploys for PRs
- Environment variables set in Vercel dashboard

### Supabase (Database + Auth)
- Managed PostgreSQL 15
- Connection pooling via PgBouncer (use `DATABASE_URL` with `?pgbouncer=true` for serverless)
- Direct URL (`DIRECT_URL`) used for Prisma migrations only
- Daily automated backups

### Environment Variables
```
# Database
DATABASE_URL=         # pooled (pgbouncer) — for runtime queries
DIRECT_URL=           # direct — for prisma migrate only

# Supabase Auth
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# External APIs
POLYGON_API_KEY=
ANTHROPIC_API_KEY=
FREECURRENCY_API_KEY=
# TASE_API_KEY=       # not yet active — currently using Yahoo Finance + Bizportal

# App
NEXT_PUBLIC_APP_URL=
```

---

## Known Limitations & Future Work

| Area | Current State | Future |
|---|---|---|
| TASE DataWise API | Blocked by WAF from server; using Yahoo Finance + Bizportal scraper | Activate `TASE_API_KEY` when WAF issue resolved |
| Price history | Dual strategy (DB cache + Yahoo Finance); numeric TASE IDs rely on DB cache | Consider dedicated TASE history endpoint |
| Benchmark data | Yahoo Finance public chart endpoint (no key) — may rate-limit | Switch to Polygon.io benchmark endpoint |
| AI agent cost | Market agent calls Claude only for movers > 3% | Fine-tune threshold per user preference |
| Sector classification | Exchange-based only (TASE = Israel, else = USA) | Enrich via Polygon company details endpoint |
| Error boundaries | No error boundaries on dashboard pages | Add per-section error boundaries |
