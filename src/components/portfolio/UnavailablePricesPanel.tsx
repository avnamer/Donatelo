'use client'

import { useState } from 'react'
import { WifiOff, RefreshCw, ChevronDown, ChevronUp } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { HoldingMetrics } from '@/hooks/usePortfolio'

interface UnavailablePricesPanelProps {
  holdings: HoldingMetrics[]
  onRefresh: () => Promise<void>
}

export function UnavailablePricesPanel({ holdings, onRefresh }: UnavailablePricesPanelProps) {
  const [expanded, setExpanded] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null)

  if (holdings.length === 0) return null

  async function handleRefresh() {
    setRefreshing(true)
    try {
      await onRefresh()
      setLastRefreshed(new Date())
    } finally {
      setRefreshing(false)
    }
  }

  return (
    <div className="rounded-xl border bg-card overflow-hidden">
      {/* Header row */}
      <button
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/30 transition-colors"
        onClick={() => setExpanded((v) => !v)}
      >
        <div className="flex items-center gap-2">
          <WifiOff className="h-4 w-4 text-amber-500" />
          <span className="text-sm font-semibold">
            Securities without automatic pricing
          </span>
          <span className="rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400 text-xs font-semibold px-2 py-0.5">
            {holdings.length}
          </span>
        </div>
        <div className="flex items-center gap-3">
          {lastRefreshed && (
            <span className="text-xs text-muted-foreground">
              Last refresh: {lastRefreshed.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
          <button
            onClick={(e) => { e.stopPropagation(); handleRefresh() }}
            disabled={refreshing}
            className={cn(
              'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
              'bg-primary/10 text-primary hover:bg-primary/20',
              refreshing && 'opacity-60 cursor-not-allowed'
            )}
          >
            <RefreshCw className={cn('h-3 w-3', refreshing && 'animate-spin')} />
            {refreshing ? 'Updating…' : 'Update All'}
          </button>
          {expanded
            ? <ChevronUp className="h-4 w-4 text-muted-foreground" />
            : <ChevronDown className="h-4 w-4 text-muted-foreground" />
          }
        </div>
      </button>

      {/* Collapsed hint */}
      {!expanded && (
        <div className="px-4 pb-3 text-xs text-muted-foreground">
          {holdings.map((h) => h.name).join(' · ')}
        </div>
      )}

      {/* Expanded table */}
      {expanded && (
        <div className="border-t">
          <table className="w-full">
            <thead>
              <tr className="border-b bg-muted/30">
                <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wide">Security</th>
                <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wide">Ticker</th>
                <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wide">Exchange</th>
                <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wide">Folder</th>
                <th className="text-right px-4 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wide">Shares</th>
                <th className="text-right px-4 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wide">Status</th>
              </tr>
            </thead>
            <tbody>
              {holdings.map((h) => (
                <tr key={h.holdingId} className="border-b last:border-0 hover:bg-muted/20 transition-colors">
                  <td className="px-4 py-2.5 text-sm font-medium">{h.name}</td>
                  <td className="px-4 py-2.5 text-sm font-mono text-muted-foreground">{h.tickerSymbol}</td>
                  <td className="px-4 py-2.5 text-sm text-muted-foreground">{h.exchange}</td>
                  <td className="px-4 py-2.5 text-sm text-muted-foreground">
                    <div className="flex items-center gap-1.5">
                      {h.folderColor && (
                        <span
                          className="w-2 h-2 rounded-full flex-shrink-0"
                          style={{ backgroundColor: h.folderColor }}
                        />
                      )}
                      {h.folderName}
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-sm text-right tabular-nums text-muted-foreground">
                    {h.activeShares}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 text-xs px-2 py-0.5 font-medium">
                      <WifiOff className="h-3 w-3" />
                      No price data
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="px-4 py-2.5 bg-muted/20 border-t text-xs text-muted-foreground">
            These securities are not available on Yahoo Finance or Polygon. Prices cannot be fetched automatically.
            You can try refreshing to check if data has become available.
          </div>
        </div>
      )}
    </div>
  )
}
