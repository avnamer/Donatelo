# Pages & Routes

## Navigation Structure

### Top Navigation Bar
```
[Logo] Home | Invest | Visualize | Allocations | Dividends | Activity
                                                          [Blog] [Explore] [Import] [Export] [Currency] [User Menu]
```

### User Menu Dropdown
- My Profile
- Cash
- Portfolios
- Import
- Sign out

---

## Pages

---

### `/` — Home (Dashboard)

**Purpose:** Main portfolio overview.

**Layout:**
```
┌─────────────────────────────────────┬──────────┐
│ [Folder Name]                       │ KPI Panel│
│ Compare to: □ S&P 500 □ MSCI ACWI  │ ₪345,952 │
│ [Time Range: 3M | 6M | 9M | 1Y]    │ VALUE    │
│                                     │          │
│ ┌─ Performance Chart (area) ─────┐  │ 46.6%    │
│ │  (indexed to 100)              │  │ RETURN   │
│ └────────────────────────────────┘  │          │
│                                     │ ₪154,411 │
│ 📉 Buy the Dip  [22] [52w|Hist|90d] │ GAIN     │
│ ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐   │          │
│ │ETOR │ │PYPL │ │CEG  │ │ ... │   │ 0.21%    │
│ │-43% │ │-48% │ │-40% │ │     │   │ EXP.RATIO│
│ │chart│ │chart│ │chart│ │     │   │          │
│ └─────┘ └─────┘ └─────┘ └─────┘   │ 0.15%    │
├─────────────────────────────────────┤ DIV.YIELD│
│ [Folder Name]              [Add ▼]  │          │
│ View: Default ▼                     └──────────┤
│                                     │ Donut    │
│ Name        Value  Gain/Ret  Act/Tgt│ Chart    │
│ ▼ Folder A  ...    ...       .../..%│ 72.93%   │
│   Folder B  ...    ...       .../..%│          │
│   Cash ILS  ...           1.16%     │          │
│   Cash USD  ...           0.10%     │          │
└─────────────────────────────────────┴──────────┘
```

**Buy the Dip section:**
- Appears below the performance chart
- Shows all portfolio holdings that have dropped ≥ 10% from their 52-week high
- Global toggle: **52w** (52-week high) | **Historical** (all available cache) | **90d** (90-day high)
- Switching the toggle updates all cards simultaneously: drop %, high price label, sparkline window
- Each card: ticker, drop % badge, current price, period high, 90-day sparkline, AI one-liner
- Clicking a card opens a modal with a larger chart and the same toggle
- Refresh button (↻) forces recomputation — backfills 52w price history from Polygon/Yahoo if cache is sparse
- **Backfill is sequential** with 13s delay between US stocks to respect Polygon.io free-tier rate limit (5 req/min). First-time refresh takes ~5 min; subsequent days are instant (data already cached)
- Same-day cache: computed once per day, instant on return visits
- Cards sorted by drop % descending (biggest dip first)
- Deduplication: if same ticker appears in multiple folders, shown once
- Data source: `dip_alerts` table + `price_cache` backfill via `/api/dip-alerts`

**Behavior:**
- Clicking a folder name navigates to that folder's page (same layout, filtered)
- Breadcrumb updates: Home > ישראל > מדדים
- [Add ▼] dropdown: Folder | Holding | Cash | Fixed Asset | Portfolio
- View dropdown: Default | Create New View
- Sort by Value (desc) by default, toggleable
- Three-dot menu per row: Move | Edit Target | Select | Rename | Hide When Shared | Delete
- KPI panel shows metrics for currently viewed folder level

**URL pattern:** `/` for root, `/folders/[...path]` for subfolders

---

### `/folders/[id]` — Folder View

Drill-down into a specific folder (region, sector, etc.).

**Layout:**
```
Breadcrumb: Portfolio › [Parent] › [Current Folder]
[Folder name + color] [Add Holding] [Rename] [Delete]

KPIs: VALUE | UNREALIZED GAIN | RETURN

┌─ DrilldownChart (weighted performance of all holdings) ─────────┐
│ [Folder] — Performance          30D 90D 6M YTD 1Y 3Y            │
│  +X.XX%                                                          │
│  [area chart indexed to 100 at start of period]                  │
└──────────────────────────────────────────────────────────────────┘

Sub-folders table (if any): Name | Value | Gain/Return | Alloc
Holdings table: Name | Value | Gain/Return | Alloc
```

