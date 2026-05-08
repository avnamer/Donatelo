# Product Requirements Document (PRD)

## Product Name
**Investment Tracker** (working title — replacing Donatello)

## Vision
A personal investment portfolio tracker for Israeli retail investors.
Tracks Israeli and US securities in one place, with intelligent tools for
rebalancing, dividend monitoring, and in the future — AI-powered insights.

## Target User
Israeli individual investor who:
- Holds both Israeli (TASE) and US securities
- Uses multiple account types (regular, קרן השתלמות, פנסיה, etc.)
- Wants to manage target allocations and rebalance periodically
- Tracks dividends
- Currently uses Donatello (which is closing)

---

## Feature List

### Must Have (Phase 1 + 2)

#### Portfolio Structure
- [ ] Create/rename/delete **folders** (unlimited nesting)
- [ ] Add **holdings** to folders: stocks, ETFs, mutual funds (Israeli + US)
- [ ] Add **lots** per holding: date, shares, cost per share, account type
- [ ] Mark lots as sold (partial or full sell)
- [ ] Add **cash accounts** (ILS and USD)
- [ ] Add **fixed assets** (real estate, etc.) — manual value
- [ ] Drag & drop to move items between folders
- [ ] **Breadcrumb navigation** through folder tree

#### Home Dashboard
- [ ] Portfolio performance **indexed chart** (normalized to 100)
  - Time ranges: 3M, 6M, 9M, 1Y, All
  - Compare to: S&P 500, MSCI ACWI
- [ ] KPI panel: Total Value, Return %, Gain (₪), Expense Ratio, Dividend Yield
- [ ] Holdings table with columns: Name, Value, Gain/Return, Actual%/Target%
- [ ] **Donut chart** showing allocation breakdown (right panel)
- [ ] Drill down into folders — same layout per folder level

#### Individual Holding Page
- [ ] Price chart (1Y default)
- [ ] Stats: Last Price, Return (Unrealized), Total Return, Value
- [ ] Stats: Unrealized Gains, Realized Gains, Cost Basis, Shares, Avg Cost, Total Proceeds, Expense Ratio
- [ ] **Lots table**: Date, Shares, Cost, Account, Folder
- [ ] Add/delete lots inline
- [ ] Link to external source (Bizportal for IL, TradingView for US)

#### Target Allocations
- [ ] Set target % per folder
- [ ] Visual: current % vs target % (donut with both rings)
- [ ] Warning badge when portfolio is significantly off-target
- [ ] Total target must equal 100% (validation)

#### Auto-Invest (Invest Page)
- [ ] Enter amount of new funds
- [ ] System calculates suggested buys per folder/holding
- [ ] Logic: bring most-underweight assets toward target first
- [ ] Optional: fractional shares toggle
- [ ] Shows suggested transactions table with symbol, name, cost

#### Dividends Page
- [ ] Annual summary: paying assets count, cost basis, yield TTM, yield on cost, trailing income, monthly avg, YoY growth
- [ ] Bar chart: quarterly/monthly/yearly breakdown
- [ ] Toggle: by folder / by asset / no breakdown
- [ ] **Recent & Upcoming dividends table**: declare date, ex-date, payout date, per-share amount, eligible shares, total paid
- [ ] Date picker for start date
- [ ] Projected tax % input
- [ ] Toggle: ignore purchase dates (treat all shares as eligible)

#### Activity Log
- [ ] Summary panel: buys, sells, dividends, cash flows
- [ ] Year filter + action type filter
- [ ] Three donut charts: net inflows by folder, net outflows by folder, dividends by folder
- [ ] Full activity log table: date, type emoji, holding, amount
- [ ] Transaction types: Security Bought 💸, Security Sold 🛒, Asset Deposit 🏦, Asset Withdrawal 🏧, Dividend 💵

#### Explore / Templates
- [ ] Public portfolio profiles with descriptions
- [ ] Click to view allocation breakdown
- [ ] "Use as template" to copy allocations to your portfolio

#### Import / Export
- [ ] Import from CSV (Donatello export format)
- [ ] Export to CSV
- [ ] Export to JSON (full backup)

---

### Should Have (Phase 3)

#### AI Agents Layer
- [ ] **Portfolio Analyzer** — explains current state, flags issues
- [ ] **Rebalancing Advisor** — suggests trades to reach target allocations
- [ ] **Dividend Insights** — trends, projections, coverage
- [ ] **Market Research** — on-demand info about holdings
- [ ] Chat interface in sidebar or floating panel
- [ ] Agents can read portfolio data (via tools) but cannot execute trades

#### Visualize Page
- [ ] Treemap: portfolio by value
- [ ] Bubble chart: return vs size
- [ ] Geographic allocation map
- [ ] Sector/industry breakdown

#### Advanced Calculations
- [ ] XIRR (internal rate of return accounting for timing of cash flows)
- [ ] Benchmark-relative return (alpha vs S&P 500)
- [ ] Sharpe ratio (where data available)

---

### Nice to Have (Phase 4)

- [ ] Price alerts (email/push when asset hits target)
- [ ] Tax report generation (capital gains summary)
- [ ] Mobile-responsive layout
- [ ] Dark mode
- [ ] Multiple portfolios per user
- [ ] Shared portfolio view (read-only link)
- [ ] Automatic import from broker (IBI, Meitav, eToro, etc.)

---

## Non-Goals (explicitly out of scope)
- Actual trade execution (this is NOT a broker)
- Real-time prices (uses previous day close, like Donatello)
- Crypto exchange integration (manual entry only for now)
- Tax advice

---

## Data Sources
| Data | Source | Notes |
|---|---|---|
| US stock prices (current + history) | Polygon.io | REST API, previous day close |
| US dividends | Polygon.io | `/v3/reference/dividends` |
| US stock splits | Polygon.io | `/v3/reference/splits` |
| Israeli securities | TASE DataWise API | Our existing integration |
| Currency rates (USD/ILS) | FreeCurrencyAPI or ECB | Cached daily |
| Benchmark data (S&P 500, MSCI) | Polygon.io | GSPC, ACWI tickers |

---

## Success Metrics
- User can import their Donatello data in < 5 minutes
- Portfolio loads in < 2 seconds
- All calculations match Donatello's output for same data
- AI agent gives useful portfolio insight in < 10 seconds
