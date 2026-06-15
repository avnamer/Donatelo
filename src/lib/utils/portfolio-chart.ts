// ─────────────────────────────────────────────
// Portfolio chart utilities
//
// The chart shows a SIMPLE-RETURN index:
//
//   index(t) = 100 × V(t) / cost(t)
//
// Where:
//   V(t)    = total market value of holdings that have price data on date t
//   cost(t) = total cost basis of those same holdings (same set, same date)
//
// The final index value closely tracks the portfolio's RETURN KPI
// (unrealised gain / cost basis of active positions). The small residual
// gap comes from realized gains in RETURN but not in the chart.
// ─────────────────────────────────────────────

import type { HoldingMetrics } from '@/hooks/usePortfolio'
import type { DailySeriesMap } from '@/hooks/useDailySeries'
import type { Lot } from '@/types'

// ─── Helpers ─────────────────────────────────

function lotSharesOnDate(lot: Lot, date: Date): number {
  if (new Date(lot.purchaseDate) > date) return 0
  if (lot.soldDate && new Date(lot.soldDate) <= date) {
    // After the sale: remaining shares stay in the portfolio (0 for full sales).
    return lot.shares - Number(lot.soldShares)
  }
  return lot.shares
}

function buildFillForwardLookup(
  points: { date: string; close: number }[],
): (iso: string) => number | null {
  const sorted = [...points].sort((a, b) => a.date.localeCompare(b.date))
  return (iso: string) => {
    let last: number | null = null
    for (const p of sorted) {
      if (p.date <= iso) last = p.close
      else break
    }
    return last
  }
}

function toPortfolioCents(
  cents: number,
  sourceCurrency: 'ILS' | 'USD',
  portfolioCurrency: 'ILS' | 'USD',
  fxRate: number,
): number {
  if (sourceCurrency === portfolioCurrency) return cents
  if (sourceCurrency === 'ILS' && portfolioCurrency === 'USD') return cents / fxRate
  return cents * fxRate
}

function nativeCents(exchange: string, shares: number, close: number): number {
  return exchange === 'TASE' ? shares * close : shares * close * 100
}

// ─── Main export ─────────────────────────────

export interface PerformancePoint {
  date: Date
  index: number
}

/**
 * Build a daily simple-return performance index: index(t) = 100 × V(t)/cost(t).
 * The final value closely tracks the portfolio's RETURN KPI.
 */
export function buildIndexedPerformance(
  holdingMetrics: HoldingMetrics[],
  seriesMap: DailySeriesMap,
  fxRate: number,
  currency: 'ILS' | 'USD',
  fromDate: Date,
  skipRebase = false,
): PerformancePoint[] {
  const dateSet = new Set<string>()
  for (const points of Object.values(seriesMap)) {
    for (const p of points) dateSet.add(p.date)
  }
  if (dateSet.size === 0) return []

  const sortedDates = Array.from(dateSet).sort()

  const fillLookup = new Map<string, (iso: string) => number | null>()
  for (const [symbol, points] of Object.entries(seriesMap)) {
    fillLookup.set(symbol, buildFillForwardLookup(points))
  }

  // Compute V (market value) and cost basis for the given date.
  // V  = only holdings that have price data (we can't value what we can't price).
  // cost = ALL active lots regardless of price availability, so that holdings
  //        without price data don't inflate the V/cost ratio — their capital
  //        is still part of the denominator even though their value is unknown.
  function valueAndCost(iso: string): { V: number; cost: number } {
    const date = new Date(iso)
    let V = 0
    let cost = 0
    for (const holding of holdingMetrics) {
      const close = fillLookup.get(holding.tickerSymbol)?.(iso)
      for (const lot of holding.lots) {
        const activeShares = lotSharesOnDate(lot, date)
        if (activeShares <= 0) continue
        const costNative = activeShares * Number(lot.costPerShare)
        if (holding.exchange === 'TASE') {
          cost += toPortfolioCents(costNative, 'ILS', currency, fxRate)
        } else {
          cost += toPortfolioCents(costNative, 'USD', currency, fxRate)
        }
        if (close != null && close > 0) {
          const valNative = nativeCents(holding.exchange, activeShares, close)
          if (holding.exchange === 'TASE') {
            V += toPortfolioCents(valNative, 'ILS', currency, fxRate)
          } else {
            V += toPortfolioCents(valNative, 'USD', currency, fxRate)
          }
        }
      }
    }
    return { V, cost }
  }

  const fromIso = fromDate.toISOString().slice(0, 10)
  const filteredDates = sortedDates.filter((iso) => iso >= fromIso)

  const result: PerformancePoint[] = []

  for (const iso of filteredDates) {
    const { V, cost } = valueAndCost(iso)
    if (V <= 0 || cost <= 0) continue
    result.push({ date: new Date(iso), index: 100 * V / cost })
  }

  // Re-base to 100 at the start of the period only for mid-history ranges.
  // For inception periods (ALL, or any range clamped to the first lot date)
  // V(t)/cost(t) × 100 already gives the correct absolute return vs cost.
  //
  // Also skip rebase when the first valid data point is far after fromDate
  // (> 90 days): this means the portfolio had no meaningful price data at the
  // period start (e.g., early numeric TASE lots with no daily-series history),
  // so rebasing at that point would produce wildly inflated returns.
  const firstDate = result.length > 0 ? result[0].date : null
  const daysFromCutoff = firstDate
    ? (firstDate.getTime() - fromDate.getTime()) / (24 * 60 * 60 * 1000)
    : 0

  // Also skip rebase when the portfolio was already in loss at period start
  // (base V/cost < 100): rebasing against a loss baseline produces artificially
  // inflated "period returns" that don't match the portfolio's actual performance.
  const baseIndex = result.length > 0 ? result[0].index : 100
  const effectiveSkipRebase = skipRebase || daysFromCutoff > 90 || baseIndex < 100

  if (!effectiveSkipRebase && result.length > 0) {
    for (const point of result) {
      point.index = (point.index / baseIndex) * 100
    }
  }

  return result
}

