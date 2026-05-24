# Investment Tracker — Project Guide for Claude

## What This Is
A full-stack investment portfolio tracker for Israeli investors, inspired by Donatello (donatelloapp.com).
Supports Israeli (TASE) and US securities. Multi-currency (ILS/USD).
Built to replace Donatello which is closing April 2026.

Future layer: AI agents for portfolio analysis, investment suggestions, and rebalancing.

## Tech Stack
| Layer | Technology |
|---|---|
| Frontend | Next.js 15 (App Router), TypeScript, Tailwind CSS, shadcn/ui |
| Charts | Recharts |
| Data Fetching | TanStack Query (React Query) |
| Database | Supabase (PostgreSQL) |
| ORM | Prisma |
| Auth | Supabase Auth |
| AI Agents | Anthropic Claude API (tool use) |
| US Stock Data | Polygon.io API |
| IL Stock Data | TASE DataWise API |
| FX Rates | Custom endpoint (see ARCHITECTURE.md) |
| Deployment | Vercel + Supabase |

## Project Structure
```
donatelo/
├── CLAUDE.md               ← You are here
├── bugs.md                 ← Bug tracking
├── docs/
│   ├── PRD.md              ← What we're building
│   ├── ARCHITECTURE.md     ← System design
│   ├── DATA_MODEL.md       ← DB schema
│   ├── CALCULATIONS.md     ← Financial formulas
│   ├── PAGES.md            ← All routes and UI
│   └── ROADMAP.md          ← Build order
├── src/
│   ├── app/                ← Next.js App Router pages
│   │   ├── (dashboard)/    ← Authenticated layout
│   │   │   ├── page.tsx    ← Home / portfolio view
│   │   │   ├── invest/
│   │   │   ├── visualize/
│   │   │   ├── allocations/
│   │   │   ├── dividends/
│   │   │   ├── activity/
│   │   │   └── explore/
│   │   ├── api/            ← API routes
│   │   │   ├── prices/
│   │   │   ├── dividends/
│   │   │   ├── fx/
│   │   │   └── agents/     ← AI agent endpoints
│   │   └── auth/
│   ├── components/
│   │   ├── ui/             ← shadcn/ui components
│   │   ├── portfolio/      ← Domain components
│   │   ├── charts/
│   │   └── agents/         ← AI agent UI
│   ├── lib/
│   │   ├── calculations/   ← All financial formulas
│   │   ├── api/            ← External API clients
│   │   │   ├── polygon.ts
│   │   │   ├── tase.ts
│   │   │   └── fx.ts
│   │   ├── agents/         ← Claude agent definitions
│   │   ├── db/             ← Prisma client + queries
│   │   └── utils/
│   ├── hooks/              ← Custom React hooks
│   ├── types/              ← Shared TypeScript types
│   └── store/              ← Zustand global state
├── prisma/
│   ├── schema.prisma
│   └── migrations/
└── public/
```

## How to Run

> **IMPORTANT: npm is broken on this machine.** Use pnpm via the wrapper script.

```bash
# pnpm alias — use instead of npm/npx everywhere
PNPM="C:/Users/Avner/AppData/Local/pnpm/global/v11/830c-19e030e4de9/node_modules/.bin/pnpm"
alias pnpm='bash "$PNPM"'

# Or use the helper script in the project root:
bash pnpm.sh <command>

# ─── Common commands ───────────────────────────
bash pnpm.sh install                # install deps
bash pnpm.sh run dev                # start dev server
bash pnpm.sh run build              # production build
bash pnpm.sh run db:generate        # prisma generate
bash pnpm.sh run db:migrate         # prisma migrate dev
bash pnpm.sh run db:studio          # prisma studio
bash pnpm.sh add <pkg>              # add a package
bash pnpm.sh add -D <pkg>           # add a dev package
```

```bash
# Setup env
cp .env.example .env.local
# Fill in: DATABASE_URL, DIRECT_URL, NEXT_PUBLIC_SUPABASE_URL,
#          NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY,
#          POLYGON_API_KEY, TASE_API_KEY, ANTHROPIC_API_KEY, FREECURRENCY_API_KEY
```

## Coding Conventions

### TypeScript
- **Strict mode** — no `any` types, ever
- **Import paths** — always use `@/` alias (`@/lib/...`, `@/components/...`)
- **Types** — shared types live in `src/types/`; inline types only for local-only shapes

### Money & Calculations
- **All monetary values are `bigint` in agorot/cents** — never `number` for money
  - ₪41,776 is stored and passed as `4177600n`
  - Display: `formatCurrency(value, currency)` from `@/lib/calculations`
  - Arithmetic: use `bigint` operators; convert to `number` only for percentages
- **Never do financial math in components** — all formulas live in `src/lib/calculations/`
- **`usePortfolioMetrics`** is the single source of truth for all portfolio values — never re-compute totals manually

### Component Pattern (Server → Client)
- **Server components** (`page.tsx`) fetch data from DB and pass it as props
- **Client components** (`*Client.tsx`) receive props and handle rendering/interaction
- **`'use client'`** only when the component uses hooks, events, or browser APIs
- **Never call Prisma or DB queries from a Client component**
- **Data fetching from APIs** (prices, FX) uses TanStack Query inside Client components

### State
- **Zustand** (`src/store/`) — UI state only: currency toggle, time range, sidebar open
- **TanStack Query** — server data that needs caching/refetching (prices, market data)
- **`useState`** — local ephemeral state (modal open, input value, loading flag)

### Styling
- **`cn()`** from `@/lib/utils` for all conditional classNames — never string concatenation
- **Tailwind only** — no inline `style={{}}` except for dynamic values (e.g. folder color dot)
- **shadcn/ui** for all base UI elements (Button, Dialog, Badge, etc.)

### DB & API
- **All DB calls go through `src/lib/db/queries/`** — never import Prisma directly in components or routes
- **API routes** always validate input with Zod before touching the DB
- **Server Actions** (`'use server'`) for form mutations; use `revalidatePath` after writes

### Code Style
- **Section dividers** in longer files: `// ─── Section Name ─────────────────`
- **Component file order**: imports → types → sub-components → main export
- **No default exports for components** — use named exports (`export function Foo`)
- **Calculations** — all formulas in `src/lib/calculations/`, covered by Vitest tests

## Key Business Rules
1. All values displayed in ILS unless user explicitly switches to USD
2. Performance chart indexed to 100 at start of selected period
3. Return % uses TWR (time-weighted return) for chart, simple return for point-in-time values
4. "Simulated performance" label when chart reconstructs history from lots
5. Actual Allocation % = folder value / total portfolio value
6. Auto-invest: sort by most underweight (furthest below target) first
7. Dividends: ex-date determines eligibility, not pay date

## Environment Variables
```
DATABASE_URL=                        # Supabase PostgreSQL
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
POLYGON_API_KEY=                     # polygon.io
TASE_API_KEY=                        # TASE DataWise
ANTHROPIC_API_KEY=                   # Claude API for agents
FX_API_KEY=                          # Exchange rates
NEXT_PUBLIC_APP_URL=
```

## Related Docs
- Full product spec: `docs/PRD.md`
- All calculations explained: `docs/CALCULATIONS.md`
- DB schema: `docs/DATA_MODEL.md`
- What each page does: `docs/PAGES.md`
- Build order: `docs/ROADMAP.md`
