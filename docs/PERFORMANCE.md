# Performance Plan — Faster Dashboard Loading

> **Audience:** an implementing agent with no memory of the analysis conversation.
> Everything needed to execute is in this file. Read it top to bottom before touching code.
>
> **Core idea:** *store data locally and on the server, then refresh from the network only the new/changed data — never re-fetch everything on every load.*

---

## 1. Background — how the dashboard loads today

Opening the site runs this sequence:

1. **Server component** `src/app/(dashboard)/page.tsx`
   - `getCurrentUser()` → `getPortfolios()` → `getHoldingsForPortfolio()` + `getFolders()`.
   - Renders HTML **with holdings/folders but no prices**.
2. **Browser hydrates**, then `src/components/portfolio/HomeClient.tsx` fires a *waterfall* of client requests:
   - `/api/fx` (`useFxRate`)
   - `/api/prices` (`usePrices` inside `usePortfolioMetrics`) — all values show `0`/loading until this returns
   - `/api/prices/daily-series` (`useDailySeries`) — the performance chart
   - `/api/benchmark` (`useBenchmark`) — **depends on** the resolved series (`chartFromDate`), so it runs *after* the series, sequentially.

The user therefore sees an empty skeleton, then 3–4 round-trips happen in sequence before numbers and chart appear.

### Confirmed bottlenecks (with file references)

| # | Problem | Location |
|---|---------|----------|
| 1 | **No browser-side persistence.** React Query is memory-only — every refresh/navigation re-fetches everything cold. | `src/lib/query-client.ts`, `src/components/providers.tsx` |
| 2 | **Prices/chart fetched client-side after hydration**, not prefetched server-side. First paint has no data. | `src/components/portfolio/HomeClient.tsx:85-100` |
| 3 | **Chart history hits Yahoo *live* on every cold load and is never persisted.** Only numeric TASE funds read from `price_cache`; named tickers always go to Yahoo. | `src/app/api/prices/daily-series/route.ts` |
| 4 | **`auth.getUser()` makes a network call to Supabase on every request**, and runs twice (layout + page) plus once per API route. ~100–300ms each. | `src/lib/db/supabase-server.ts:59`; `src/app/(dashboard)/layout.tsx` + `page.tsx` both call `getPortfolios` |
| 5 | **Benchmark waterfalls behind the series** instead of fetching in parallel. | `src/components/portfolio/HomeClient.tsx:100` |

---

## 2. Implementation phases

Do them in order. Each phase is independently shippable and independently testable. **Phase 1 is the highest impact-to-effort win — do it first.**

---

## Phase 1 — Persist the React Query cache to localStorage (instant repeat visits)

**Goal:** on any repeat visit/refresh, prices + chart + FX render instantly from disk, then refresh quietly in the background (stale-while-revalidate). No more staring at zeros.

### Steps

1. **Add the persister dependency** (use the pnpm wrapper — npm is broken on this machine, see `CLAUDE.md`):
   ```bash
   bash pnpm.sh add @tanstack/react-query-persist-client @tanstack/query-sync-storage-persister
   ```

2. **Add `gcTime` to the query client** so cached data survives long enough to be persisted. Edit `src/lib/query-client.ts`:
   ```ts
   export function makeQueryClient() {
     return new QueryClient({
       defaultOptions: {
         queries: {
           staleTime: 1000 * 60 * 5,        // 5 minutes
           gcTime: 1000 * 60 * 60 * 24,     // 24h — keep around for persistence
           retry: 3,
           retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 30_000),
         },
       },
     })
   }
   ```

3. **Swap `QueryClientProvider` for `PersistQueryClientProvider`** in `src/components/providers.tsx`:
   ```tsx
   'use client'

   import { useState } from 'react'
   import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client'
   import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister'
   import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
   import { ThemeProvider } from 'next-themes'
   import { makeQueryClient } from '@/lib/query-client'

   export function Providers({ children }: { children: React.ReactNode }) {
     const [queryClient] = useState(makeQueryClient)
     const [persister] = useState(() =>
       typeof window === 'undefined'
         ? null
         : createSyncStoragePersister({
             storage: window.localStorage,
             key: 'donatelo-query-cache',
           })
     )

     // SSR / first render with no window: render plain provider to avoid hydration mismatch
     if (!persister) {
       // Fall back to a normal provider on the server. On the client the
       // effect-driven persistence kicks in after mount.
       return (
         <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
           {/* PersistQueryClientProvider also works here, but guard for SSR */}
           {children}
         </ThemeProvider>
       )
     }

     return (
       <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
         <PersistQueryClientProvider
           client={queryClient}
           persistOptions={{
             persister,
             maxAge: 1000 * 60 * 60 * 24,   // discard persisted cache older than 24h
             // Bump this string whenever PriceData/series shapes change, to invalidate old caches
             buster: 'v1',
           }}
         >
           {children}
           {process.env.NODE_ENV === 'development' && (
             <ReactQueryDevtools initialIsOpen={false} />
           )}
         </PersistQueryClientProvider>
       </ThemeProvider>
     )
   }
   ```
   > **Note on the SSR guard:** the simplest correct approach is to always render `PersistQueryClientProvider` and let it no-op on the server. If you hit hydration warnings, use the `persister === null` guard above. Verify in the browser that no hydration error appears in the console.

