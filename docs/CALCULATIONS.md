# Financial Calculations

All formulas verified against Donatello's actual output.
All code examples assume values stored as integers (agorot/cents × 100).

---

## 1. Current Value

```
Value = active_shares × current_price
```

**Multi-currency:**
```
If holding.currency == portfolio.base_currency:
  value = shares × price

If holding.currency != portfolio.base_currency:
  value = shares × price × fx_rate(holding.currency → portfolio.base_currency)
```

**Example:**
```
AAPL: 6 shares × $230.00 USD
USD/ILS rate: 3.72
Value in ILS = 6 × 230 × 3.72 = ₪5,140.80
```

---

## 2. Cost Basis

Cost of currently-held shares (excludes sold shares).

```
cost_basis = Σ(lot.active_shares × lot.cost_per_share)
           = Σ((lot.shares - lot.sold_shares) × lot.cost_per_share)
```

**Multi-currency lots:**
If lot purchased in USD but portfolio in ILS, convert using rate at calculation time (not purchase time).
This matches Donatello behavior (uses current FX rate, not historical).

---

## 3. Unrealized Gains

```
unrealized_gains = current_value - cost_basis
unrealized_return_pct = unrealized_gains / cost_basis × 100
```

**Verified example from Donatello:**
```
Ticker: 1150259 (MTF ת"א 90)
Active shares: 695
Cost per share: ₪27.69 (stored as 2769)
Current price: ₪60.11 (stored as 6011)

cost_basis = 695 × 27.69 = ₪19,244.55 ≈ ₪19,245
current_value = 695 × 60.11 = ₪41,776.45 ≈ ₪41,776
unrealized_gains = 41,776 - 19,245 = ₪22,531
unrealized_return_pct = 22,531 / 19,245 × 100 = 117.08% ✓
```

---

## 4. Realized Gains

Profit/loss from shares that were already sold.

```
realized_gains = Σ(lot.proceeds_from_sale - lot.sold_shares × lot.cost_per_share)
```

**Per lot:**
```
lot_realized = proceeds_from_sale - (sold_shares × cost_per_share)
```

---

## 5. Total Return (Money-Weighted)

Accounts for ALL capital deployed, including sold positions.

```
total_deployed = Σ_all_lots(lots.shares × lots.cost_per_share)
              = cost_basis + Σ(sold_shares × cost_per_share)

total_pnl = unrealized_gains + realized_gains
         = (current_value - cost_basis) + realized_gains

total_return_pct = total_pnl / total_deployed × 100
```

**Verified example from Donatello:**
```
Ticker: 1150259
Total lots ever: 695 active + 388 sold = 1083 shares at ₪27.69 each
total_deployed = 1083 × 27.69 = ₪29,978.27

current_value = ₪41,776
proceeds_from_sale (388 shares) = ₪10,969
cost_of_sold = 388 × 27.69 = ₪10,743.72
realized_gains = 10,969 - 10,743.72 = ₪225.28

total_pnl = (41,776 - 19,245) + 225 = ₪22,756
total_return_pct = 22,756 / 29,978 × 100 = 75.91% ≈ 75.89% ✓
```

---

## 6. Folder-Level Aggregations

All metrics roll up from holdings to folders to portfolio.

```
folder_value = Σ(holding_value) + Σ(child_folder_value)
folder_cost_basis = Σ(holding_cost_basis) + Σ(child_folder_cost_basis)
folder_unrealized_gains = folder_value - folder_cost_basis
folder_unrealized_return_pct = folder_unrealized_gains / folder_cost_basis × 100
```

---

## 7. Actual Allocation %

How much of the portfolio a folder currently represents.

```
actual_pct = folder_value / total_portfolio_value × 100
```

**Includes cash accounts in denominator:**
```
total_portfolio_value = Σ(all_folder_values) + Σ(all_cash_account_balances_in_base_currency)
```

---

## 8. Target vs Actual Deviation

```
deviation = actual_pct - target_pct
deviation > 0 → overweight (need to sell or reduce buying)
deviation < 0 → underweight (need to buy)
```

---

## 9. Expense Ratio (Weighted Average)

```
portfolio_expense_ratio = Σ(holding_value × holding.expense_ratio) / total_portfolio_value
```

**Folder level:**
```
folder_expense_ratio = Σ(holding_value × holding.expense_ratio) / folder_value
```

Cash accounts contribute 0% expense ratio.

---

## 10. Auto-Invest Algorithm

Given: amount_to_invest (new cash)

