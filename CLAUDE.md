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
- **TypeScript strict mode** — no `any` types
- **All financial values** stored as integers in agorot/cents to avoid float errors
  - Display: divide by 100. Example: ₪41,776 stored as `4177600`
- **Currency** — always explicit. Never assume ILS.
- **Folder paths** — stored as materialized paths (e.g. `ישראל/מדדים`)
- **Component naming** — PascalCase, co-located with their stories
- **API routes** — always validate with Zod
- **DB queries** — always go through `src/lib/db/` layer, never direct Prisma in components
- **Calculations** — all formulas live in `src/lib/calculations/`, tested with Vitest

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
