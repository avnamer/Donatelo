'use client'

import { useState, useEffect } from 'react'
import { AlertTriangle, X, RefreshCw, ChevronDown, ChevronUp } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { HoldingMetrics } from '@/hooks/usePortfolio'

const LAST_REFRESH_KEY = 'stale-prices-last-refresh'

interface StalePricesBannerProps {
  unavailableHoldings: HoldingMetrics[]
  onRefresh: () => Promise<void>
  loading?: boolean
}

export function StalePricesBanner({ unavailableHoldings, onRefresh, loading }: StalePricesBannerProps) {
  const [dismissed, setDismissed] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null)

  useEffect(() => {
    const stored = localStorage.getItem(LAST_REFRESH_KEY)
    if (stored) setLastRefresh(new Date(stored))
  }, [])

  if (dismissed || loading || unavailableHoldings.length === 0) return null

  const count = unavailableHoldings.length

  const lastRefreshLabel = lastRefresh
    ? `Last refresh: ${lastRefresh.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · ${lastRefresh.toLocaleDateString()}`
    : null

  async function handleRefresh() {
    setRefreshing(true)
    try {
      await onRefresh()
      const now = new Date()
      setLastRefresh(now)
      localStorage.setItem(LAST_REFRESH_KEY, now.toISOString())
    } finally {
      setRefreshing(false)
    }
  }

  return (
    <div className={cn(
      'rounded-xl border border-amber-500/30 bg-amber-500/8 text-sm overflow-hidden'
    )}>
      {/* Header row */}
      <div className="flex items-start gap-3 px-4 py-3">
        <AlertTriangle className="h-4 w-4 mt-0.5 text-amber-500 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="font-medium text-amber-600 dark:text-amber-400">
            {count} {count === 1 ? 'security has' : 'securities have'} no price data — value shown as ₪0
          </p>
          {lastRefreshLabel && (
            <p className="text-muted-foreground text-xs mt-0.5">{lastRefreshLabel}</p>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className={cn(
              'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
              'bg-amber-500/15 text-amber-700 dark:text-amber-300 hover:bg-amber-500/25',
              refreshing && 'opacity-60 cursor-not-allowed'
            )}
          >
            <RefreshCw className={cn('h-3.5 w-3.5', refreshing && 'animate-spin')} />
            {refreshing ? 'Refreshing…' : 'Retry'}
          </button>
          <button
            onClick={() => setExpanded((v) => !v)}
            className="rounded p-1 hover:bg-amber-500/10 transition-colors"
            aria-label={expanded ? 'Collapse' : 'Show affected securities'}
          >
            {expanded
              ? <ChevronUp className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
              : <ChevronDown className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
            }
          </button>
          <button
            onClick={() => setDismissed(true)}
            className="rounded p-1 hover:bg-muted transition-colors"
            aria-label="Dismiss"
          >
            <X className="h-3.5 w-3.5 text-muted-foreground" />
          </button>
        </div>
      </div>

      {/* Expandable detail list */}
      {expanded && (
        <div className="border-t border-amber-500/20 divide-y divide-amber-500/10">
          {unavailableHoldings.map((h) => (
            <div key={h.holdingId} className="flex items-center justify-between px-4 py-2 gap-4">
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{h.name}</p>
                <p className="text-xs text-muted-foreground font-mono">{h.tickerSymbol} · {h.exchange}</p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-xs text-muted-foreground">{h.activeShares} units</p>
                <p className="text-xs text-amber-600 dark:text-amber-400 font-medium">Price unavailable</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