**DrilldownChart:** cost-basis-weighted portfolio return across all holdings in the folder
(direct + sub-folder holdings). Fetches price series from `/api/prices/series`.
Period selector: 30D · 90D · 6M · YTD · 1Y · 3Y.
- Anchor strategy: if the holding is newer than the selected period, uses cost-basis-equivalent
  anchor price so the lifetime return ≈ KPI unrealized return. Otherwise anchors to period start.
- `sinceDate` param caps series to earliest lot purchase date (no pre-ownership price history).
- Hover tooltip shows % change from period start; for single-holding, also shows actual price.
- Shows "No price history for this period" if price_cache lacks data for the range.

---

### `/holdings/[id]` — Holding Detail

**Purpose:** Deep dive into a single security.

**Layout:**
```
Back to Portfolio / [Folder Name]
[TICKER]  [EXCHANGE]   [Record Dividend]  [Add Lot]
[Full name]

KPIs: CURRENT VALUE | COST BASIS | UNREALIZED P&L | SHARES

┌─ DrilldownChart (price history for this security) ──────────────┐
│ [TICKER] — Performance          30D 90D 6M YTD 1Y 3Y            │
│  +X.XX%                                                          │
│  [area chart indexed to 100 at start of period]                  │
└──────────────────────────────────────────────────────────────────┘

ACTIVE LOTS table: Date | Shares | Cost/Share | Account | Notes
SOLD LOTS table:   Bought | Sold | Shares Sold | Sell Price | Proceeds
```

**DrilldownChart:** single-security price history from `price_cache`, indexed to 100
at start of period (or cost-basis anchor if holding is newer than the period).
Period selector: 30D · 90D · 6M · YTD · 1Y · 3Y.
Hover tooltip shows actual price + % change from period start.

**Interactions:**
- [Sell] on a lot → SellLotDialog
- [Edit] on a lot → EditLotDialog
- [🗑 icon] → delete lot (with confirmation)

---

### `/invest` — Auto-Invest

**Purpose:** Calculate how to deploy new cash to reach target allocations.

**Layout:**
```
Enter new funds: [_________] and click [Auto Invest]
□ Enable fractional shares

┌─── Folder Tree (left) ──────────────┬─── Transactions (right) ───┐
│ Allocated for this folder: 0         │ Remaining: ₪0              │
│ Remaining: ₪0                        │                             │
│                                      │ Symbol  Name  Cost         │
│ Name    Value  Allocation  Act/Tgt   │                             │
│ ארהב    ₪X     [_____]    17.56%/31%│                             │
│ אירופה  ₪X     [_____]    2.63%/8%  │                             │
│ ...                                  │                             │
└──────────────────────────────────────┴─────────────────────────────┘
```

**Behavior:**
- [Auto Invest] fills allocation inputs automatically
- Allocation inputs are editable (manual tweaking)
- Right panel shows suggested buy transactions
- Remaining shows unallocated cash
- Can drill into folders to see per-holding allocations

---

### `/visualize` — Visualizations

**Purpose:** Advanced visual analysis of portfolio.

**Components (tabbed or sectioned):**
- **Treemap** — portfolio holdings as rectangles sized by value, colored by return
- **Bubble Chart** — size = value, x = return %, y = allocation %
- **Geographic Map** — allocation by country/region
- **Sector Breakdown** — pie/bar by sector (tech, finance, energy, etc.)
- **Timeline** — portfolio value over all time (not indexed)

---

### `/allocations` — Target Allocations

**Purpose:** Define and adjust target % for each folder.

**Layout:**
```
Target Allocations    [All changes saved]

Name                Current   Target
▼ ישראל (14)        50%       [28] %
▼ ארהב (19)         17.56%    [31] %
  אנרגיות מתחדשות   12.62%    [6]  %
  ...
                              Total: 100% ✓

┌──────────────────────────────────┐
│  Donut Chart                     │
│  Inner ring: Current allocation  │
│  Outer ring: Target allocation   │
└──────────────────────────────────┘
```

**Behavior:**
- Editing a target % auto-saves (debounced)
- Total must equal 100% — shows warning if not
- Donut updates live as targets change
- Folders with no target show "–"

---

### `/dividends` — Dividends

**Purpose:** Track past and upcoming dividend income.

