'use client'

import { useState, useMemo } from 'react'
import { Treemap, ResponsiveContainer, Tooltip, PieChart, Pie, Cell } from 'recharts'
import { usePortfolioMetrics } from '@/hooks/usePortfolio'
import { usePriceHistory } from '@/hooks/usePriceHistory'
import { formatCurrency, formatPercent, calcActualAllocationPct } from '@/lib/calculations'
import { useUIStore } from '@/store/ui'
import { cn, formatHoldingDurationLong, calcAnnualizedReturn } from '@/lib/utils'
import type { ServerHolding } from '@/hooks/usePortfolio'

// ─── Tabs ─────────────────────────────────────

type Tab = 'treemap' | 'rankings' | 'sector' | 'geographic'
const TABS: { id: Tab; label: string }[] = [
  { id: 'treemap',     label: 'Treemap' },
  { id: 'rankings',   label: 'Rankings' },
  { id: 'sector',     label: 'By Folder' },
  { id: 'geographic', label: 'Geographic' },
]

// ─── Period filter ────────────────────────────

type Period = '1w' | '1m' | '6m' | '1y' | 'all'
const PERIODS: { id: Period; label: string }[] = [
  { id: '1w',  label: 'Week' },
  { id: '1m',  label: 'Month' },
  { id: '6m',  label: '6 Months' },
  { id: '1y',  label: 'Year' },
  { id: 'all', label: 'All Time' },
]

// "all" → null (no history API needed); others → passed to usePriceHistory
function toHistoryPeriod(period: Period): string | null {
  return period === 'all' ? null : period
}

// ─── Color palette ────────────────────────────

const PALETTE = [
  '#6366f1', '#f59e0b', '#10b981', '#ef4444', '#3b82f6',
  '#ec4899', '#8b5cf6', '#14b8a6', '#f97316', '#a3e635',
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
  duration?: string; annualizedReturn?: number | null
}) {
  const { x = 0, y = 0, width = 0, height = 0, name, unrealizedReturnPct = 0, duration, annualizedReturn } = props
  if (width < 30 || height < 20) return null

  return (
    <g>
      <rect
        x={x} y={y} width={width} height={height}
        fill={returnColor(unrealizedReturnPct)}
        stroke="hsl(var(--background))"
        strokeWidth={2}
        rx={4}
      />
      {height > 40 && (
        <text x={x + 8} y={y + 18} fill="#fff" fontSize={12} fontWeight={600}>
          {name}
        </text>
      )}
      {height > 55 && (
        <text x={x + 8} y={y + 32} fill="#ffffffcc" fontSize={11}>
          {unrealizedReturnPct >= 0 ? '+' : ''}{unrealizedReturnPct.toFixed(1)}%
        </text>
      )}
      {height > 72 && duration && (
        <text x={x + 8} y={y + 48} fill="#ffffffaa" fontSize={10}>
          {duration}
          {annualizedReturn != null
            ? `  ·  ${annualizedReturn >= 0 ? '+' : ''}${annualizedReturn.toFixed(1)}%/yr`
            : ''}
        </text>
      )}
    </g>
  )
}

// Always shows ALL holdings.
// Block SIZE  = full current value (all lots).
// Block COLOR = price-change % over the selected period (Yahoo Finance).
//               Holdings with no historical data fall back to all-time unrealized return.
function TreemapSection({ holdings, period }: { holdings: ServerHolding[]; period: Period }) {
  const metrics = usePortfolioMetrics(holdings)

  // Build ticker list in the format the history API expects
  const tickers = useMemo(
    () => metrics.holdings.map(
      (h) => `${h.tickerSymbol}:${h.exchange === 'TASE' ? 'TASE' : 'US'}`
    ),
    [metrics.holdings]
  )

  const historyPeriod = toHistoryPeriod(period)
  const { data: periodReturns = {}, isLoading: historyLoading } = usePriceHistory(tickers, historyPeriod)

  const isLoading = metrics.pricesLoading || (period !== 'all' && historyLoading)

  if (isLoading) {
    return (
      <div className="h-80 flex items-center justify-center text-muted-foreground text-sm">
        Loading prices…
      </div>
    )
  }

  // Merge: size = full current value, color = period return (fallback to all-time)
  const mergedHoldings = metrics.holdings.map((h) => {
    if (period === 'all') return h
    const periodPct = periodReturns[h.tickerSymbol]
    if (periodPct == null) return h  // no historical data → show all-time return
    return { ...h, unrealizedReturnPct: periodPct }
  })

  return <TreemapView holdings={mergedHoldings} />
}

