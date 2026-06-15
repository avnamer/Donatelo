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
  calcWeightedExpenseRatio,
  calcXIRR,
  buildXirrCashFlows,
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

  // Root folder (parentId = null) — may differ when holding is in a sub-folder
  rootFolderId: string
  rootFolderName: string
  rootFolderColor: string | null

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
  expenseRatio: number | null

  lots: Lot[]
  priceStale: boolean
  priceUnavailable: boolean
}

export interface PortfolioMetrics {
  totalValue: bigint
  totalCostBasis: bigint
  totalUnrealizedGains: bigint
  totalUnrealizedReturnPct: number
  totalRealizedGains: bigint
  totalDeployed: bigint
  totalReturnPct: number
  totalExpenseRatio: number
  xirr: number | null
  lastUpdated: Date | null
  holdings: HoldingMetrics[]
  unavailableHoldings: HoldingMetrics[]
  pricesLoading: boolean
  pricesError: boolean
}

// ─── Server data type ─────────────────────────

export interface ServerHolding {
  id: string
  tickerSymbol: string
  name: string
  exchange: string
  folderId: string
  expenseRatio: number | null
  targetFolderId: string | null
  plannedAmount: number | null
  folder: {
    name: string
    color: string | null
    parentId?: string | null
  }
  lots: Lot[]
}

// ─── Hook ─────────────────────────────────────

export function usePortfolioMetrics(
  holdings: ServerHolding[],
  // Optional: pre-built map of folderId → folder info for root resolution
  folderMap?: Map<string, { name: string; color: string | null; parentId: string | null }>
): PortfolioMetrics {
  const currency = useUIStore((s) => s.currency)
  const { data: fxRate = 3.72 } = useFxRate()

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

      // Resolve root folder: walk up one level if parentId exists
      const directParentId = holding.folder.parentId
      let rootFolderId = holding.folderId
      let rootFolderName = holding.folder.name
      let rootFolderColor = holding.folder.color

      if (directParentId) {
        // This holding is in a sub-folder — root is the parent
        const parentInfo = folderMap?.get(directParentId)
        if (parentInfo) {
          rootFolderId = directParentId
          rootFolderName = parentInfo.name
          rootFolderColor = parentInfo.color
        } else {
          // Fallback: use the parentId as root (name unknown without full folder data)
          rootFolderId = directParentId
          rootFolderName = holding.folder.name  // will be corrected when folderMap is provided
          rootFolderColor = holding.folder.color
        }
      }

      holdingMetrics.push({
        holdingId: holding.id,
        tickerSymbol: holding.tickerSymbol,
        name: holding.name,
        exchange: holding.exchange,
        folderId: holding.folderId,
        folderName: holding.folder.name,
        folderColor: holding.folder.color,
        rootFolderId,
        rootFolderName,
        rootFolderColor,
        activeShares,
        currentPrice,
        currentValue,
        costBasis,
        unrealizedGains,
        unrealizedReturnPct,
        realizedGains,
        totalDeployed,
        totalReturnPct,
        allocationPct: 0,
        expenseRatio: holding.expenseRatio,
        lots: holding.lots,
        priceStale: priceEntry?.stale ?? false,
        priceUnavailable: priceEntry?.unavailable ?? false,
      })
    }

    const totalValue = holdingMetrics.reduce((s, h) => s + h.currentValue, 0n)
    const totalCostBasis = holdingMetrics.reduce((s, h) => s + h.costBasis, 0n)
    const totalUnrealizedGains = holdingMetrics.reduce((s, h) => s + h.unrealizedGains, 0n)
    const totalRealizedGains = holdingMetrics.reduce((s, h) => s + h.realizedGains, 0n)
    const totalDeployed = holdingMetrics.reduce((s, h) => s + h.totalDeployed, 0n)

    for (const h of holdingMetrics) {
      h.allocationPct = calcActualAllocationPct(h.currentValue, totalValue)
    }

    const totalExpenseRatio = calcWeightedExpenseRatio(
      holdingMetrics.map((h) => ({ value: h.currentValue, expenseRatio: h.expenseRatio }))
    )

    // Most recent price date across all holdings
    const priceDates = Object.values(prices)
      .map((p) => new Date(p.date))
      .filter((d) => !isNaN(d.getTime()))
    const lastUpdated = priceDates.length > 0
      ? new Date(Math.max(...priceDates.map((d) => d.getTime())))
      : null

    const unavailableHoldings = holdingMetrics.filter((h) => h.priceUnavailable)

    // XIRR: only compute when prices are loaded and we have value
    const xirrFlows = !pricesLoading && totalValue > 0n
      ? buildXirrCashFlows(
          holdingMetrics.flatMap((h) => h.lots),
          totalValue,
          currency,
          fxRate
        )
      : []
    const xirr = xirrFlows.length >= 2 ? calcXIRR(xirrFlows) : null

    return {
      totalValue,
      totalCostBasis,
      totalUnrealizedGains,
      totalUnrealizedReturnPct: calcUnrealizedReturnPct(totalUnrealizedGains, totalCostBasis),
      totalRealizedGains,
      totalDeployed,
      totalReturnPct: calcTotalReturnPct(totalUnrealizedGains, totalRealizedGains, totalDeployed),
      totalExpenseRatio,
      xirr,
      lastUpdated,
      holdings: holdingMetrics,
      unavailableHoldings,
      pricesLoading,
      pricesError,
    }
  }, [holdings, prices, currency, fxRate, pricesLoading, pricesError, folderMap])

  return metrics
}
