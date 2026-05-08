'use client'

// ─────────────────────────────────────────────
// KPI Panel — top summary cards on the Home page
// Shows: Total Value, Unrealized P&L, Total Return, Cost Basis
// ─────────────────────────────────────────────

import { TrendingUp, TrendingDown, DollarSign, Wallet } from 'lucide-react'
import { formatCurrency, formatPercent } from '@/lib/calculations'
import { useUIStore } from '@/store/ui'
import { cn } from '@/lib/utils'
import type { PortfolioMetrics } from '@/hooks/usePortfolio'

interface KpiPanelProps {
  metrics: PortfolioMetrics
}

interface KpiCardProps {
  label: string
  value: string
  sub?: string
  subPositive?: boolean
  icon: React.ReactNode
  loading?: boolean
}

function KpiCard({ label, value, sub, subPositive, icon, loading }: KpiCardProps) {
  return (
    <div className="rounded-xl border bg-card p-4 flex flex-col gap-2">
      <div className="flex items-center justify-between text-muted-foreground">
        <span className="text-xs font-medium uppercase tracking-wide">{label}</span>
        <span className="text-muted-foreground">{icon}</span>
      </div>
      {loading ? (
        <div className="h-7 w-32 animate-pulse rounded bg-muted" />
      ) : (
        <span className="text-2xl font-bold tabular-nums">{value}</span>
      )}
      {sub && !loading && (
        <span className={cn('text-sm font-medium', subPositive ? 'text-gain' : 'text-loss')}>
          {sub}
        </span>
      )}
    </div>
  )
}

export function KpiPanel({ metrics }: KpiPanelProps) {
  const currency = useUIStore((s) => s.currency)

  const isPositive = metrics.totalUnrealizedGains >= 0n
  const totalReturnPositive = metrics.totalReturnPct >= 0

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      <KpiCard
        label="Portfolio Value"
        icon={<Wallet className="h-4 w-4" />}
        value={formatCurrency(metrics.totalValue, currency, { compact: true })}
        loading={metrics.pricesLoading}
      />
      <KpiCard
        label="Unrealized P&L"
        icon={isPositive
          ? <TrendingUp className="h-4 w-4 text-gain" />
          : <TrendingDown className="h-4 w-4 text-loss" />
        }
        value={formatCurrency(metrics.totalUnrealizedGains, currency, { compact: true })}
        sub={formatPercent(metrics.totalUnrealizedReturnPct)}
        subPositive={isPositive}
        loading={metrics.pricesLoading}
      />
      <KpiCard
        label="Total Return"
        icon={<TrendingUp className="h-4 w-4" />}
        value={formatPercent(metrics.totalReturnPct)}
        sub={`incl. realized gains`}
        subPositive={totalReturnPositive}
        loading={metrics.pricesLoading}
      />
      <KpiCard
        label="Cost Basis"
        icon={<DollarSign className="h-4 w-4" />}
        value={formatCurrency(metrics.totalCostBasis, currency, { compact: true })}
        loading={metrics.pricesLoading}
      />
    </div>
  )
}