function TreemapView({ holdings }: { holdings: ReturnType<typeof usePortfolioMetrics>['holdings'] }) {
  const currency = useUIStore((s) => s.currency)

  const data = holdings
    .filter((h) => h.currentValue > 0n)
    .map((h) => {
      const oldestLot = h.lots.reduce<Date | null>((min, lot) => {
        const d = new Date(lot.purchaseDate)
        return min === null || d < min ? d : min
      }, null)
      const duration        = oldestLot ? formatHoldingDurationLong(oldestLot) : undefined
      const annualizedReturn = oldestLot
        ? calcAnnualizedReturn(h.unrealizedReturnPct, oldestLot)
        : null

      return {
        name: h.name,
        value: Number(h.currentValue),
        unrealizedReturnPct: h.unrealizedReturnPct,
        currentValue: h.currentValue,
        duration,
        annualizedReturn,
      }
    })

  if (data.length === 0) {
    return (
      <div className="h-80 flex items-center justify-center text-muted-foreground text-sm">
        No holdings to visualize
      </div>
    )
  }

  return (
    <ResponsiveContainer width="100%" height={400}>
      <Treemap data={data} dataKey="value" content={<TreemapContent />}>
        <Tooltip
          content={({ payload }) => {
            if (!payload?.[0]) return null
            const d = payload[0].payload
            return (
              <div className="rounded-lg border bg-card px-3 py-2 text-sm shadow-sm space-y-0.5">
                <p className="font-semibold">{d.name}</p>
                <p className="tabular-nums text-muted-foreground">
                  {formatCurrency(BigInt(d.currentValue), currency)}
                </p>
                <p className={d.unrealizedReturnPct >= 0 ? 'text-gain' : 'text-loss'}>
                  {formatPercent(d.unrealizedReturnPct)}
                </p>
                {d.duration && (
                  <p className="text-xs text-muted-foreground">
                    {d.duration}
                    {d.annualizedReturn != null && (
                      <span className={cn(
                        'ml-1.5',
                        d.annualizedReturn >= 0 ? 'text-gain' : 'text-loss'
                      )}>
                        · {d.annualizedReturn >= 0 ? '+' : ''}{d.annualizedReturn.toFixed(1)}%/yr
                      </span>
                    )}
                  </p>
                )}
              </div>
            )
          }}
        />
      </Treemap>
    </ResponsiveContainer>
  )
}

// ─── Rankings view ────────────────────────────