```
Step 1: Calculate target value for each folder
  target_value = (current_portfolio_value + amount_to_invest) × target_pct

Step 2: Calculate shortfall for each folder
  shortfall = target_value - current_folder_value

Step 3: Sort folders by shortfall descending (most underweight first)

Step 4: Allocate new cash to each folder proportional to shortfall
  allocation = (shortfall / Σ(positive_shortfalls)) × amount_to_invest

Step 5: Within each folder, repeat same logic for holdings
  (drill down to individual securities)

Step 6: Convert allocation to shares
  suggested_shares = allocation / current_price
  If fractional_shares_enabled: round to 6 decimal places
  Else: floor to integer
```

---

## 11. Performance Chart (Indexed)

Shows how the portfolio has grown, normalized to 100 at start of period.

```
For each trading day d in [start_date, today]:
  portfolio_value(d) = Σ(holding.shares_on_day(d) × price(d))
  index(d) = portfolio_value(d) / portfolio_value(start_date) × 100
```

**"Simulated performance"** note: chart is reconstructed from lots.
- Before a lot's purchase_date: that holding doesn't exist in the simulation
- After a lot's purchase_date: holding included at historical price

**Benchmark overlay (S&P 500, MSCI ACWI):**
```
benchmark_index(d) = benchmark_price(d) / benchmark_price(start_date) × 100
```
Source: Polygon.io historical OHLC for SPY (S&P 500 proxy) and ACWI.

---

## 12. Dividend Calculations

### Assets Yield TTM
```
assets_yield_ttm = trailing_12m_dividends / current_portfolio_value × 100
```

### Yield On Cost
```
yield_on_cost = trailing_12m_dividends / cost_basis × 100
```

### Trailing Year Income
```
trailing_year_income = Σ(dividends received in last 365 days)
```

Converted to base currency at rate on payment date.

### Monthly Average Income
```
monthly_avg = trailing_year_income / 12
```

### YoY Growth
```
yoy_growth = (this_year_income - last_year_income) / last_year_income × 100
```

### Dividend Eligibility
A lot is eligible for a dividend if:
```
lot.purchase_date < dividend.ex_date
AND lot.shares > 0 on dividend.ex_date
AND (NOT ignore_purchase_dates)
```

### Expected Dividend Income
```
expected = eligible_shares × dividend.amount_per_share
expected_after_tax = expected × (1 - tax_rate / 100)
```

---

## 13. Realized Gain Calculation for Tax

```
For each SELL transaction:
  cost_of_sold = sold_shares × avg_cost_per_share (FIFO or specific lot)
  realized_gain = proceeds - cost_of_sold
  taxable_gain = MAX(0, realized_gain)
```

**FIFO (default):** First purchased lots are sold first.
**Specific lot:** User can choose which lot to sell (shown in lot table).

---

## 14. Key TypeScript Signatures

```typescript
// src/lib/calculations/index.ts

export function calcCurrentValue(
  shares: Decimal,
  price: bigint,           // in agorot/cents
  priceCurrency: 'ILS' | 'USD',
  fxRate: Decimal,         // USD→ILS
  baseCurrency: 'ILS' | 'USD'
): bigint

export function calcCostBasis(lots: Lot[]): bigint

export function calcUnrealizedGains(value: bigint, costBasis: bigint): bigint

export function calcUnrealizedReturnPct(
  unrealizedGains: bigint,
  costBasis: bigint
): Decimal  // e.g. Decimal('75.89')

export function calcTotalReturn(
  unrealizedGains: bigint,
  realizedGains: bigint,
  totalDeployed: bigint
): Decimal

export function calcActualAllocationPct(
  folderValue: bigint,
  totalPortfolioValue: bigint
): Decimal

export function calcExpenseRatio(
  holdings: Array<{ value: bigint; expenseRatio: Decimal }>
): Decimal

export function calcIndexedPerformance(
  dailyValues: Array<{ date: Date; value: bigint }>
): Array<{ date: Date; index: number }>

export function calcAutoInvest(
  folders: FolderWithTarget[],
  amountToInvest: bigint,
  allowFractional: boolean
): AutoInvestSuggestion[]
```

---

## 15. Edge Cases

| Case | Handling |
|---|---|
| Cost basis = 0 (free shares, gift) | Return % = N/A, show value only |
| All shares sold (lot fully sold) | active_shares = 0, excluded from value |
| Negative unrealized gains | Show in red, return % is negative |
| No price available | Show last known price with ⚠️ indicator |
| Currency mismatch | Always convert using latest fx_rate |
| Folder with no holdings | Value = 0, return = N/A |
| Target pct sum ≠ 100% | Show warning on allocations page |
| Future dividends | Mark as "projected" if ex_date > today |
