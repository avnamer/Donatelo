'use client'

// ─────────────────────────────────────────────
// MarketMovers — three side-by-side boxes showing
// top-10 performers for Israel, US, and International ETFs
// ─────────────────────────────────────────────

import { cn } from '@/lib/utils'
import type { TimeRange } from '@/store/ui'
import type { Mover } from '@/app/api/market-movers/route'

// ─── MoverBox ─────────────────────────────────

interface MoverBoxProps {
  flag: string
  market: string
  period: TimeRange
  movers: Mover[]
  loading: boolean
  accentColor: string
  borderColor: string
  bgColor: string
}

function MoverBox({ flag, market, period, movers, loading, accentColor, borderColor, bgColor }: MoverBoxProps) {
  return (
    <div className={cn('flex-1 rounded-xl border p-4', borderColor, bgColor)}>
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <span className={cn('text-sm font-semibold', accentColor)}>
          {flag} {market}
        </span>
        <span className="text-xs text-muted-foreground">TOP 10 · {period}</span>
      </div>

      {/* Rows */}
      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="h-4 animate-pulse rounded bg-muted" />
          ))}
        </div>
      ) : movers.length === 0 ? (
        <p className="text-xs text-muted-foreground text-center py-4">No data available</p>
      ) : (
        <ol className="space-y-1.5">
          {movers.map(({ ticker, returnPct }) => (
            <li key={ticker} className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground font-mono">{ticker}</span>
              <span className={cn(
                'text-xs font-semibold tabular-nums',
                returnPct >= 0 ? 'text-gain' : 'text-loss',
              )}>
                {returnPct >= 0 ? '+' : ''}{returnPct.toFixed(2)}%
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}

// ─── MarketMovers ─────────────────────────────

interface MarketMoversProps {
  israel:  Mover[]
  us:      Mover[]
  etf:     Mover[]
  loading: boolean
  period:  TimeRange
}

export function MarketMovers({ israel, us, etf, loading, period }: MarketMoversProps) {
  return (
    <div className="flex flex-col lg:flex-row gap-4">
      <MoverBox
        flag="🇮🇱"
        market="ישראל"
        period={period}
        movers={israel}
        loading={loading}
        accentColor="text-emerald-400"
        borderColor="border-emerald-500/20"
        bgColor="bg-emerald-950/20"
      />
      <MoverBox
        flag="🇺🇸"
        market='ארה"ב'
        period={period}
        movers={us}
        loading={loading}
        accentColor="text-blue-400"
        borderColor="border-blue-500/20"
        bgColor="bg-blue-950/20"
      />
      <MoverBox
        flag="🌍"
        market="ETF בינלאומי"
        period={period}
        movers={etf}
        loading={loading}
        accentColor="text-violet-400"
        borderColor="border-violet-500/20"
        bgColor="bg-violet-950/20"
      />
    </div>
  )
}
