# Data Model

## Overview
All user data lives in Supabase (PostgreSQL).
Financial values stored as **integers in agorot** (₪ × 100) to avoid float arithmetic errors.
USD values stored in **cents** ($× 100).

---

## Entity Relationship Diagram

```
users (Supabase Auth)
  └── portfolios
        ├── folders (self-referencing tree)
        │     └── holdings
        │           └── lots
        ├── cash_accounts
        ├── transactions
        └── dip_alerts   (per portfolio, 1 row per unique ticker)

price_cache        (shared, not per-user)
dividend_cache     (shared, not per-user)
fx_rates           (shared, not per-user)
```

---

## Tables

### `portfolios`
Top-level container. One user can have multiple portfolios (e.g. "Personal", "Joint").

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| user_id | uuid FK → auth.users | RLS: user sees own only |
| name | text | e.g. "Home", "My Portfolio" |
| base_currency | text | 'ILS' or 'USD' |
| created_at | timestamptz | |
| updated_at | timestamptz | |

---

### `folders`
Hierarchical folders for organizing holdings. Unlimited nesting.
Uses **adjacency list** (parent_id) — simple and sufficient for this use case.

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| portfolio_id | uuid FK → portfolios | |
| parent_id | uuid FK → folders | NULL = top-level folder |
| name | text | e.g. "ישראל", "ארהב", "מדדים" |
| color | text | hex color for chart, e.g. "#1d4ed8" |
| target_allocation_pct | decimal(5,2) | e.g. 28.00 for 28%. NULL = no target |
| sort_order | integer | for display ordering |
| is_hidden_when_shared | boolean | default false |
| created_at | timestamptz | |

**Indexes:** portfolio_id, parent_id

---

### `holdings`
A security held within a folder. One row per ticker per folder
(same ticker in different folders = different rows).

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| folder_id | uuid FK → folders | |
| ticker_symbol | text | e.g. "AAPL", "1150259" |
| exchange | text | 'TASE', 'NYSE', 'NASDAQ', 'OTHER' |
| name | text | e.g. "Apple Inc." — cached from API |
| expense_ratio | decimal(5,4) | e.g. 0.0061 for 0.61% |
| target_allocation_pct | decimal(5,2) | optional, within parent folder |
| is_active | boolean | false = archived/sold out |
| created_at | timestamptz | |

**Indexes:** folder_id, ticker_symbol

---

### `lots`
Individual purchase transactions for a holding.
This is the core of the portfolio — each buy creates a lot.
Sells reduce/zero-out a lot.

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| holding_id | uuid FK → holdings | |
| purchase_date | date | |
| shares | decimal(18,6) | supports fractional shares |
| cost_per_share | bigint | in agorot (ILS×100) or cents (USD×100) |
| cost_currency | text | 'ILS' or 'USD' |
| account_type | text | e.g. "השתלמות", "פנסיה", "ברוקר", NULL |
| sold_shares | decimal(18,6) | 0 if not sold. Can be partial. |
| sold_date | date | NULL if not sold |
| sold_price_per_share | bigint | in agorot/cents, NULL if not sold |
| proceeds_from_sale | bigint | sold_shares × sold_price, NULL if not sold |
| notes | text | optional |
| created_at | timestamptz | |

**Derived:**
- `active_shares = shares - sold_shares`
- `cost_basis = active_shares × cost_per_share`
- `unrealized_gains = current_value - cost_basis`
- `realized_gains = proceeds_from_sale - (sold_shares × cost_per_share)`

---

### `cash_accounts`
Cash balances in ILS or USD.

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| portfolio_id | uuid FK → portfolios | |
| name | text | e.g. "ILS Balance", "USD Balance" |
| currency | text | 'ILS' or 'USD' |
| balance | bigint | in agorot or cents |
| target_allocation_pct | decimal(5,2) | optional |
| created_at | timestamptz | |
| updated_at | timestamptz | |

---

