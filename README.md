# Donatelo — Investment Portfolio Tracker

A full-stack investment portfolio tracker with AI-powered insights, market data, and multi-currency support (ILS + USD).

**Live:** https://donatelo.vercel.app

---

## Features

| Area | What it does |
|---|---|
| **Portfolio** | Folder tree, holdings table, KPI panel (value, return, gain, expense ratio), allocation donut |
| **Lots** | Per-holding lot management — add, sell (partial/full), cost basis tracking |
| **Performance Chart** | Indexed chart vs benchmarks (S&P 500, Nasdaq, ACWI, TA-35/90/125) across 9 time ranges |
| **Auto-Invest** | Suggests how to allocate new cash to hit target allocations |
| **Dividends** | Annual summary, bar chart (quarterly/monthly/yearly), upcoming projected dividends |
| **Activity Log** | Transaction history with filters, donut breakdown by folder |
| **Market Movers** | Top 10 movers per period — Israel 🇮🇱, US 🇺🇸, International ETFs 🌍 |
| **P/E Multiples** | 30-year historical P/E chart for 7 indices with average/median reference lines |
| **Visualize** | Treemap, bubble chart (return vs size), sector/industry breakdown |
| **AI Agents** | Claude-powered market research, rebalancing advisor chat, drift alerts |
| **Import/Export** | JSON backup (full round-trip), CSV export (holdings, lots, dividends) |
| **Explore** | Noteworthy portfolio templates — apply as starting structure |

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router), React 19, TypeScript |
| Styling | Tailwind CSS 4, shadcn/ui |
| Database | Supabase (PostgreSQL + Auth + RLS) |
| ORM | Prisma 6 |
| State | TanStack Query (server), Zustand (client) |
| Charts | Recharts |
| Validation | Zod |
| AI | Anthropic Claude API (`@anthropic-ai/sdk`) |
| Price Data | Polygon.io (US stocks), TASE DataWise (Israeli stocks), Yahoo Finance (market movers) |
| Hosting | Vercel (fra1) |
| Testing | Vitest |

---

## Getting Started

### Prerequisites

- Node.js 18+
- A [Supabase](https://supabase.com) project
- A [Polygon.io](https://polygon.io) API key (free tier works)
- An [Anthropic](https://console.anthropic.com) API key (for AI agents)

### Setup

```bash
# 1. Install dependencies
npm install

# 2. Copy environment variables
cp .env.example .env.local
# Fill in all values (see Environment Variables below)

# 3. Generate Prisma client
npm run db:generate

# 4. Run the dev server
npm run dev
```

Open http://localhost:3000.

### Environment Variables

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
DATABASE_URL=
DIRECT_URL=
POLYGON_API_KEY=
TASE_API_KEY=
TASE_API_SECRET=
ANTHROPIC_API_KEY=
NEXTAUTH_URL=
NEXTAUTH_SECRET=
```

---

## Scripts

```bash
npm run dev          # Start dev server (localhost:3000)
npm run build        # Production build
npm run start        # Serve production build
npm run lint         # ESLint

npm run db:generate  # Regenerate Prisma client after schema changes
npm run db:migrate   # Create + apply a new migration (dev only)
npm run db:studio    # Open Prisma Studio (visual DB browser)

npm run test         # Run Vitest test suite
npm run test:watch   # Vitest in watch mode
```

---

## Project Structure

```
src/
  app/
    (dashboard)/         # All authenticated pages
      page.tsx           # Home — market overview + performance
      my-portfolio/      # Portfolio dashboard (holdings, KPIs, chart)
      invest/            # Auto-invest suggestions
      allocations/       # Target allocation editor
      dividends/         # Dividend tracker
      activity/          # Transaction log
      visualize/         # Treemap + bubble + sector charts
      import/ export/    # Data import/export
      explore/           # Portfolio templates
      holdings/[id]/     # Per-holding lot management + price chart
    auth/                # Login page + error page
  components/            # React components
  lib/
    agents/              # AI agent logic (market, profile, rebalancing, orchestrator)
    api/                 # External API clients (Polygon, TASE, Yahoo Finance)
    calculations/        # Pure financial calculation functions
    db/queries/          # Prisma query functions
    utils/               # Shared utilities
  store/                 # Zustand stores
  types/                 # TypeScript type definitions

prisma/
  schema.prisma          # DB schema
  migrations/            # Migration history

docs/
  ROADMAP.md             # Feature roadmap + open items
  ARCHITECTURE.md        # System architecture
  DATA_MODEL.md          # DB schema explanation
  CALCULATIONS.md        # Financial calculation formulas
  PAGES.md               # Page-by-page feature spec
  PRD.md                 # Product requirements
```

---

## Deployment

The app auto-deploys to Vercel on every push to `master`.

```bash
git push origin master   # triggers Vercel deploy automatically
```

Manual deploy:
```bash
npx vercel --prod
```

See [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) for full deployment guide, schema migration workflow, and rollback instructions.

---

## Documentation

| File | Contents |
|---|---|
| [ROADMAP.md](docs/ROADMAP.md) | Phase-by-phase feature roadmap and open items |
| [ARCHITECTURE.md](docs/ARCHITECTURE.md) | System design and data flow |
| [DATA_MODEL.md](docs/DATA_MODEL.md) | Database schema with field descriptions |
| [CALCULATIONS.md](docs/CALCULATIONS.md) | Financial formulas (cost basis, returns, XIRR, etc.) |
| [PAGES.md](docs/PAGES.md) | Per-page feature spec |
| [DEPLOYMENT.md](docs/DEPLOYMENT.md) | Deployment, env vars, schema migrations |
