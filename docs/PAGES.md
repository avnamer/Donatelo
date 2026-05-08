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
│ * Simulated performance             │ ₪154,411 │
├─────────────────────────────────────┤ GAIN     │
│ [Folder Name]              [Add ▼]  │          │
│ View: Default ▼                     │ 0.21%    │
│                                     │ EXP.RATIO│
│ Name        Value  Gain/Ret  Act/Tgt│          │
│ ▼ Folder A  ...    ...       .../..%│ 0.15%    │
│   Folder B  ...    ...       .../..%│ DIV.YIELD│
│   Cash ILS  ...           1.16%     │          │
│   Cash USD  ...           0.10%     └──────────┤
│                                     │ Donut    │
│                                     │ Chart    │
│                                     │ 72.93%   │
└─────────────────────────────────────┴──────────┘
```

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

### `/folders/[...path]` — Folder View

Same layout as Home, but scoped to a specific folder.
URL examples:
- `/folders/ישראל`
- `/folders/ישראל/מדדים`

---

### `/tickers/[symbol]` — Holding Detail

**Purpose:** Deep dive into a single security.

**Layout:**
```
┌──────────────────┬──────────────────────────────────┐
│ [Ticker Name]    │                                  │
│ Back             │  Price Chart (1Y, full width)    │
│                  │                                  │
│ Last Closing: X  │                                  │
│ Return (Unreal): │                                  │
│ Total Return:    ├──────────────────────────────────┤
│ Value: ₪X        │ Lots                             │
│                  │ Date  Shares  Cost  Portfolio  Folder│
│ Unrealized:      │ ...                              │
│ Realized:        │ [+ Add new lot]    [Delete All]  │
│ Cost Basis:      │                                  │
│ Shares:          │                                  │
│ Avg Cost/share:  │                                  │
│ Total Proceeds:  │                                  │
│ Expense Ratio:   │                                  │
│                  │                                  │
│ [Link: Bizportal]│                                  │
│ X.XX% of portf.  │                                  │
└──────────────────┴──────────────────────────────────┘
```

**Interactions:**
- Click on a lot date → open edit lot modal
- [+ Add new lot] → inline form: date, shares, cost, portfolio, folder
- [$ icon] → record a sell on this lot
- [🗑 icon] → delete lot (with confirmation)
- [Delete All] → delete all lots

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

**Purpose:** Full history of all transactions.

**Layout:**
```
┌── Summary ────────┬── Accounts Activity ─────────────────────────┐
│ Securities        │ [2026▼] [Actions: All▼]                        │
│ # Buys: 4         │                                                 │
│ # Sells: 1        │ ┌─Donut 1──┐  ┌─Donut 2──┐  ┌─Donut 3───┐   │
│ Sum Buys: ₪14,815 │ │₪18,805   │  │-₪4,122   │  │₪90        │   │
│ Sum Sells: ₪4,122 │ │Net Inflow│  │Outflow   │  │Dividends  │   │
│ Net Inflow: ₪10,693│ │by Folder │  │by Folder │  │by Folder  │   │
│ Realized: ₪2,477  │ └──────────┘  └──────────┘  └───────────┘   │
│                   ├────────────────────────────────────────────────┤
│ Assets & Cash     │ Activity Log                                    │
│ # Transactions: 2 │ Date      Action          Holding        Amt   │
│ Net Inflow: ₪3,990│ Apr 9     Dividend 💵     VICI           $10   │
│                   │           22 shares × $0.45              │
│ Dividends         │ Jan 14    Security Bought 💸 ETOR        $1,752│
│ # Distributions: 9│           56 shares × 31.28              │
│ Total Collected:  │ Jan 14    Security Sold 🛒  604611       ₪4,122│
│ Post-Tax:         │           Realized: ₪2,477               │
└───────────────────┴────────────────────────────────────────────────┘
```

**Filters:**
- Year: 2023 | 2024 | 2025 | 2026 | Custom
- Action types: All | Security Bought | Security Sold | Asset Deposit | Asset Withdrawal | Dividend

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

### Performance Chart
```typescript
interface PerformanceChartProps {
  data: Array<{ date: Date; index: number }>
  benchmarks?: {
    sp500?: Array<{ date: Date; index: number }>
    msciAcwi?: Array<{ date: Date; index: number }>
  }
  timeRange: '3M' | '6M' | '9M' | '1Y' | 'ALL'
  isSimulated: boolean
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