4. **BigInt serialization gotcha.** `usePrices` stores `price: bigint` in the cache (`src/hooks/usePrices.ts`). `JSON.stringify` **throws on BigInt**, so the default persister will fail to write the `['prices', ...]` query. Fix with custom serialize/deserialize on the persister:
   ```ts
   createSyncStoragePersister({
     storage: window.localStorage,
     key: 'donatelo-query-cache',
     serialize: (data) =>
       JSON.stringify(data, (_k, v) =>
         typeof v === 'bigint' ? { __type: 'bigint', value: v.toString() } : v
       ),
     deserialize: (str) =>
       JSON.parse(str, (_k, v) =>
         v && typeof v === 'object' && v.__type === 'bigint' ? BigInt(v.value) : v
       ),
   })
   ```
   **Verify** after implementing: open the dashboard, then in DevTools → Application → Local Storage confirm `donatelo-query-cache` exists and contains the `prices` query without errors. Reload and confirm values appear *before* any network request completes (throttle the network in DevTools to make this obvious).

### Acceptance criteria — Phase 1
- [ ] Reloading the dashboard shows prices/chart **immediately** from localStorage (verify with Network throttling set to "Slow 3G").
- [ ] A background refresh still happens (network tab shows `/api/prices` etc. firing after paint).
- [ ] No console errors about BigInt or hydration mismatch.
- [ ] `donatelo-query-cache` key present in localStorage with valid JSON.

---

## Phase 2 — Refresh only the new data (server-side delta fetching)

**Goal:** stop re-pulling full datasets that don't change. The chart history is the worst offender.

### 2a. Persist daily chart history in the DB, fetch only the tail

**Problem:** `src/app/api/prices/daily-series/route.ts` calls Yahoo live for every named ticker on every cold load, fetching the *entire* range (up to 3 years), and never saves the result. Past daily closes never change — this is pure waste.

**Design:**
1. **Storage.** Reuse `price_cache` if its shape fits, or add a dedicated table. Recommended: a new Prisma model so we don't overload `price_cache` semantics:
   ```prisma
   model DailyClose {
     id           String   @id @default(uuid())
     tickerSymbol String   @map("ticker_symbol")
     exchange     String
     closeDate    DateTime @map("close_date") @db.Date
     close        Decimal  @db.Decimal(18, 6)   // native currency units, matches DailyPoint.close
     fetchedAt    DateTime @default(now()) @map("fetched_at")

     @@unique([tickerSymbol, closeDate])
     @@index([tickerSymbol, closeDate(sort: Desc)])
     @@map("daily_closes")
   }
   ```
   Run `bash pnpm.sh run db:migrate` (dev) — note the schema uses `directUrl`; ensure `DIRECT_URL` is set in `.env.local`.

2. **New route logic** (`daily-series/route.ts`), per ticker:
   - Read stored closes for the ticker `>= from` from `daily_closes`.
   - Find the **latest stored `closeDate`** for the ticker.
   - Only call Yahoo for the **gap**: `period1 = lastStoredDate + 1 day` (or `from` if nothing stored), `period2 = today`.
   - **Upsert** the newly fetched points into `daily_closes` (`createMany` with `skipDuplicates`, or per-row upsert on the `[tickerSymbol, closeDate]` unique key).
   - Merge stored + new, return the same `Record<symbol, DailyPoint[]>` shape so the client and `buildIndexedPerformance` are unchanged.
   - Keep the existing numeric-TASE fallback that reads `price_cache`.

3. **Edge cases to handle:**
   - **Today's close is provisional** during market hours — Yahoo may return an intraday/partial value. Either: don't persist *today's* point (only persist dates `< today`), or upsert it and let it be overwritten on the next fetch via the unique-key upsert. Prefer the upsert approach for simplicity.
   - **Weekends/holidays:** no new trading days → the gap fetch returns nothing → serve purely from DB. This is the common, fast path.
   - **First-ever load for a ticker:** nothing stored → fetch the full range once, persist, done. Subsequent loads only fetch the tail.

### 2b. Serve cached current prices immediately, background-refresh only stale ones

**Problem:** `usePrices` blocks the whole price set on one request, and `usePortfolioMetrics` shows `0`/loading until it resolves.

**Design (mostly client-side, complements Phase 1):**
- The server route `src/app/api/prices/route.ts` already serves from `price_cache` (60-min TTL) and only fetches missing/stale tickers — that logic is good, keep it.
- With Phase 1's persistence, the *client* now has last-known prices instantly. Ensure `usePrices` uses `placeholderData: (prev) => prev` (keep previous data) so switching portfolios/time-ranges doesn't flash to empty.
- Optional refinement: the `stale` flag already returned per-ticker by the route can drive a subtle "updating…" indicator instead of a blocking spinner. Not required for the speed win.