**Layout:**
```
┌── Annual Summary ──┬─────────────────────────────────────────┐
│ Paying Assets: 11  │ Dividends   [Quarterly▼] [Breakdown▼]   │
│ Cost Basis: ₪X     │                                          │
│ Yield TTM: 1.25%   │  ┌─ Bar Chart ──────────────────────┐   │
│ Yield/Cost: 1.79%  │  │  Q2'23 Q3'23 Q4'23 Q1'24 ...    │   │
│ Trailing YR: ₪X    │  └──────────────────────────────────┘   │
│ Monthly Avg: ₪X    │                                          │
│ YoY Growth: -78%   ├─────────────────────────────────────────┤
│                    │ Recent and Upcoming Dividends            │
│ □ Ignore Purch. Dt │ Start date [picker]  Tax %: [____]      │
│                    │                                          │
│                    │ Name  Declare  Ex-date  Pay   $/share  Shares  Total│
│                    │ AAPL  Apr 30   May 11   May 14  $0.27  6     $1.62  │
│                    │ ...                                      │
│                    │ Sum: 9 distributions, 5 increases        │
└────────────────────┴─────────────────────────────────────────┘
```

**Controls:**
- Time grouping: Monthly | Quarterly | Yearly
- Breakdown: None | By Folder | By Asset
- Start date picker (calendar)
- Projected tax % input (affects "Total After Tax" column)
- Toggle: Ignore Purchase Dates

---

### `/activity` — Activity Log

**Purpose:** Full history of all transactions — buys, sells, dividends,
deposits, withdrawals, commissions, and FX conversions.

**Files:**
- Server component: `src/app/(dashboard)/activity/page.tsx`
- Client component: `src/components/activity/ActivityClient.tsx`

**Layout:**
```
Activity
123 transactions

┌─ Summary cards (all-time totals, always visible) ──────────────────┐
│ [Trades donut]  [Dividends donut]  [Cash flows donut]              │
│ [Invested ₪X]   [Deposited ₪X]    [Dividends ₪X]  [Commissions ₪X]│
└────────────────────────────────────────────────────────────────────┘

[All 123] [Buys 45] [Sells 12] [Dividends 8] [Deposits 4]
[Withdrawals 2] [Commissions 30] [FX 22]

┌─ Transaction table ─────────────────────────────────────────────────┐
│ Date       Type         Security/Account  Shares        Amount      │
│ 2026-01-14 🟢 Buy       AAPL Apple Inc.   10           +₪5,240      │
│                                           @ ₪524.00                 │
│ 2025-12-03 🔴 Sell      MSFT Microsoft    5            −₪2,100      │
│                                           @ ₪420.00    +₪300 gain  │
│ 2025-11-01 🟣 Dividend  VICI              —             +$10.00     │
│ 2025-10-15 🟠 Commission AAPL             —             −₪18.00     │
│ 2025-09-01 🔵 FX        —                —              $2,700.00  │
├─────────────────────────────────────────────────────────────────────┤
│ 1–50 of 123                          [‹] [1] [2] [3] [›]           │
└─────────────────────────────────────────────────────────────────────┘
```

**Transaction types displayed:**

| Type | Badge color | Amount sign | Notes column |
|---|---|---|---|
| `SECURITY_BUY` | Green | + green | Notes from lot |
| `SECURITY_SELL` | Red | − red + realized gain line | Notes from lot |
| `DIVIDEND` | Indigo | + green | Notes |
| `CASH_DEPOSIT` | Green | + green | Account name |
| `CASH_WITHDRAWAL` | Amber | − red | Account name |
| `COMMISSION` | Orange | − red | Notes (e.g. broker name) |
| `FX_CONVERSION` | Sky blue | neutral | Notes (e.g. "₪10,000 → USD") |

Bonds use `SECURITY_BUY` / `SECURITY_SELL` — the holding's ticker/name
identifies it as a bond. No separate bond type is needed.

**URL params (server-driven):**
- `?type=SECURITY_BUY` — filter by transaction type
- `?page=2` — pagination (50 rows per page)
- Changing a filter tab navigates to `?type=X&page=1`

**Data flow:**
1. `syncActivityData(portfolioId, userId)` runs on every page load:
   - If no duplicates and no unlinked lots → returns immediately (2 COUNT queries, zero writes)
   - If duplicates found → runs `deduplicateTransactions` (deletes extra rows)
   - If unlinked lots found → runs `backfillTransactionsFromLots` (creates/links missing rows)
2. `getTransactions(portfolioId, userId, { page, type })` fetches current page
3. `getTransactionSummary(portfolioId, userId)` fetches all-time totals (for summary cards — always unfiltered)

**Future (not yet implemented):**
- Date range filter (this year / last 12 months / custom)
- Manual transaction entry UI for COMMISSION / DIVIDEND / FX_CONVERSION / CASH_DEPOSIT
- `FX_CONVERSION` schema extension: `from_amount` + `from_currency` fields
- CSV export of filtered activity

---

### `/explore` — Portfolio Profiles

**Purpose:** Discover and be inspired by curated portfolio strategies.

