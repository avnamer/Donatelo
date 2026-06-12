# Bug Tracker

## Status Legend
- 🔴 Open
- 🟡 In Progress
- 🟢 Closed (confirm with user before closing)

---

## Open Bugs

| # | Status | Issue | Details |
|---|--------|-------|---------|
| 1 | 🔴 | TASE DataWise API blocked by WAF | Incapsula blocks server-side requests. Workaround: Yahoo Finance + Bizportal scraper. |
| 2 | 🔴 | "Market closed" detection | `StalePricesBanner` exists but logic for detecting market hours and invalidating cache needs review. |

---

## Closed Bugs

| # | Date | Bug | Fix |
|---|------|-----|-----|
| 1 | 2026-05-24 | `1380104.TA` (ארזים אגח 4) — "Price unavailable ₪0" shown in portfolio | Added `fetchBizportalSecurityPrice()` in `src/lib/api/tase.ts`; numeric-base `.TA` tickers now fall through to Bizportal after Yahoo Finance fails. |
| 2 | 2026-05-25 | Activity page shows "No transactions recorded yet" even though portfolio has lots | `backfillTransactionsFromLots()` now runs on every Activity page load (idempotent). Also: server-driven filter+pagination via URL searchParams; `ActivityClient` upgraded with filter tabs, 3 donut charts, realized-gain display, pagination bar. New `POST /api/lots/backfill` endpoint. |
| 3 | 2026-05-18 | Pre-existing Next.js 16 type error in `/api/explore/[id]/use-template` | Fixed: `params` must be `Promise<{ id: string }>` in Next.js 16 dynamic routes. |
