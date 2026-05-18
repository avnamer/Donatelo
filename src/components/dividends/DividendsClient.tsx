'use client'

// ─────────────────────────────────────────────
// DividendsClient — auto-fetches dividend schedule from API per holding,
// computes eligible shares per ex-date, shows:
//  • Summary stats (TTM yield, income, monthly avg, YoY growth)
//  • Quarterly/monthly bar chart (historical + upcoming)
//  • "Recent and Upcoming" table matching Donatello-style layout
// ─────────────────────────────────────────────

import { useState, useMemo } from 'react'
import { useQueries } from '@tanstack/react-query'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from 'recharts'
import { formatCurrency } from '@/lib/calculations'
import { useUIStore } from '@/store/ui'
import { useFxRate } from '@/hooks/useFxRate'
import { cn } from '@/lib/utils'
import type { ServerHolding } from '@/hooks/usePortfolio'
import type { Lot } from '@/types'

// ─── Types ────────────────────────────────────

interface DividendEvent {
  exDate: string        // YYYY-MM-DD
  declareDate: string | null
  payDate: string | null
  amountPerShare: string  // BigInt serialized
  currency: string
  frequency: string | null
}

interface EnrichedEvent {
  ticker: string
  name: string
  holdingId: string
  exDate: string
  declareDate: string | null
  payDate: string | null
  amountPerShareCents: number   // in cents/agorot
  amountPerShareDisplay: number // in display currency
  currency: string
  eligibleShares: number
  totalPaid: number             // display currency
  isFuture: boolean
  prevAmountCents: number | null  // for % change
}

interface HoldingForDiv {
  id: string
  tickerSymbol: string
  name: string
  exchange: string
  lots: Array<{
    purchaseDate: Date
    shares: number
    soldShares: number
    soldDate: Date | null
  }>
}

interface DividendsClientProps {
  holdings: HoldingForDiv[]
}

// ─── Eligible shares calculation ──────────────

function getEligibleSharesAtDate(lots: HoldingForDiv['lots'], exDate: Date): number {
  return lots.reduce((total, lot) => {
    const purchased = new Date(lot.purchaseDate)
    if (purchased >= exDate) return total // bought on or after ex-date
    // Shares sold before ex-date don't count
    const soldBeforeExDate =
      lot.soldDate && new Date(lot.soldDate) < exDate ? lot.soldShares : 0
    return total + Math.max(0, lot.shares - soldBeforeExDate)
  }, 0)
}

function getTotalActiveShares(lots: HoldingForDiv['lots']): number {
  return lots.reduce((s, l) => s + Math.max(0, l.shares - l.soldShares), 0)
}

// ─── Quarter helpers ──────────────────────────

function toQuarterKey(dateStr: string): string {
  const d = new Date(dateStr)
  const q = Math.ceil((d.getMonth() + 1) / 3)
  return `Q${q} ${d.getFullYear()}`
}

function toMonthKey(dateStr: string): string {
  const d = new Date(dateStr)
  return d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' })
}

// ─── Fetch helper ──────────────────────────────

async function fetchDividends(ticker: string, exchange: string): Promise<DividendEvent[]> {
  const ex = exchange === 'TASE' ? 'TASE' : 'US'
  const res = await fetch(`/api/dividends?ticker=${ticker}&exchange=${ex}`)
  if (!res.ok) return []
  return res.json()
}

// ─── Summary stat card ────────────────────────

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{label}</p>
      <p className="text-xl font-bold tabular-nums mt-1">{value}</p>
      {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  )
}

// ─── Main Component ───────────────────────────