### Acceptance criteria — Phase 2
- [ ] Second load of the chart for the same period issues **no Yahoo request** for date ranges already stored (verify via server logs / network: only a small tail request, or none on weekends).
- [ ] `daily_closes` table fills in and grows by only the new trading days on subsequent loads.
- [ ] Chart output is visually identical to before (same `buildIndexedPerformance` input shape).
- [ ] Switching time range / portfolio never flashes price values to `0`.

---

## Phase 3 — Faster first (cold) paint & fewer round-trips

**Goal:** make the very first visit fast too, by prefetching on the server and removing duplicate/sequential work.

### 3a. Prefetch + hydrate prices and series on the server
In `src/app/(dashboard)/page.tsx`, after loading holdings, prefetch the price + daily-series queries on a server-side `QueryClient` and pass a dehydrated state to the client via `HydrationBoundary`:
- Build the same ticker list the client builds (`${tickerSymbol}:${exchange === 'TASE' ? 'TASE' : 'US'}`).
- `queryClient.prefetchQuery` for `['prices', ...tickers.sort()]` and `['daily-series', fromKey, ...tickers.sort()]` using the **same query keys** the hooks use (see `usePrices.ts`, `useDailySeries.ts`) so the client hydrates instead of refetching.
- Wrap `<HomeClient />` in `<HydrationBoundary state={dehydrate(queryClient)}>`.
- **Caution:** match query keys *exactly*, including sort order and the `fromKey` date string format (`toISOString().slice(0,10)`), or hydration misses and the client refetches anyway.
- This streams data in the first HTML payload — no post-hydration waterfall for the common case.

### 3b. De-duplicate auth and portfolio loading
- `getCurrentUser()` (`src/lib/db/supabase-server.ts:59`) calls `supabase.auth.getUser()` — a network round-trip — and runs in both `layout.tsx` and `page.tsx`, plus every API route. Wrap it in React's `cache()` so it's memoized per request:
  ```ts
  import { cache } from 'react'
  export const getCurrentUser = cache(async () => { /* existing body */ })
  ```
- Similarly, `getPortfolios(user.id)` runs in both `layout.tsx` and `page.tsx`. Wrap that query in `cache()` too (or lift it to a shared cached helper) so the DB is hit once per request.

### 3c. Parallelize the benchmark
In `src/components/portfolio/HomeClient.tsx:100`, `useBenchmark` currently depends on `chartFromDate`, which is derived from the resolved series — creating a sequential request. Change it to use the raw `fromDate` (already known before the series resolves) so the benchmark fetch runs **in parallel** with the series. Verify the benchmark indexing still lines up with the chart's start date after the change.

### Acceptance criteria — Phase 3
- [ ] First cold load: `/api/prices` and `/api/prices/daily-series` data is present in the initial HTML (View Source / Network shows no client refetch on first paint, or a hydrated cache).
- [ ] `supabase.auth.getUser()` fires **once** per page request, not 2–4×.
- [ ] Benchmark request starts in parallel with the series request (Network waterfall shows them overlapping, not sequential).

---

## 3. Verification & rollout

- **Measure before/after** with Chrome DevTools → Performance / Lighthouse, and the Network "Load" + "Finish" timings. Capture numbers for: (a) cold first load, (b) warm reload. Record them in this file or in `bugs.md`.
- **Test the data correctness**, not just speed: portfolio totals, chart shape, and benchmark must be unchanged. Run the existing Vitest suite: `bash pnpm.sh test`.
- **Ship phase by phase.** Each phase is independently mergeable. After each, follow the repo's branch-finish convention (push + PR — see project memory/`finishing-a-development-branch`).
- **Cache-busting:** if any cached data shape changes (e.g. `PriceData`, `DailyPoint`), bump the persister `buster` string (Phase 1) so old localStorage caches are discarded cleanly.

## 4. Out of scope / non-goals
- Changing financial calculations (`src/lib/calculations/`) — must stay byte-identical in output.
- Switching data providers (Polygon / TASE / Yahoo / FX) — only changing *when and how much* we fetch.
- Real-time/websocket pricing — the 5-minute poll model stays.

## 5. Quick reference — files this plan touches
| File | Phase | Change |
|------|-------|--------|
| `src/lib/query-client.ts` | 1 | add `gcTime` |
| `src/components/providers.tsx` | 1 | `PersistQueryClientProvider` + persister (BigInt-safe) |
| `src/hooks/usePrices.ts` | 2b | `placeholderData: keepPrevious` |
| `prisma/schema.prisma` | 2a | new `DailyClose` model + migration |
| `src/app/api/prices/daily-series/route.ts` | 2a | persist + tail-only fetch |
| `src/app/(dashboard)/page.tsx` | 3a | prefetch + `HydrationBoundary` |
| `src/lib/db/supabase-server.ts` | 3b | `cache()` around `getCurrentUser` |
| `src/lib/db/queries/portfolios.ts` (`getPortfolios`) | 3b | `cache()` / de-dupe |
| `src/components/portfolio/HomeClient.tsx` | 3c | benchmark uses raw `fromDate` |