**Layout:**
```
Profiles

Noteworthy Profiles

[Passive Income Man]
My portfolio represents a diversified set of blue chip companies...

[Diversified Investor]
My portfolio aims for maximum diversification...

[Aggressive Tech Growth]
...
```

**Clicking a profile → detail page with:**
- Full description
- Allocation breakdown (table + donut chart)
- Holdings list (anonymized)
- [Use as Template] button → copies target allocations to user's portfolio

---

### `/import` — Import Data

**Purpose:** Import portfolio from Donatello CSV export or manual CSV.

**Steps:**
1. Upload CSV file
2. Preview parsed data (table)
3. Map columns if needed
4. Confirm → creates all folders, holdings, lots

**Supported formats:**
- Donatello export (auto-detected)
- Generic CSV with columns: date, ticker, exchange, shares, cost, currency, account, folder

---

### `/export` — Export Data

**Purpose:** Export portfolio data for backup or migration.

**Options:**
- Full JSON backup (all data)
- CSV: Holdings summary
- CSV: Lots (all transactions)
- CSV: Dividends history

---

### `/settings` — User Settings

- Base currency (ILS / USD)
- Default time range for charts
- Tax rate (for dividend projections)
- Account types list (manage custom account names)
- Notification preferences (future)
- Delete account

---

## Shared Components

### KPI Panel (right side of dashboard)
```typescript
interface KPIPanelProps {
  value: bigint
  returnPct: Decimal
  gain: bigint
  expenseRatio: Decimal
  dividendYield: Decimal
  currency: 'ILS' | 'USD'
}
```

### Performance Chart (`src/components/charts/PerformanceChart.tsx`)
Full portfolio performance — area chart indexed to 100, with benchmark overlay.
Time ranges: 1W · 1M · 3M · 6M · YTD · 1Y · 2Y · 3Y · ALL.
Used on the Home dashboard.

```typescript
interface PerformanceChartProps {
  data: PerformancePoint[]       // { date: Date; index: number }[]
  benchmarkData?: PerformancePoint[]
  loading?: boolean
}
```

### Drilldown Chart (`src/components/charts/DrilldownChart.tsx`)
Folder / holding-level performance — cost-basis-weighted area chart indexed to 100.
Fetches price time series from `/api/prices/series` via `usePriceSeries` hook.
Period selector: 30D · 90D · 6M · YTD · 1Y · 3Y.
Used on `/folders/[id]` and `/holdings/[id]`.

**Anchor strategy:**
- Period capped by `earliestPurchaseDate` (holding newer than period): anchor = `costBasis / (fxRate × shares)` for USD, `costBasis / shares` for ILS → lifetime return ≈ KPI
- Period not capped: anchor = price at period start → shows true period return

**Weighting:** cost-basis weights ensure blended return = `totalValue / totalCostBasis` = KPI.

**Tooltip:** % change from period start. Single-holding also shows actual security price.

**Corruption guard:** `sanitizePriceSeries()` detects 5× consecutive jumps and truncates pre-jump data. `/api/prices/series` prepends an anchor row (last price before period start, within 14 days) and validates it against the first series price (10× threshold).

```typescript
interface DrilldownHolding {
  tickerSymbol: string
  exchange: string            // 'TASE' | 'US' | ...
  activeShares: number
  currentValue: number        // portfolio currency cents — weighting fallback
  costBasis: number           // portfolio currency cents — anchor + weighting
  earliestPurchaseDate?: string  // ISO date — caps series start
}

interface DrilldownChartProps {
  holdings: DrilldownHolding[]
  fxRate?: number             // ILS per USD (default 3.72)
  portfolioCurrency?: string  // 'ILS' | 'USD'
  label?: string              // chart title
}
```

### Donut Chart (Allocation)
```typescript
interface AllocationDonutProps {
  segments: Array<{
    name: string
    value: bigint
    color: string
    actualPct: Decimal
    targetPct?: Decimal
  }>
  selectedSegment?: string
  centerLabel?: string
}
```

### Holdings Table
```typescript
interface HoldingsTableProps {
  items: FolderOrHolding[]
  currency: 'ILS' | 'USD'
  columns: ('name' | 'value' | 'gain' | 'return' | 'actual' | 'target')[]
  onRowClick: (item: FolderOrHolding) => void
  onMenuAction: (action: MenuAction, item: FolderOrHolding) => void
}
```

### AI Agent Chat Panel
```typescript
interface AgentPanelProps {
  agentType: 'analyzer' | 'rebalancer' | 'dividends' | 'researcher'
  portfolioId: string
  contextItem?: FolderOrHolding  // optional: agent focused on specific item
}
```