export function DividendsClient({ holdings }: DividendsClientProps) {
  const currency = useUIStore((s) => s.currency)
  const { data: fxRate = 3.72 } = useFxRate()
  const [ignorePurchaseDates, setIgnorePurchaseDates] = useState(false)
  const [chartMode, setChartMode] = useState<'quarterly' | 'monthly'>('quarterly')

  // Fetch dividend schedule for every holding
  const queries = useQueries({
    queries: holdings.map((h) => ({
      queryKey: ['dividends', h.tickerSymbol, h.exchange],
      queryFn: () => fetchDividends(h.tickerSymbol, h.exchange),
      staleTime: 24 * 60 * 60 * 1000,
      retry: false,
    })),
  })

  const isLoading = queries.some((q) => q.isLoading)
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  // Build enriched events for all holdings
  const allEvents = useMemo<EnrichedEvent[]>(() => {
    const events: EnrichedEvent[] = []

    holdings.forEach((holding, i) => {
      const divs = queries[i]?.data ?? []
      if (divs.length === 0) return

      // Sort ascending to compute prev amount
      const sorted = [...divs].sort(
        (a, b) => new Date(a.exDate).getTime() - new Date(b.exDate).getTime()
      )

      sorted.forEach((div, idx) => {
        const exDate = new Date(div.exDate)
        exDate.setHours(0, 0, 0, 0)
        const isFuture = exDate > today

        const eligibleShares = ignorePurchaseDates
          ? getTotalActiveShares(holding.lots)
          : isFuture
            ? getTotalActiveShares(holding.lots)
            : getEligibleSharesAtDate(holding.lots, exDate)

        const amountCents = Number(div.amountPerShare)

        // Convert to display currency
        const divCurrency = div.currency as 'ILS' | 'USD'
        let amountDisplay: number
        if (divCurrency === currency) {
          amountDisplay = amountCents / 100
        } else if (divCurrency === 'USD' && currency === 'ILS') {
          amountDisplay = (amountCents / 100) * fxRate
        } else {
          amountDisplay = (amountCents / 100) / fxRate
        }

        const prevAmountCents = idx > 0 ? Number(sorted[idx - 1].amountPerShare) : null

        events.push({
          ticker: holding.tickerSymbol,
          name: holding.name,
          holdingId: holding.id,
          exDate: div.exDate,
          declareDate: div.declareDate,
          payDate: div.payDate,
          amountPerShareCents: amountCents,
          amountPerShareDisplay: amountDisplay,
          currency: div.currency,
          eligibleShares,
          totalPaid: eligibleShares * amountDisplay,
          isFuture,
          prevAmountCents,
        })
      })
    })

    return events.sort(
      (a, b) => new Date(b.exDate).getTime() - new Date(a.exDate).getTime()
    )
  }, [holdings, queries, ignorePurchaseDates, currency, fxRate, today])

  // TTM events
  const oneYearAgo = new Date(today)
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1)

  const ttmEvents = allEvents.filter(
    (e) => !e.isFuture && new Date(e.exDate) >= oneYearAgo
  )
  const prevYearEvents = allEvents.filter((e) => {
    const d = new Date(e.exDate)
    const twoYearsAgo = new Date(today)
    twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2)
    return !e.isFuture && d < oneYearAgo && d >= twoYearsAgo
  })

  const ttmIncome = ttmEvents.reduce((s, e) => s + e.totalPaid, 0)
  const prevYearIncome = prevYearEvents.reduce((s, e) => s + e.totalPaid, 0)
  const yoyGrowth = prevYearIncome > 0
    ? ((ttmIncome - prevYearIncome) / prevYearIncome) * 100
    : null

  const payingAssets = new Set(ttmEvents.filter((e) => e.totalPaid > 0).map((e) => e.holdingId)).size
  const monthlyAvg = ttmIncome / 12

  // Chart data: group by quarter or month
  const chartData = useMemo(() => {
    const map = new Map<string, number>()
    const now = new Date()
    const threeYearsAgo = new Date(now)
    threeYearsAgo.setFullYear(threeYearsAgo.getFullYear() - 3)

    allEvents
      .filter((e) => new Date(e.exDate) >= threeYearsAgo)
      .forEach((e) => {
        const key = chartMode === 'quarterly' ? toQuarterKey(e.exDate) : toMonthKey(e.exDate)
        map.set(key, (map.get(key) ?? 0) + e.totalPaid)
      })

    // Build sorted array
    const entries = Array.from(map.entries())
      .sort((a, b) => {
        // Extract year+quarter from key for sorting
        if (chartMode === 'quarterly') {
          const parseQ = (k: string) => {
            const [q, y] = k.split(' ')
            return Number(y) * 10 + Number(q[1])
          }
          return parseQ(a[0]) - parseQ(b[0])
        }
        return new Date('01 ' + a[0]).getTime() - new Date('01 ' + b[0]).getTime()
      })

    return entries.map(([period, income]) => ({
      period,
      income,
      isFuture: isFuturePeriod(period, chartMode),
    }))
  }, [allEvents, chartMode])

  function isFuturePeriod(key: string, mode: 'quarterly' | 'monthly'): boolean {
    if (mode === 'quarterly') {
      const [q, y] = key.split(' ')
      const qNum = Number(q[1])
      const year = Number(y)
      const curQ = Math.ceil((today.getMonth() + 1) / 3)
      return year > today.getFullYear() || (year === today.getFullYear() && qNum > curQ)
    }
    return new Date('01 ' + key) > today
  }

  const sym = currency === 'ILS' ? '₪' : '$'

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Dividends</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Dividend schedule from your holdings — auto-fetched from market data
        </p>
      </div>

      {isLoading && (
        <div className="text-sm text-muted-foreground animate-pulse">
          Fetching dividend data…
        </div>
      )}

      {/* Summary stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <StatCard label="Paying Assets" value={String(payingAssets)} />
        <StatCard label="Trailing 12M" value={`${sym}${ttmIncome.toLocaleString(undefined, { maximumFractionDigits: 0 })}`} />
        <StatCard label="Monthly Avg" value={`${sym}${monthlyAvg.toLocaleString(undefined, { maximumFractionDigits: 0 })}`} />
        <StatCard
          label="YoY Growth"
          value={yoyGrowth !== null ? `${yoyGrowth >= 0 ? '+' : ''}${yoyGrowth.toFixed(1)}%` : '—'}
        />
      </div>

      {/* Toggle row */}
      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex rounded-lg border overflow-hidden text-sm">
          {(['quarterly', 'monthly'] as const).map((m) => (
            <button
              key={m}
              onClick={() => setChartMode(m)}
              className={cn(
                'px-3 py-1.5 capitalize transition-colors',
                chartMode === m ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'
              )}
            >
              {m}
            </button>
          ))}
        </div>

        <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
          <div
            onClick={() => setIgnorePurchaseDates((v) => !v)}
            className={cn(
              'relative w-8 h-4 rounded-full transition-colors cursor-pointer',
              ignorePurchaseDates ? 'bg-primary' : 'bg-muted-foreground/30'
            )}
          >
            <span
              className={cn(
                'absolute top-0.5 w-3 h-3 rounded-full bg-white shadow transition-transform',
                ignorePurchaseDates ? 'translate-x-4' : 'translate-x-0.5'
              )}
            />
          </div>
          Ignore Purchase Dates
        </label>
      </div>

      {/* Bar chart */}
      {chartData.length > 0 && (
        <div className="rounded-xl border bg-card p-4">
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={chartData} margin={{ top: 4, right: 0, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
              <XAxis
                dataKey="period"
                tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                tickLine={false}
                axisLine={false}
                interval="preserveStartEnd"
              />
              <YAxis
                tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v) => `${sym}${v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v.toFixed(0)}`}
              />
              <Tooltip
                formatter={(value: number) => [`${sym}${value.toFixed(2)}`, 'Income']}
                contentStyle={{
                  background: 'hsl(var(--card))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: 8,
                  fontSize: 12,
                }}
              />
              <Bar dataKey="income" radius={[3, 3, 0, 0]}>
                {chartData.map((entry, i) => (
                  <Cell
                    key={i}
                    fill={entry.isFuture ? 'hsl(var(--primary) / 0.4)' : 'hsl(var(--primary))'}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <p className="text-xs text-muted-foreground mt-2">
            Light bars = projected (future ex-dates)
          </p>
        </div>
      )}

      {/* Recent & Upcoming table */}
      <div>
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">
          Recent and Upcoming Dividends
        </h2>
        <div className="rounded-xl border bg-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/30">
                  <th className="py-2 px-3 text-left font-medium text-muted-foreground">Security</th>
                  <th className="py-2 px-3 text-right font-medium text-muted-foreground whitespace-nowrap">Declare Date</th>
                  <th className="py-2 px-3 text-right font-medium text-muted-foreground whitespace-nowrap">Payout Date</th>
                  <th className="py-2 px-3 text-right font-medium text-muted-foreground whitespace-nowrap">Amount/Share</th>
                  <th className="py-2 px-3 text-right font-medium text-muted-foreground whitespace-nowrap">Shares</th>
                  <th className="py-2 px-3 text-right font-medium text-muted-foreground whitespace-nowrap">Total</th>
                </tr>
              </thead>
              <tbody>
                {allEvents.length === 0 && !isLoading && (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-muted-foreground">
                      {holdings.length === 0
                        ? 'No holdings in portfolio.'
                        : 'No dividend data found for your holdings. US stocks use Polygon.io — add a POLYGON_API_KEY to .env.local.'}
                    </td>
                  </tr>
                )}
                {allEvents.map((e, i) => {
                  const pctChange = e.prevAmountCents !== null && e.prevAmountCents > 0
                    ? ((e.amountPerShareCents - e.prevAmountCents) / e.prevAmountCents) * 100
                    : null

                  const divSym = e.currency === 'ILS' ? '₪' : '$'

                  return (
                    <tr
                      key={`${e.holdingId}-${e.exDate}-${i}`}
                      className={cn(
                        'border-b last:border-0 transition-colors',
                        e.isFuture ? 'bg-muted/10 hover:bg-muted/20' : 'hover:bg-muted/10'
                      )}
                    >
                      <td className="py-2.5 px-3">
                        <div>
                          <span className="font-medium">{e.name}</span>
                          <span className="text-xs text-muted-foreground ml-1.5">{e.ticker}</span>
                        </div>
                        <div className="text-xs text-muted-foreground">
                          ex-date: {e.exDate}
                          {e.isFuture && (
                            <span className="ml-1.5 text-primary font-medium">upcoming</span>
                          )}
                        </div>
                      </td>
                      <td className="py-2.5 px-3 text-right text-muted-foreground tabular-nums">
                        {e.declareDate ?? '—'}
                      </td>
                      <td className="py-2.5 px-3 text-right text-muted-foreground tabular-nums">
                        {e.payDate ?? '—'}
                      </td>
                      <td className="py-2.5 px-3 text-right tabular-nums">
                        <div>{divSym}{(e.amountPerShareCents / 100).toFixed(4)}</div>
                        {pctChange !== null && (
                          <div className={cn(
                            'text-xs',
                            pctChange > 0 ? 'text-gain' : pctChange < 0 ? 'text-loss' : 'text-muted-foreground'
                          )}>
                            {pctChange > 0 ? '+' : ''}{pctChange.toFixed(2)}%
                          </div>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-right tabular-nums text-muted-foreground">
                        {e.eligibleShares > 0
                          ? e.eligibleShares.toLocaleString(undefined, { maximumFractionDigits: 4 })
                          : <span className="text-muted-foreground/50">0</span>}
                      </td>
                      <td className={cn(
                        'py-2.5 px-3 text-right tabular-nums font-medium',
                        e.totalPaid > 0 ? 'text-gain' : 'text-muted-foreground/50'
                      )}>
                        {e.totalPaid > 0
                          ? `${sym}${e.totalPaid.toFixed(2)}`
                          : '$0.00'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              {allEvents.length > 0 && (
                <tfoot>
                  <tr className="border-t bg-muted/20">
                    <td colSpan={4} className="py-2 px-3 text-sm font-semibold">
                      Sum: {allEvents.filter((e) => !e.isFuture).length} distributions
                    </td>
                    <td />
                    <td className="py-2 px-3 text-right text-sm font-semibold tabular-nums text-gain">
                      {sym}{allEvents
                        .filter((e) => !e.isFuture && e.totalPaid > 0)
                        .reduce((s, e) => s + e.totalPaid, 0)
                        .toFixed(2)}
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}
