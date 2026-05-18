// ─────────────────────────────────────────────
// Financial Calculations Engine
// All formulas from docs/CALCULATIONS.md
// Verified against Donatello's actual output
// ─────────────────────────────────────────────

import Decimal from 'decimal.js'
import type { Lot, FxRate, AutoInvestSuggestion } from '@/types'

// Configure Decimal for financial precision
Decimal.set({ precision: 20, rounding: Decimal.ROUND_HALF_UP })

// ─── Helpers ─────────────────────────────────

/** Convert bigint agorot/cents to display number */
export function toDisplay(value: bigint): number {
  return Number(value) / 100
}

/** Convert display number to bigint agorot/cents */
export function toStorage(value: number): bigint {
  return BigInt(Math.round(value * 100))
}

/** Apply FX rate: convert amount from one currency to another */
export function applyFxRate(
  amount: bigint,
  rate: number,
  invert = false
): bigint {
  const r = invert ? 1 / rate : rate
  return BigInt(Math.round(Number(amount) * r))
}

// ─── 1. Current Value ────────────────────────

/**
 * Calculate current value of a holding.
 * price and return value are both in agorot/cents of their respective currencies.
 * If currencies differ, convert using fxRate (USD→ILS by default).
 */
export function calcCurrentValue(
  activeShares: number,
  currentPrice: bigint,     // in priceCurrency units
  priceCurrency: 'ILS' | 'USD',
  baseCurrency: 'ILS' | 'USD',
  fxRateUsdToIls: number    // e.g. 3.72
): bigint {
  const rawValue = BigInt(Math.round(activeShares * Number(currentPrice)))

  if (priceCurrency === baseCurrency) return rawValue

  // Convert USD → ILS
  if (priceCurrency === 'USD' && baseCurrency === 'ILS') {
    return applyFxRate(rawValue, fxRateUsdToIls)
  }
  // Convert ILS → USD (rare)
  if (priceCurrency === 'ILS' && baseCurrency === 'USD') {
    return applyFxRate(rawValue, fxRateUsdToIls, true)
  }

  return rawValue
}

// ─── 2. Cost Basis ───────────────────────────

/**
 * Cost basis of currently-held shares (excludes sold shares).
 * Returns value in baseCurrency (converted at current FX rate).
 */
export function calcCostBasis(
  lots: Lot[],
  baseCurrency: 'ILS' | 'USD',
  fxRateUsdToIls: number
): bigint {
  let total = BigInt(0)

  for (const lot of lots) {
    const activeShares = lot.shares - lot.soldShares
    if (activeShares <= 0) continue

    const lotCost = BigInt(Math.round(activeShares * Number(lot.costPerShare)))

    if (lot.costCurrency === baseCurrency) {
      total += lotCost
    } else if (lot.costCurrency === 'USD' && baseCurrency === 'ILS') {
      total += applyFxRate(lotCost, fxRateUsdToIls)
    } else if (lot.costCurrency === 'ILS' && baseCurrency === 'USD') {
      total += applyFxRate(lotCost, fxRateUsdToIls, true)
    }
  }

  return total
}

// ─── 3. Unrealized Gains ─────────────────────

export function calcUnrealizedGains(
  currentValue: bigint,
  costBasis: bigint
): bigint {
  return currentValue - costBasis
}

/**
 * Unrealized return as percentage.
 * Example: (41776 - 19245) / 19245 × 100 = 117.08%
 */
export function calcUnrealizedReturnPct(
  unrealizedGains: bigint,
  costBasis: bigint
): number {
  if (costBasis === BigInt(0)) return 0
  return new Decimal(unrealizedGains.toString())
    .div(costBasis.toString())
    .mul(100)
    .toNumber()
}

// ─── 4. Realized Gains ──────────────────────

export function calcRealizedGains(lots: Lot[]): bigint {
  let total = BigInt(0)
  for (const lot of lots) {
    if (lot.proceedsFromSale && lot.soldShares > 0) {
      const soldCost = BigInt(Math.round(lot.soldShares * Number(lot.costPerShare)))
      total += lot.proceedsFromSale - soldCost
    }
  }
  return total
}

// ─── 5. Total Return ─────────────────────────

/**
 * Total return including realized gains from sold positions.
 * total_deployed = ALL lots ever × cost (not just current holdings)
 * Verified: 75.89% example from CALCULATIONS.md
 */
