# Buy the Dip Alerts — Design Spec

**Date:** 2026-06-11  
**Status:** Approved

---

## Overview

A new feature on the Home page that detects when any holding in the user's portfolio has dropped more than 10% from its 52-week high and surfaces a rich alert card with AI-powered buy suggestion. The user can toggle between three peak reference points (52-week high, all-time high, 90-day high) in the detail view.

---

## Data Model

New `DipAlert` table in Prisma. One record per qualifying holding per portfolio. Records are upserted on each refresh cycle.

```prisma
model DipAlert {
  id           String   @id @default(cuid())
  userId       String
  portfolioId  String
  holdingId    String
  ticker       String
  name         String
  currentPrice Float
  high52w      Float
  highATH      Float?       // nullable — best-effort from all available DB history
  high90d      Float
  dropFrom52w  Float        // negative decimal (e.g. -0.142 = -14.2%)
  dropFromATH  Float?
  dropFrom90d  Float
  priceHistory Json         // 90-day daily prices array for sparkline
  aiSuggestion String?      // cached Claude one-liner
  computedAt   DateTime

  holding   Holding   @relation(fields: [holdingId], references: [id])
  portfolio Portfolio @relation(fields: [portfolioId], references: [id])
}
```

**Filter rule:** Only holdings where `dropFrom52w ≤ -0.10` are stored as alerts.

---

## API

### `GET /api/dip-alerts?portfolioId=xxx`

**Cache strategy:** Same-day cache (TTL: current calendar day, matching existing price cache behavior). On page load, if records exist with `computedAt` = today → return cached. Otherwise recompute.

**Computation flow:**
1. Fetch all holdings for the portfolio
2. For each holding, pull price history from the existing DB price cache (no extra external API calls)
3. Compute peaks: `high52w` (max of last 365 days), `high90d` (max of last 90 days), `highATH` (max of all available history in DB — best-effort)
4. Calculate drop percentages from each peak
5. Filter to holdings where `dropFrom52w ≤ -0.10`
6. For each qualifying holding, call Claude with a one-sentence "buy the dip?" prompt → store as `aiSuggestion`
7. Upsert `DipAlert` records in DB
8. Return results

**Cost optimization:** Claude is called only for holdings crossing the 10% threshold, matching the existing market-agent pattern (called only for movers ≥ 3%).

**Response shape:**
```ts
{
  alerts: DipAlert[]     // sorted by dropFrom52w ascending (biggest drop first)
  computedAt: string
  totalHoldings: number
  alertCount: number
}
```

---

## UI Components

### `DipAlertsSection` (Home page, below performance chart)

Section header shows: title "📉 Buy the Dip", alert count badge, refresh button (↻).

Horizontal scrollable row of `DipAlertCard` components.

**Empty state:** Green banner — "All holdings within 10% of their 52-week high."

---

### `DipAlertCard`

Rich card showing at a glance:
- Ticker symbol + holding name
- Drop % badge in red (e.g. `-14.2% from 52w high`)
- Current price / peak price
- 90-day sparkline mini-chart (Recharts)
- AI one-liner suggestion (from `aiSuggestion`)
- "Details" button

---

### `DipAlertModal`

Opens on card click. Contains a three-way toggle at the top:

```
[ 52-week high ]  [ All-time high ]  [ 90-day high ]
```

Toggle switches the displayed drop % and peak price using already-fetched data — no additional API call. The sparkline window adjusts to match the selected period. The AI suggestion is static across all views.

Fields shown in modal:
- Selected peak value + date
- Current price
- Drop % from selected peak
- Full sparkline for selected window
- AI buy suggestion paragraph
- Link to holding detail page

---

## Architecture Notes

- This is a **standalone feature** — separate from the AI Agent insight system (`AgentInsight` model and orchestrator). Dip alerts are not `MARKET_UPDATE` insights.
- The existing price history already cached in DB is the sole data source — no new external API calls for price data.
- `ATH` is best-effort: uses the maximum price across all history available in the DB for that ticker. If no history exists, `highATH` is null and the ATH toggle in the modal is disabled.
- The `DipAlert` table replaces itself on each refresh (upsert by `holdingId + portfolioId`), so DB size stays bounded.

---

## Out of Scope

- Push notifications or email alerts
- Per-holding threshold customization (10% is fixed)
- Historical alert log / dismissal tracking
- Integration with the 🤖 Agent Panel
