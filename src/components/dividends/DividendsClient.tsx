'use client'

// ─────────────────────────────────────────────
// DividendsClient — dividend income overview
// Shows: trailing 12M income, yield, YoC per holding,
// upcoming ex-dividend dates, historical dividends bar chart
// ─────────────────────────────────────────────

import { useMemo } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { usePortfolioMetrics } from '@/hooks/usePortfolio'
import { calcDividendYield, calcYieldOnCost, formatCurrency, formatPercent } from '@/lib/calculations'
import { useUIStore } from '@/store/ui'
import { cn } from '@/lib/utils'
import type { ServerHolding } from '@/hooks/usePortfolio'

// ─── Types ────────────────────────────────────

interface DividendEvent {
  tickerSymbol: string
  exDate: string
  payDate: string | null
  amountPerShare: string  // BigInt as string
  currency: string
}

interface DividendHoldingData {
  holdingId: string
  tickerSymbol: string
  name: string
  trailingIncome: string  // BigInt as string
  currency: string
}

interface DividendsClientProps {
  holdings: ServerHolding[]
  dividendsByHolding: Record<string, DividendHoldingData>
  upcomingEvents: DividendEvent[]
}

// ─── Monthly income chart ─────────────────────

function MonthlyIncomeChart({
  data,
  currency,
}: {
  data: Array<{ month: string; income: number }>
  currency: 'ILS' | 'USD'
}) {
  if (data.every((d) => d.income === 0)) return null

  return (
    <div className="rounded-xl border bg-card p-4">
      <h3 className="text-sm font-semibold mb-3">Monthly Dividend Income</h3>
      <ResponsiveContainer width="100%" height={180}>
        <BarChart data={data} margin={{ top: 4, right: 0, left: -20, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
          <XAxis
            dataKey="month"
            tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
            tickLine={false}
            axisLine={false}
          />
          <Tooltip
            formatter={(value: number) =>
              formatCurrency(BigInt(Math.round(value * 100)), currency)
            }
            contentStyle={{
              background: 'hsl(var(--card))',
              border: '1px solid hsl(var(--border))',
              borderRadius: 8,
              fontSize: 12,
            }}
          />
          <Bar dataKey="income" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

// ─── Main Component ───────────────────────────

export function DividendsClient({
  holdings,
  dividendsByHolding,
  upcomingEvents,
}: DividendsClientProps) {
  const currency = useUIStore((s) => s.currency)
  const metrics = usePortfolioMetrics(holdings)

  // Compute per-holding dividend metrics
  const holdingDividendMetrics = useMemo(() => {
    return metrics.holdings
      .filter((h) => dividendsByHolding[h.holdingId])
      .map((h) => {
        const divData = dividendsByHolding[h.holdingId]
        const trailingIncome = BigInt(divData.trailingIncome)
        const yield_ = calcDividendYield(trailingIncome, h.currentValue)
        const yoc = calcYieldOnCost(trailingIncome, h.costBasis)
        return { ...h, trailingIncome, yield_, yoc }
      })
      .sort((a, b) => Number(b.trailingIncome - a.trailingIncome))
  }, [metrics.holdings, dividendsByHolding])

  const totalTrailingIncome = holdingDividendMetrics.reduce(
    (s, h) => s + h.trailingIncome,
    0n
  )

  const portfolioYield = calcDividendYield(totalTrailingIncome, metrics.totalValue)

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Dividends</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Trailing 12-month dividend income and yield analysis
        </p>
      </div>

      {/* Summary KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <div className="rounded-xl border bg-card p-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wide">
            Trailing 12M Income
          </p>
          <p className="text-2xl font-bold tabular-nums mt-1">
            {formatCurrency(totalTrailingIncome, currency)}
          </p>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wide">
            Portfolio Yield
          </p>
          <p className="text-2xl font-bold tabular-nums mt-1 text-gain">
            {portfolioYield.toFixed(2)}%
          </p>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wide">
            Paying Securities
          </p>
          <p className="text-2xl font-bold tabular-nums mt-1">
            {holdingDividendMetrics.length}
          </p>
        </div>
      </div>

      {/* Upcoming ex-dates */}
      {upcomingEvents.length > 0 && (
        <div className="rounded-xl border bg-card p-4">
          <h3 className="text-sm font-semibold mb-3">Upcoming Ex-Dividend Dates</h3>
          <div className="space-y-2">
            {upcomingEvents.map((ev) => (
              <div key={`${ev.tickerSymbol}-${ev.exDate}`} className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{ev.tickerSymbol}</span>
                  <span className="text-xs text-muted-foreground">ex: {ev.exDate}</span>
                  {ev.payDate && (
                    <span className="text-xs text-muted-foreground">pay: {ev.payDate}</span>
                  )}
                </div>
                <span className="tabular-nums font-medium">
                  {formatCurrency(BigInt(ev.amountPerShare), ev.currency as 'ILS' | 'USD')} / share
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Per-holding table */}
      <div className="rounded-xl border bg-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b bg-muted/30">
                <th className="py-2 px-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Security
                </th>
                <th className="py-2 px-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  12M Income
                </th>
                <th className="py-2 px-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Yield
                </th>
                <th className="py-2 px-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Yield on Cost
                </th>
                <th className="py-2 px-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Value
                </th>
              </tr>
            </thead>
            <tbody>
              {holdingDividendMetrics.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-sm text-muted-foreground">
                    No dividend data available yet
                  </td>
                </tr>
              ) : (
                holdingDividendMetrics.map((h) => (
                  <tr key={h.holdingId} className="border-b hover:bg-muted/20 transition-colors">
                    <td className="py-2.5 px-3">
                      <div>
                        <span className="text-sm font-medium">{h.tickerSymbol}</span>
                        <span className="text-xs text-muted-foreground ml-1.5">{h.name}</span>
                      </div>
                    </td>
                    <td className="py-2.5 px-3 text-right tabular-nums text-sm font-medium text-gain">
                      {formatCurrency(h.trailingIncome, currency)}
                    </td>
                    <td className="py-2.5 px-3 text-right tabular-nums text-sm">
                      {h.yield_.toFixed(2)}%
                    </td>
                    <td className="py-2.5 px-3 text-right tabular-nums text-sm">
                      {h.yoc.toFixed(2)}%
                    </td>
                    <td className="py-2.5 px-3 text-right tabular-nums text-sm text-muted-foreground">
                      {formatCurrency(h.currentValue, currency, { compact: true })}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