export function calcTotalDeployed(
  lots: Lot[],
  baseCurrency: 'ILS' | 'USD',
  fxRateUsdToIls: number
): bigint {
  let total = BigInt(0)
  for (const lot of lots) {
    const fullCost = BigInt(Math.round(lot.shares * Number(lot.costPerShare)))

    if (lot.costCurrency === baseCurrency) {
      total += fullCost
    } else if (lot.costCurrency === 'USD' && baseCurrency === 'ILS') {
      total += applyFxRate(fullCost, fxRateUsdToIls)
    } else {
      total += applyFxRate(fullCost, fxRateUsdToIls, true)
    }
  }
  return total
}

export function calcTotalReturnPct(
  unrealizedGains: bigint,
  realizedGains: bigint,
  totalDeployed: bigint
): number {
  if (totalDeployed === BigInt(0)) return 0
  const totalPnl = unrealizedGains + realizedGains
  return new Decimal(totalPnl.toString())
    .div(totalDeployed.toString())
    .mul(100)
    .toNumber()
}

// ─── 6. Allocation ──────────────────────────

export function calcActualAllocationPct(
  itemValue: bigint,
  totalPortfolioValue: bigint
): number {
  if (totalPortfolioValue === BigInt(0)) return 0
  return new Decimal(itemValue.toString())
    .div(totalPortfolioValue.toString())
    .mul(100)
    .toNumber()
}

// ─── 7. Expense Ratio ────────────────────────

export function calcWeightedExpenseRatio(
  items: Array<{ value: bigint; expenseRatio: number | null }>
): number {
  const totalValue = items.reduce((sum, i) => sum + i.value, BigInt(0))
  if (totalValue === BigInt(0)) return 0

  let weightedSum = new Decimal(0)
  for (const item of items) {
    if (item.expenseRatio == null) continue
    const weight = new Decimal(item.value.toString()).div(totalValue.toString())
    weightedSum = weightedSum.add(weight.mul(item.expenseRatio))
  }

  return weightedSum.toNumber()
}

// ─── 8. Dividend Yield ───────────────────────

export function calcDividendYield(
  trailingYearDividends: bigint,
  currentValue: bigint
): number {
  if (currentValue === BigInt(0)) return 0
  return new Decimal(trailingYearDividends.toString())
    .div(currentValue.toString())
    .mul(100)
    .toNumber()
}

export function calcYieldOnCost(
  trailingYearDividends: bigint,
  costBasis: bigint
): number {
  if (costBasis === BigInt(0)) return 0
  return new Decimal(trailingYearDividends.toString())
    .div(costBasis.toString())
    .mul(100)
    .toNumber()
}

// ─── 9. Auto-Invest Algorithm ────────────────

interface FolderTarget {
  id: string
  name: string
  currentValue: bigint
  targetPct: number
  holdings?: HoldingTarget[]
}

interface HoldingTarget {
  holdingId: string
  tickerSymbol: string
  holdingName: string
  currentValue: bigint
  targetPct: number  // within folder
  currentPrice: bigint
}

export function calcAutoInvest(
  folders: FolderTarget[],
  totalCurrentValue: bigint,
  amountToInvest: bigint,
  allowFractional: boolean
): AutoInvestSuggestion[] {
  const newTotal = totalCurrentValue + amountToInvest
  const suggestions: AutoInvestSuggestion[] = []

  for (const folder of folders) {
    if (!folder.holdings || folder.targetPct === 0) continue

    const folderTargetValue = BigInt(Math.round(Number(newTotal) * folder.targetPct / 100))
    const folderShortfall = folderTargetValue - folder.currentValue

    if (folderShortfall <= BigInt(0)) continue

    // Distribute shortfall among holdings
    const holdingsTotalTarget = folder.holdings.reduce((s, h) => s + h.targetPct, 0)

    for (const holding of folder.holdings) {
      if (holding.currentPrice === BigInt(0)) continue

      const holdingShare = holdingsTotalTarget > 0 ? holding.targetPct / holdingsTotalTarget : 0
      const holdingAmount = BigInt(Math.round(Number(folderShortfall) * holdingShare))

      if (holdingAmount <= BigInt(0)) continue

      let suggestedShares = Number(holdingAmount) / Number(holding.currentPrice)
      if (!allowFractional) {
        suggestedShares = Math.floor(suggestedShares)
      } else {
        suggestedShares = Math.round(suggestedShares * 1_000_000) / 1_000_000
      }

      const actualPct = calcActualAllocationPct(holding.currentValue, totalCurrentValue)
      const folderActualPct = calcActualAllocationPct(folder.currentValue, totalCurrentValue)

      suggestions.push({
        holdingId: holding.holdingId,
        tickerSymbol: holding.tickerSymbol,
        holdingName: holding.holdingName,
        folderName: folder.name,
        suggestedAmount: holdingAmount,
        suggestedShares,
        currentPrice: holding.currentPrice,
        actualPct,
        targetPct: folder.targetPct * holdingShare / 100,
        deviation: actualPct - folder.targetPct * holdingShare / 100,
      })
    }
  }

  // Sort by most underweight first
  return suggestions.sort((a, b) => a.deviation - b.deviation)
}