### `transactions`
Complete activity log. Every event creates a transaction row.
This is the source of truth for the Activity page.

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| portfolio_id | uuid FK → portfolios | |
| type | text | See types below |
| date | date | |
| holding_id | uuid FK → holdings | NULL for cash-only transactions |
| lot_id | uuid FK → lots | NULL for dividends/cash |
| cash_account_id | uuid FK → cash_accounts | NULL for securities |
| shares | decimal(18,6) | NULL for non-security transactions |
| price_per_share | bigint | in agorot/cents |
| amount | bigint | total amount in agorot/cents |
| currency | text | 'ILS' or 'USD' |
| realized_gain | bigint | NULL unless SELL |
| notes | text | e.g. "22 shares × $0.45" |
| created_at | timestamptz | |

**Transaction Types:**
```
SECURITY_BUY      - buying shares (linked to a lot via lot_id)
SECURITY_SELL     - selling shares (linked to lot; stores realized_gain)
DIVIDEND          - dividend payment received (linked to holding)
CASH_DEPOSIT      - cash added to account (linked to cash_account)
CASH_WITHDRAWAL   - cash removed from account (linked to cash_account)
COMMISSION        - broker fee / transaction cost (optional holding_id)
FX_CONVERSION     - foreign-exchange conversion; amount = received amount,
                    currency = received currency; notes stores "from" side
                    (e.g. "Converted ₪10,000 → USD") until schema adds
                    from_amount / from_currency fields
```

**Notes on lot_id linkage:**
- Every `SECURITY_BUY` and `SECURITY_SELL` row should have `lot_id` set.
- Orphaned rows (lot_id = null) are cleaned up automatically by `syncActivityData`
  on the Activity page load.
- Bonds are securities — they use `SECURITY_BUY` / `SECURITY_SELL` with
  the bond ticker as the holding. No separate bond type is needed.

**Indexes:** portfolio_id, date DESC, type, holding_id

---

### `price_cache`
Cached prices to avoid hammering external APIs.
Shared across all users.

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| ticker_symbol | text | |
| exchange | text | 'TASE', 'US' |
| price | bigint | in agorot (TASE) or cents (US) |
| currency | text | 'ILS' or 'USD' |
| price_date | date | trading day of this price |
| fetched_at | timestamptz | when we fetched it |

**Unique:** (ticker_symbol, price_date)
**Index:** ticker_symbol, price_date DESC

---

### `dividend_cache`
Cached dividend data from Polygon.io / TASE.

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| ticker_symbol | text | |
| exchange | text | |
| declare_date | date | |
| ex_date | date | |
| pay_date | date | |
| amount_per_share | bigint | in cents (USD) |
| currency | text | |
| frequency | text | 'monthly', 'quarterly', 'annual', 'irregular' |
| fetched_at | timestamptz | |

**Unique:** (ticker_symbol, ex_date)

---

### `fx_rates`
Currency exchange rates, refreshed daily.

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| from_currency | text | e.g. 'USD' |
| to_currency | text | e.g. 'ILS' |
| rate | decimal(12,6) | e.g. 3.720000 |
| rate_date | date | |
| fetched_at | timestamptz | |

**Unique:** (from_currency, to_currency, rate_date)

---

### `dip_alerts`
Per-portfolio cache of "Buy the Dip" signals. One row per unique ticker per portfolio.
Recomputed on demand (same-day cache) via `GET /api/dip-alerts?force=true`.

| Column | Type | Notes |
|---|---|---|
| id | cuid PK | |
| user_id | text FK → auth.users | |
| portfolio_id | uuid FK → portfolios | onDelete: Cascade |
| holding_id | uuid FK → holdings | onDelete: Cascade |
| ticker | text | e.g. "AAPL", "ETOR" |
| name | text | e.g. "Apple Inc." |
| current_price | float | current price in native currency (÷100 from price_cache) |
| high_52w | float | max price in last 365 days from price_cache |
| high_ath | float NULL | max price across all available cache history (best-effort) |
| high_90d | float | max price in last 90 days from price_cache |
| drop_from_52w | float | negative fraction: (current − high_52w) / high_52w |
| drop_from_ath | float NULL | negative fraction from ATH (null if ATH unavailable) |
| drop_from_90d | float | negative fraction: (current − high_90d) / high_90d |
| price_history | jsonb | 52-week daily prices: `[{date: "YYYY-MM-DD", price: float}]` |
| ai_suggestion | text NULL | one-sentence Claude buy consideration |
| computed_at | timestamptz | when this row was last computed |