function RankingsView({ holdings }: { holdings: ReturnType<typeof usePortfolioMetrics>['holdings'] }) {
  const currency = useUIStore((s) => s.currency)

  const sorted = [...holdings]
    .filter((h) => h.currentValue > 0n)
    .sort((a, b) => b.unrealizedReturnPct - a.unrealizedReturnPct)

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground mb-3">
        Holdings ranked by unrealized return — bar width = allocation %
      </p>
      {sorted.map((h) => (
        <div key={h.holdingId} className="flex items-center gap-3">
          <div className="w-20 text-xs font-medium text-right flex-shrink-0">{h.tickerSymbol}</div>
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

// ─── Sector / By-Folder view ──────────────────

function SectorView({ holdings }: { holdings: ReturnType<typeof usePortfolioMetrics>['holdings'] }) {
  const currency = useUIStore((s) => s.currency)

  const groups = useMemo(() => {
    const map = new Map<string, { name: string; value: bigint; color: string | null; gain: bigint; cost: bigint }>()
    for (const h of holdings) {
      if (h.currentValue === 0n) continue
      const key = h.rootFolderId
      if (!map.has(key)) {
        map.set(key, { name: h.rootFolderName, value: 0n, color: h.rootFolderColor, gain: 0n, cost: 0n })
      }
      const g = map.get(key)!
      g.value += h.currentValue
      g.gain += h.unrealizedGains
      g.cost += h.costBasis
    }

    const total = Array.from(map.values()).reduce((s, g) => s + g.value, 0n)
    return Array.from(map.values())
      .map((g, i) => ({
        ...g,
        pct: Number(total) > 0 ? (Number(g.value) / Number(total)) * 100 : 0,
        returnPct: Number(g.cost) > 0 ? (Number(g.gain) / Number(g.cost)) * 100 : 0,
        color: g.color ?? PALETTE[i % PALETTE.length],
      }))
      .sort((a, b) => b.pct - a.pct)
  }, [holdings])

  const pieData = groups.map((g) => ({ name: g.name, value: Number(g.value) }))
  const total = groups.reduce((s, g) => s + g.value, 0n)

  if (groups.length === 0) {
    return (
      <div className="h-80 flex items-center justify-center text-muted-foreground text-sm">
        No data
      </div>
    )
  }

  return (
    <div className="flex flex-col md:flex-row gap-6 items-center">
      {/* Pie chart */}
      <div className="w-full md:w-56 flex-shrink-0">
        <ResponsiveContainer width="100%" height={220}>
          <PieChart>
            <Pie data={pieData} dataKey="value" cx="50%" cy="50%" innerRadius={50} outerRadius={90} paddingAngle={2}>
              {groups.map((g, i) => (
                <Cell key={i} fill={g.color} />
              ))}
            </Pie>
            <Tooltip
              content={({ payload }) => {
                if (!payload?.[0]) return null
                const name = payload[0].name
                const g = groups.find((x) => x.name === name)
                if (!g) return null
                return (
                  <div className="rounded-lg border bg-card px-3 py-2 text-sm shadow-sm">
                    <p className="font-semibold">{g.name}</p>
                    <p className="tabular-nums">{formatCurrency(g.value, currency)}</p>
                    <p className="text-muted-foreground">{g.pct.toFixed(1)}%</p>
                  </div>
                )
              }}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>

      {/* Table */}
      <div className="flex-1 w-full space-y-2">
        {groups.map((g) => (
          <div key={g.name} className="flex items-center gap-3">
            <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: g.color }} />
            <span className="text-sm font-medium flex-1 truncate">{g.name}</span>
            <span className="text-sm tabular-nums text-muted-foreground">
              {formatCurrency(g.value, currency, { compact: true })}
            </span>
            <span className={cn('text-sm tabular-nums w-16 text-right', g.returnPct >= 0 ? 'text-gain' : 'text-loss')}>
              {formatPercent(g.returnPct, 1)}
            </span>
            <div className="w-20 bg-muted rounded-full h-1.5 flex-shrink-0">
              <div
                className="h-1.5 rounded-full"
                style={{ width: `${Math.min(g.pct, 100)}%`, backgroundColor: g.color }}
              />
            </div>
            <span className="text-xs text-muted-foreground w-10 text-right flex-shrink-0">
              {g.pct.toFixed(1)}%
            </span>
          </div>
        ))}
        <div className="border-t pt-2 flex justify-between text-xs text-muted-foreground">
          <span>{groups.length} folders</span>
          <span>{formatCurrency(total, currency, { compact: true })} total</span>
        </div>
      </div>
    </div>
  )
}

// ─── Geographic view ──────────────────────────

const COUNTRY_COLORS: Record<string, string> = {
  'Israel': '#2563eb',
  'USA': '#ef4444',
  'Other': '#6b7280',
}

function GeographicView({ holdings }: { holdings: ReturnType<typeof usePortfolioMetrics>['holdings'] }) {
  const currency = useUIStore((s) => s.currency)

  const regions = useMemo(() => {
    const map = new Map<string, { value: bigint; gain: bigint; cost: bigint; count: number }>()

    for (const h of holdings) {
      if (h.currentValue === 0n) continue
      const region = h.exchange === 'TASE' ? 'Israel' : h.exchange === 'OTHER' ? 'Other' : 'USA'
      if (!map.has(region)) map.set(region, { value: 0n, gain: 0n, cost: 0n, count: 0 })
      const r = map.get(region)!
      r.value += h.currentValue
      r.gain += h.unrealizedGains
      r.cost += h.costBasis
      r.count++
    }

    const total = Array.from(map.values()).reduce((s, r) => s + r.value, 0n)
    return Array.from(map.entries())
      .map(([name, r]) => ({
        name,
        ...r,
        pct: Number(total) > 0 ? (Number(r.value) / Number(total)) * 100 : 0,
        returnPct: Number(r.cost) > 0 ? (Number(r.gain) / Number(r.cost)) * 100 : 0,
        color: COUNTRY_COLORS[name] ?? '#6b7280',
      }))
      .sort((a, b) => b.pct - a.pct)
  }, [holdings])

  const total = regions.reduce((s, r) => s + r.value, 0n)

  if (regions.length === 0) {
    return (
      <div className="h-80 flex items-center justify-center text-muted-foreground text-sm">No data</div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Stacked bar */}
      <div>
        <p className="text-xs text-muted-foreground mb-2">Allocation by market</p>
        <div className="flex rounded-lg overflow-hidden h-8 w-full">
          {regions.map((r) => (
            <div
              key={r.name}
              style={{ width: `${r.pct}%`, backgroundColor: r.color }}
              className="relative flex items-center justify-center"
              title={`${r.name}: ${r.pct.toFixed(1)}%`}
            >
              {r.pct > 8 && (
                <span className="text-xs text-white font-semibold">{r.pct.toFixed(0)}%</span>
              )}
            </div>
          ))}
        </div>
        <div className="flex gap-4 mt-2 flex-wrap">
          {regions.map((r) => (
            <span key={r.name} className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: r.color }} />
              {r.name}
            </span>
          ))}
        </div>
      </div>

      {/* Region cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {regions.map((r) => (
          <div key={r.name} className="rounded-xl border bg-card p-4">
            <div className="flex items-center gap-2 mb-3">
              <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: r.color }} />
              <span className="font-semibold text-sm">{r.name}</span>
              <span className="ml-auto text-xs text-muted-foreground">{r.count} holdings</span>
            </div>
            <p className="text-xl font-bold tabular-nums">
              {formatCurrency(r.value, currency, { compact: true })}
            </p>
            <p className="text-sm text-muted-foreground">{r.pct.toFixed(1)}% of portfolio</p>
            <p className={cn('text-sm font-medium mt-1', r.returnPct >= 0 ? 'text-gain' : 'text-loss')}>
              {formatPercent(r.returnPct, 1)} unrealized
            </p>
          </div>
        ))}
      </div>

      <p className="text-xs text-muted-foreground">
        Geographic classification based on exchange: TASE = Israel, NYSE/NASDAQ = USA.
      </p>

      <div className="border-t pt-2 flex justify-between text-xs text-muted-foreground">
        <span>{holdings.filter((h) => h.currentValue > 0n).length} total holdings</span>
        <span>{formatCurrency(total, currency, { compact: true })} total value</span>
      </div>
    </div>
  )
}

// ─── Main Component ───────────────────────────

export function VisualizeClient({ holdings }: { holdings: ServerHolding[] }) {
  const [activeTab, setActiveTab] = useState<Tab>('treemap')
  const [period, setPeriod] = useState<Period>('all')
  const metrics = usePortfolioMetrics(holdings)

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Visualize</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Visual analysis of your portfolio</p>
      </div>

      <div className="rounded-xl border bg-card p-4">
        {/* Tabs */}
        <div className="flex items-center gap-1 mb-4 border-b pb-2 overflow-x-auto">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'px-3 py-1.5 rounded text-sm font-medium transition-colors whitespace-nowrap',
                activeTab === tab.id
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted'
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Treemap controls */}
        {activeTab === 'treemap' && (
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-3">
            {/* Period selector */}
            <div className="flex items-center gap-1 rounded-lg bg-muted p-1 w-fit">
              {PERIODS.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setPeriod(p.id)}
                  className={cn(
                    'px-3 py-1 rounded text-xs font-medium transition-colors whitespace-nowrap',
                    period === p.id
                      ? 'bg-background text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  {p.label}
                </button>
              ))}
            </div>
            {/* Legend */}
            <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
              <span>
                {period === 'all'
                  ? 'Color = Unrealized return (all time):'
                  : `Color = Price change (${PERIODS.find((p) => p.id === period)?.label}):`}
              </span>
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
          </div>
        )}

        {/* Content */}
        {activeTab === 'treemap' ? (
          <TreemapSection holdings={holdings} period={period} />
        ) : metrics.pricesLoading ? (
          <div className="h-80 flex items-center justify-center text-muted-foreground text-sm">
            Loading prices…
          </div>
        ) : activeTab === 'rankings' ? (
          <RankingsView holdings={metrics.holdings} />
        ) : activeTab === 'sector' ? (
          <SectorView holdings={metrics.holdings} />
        ) : (
          <GeographicView holdings={metrics.holdings} />
        )}
      </div>
    </div>
  )
}