// ─── 10. Performance Index ──────────────────

export function calcIndexedPerformance(
  dailyValues: Array<{ date: Date; value: bigint }>
): Array<{ date: Date; index: number }> {
  if (dailyValues.length === 0) return []

  const startValue = dailyValues[0].value
  if (startValue === BigInt(0)) return dailyValues.map(d => ({ date: d.date, index: 100 }))

  return dailyValues.map(d => ({
    date: d.date,
    index: new Decimal(d.value.toString())
      .div(startValue.toString())
      .mul(100)
      .toNumber(),
  }))
}

// ─── 11. XIRR ───────────────────────────────

export interface XirrCashFlow {
  date: Date
  amount: number  // negative = outflow (purchase), positive = inflow (proceeds/current value)
}

/**
 * Extended IRR: annualised return accounting for the timing of cash flows.
 * Returns the annual rate as a percentage (e.g. 12.5 means 12.5% per year),
 * or null if the calculation doesn't converge or there aren't enough data points.
 *
 * Uses Newton-Raphson iteration to solve:
 *   sum( CF_i / (1+r)^t_i ) = 0
 * where t_i = years from the first cash flow.
 */
export function calcXIRR(cashFlows: XirrCashFlow[]): number | null {
  if (cashFlows.length < 2) return null

  const sorted = [...cashFlows].sort((a, b) => a.date.getTime() - b.date.getTime())
  const t0 = sorted[0].date.getTime()
  const MS_PER_YEAR = 365.25 * 24 * 60 * 60 * 1000
  const years = sorted.map((cf) => (cf.date.getTime() - t0) / MS_PER_YEAR)
  const amounts = sorted.map((cf) => cf.amount)

  function npv(r: number): number {
    return amounts.reduce((sum, cf, i) => sum + cf / Math.pow(1 + r, years[i]), 0)
  }

  function dnpv(r: number): number {
    return amounts.reduce(
      (sum, cf, i) => sum - (years[i] * cf) / Math.pow(1 + r, years[i] + 1),
      0
    )
  }

  let r = 0.1
  for (let iter = 0; iter < 200; iter++) {
    const fr = npv(r)
    const dfr = dnpv(r)
    if (Math.abs(dfr) < 1e-12) break
    const rNew = r - fr / dfr
    if (Math.abs(rNew - r) < 1e-10) return rNew * 100
    r = rNew
    if (r <= -1) return null  // rate can't be below -100%
  }

  return null  // did not converge
}

/**
 * Build XIRR cash flows from portfolio lots + current value.
 * All amounts are in the same currency (already converted by caller).
 */
export function buildXirrCashFlows(
  lots: Lot[],
  currentValue: bigint,
  baseCurrency: 'ILS' | 'USD',
  fxRateUsdToIls: number
): XirrCashFlow[] {
  const flows: XirrCashFlow[] = []

  for (const lot of lots) {
    const purchaseCost = lot.shares * Number(lot.costPerShare)
    const costInBase = lot.costCurrency === baseCurrency
      ? purchaseCost
      : lot.costCurrency === 'USD' && baseCurrency === 'ILS'
        ? purchaseCost * fxRateUsdToIls
        : purchaseCost / fxRateUsdToIls

    flows.push({ date: new Date(lot.purchaseDate), amount: -costInBase / 100 })

    if (lot.soldShares > 0 && lot.proceedsFromSale && lot.soldDate) {
      flows.push({
        date: new Date(lot.soldDate),
        amount: Number(lot.proceedsFromSale) / 100,
      })
    }
  }

  // Current portfolio value as final inflow today
  flows.push({ date: new Date(), amount: Number(currentValue) / 100 })

  return flows
}

// ─── 12. Formatting Helpers ─────────────────

export function formatCurrency(
  value: bigint,
  currency: 'ILS' | 'USD',
  options?: { compact?: boolean; decimals?: number }
): string {
  const num = toDisplay(value)
  const opts: Intl.NumberFormatOptions = {
    style: 'currency',
    currency,
    minimumFractionDigits: options?.decimals ?? 0,
    maximumFractionDigits: options?.decimals ?? 0,
  }
  if (options?.compact && Math.abs(num) >= 1000) {
    opts.notation = 'compact'
  }
  return new Intl.NumberFormat('he-IL', opts).format(num)
}

export function formatPercent(value: number, decimals = 2): string {
  return `${value >= 0 ? '+' : ''}${value.toFixed(decimals)}%`
}
