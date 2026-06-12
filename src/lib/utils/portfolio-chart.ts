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

  // Compute V (market value) and cost basis for holdings with price data on iso.
  function valueAndCost(iso: string): { V: number; cost: number } {
    const date = new Date(iso)
    let V = 0
    let cost = 0
    for (const holding of holdingMetrics) {
      const close = fillLookup.get(holding.tickerSymbol)?.(iso)
      if (close == null || close <= 0) continue
      for (const lot of holding.lots) {
        const activeShares = lotSharesOnDate(lot, date)
        if (activeShares <= 0) continue
        const valNative = nativeCents(holding.exchange, activeShares, close)
        const costNative = activeShares * Number(lot.costPerShare)
        if (holding.exchange === 'TASE') {
          V += toPortfolioCents(valNative, 'ILS', currency, fxRate)
          cost += toPortfolioCents(costNative, 'ILS', currency, fxRate)
        } else {
          V += toPortfolioCents(valNative, 'USD', currency, fxRate)
          cost += toPortfolioCents(costNative, 'USD', currency, fxRate)
        }
      }
    }
    return { V, cost }
  }

  const result: PerformancePoint[] = []

  for (const iso of sortedDates) {
    const { V, cost } = valueAndCost(iso)
    if (V <= 0 || cost <= 0) continue
    result.push({ date: new Date(iso), index: 100 * V / cost })
  }

  return result
}

