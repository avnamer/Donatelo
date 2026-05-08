'use client'

// ─────────────────────────────────────────────
// VisualizeClient — portfolio visualizations
// Tab: Treemap | Bubble | Sector (Phase 2: more tabs)
//
// Treemap: rectangles sized by value, colored by return %
// Bubble:  size = value, x = return %, y = allocation %
// ─────────────────────────────────────────────

import { useState } from 'react'
import { Treemap, ResponsiveContainer, Tooltip } from 'recharts'
import { usePortfolioMetrics } from '@/hooks/usePortfolio'
import { formatCurrency, formatPercent } from '@/lib/calculations'
import { useUIStore } from '@/store/ui'
import { cn } from '@/lib/utils'
import type { ServerHolding } from '@/hooks/usePortfolio'

// ─── Tabs ─────────────────────────────────────

type Tab = 'treemap' | 'bubble'
const TABS: { id: Tab; label: string }[] = [
  { id: 'treemap', label: 'Treemap' },
  { id: 'bubble', label: 'Bubble' },
]

// ─── Treemap ──────────────────────────────────

function returnColor(pct: number): string {
  if (pct >= 50) return '#22c55e'
  if (pct >= 20) return '#4ade80'
  if (pct >= 5)  return '#86efac'
  if (pct >= 0)  return '#bbf7d0'
  if (pct >= -5) return '#fca5a5'
  if (pct >= -20) return '#f87171'
  return '#ef4444'
}

function TreemapContent(props: {
  x?: number; y?: number; width?: number; height?: number
  name?: string; value?: number; unrealizedReturnPct?: number
}) {
  const { x = 0, y = 0, width = 0, height = 0, name, value, unrealizedReturnPct = 0 } = props
  if (width < 30 || height < 20) return null

  return (
    <g>
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        fill={returnColor(unrealizedReturnPct)}
        stroke="hsl(var(--background))"
        strokeWidth={2}
        rx={4}
      />
      {height > 40 && (
        <text x={x + 8} y={y + 18} fill="#fff" fontSize={12} fontWeight={600} className="drop-shadow">
          {name}
        </text>
      )}
      {height > 55 && (
        <text x={x + 8} y={y + 32} fill="#ffffffcc" fontSize={11}>
          {unrealizedReturnPct >= 0 ? '+' : ''}{unrealizedReturnPct.toFixed(1)}%
        </text>
      )}
    </g>
  )
}

function TreemapView({ holdings }: { holdings: ReturnType<typeof usePortfolioMetrics>['holdings'] }) {
  const currency = useUIStore((s) => s.currency)

  const data = holdings
    .filter((h) => h.currentValue > 0n)
    .map((h) => ({
      name: h.tickerSymbol,
      value: Number(h.currentValue),
      unrealizedReturnPct: h.unrealizedReturnPct,
      currentValue: h.currentValue,
    }))

  if (data.length === 0) {
    return (
      <div className="h-80 flex items-center justify-center text-muted-foreground text-sm">
        No holdings to visualize
      </div>
    )
  }

  return (
    <ResponsiveContainer width="100%" height={400}>
      <Treemap
        data={data}
        dataKey="value"
        content={<TreemapContent />}
      >
        <Tooltip
          content={({ payload }) => {
            if (!payload?.[0]) return null
            const d = payload[0].payload
            return (
              <div className="rounded-lg border bg-card px-3 py-2 text-sm shadow-sm">
                <p className="font-semibold">{d.name}</p>
                <p className="tabular-nums">{formatCurrency(BigInt(d.currentValue), currency)}</p>
                <p className={d.unrealizedReturnPct >= 0 ? 'text-gain' : 'text-loss'}>
                  {formatPercent(d.unrealizedReturnPct)}
                </p>
              </div>
            )
          }}
        />
      </Treemap>
    </ResponsiveContainer>
  )
}

// ─── Bubble view ──────────────────────────────

function BubbleView({ holdings }: { holdings: ReturnType<typeof usePortfolioMetrics>['holdings'] }) {
  const currency = useUIStore((s) => s.currency)

  const sorted = [...holdings]
    .filter((h) => h.currentValue > 0n)
    .sort((a, b) => b.unrealizedReturnPct - a.unrealizedReturnPct)

  return (
    <div className="space-y-2">
      {/* Simple horizontal bar view as bubble alternative */}
      <p className="text-xs text-muted-foreground mb-3">
        Holdings ranked by unrealized return — bar width = allocation %
      </p>
      {sorted.map((h) => (
        <div key={h.holdingId} className="flex items-center gap-3">
          <div className="w-20 text-xs font-medium text-right flex-shrink-0">
            {h.tickerSymbol}
          </div>
          <div className="flex-1 relative h-7 bg-muted rounded overflow-hidden">
            <div
              className={cn('h-full rounded transition-all', h.unrealizedGains >= 0n ? 'bg-gain' : 'bg-loss')}
              style={{ width: `${Math.min(h.allocationPct, 100)}%`, opacity: 0.7 }}
            />
            <div className="absolute inset-0 flex items-center px-2">
              <span className={cn('text-xs font-medium', h.unrealizedGains >= 0n ? 'text-gain' : 'text-loss')}>
                {formatPercent(h.unrealizedReturnPct, 1)}
              </span>
              <span className="text-xs text-muted-foreground ml-2">
                {formatCurrency(h.currentValue, currency, { compact: true })}
              </span>
            </div>
          </div>
          <div className="w-12 text-xs text-muted-foreground text-right flex-shrink-0">
            {h.allocationPct.toFixed(1)}%
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── Main Component ───────────────────────────

export function VisualizeClient({ holdings }: { holdings: ServerHolding[] }) {
  const [activeTab, setActiveTab] = useState<Tab>('treemap')
  const metrics = usePortfolioMetrics(holdings)

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Visualize</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Visual analysis of your portfolio
        </p>
      </div>

      <div className="rounded-xl border bg-card p-4">
        {/* Tabs */}
        <div className="flex items-center gap-1 mb-4 border-b pb-2">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'px-3 py-1.5 rounded text-sm font-medium transition-colors',
                activeTab === tab.id
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted'
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Legend for treemap */}
        {activeTab === 'treemap' && (
          <div className="flex items-center gap-3 text-xs text-muted-foreground mb-3 flex-wrap">
            <span>Color = Unrealized return:</span>
            {[
              { color: '#22c55e', label: '>50%' },
              { color: '#86efac', label: '5–50%' },
              { color: '#bbf7d0', label: '0–5%' },
              { color: '#fca5a5', label: '-5–0%' },
              { color: '#ef4444', label: '<-5%' },
            ].map((l) => (
              <span key={l.label} className="flex items-center gap-1">
                <span className="w-3 h-3 rounded-sm inline-block" style={{ background: l.color }} />
                {l.label}
              </span>
            ))}
          </div>
        )}

        {/* Tab content */}
        {metrics.pricesLoading ? (
          <div className="h-80 flex items-center justify-center text-muted-foreground text-sm">
            Loading prices…
          </div>
        ) : activeTab === 'treemap' ? (
          <TreemapView holdings={metrics.holdings} />
        ) : (
          <BubbleView holdings={metrics.holdings} />
        )}
      </div>
    </div>
  )
}
