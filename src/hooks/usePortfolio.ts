// ─────────────────────────────────────────────
// usePortfolio — load portfolio structure + compute metrics
// Combines DB data with live prices and FX rate
// ─────────────────────────────────────────────

'use client'

import { useMemo } from 'react'
import { usePrices } from './usePrices'
import { useFxRate } from './useFxRate'
import { useUIStore } from '@/store/ui'
import {
  calcCurrentValue,
  calcCostBasis,
  calcUnrealizedGains,
  calcUnrealizedReturnPct,
  calcRealizedGains,
  calcTotalDeployed,
  calcTotalReturnPct,
  calcActualAllocationPct,
} from '@/lib/calculations'
import type { Lot } from '@/types'

// ─── Types ────────────────────────────────────

export interface HoldingMetrics {
  holdingId: string
  tickerSymbol: string
  name: string
  exchange: string
  folderId: string
  folderName: string
  folderColor: string | null

  activeShares: number
  currentPrice: bigint
  currentValue: bigint
  costBasis: bigint
  unrealizedGains: bigint
  unrealizedReturnPct: number
  realizedGains: bigint
  totalDeployed: bigint
  totalReturnPct: number
  allocationPct: number

  lots: Lot[]
  priceStale: boolean
}

export interface PortfolioMetrics {
  totalValue: bigint
  totalCostBasis: bigint
  totalUnrealizedGains: bigint
  totalUnrealizedReturnPct: number
  totalRealizedGains: bigint
  totalDeployed: bigint
  totalReturnPct: number
  holdings: HoldingMetrics[]
  pricesLoading: boolean
  pricesError: boolean
}

// ─── Server data type (what the server component fetches) ────

export interface ServerHolding {
  id: string
  tickerSymbol: string
  name: string
  exchange: string
  folderId: string
  folder: {
    name: string
    color: string | null
  }
  lots: Lot[]
}

// ─── Hook ─────────────────────────────────────

export function usePortfolioMetrics(holdings: ServerHolding[]): PortfolioMetrics {
  const currency = useUIStore((s) => s.currency)
  const { data: fxRate = 3.72 } = useFxRate()

  // Build ticker list for price fetching
  const tickers = useMemo(
    () => holdings.map((h) => `${h.tickerSymbol}:${h.exchange === 'TASE' ? 'TASE' : 'US'}`),
    [holdings]
  )

  const { data: prices = {}, isLoading: pricesLoading, isError: pricesError } = usePrices(tickers)

  const metrics = useMemo((): PortfolioMetrics => {
    const holdingMetrics: HoldingMetrics[] = []

    for (const holding of holdings) {
      const tickerKey = holding.tickerSymbol
      const priceEntry = prices[tickerKey]
      const currentPrice = priceEntry?.price ?? 0n
      const priceCurrency = priceEntry?.currency ?? (holding.exchange === 'TASE' ? 'ILS' : 'USD')

      const activeShares = holding.lots.reduce(
        (sum, lot) => sum + lot.shares - lot.soldShares,
        0
      )

      const currentValue = calcCurrentValue(
        activeShares,
        currentPrice,
        priceCurrency as 'ILS' | 'USD',
        currency,
        fxRate
      )

      const costBasis = calcCostBasis(holding.lots, currency, fxRate)
      const unrealizedGains = calcUnrealizedGains(currentValue, costBasis)
      const unrealizedReturnPct = calcUnrealizedReturnPct(unrealizedGains, costBasis)
      const realizedGains = calcRealizedGains(holding.lots)
      const totalDeployed = calcTotalDeployed(holding.lots, currency, fxRate)
      const totalReturnPct = calcTotalReturnPct(unrealizedGains, realizedGains, totalDeployed)

      holdingMetrics.push({
        holdingId: holding.id,
        tickerSymbol: holding.tickerSymbol,
        name: holding.name,
        exchange: holding.exchange,
        folderId: holding.folderId,
        folderName: holding.folder.name,
        folderColor: holding.folder.color,
        activeShares,
        currentPrice,
        currentValue,
        costBasis,
        unrealizedGains,
        unrealizedReturnPct,
        realizedGains,
        totalDeployed,
        totalReturnPct,
        allocationPct: 0,  // computed below after total is known
        lots: holding.lots,
        priceStale: priceEntry?.stale ?? false,
      })
    }

    // Total portfolio value
    const totalValue = holdingMetrics.reduce((s, h) => s + h.currentValue, 0n)
    const totalCostBasis = holdingMetrics.reduce((s, h) => s + h.costBasis, 0n)
    const totalUnrealizedGains = holdingMetrics.reduce((s, h) => s + h.unrealizedGains, 0n)
    const totalRealizedGains = holdingMetrics.reduce((s, h) => s + h.realizedGains, 0n)
    const totalDeployed = holdingMetrics.reduce((s, h) => s + h.totalDeployed, 0n)

    // Backfill allocation %
    for (const h of holdingMetrics) {
      h.allocationPct = calcActualAllocationPct(h.currentValue, totalValue)
    }

    return {
      totalValue,
      totalCostBasis,
      totalUnrealizedGains,
      totalUnrealizedReturnPct: calcUnrealizedReturnPct(totalUnrealizedGains, totalCostBasis),
      totalRealizedGains,
      totalDeployed,
      totalReturnPct: calcTotalReturnPct(totalUnrealizedGains, totalRealizedGains, totalDeployed),
      holdings: holdingMetrics,
      pricesLoading,
      pricesError,
    }
  }, [holdings, prices, currency, fxRate, pricesLoading, pricesError])

  return metrics
}
