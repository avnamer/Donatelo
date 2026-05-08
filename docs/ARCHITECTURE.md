# Architecture

## System Overview

```
┌─────────────────────────────────────────────────────────────┐
│                         Browser                             │
│  Next.js App (React, TypeScript, Tailwind, shadcn/ui)       │
│  TanStack Query  ←→  Zustand (global state)                 │
└──────────────┬──────────────────────────────────────────────┘
               │  HTTP / Server Actions
┌──────────────▼──────────────────────────────────────────────┐
│              Next.js API Routes (Server)                    │
│   /api/prices     /api/fx     /api/dividends                │
│   /api/portfolio  /api/agents/[agent]                       │
└──────┬──────────┬──────────────┬───────────────┬────────────┘
       │          │              │               │
  ┌────▼────┐ ┌───▼────┐  ┌─────▼──────┐  ┌────▼──────────┐
  │Supabase │ │Polygon │  │TASE DataWi-│  │Anthropic API  │
  │Postgres │ │  .io   │  │   se API   │  │(Claude Agents)│
  └─────────┘ └────────┘  └────────────┘  └───────────────┘
```

---

## Technology Choices

### Next.js 15 (App Router)
**Why:** Full-stack framework — one codebase for frontend + API.
- Server Components → fast initial load, no client bundle bloat
- API Routes → proxy external APIs (hide keys, add caching)
- Server Actions → form mutations without separate endpoints
- Excellent TypeScript support
- Deploys to Vercel with zero config

### Supabase (PostgreSQL)
**Why over Firebase/MongoDB:**
- Relational DB — portfolio data is highly relational (folders→holdings→lots)
- Row Level Security (RLS) — users can only see their own data, enforced at DB level
- Built-in Auth — Google OAuth, email/password out of the box
- Real-time subscriptions — useful for future live price updates
- Prisma connects directly via connection string

### Prisma ORM
**Why:** Type-safe DB queries — the schema generates TypeScript types automatically.
No raw SQL, auto-complete on all queries, easy migrations.

### TanStack Query
**Why:** Server state management — caching, background refetching, loading/error states.
Financial data needs careful cache invalidation (prices stale after market close).

### Zustand
**Why:** Lightweight global state for UI state (selected folder, currency, time range).
Not for server data (that's TanStack Query).

### Recharts
**Why:** Flexible, composable, good TypeScript support, area charts + donut charts.

### shadcn/ui
**Why:** Not a component library — it's components you own. Copy-paste into your project.
Built on Radix UI (accessible), styled with Tailwind. Easy to customize.

---

## Data Flow

### Loading Portfolio Home
```
1. User navigates to /
2. Server Component fetches user's portfolio from Supabase
3. Client component calls GET /api/prices with list of tickers
4. API route batches request to Polygon.io (US) + TASE API (IL)
5. Prices cached in price_cache table (TTL: until market close)
6. Calculations run client-side in lib/calculations/
7. Chart data assembled and rendered by Recharts
```

### Price Caching Strategy
```
- Market hours: US 9:30-16:00 ET, IL 9:30-17:30 IL time
- Cache invalidated at 17:30 IL time (after both markets close)
- Weekend/holiday: use last cached price
- Cache stored in: price_cache table in Supabase
- Fallback: last known price with "stale" indicator
```

### Currency Rates
```
- USD/ILS rate fetched daily at midnight
- Stored in fx_rates table
- All cross-currency conversions use this rate
- API: FreeCurrencyAPI (free tier: 1500 req/month, sufficient for daily refresh)
```

---

## AI Agents Architecture

### Design Principles
- Agents are **read-only** — they can read portfolio data but cannot modify it
- Each agent is a Next.js API route at `/api/agents/[agent]`
- Agents use **Claude tool use** to fetch portfolio data on-demand
- Streaming responses via Vercel AI SDK

### Agent Tools Available
```typescript
// Tools the agent can call:
getPortfolioSummary()    // total value, return, allocation
getFolderDetails(path)   // specific folder breakdown
getHoldingDetails(ticker) // individual stock data
getDividendHistory()     // past dividends
getMarketData(tickers)   // current prices from Polygon/TASE
calculateRebalance()     // current vs target allocation gap
```

### Agents Planned
| Agent | Trigger | Does |
|---|---|---|
| Portfolio Analyzer | On demand | Explains portfolio state, flags concentration risk |
| Rebalancing Advisor | On demand | Suggests trades to reach target allocations |
| Dividend Coach | On demand | Dividend trends, projections, yield analysis |
| Market Researcher | Per holding | Background on a specific stock/ETF |

### Scaling Path
- Phase 1: Agents as Next.js API routes (simple)
- Phase 2: Move to separate Node.js service if load requires
- Phase 3: Agent orchestration with multi-step reasoning (LangGraph or custom)

---

## External APIs

### Polygon.io
```
Base: https://api.polygon.io
Used for:
  - Current price:  GET /v2/last/trade/{ticker}
  - Previous close: GET /v2/aggs/ticker/{ticker}/prev
  - Historical:     GET /v2/aggs/ticker/{ticker}/range/1/day/{from}/{to}
  - Dividends:      GET /v3/reference/dividends?ticker={ticker}
  - Splits:         GET /v3/reference/splits?ticker={ticker}
  - Search:         GET /v3/reference/tickers?search={q}
Auth: apiKey query param
Rate limit: depends on plan (free: 5 req/min)
Cache: 24h for dividends/splits, 1h for prices
```

### TASE DataWise API
```
Used for: Israeli securities (mutual funds, stocks, bonds, ETFs)
Endpoints: See docs/TASE_API.md (from existing project_tase_api.md memory)
Securities identified by: ISIN or security number (e.g. 1150259)
Price format: In agorot × 100 (e.g. 6011 = ₪60.11)
```

### Supabase
```
Auth: email/password + Google OAuth
DB: PostgreSQL 15 via Prisma
Storage: for future use (profile pics, attachments)
Edge Functions: optional (webhooks, scheduled jobs)
```

---

## Security

### Authentication
- Supabase Auth with JWT tokens
- All API routes validate JWT via Supabase middleware
- RLS on all DB tables — users can only access rows where `user_id = auth.uid()`

### API Key Protection
- External API keys (Polygon, TASE, Anthropic) stored server-side only
- Never exposed to client
- All external API calls proxied through Next.js API routes

### Data Isolation
```sql
-- Example RLS policy on portfolios table:
CREATE POLICY "users see own portfolios"
ON portfolios FOR ALL
USING (user_id = auth.uid());
```

---

## Deployment

### Vercel (Frontend + API)
- Automatic deploys from `main` branch
- Preview deploys for PRs
- Environment variables in Vercel dashboard

### Supabase (Database + Auth)
- Managed PostgreSQL
- Connection pooling via Supabase's built-in PgBouncer
- Daily automated backups

### Environment Variables
```
# Database
DATABASE_URL=postgresql://...    # with pgbouncer for serverless
DIRECT_URL=postgresql://...      # for migrations

# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# External APIs
POLYGON_API_KEY=
TASE_API_KEY=
ANTHROPIC_API_KEY=
FREECURRENCY_API_KEY=

# App
NEXT_PUBLIC_APP_URL=
```