**Unique:** (holding_id, portfolio_id)
**Index:** (portfolio_id, computed_at DESC)

**Filter rule:** only holdings where `drop_from_52w ≤ −0.10` are stored.
Holdings with the same ticker in multiple folders appear as a single row (deduplicated by ticker).

---

### `explore_profiles`
Public portfolio templates for the Explore page.

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| name | text | e.g. "Passive Income Man" |
| description | text | |
| allocations | jsonb | `[{name, pct, color}]` |
| is_featured | boolean | shows in "Noteworthy Profiles" |
| created_at | timestamptz | |

---

## Prisma Schema (key models)

```prisma
model Portfolio {
  id           String   @id @default(uuid())
  userId       String
  name         String
  baseCurrency String   @default("ILS")
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  folders      Folder[]
  cashAccounts CashAccount[]
  transactions Transaction[]
}

model Folder {
  id                    String   @id @default(uuid())
  portfolioId           String
  parentId              String?
  name                  String
  color                 String?
  targetAllocationPct   Decimal?
  sortOrder             Int      @default(0)
  createdAt             DateTime @default(now())

  portfolio  Portfolio  @relation(fields: [portfolioId], references: [id])
  parent     Folder?    @relation("FolderTree", fields: [parentId], references: [id])
  children   Folder[]   @relation("FolderTree")
  holdings   Holding[]
}

model Holding {
  id                  String   @id @default(uuid())
  folderId            String
  tickerSymbol        String
  exchange            String
  name                String
  expenseRatio        Decimal?
  targetAllocationPct Decimal?
  isActive            Boolean  @default(true)
  createdAt           DateTime @default(now())

  folder       Folder        @relation(fields: [folderId], references: [id])
  lots         Lot[]
  transactions Transaction[]
}

model Lot {
  id                 String    @id @default(uuid())
  holdingId          String
  purchaseDate       DateTime
  shares             Decimal
  costPerShare       BigInt
  costCurrency       String
  accountType        String?
  soldShares         Decimal   @default(0)
  soldDate           DateTime?
  soldPricePerShare  BigInt?
  proceedsFromSale   BigInt?
  createdAt          DateTime  @default(now())

  holding      Holding       @relation(fields: [holdingId], references: [id])
  transactions Transaction[]
}
```

---

## Key Design Decisions

### Why integers for money?
```
₪41,776.45 stored as 4177645 (bigint)
$1.23 stored as 123 (bigint)
Display: value / 100
Arithmetic: integer math, no floating point errors
```

### Why adjacency list for folders?
- Simple to implement
- Sufficient for typical depth (3-4 levels max)
- Easy to query with recursive CTEs if needed
- Materialized paths would be faster for deep trees but overkill here

### Why cache prices in DB?
- Avoid external API rate limits
- Multiple users querying same tickers = one API call
- Offline/fallback if API is down
- Easy to add price history for chart later

### Why separate lots from transactions?
- `lots` = current state of holdings (what you own)
- `transactions` = history of events (what happened)
- Lots give you current cost basis efficiently
- Transactions give you the full activity log
- They're linked (a SELL transaction updates a lot AND creates a transaction row)

---

## Activity Data Sync Functions

Three helper functions in `src/lib/db/queries/transactions.ts` keep the
`transactions` table consistent with `lots`:

| Function | Purpose |
|---|---|
| `syncActivityData(portfolioId, userId)` | **Main entry point** called on every Activity page load. Runs two fast `COUNT` queries; only writes to DB when dirty. Calls dedup then backfill if needed. |
| `deduplicateTransactions(portfolioId, userId)` | Removes duplicate rows: same `lot_id` on multiple rows of the same type, unlinked rows shadowed by a linked row for the same holding+date, and multiple unlinked rows for the same holding+date. |
| `backfillTransactionsFromLots(portfolioId, userId)` | Creates missing `SECURITY_BUY` / `SECURITY_SELL` rows for any lots not yet linked to a transaction. Links existing orphaned rows (lot_id = null) to their lot instead of creating duplicates. |
| `hasUnlinkedLots(portfolioId, userId)` | Fast pre-check: returns true if any lot has no linked `SECURITY_BUY` transaction. Used by `syncActivityData` to skip backfill when unnecessary. |
