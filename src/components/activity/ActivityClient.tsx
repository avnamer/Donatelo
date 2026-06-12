'use client'

// ─────────────────────────────────────────────
// ActivityClient — paginated transaction feed
// Supports: BUY, SELL, DIVIDEND, DEPOSIT, WITHDRAWAL, COMMISSION, FX_CONVERSION
// Filtering and pagination are server-driven via URL params.
// ─────────────────────────────────────────────

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'
import { formatCurrency } from '@/lib/calculations'
import { useUIStore } from '@/store/ui'
import { cn } from '@/lib/utils'
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  ArrowDownLeft,
  ArrowUpRight,
  ArrowLeftRight,
  Percent,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react'

// ─── Types ────────────────────────────────────

interface Transaction {
  id: string
  type: string
  date: string
  amount: string
  currency: string
  shares: string | null
  pricePerShare: string | null
  realizedGain: string | null
  notes: string | null
  holding: { tickerSymbol: string; name: string } | null
  cashAccount: { name: string } | null
}

interface SummaryItem {
  type: string
  totalAmount: string
  count: number
}

interface ActivityClientProps {
  transactions: Transaction[]
  summary: SummaryItem[]
  total: number
  portfolioId: string
  currentPage: number
  totalPages: number
  activeType: string
}

// ─── Transaction type metadata ─────────────────────────────────────────────
//
// colorVariant drives:
//   "gain"    → green text/bg
//   "loss"    → red text/bg
//   "info"    → primary (indigo) text/bg
//   "neutral" → muted text/bg
//
// amountSign:
//   "positive" → show + prefix in green
//   "negative" → show − prefix in red
//   "neutral"  → no prefix, muted color
// ──────────────────────────────────────────────────────────────────────────

const TYPE_META: Record<string, {
  label: string
  icon: React.ComponentType<{ className?: string }>
  badgeClass: string  // badge bg + text color
  color: string       // recharts fill
  amountSign: 'positive' | 'negative' | 'neutral'
}> = {
  SECURITY_BUY: {
    label: 'Buy',
    icon: TrendingUp,
    badgeClass: 'text-gain bg-gain/10',
    color: '#22c55e',
    amountSign: 'positive',
  },
  SECURITY_SELL: {
    label: 'Sell',
    icon: TrendingDown,
    badgeClass: 'text-loss bg-loss/10',
    color: '#ef4444',
    amountSign: 'negative',
  },
  DIVIDEND: {
    label: 'Dividend',
    icon: DollarSign,
    badgeClass: 'text-primary bg-primary/10',
    color: '#6366f1',
    amountSign: 'positive',
  },
  CASH_DEPOSIT: {
    label: 'Deposit',
    icon: ArrowDownLeft,
    badgeClass: 'text-gain bg-gain/10',
    color: '#10b981',
    amountSign: 'positive',
  },
  CASH_WITHDRAWAL: {
    label: 'Withdraw',
    icon: ArrowUpRight,
    badgeClass: 'text-loss bg-loss/10',
    color: '#f59e0b',
    amountSign: 'negative',
  },
  COMMISSION: {
    label: 'Commission',
    icon: Percent,
    badgeClass: 'text-orange-600 bg-orange-500/10',
    color: '#f97316',
    amountSign: 'negative',
  },
  FX_CONVERSION: {
    label: 'FX',
    icon: ArrowLeftRight,
    badgeClass: 'text-sky-600 bg-sky-500/10',
    color: '#0ea5e9',
    amountSign: 'neutral',
  },
}

const FILTER_TABS = [
  { key: 'all',              label: 'All' },
  { key: 'SECURITY_BUY',    label: 'Buys' },
  { key: 'SECURITY_SELL',   label: 'Sells' },
  { key: 'DIVIDEND',        label: 'Dividends' },
  { key: 'CASH_DEPOSIT',    label: 'Deposits' },
  { key: 'CASH_WITHDRAWAL', label: 'Withdrawals' },
  { key: 'COMMISSION',      label: 'Commissions' },
  { key: 'FX_CONVERSION',   label: 'FX' },
]

// ─── TypeBadge ────────────────────────────────

function TypeBadge({ type }: { type: string }) {
  const meta = TYPE_META[type] ?? {
    label: type,
    icon: DollarSign,
    badgeClass: 'text-muted-foreground bg-muted',
  }
  const Icon = meta.icon
  return (
    <span className={cn(
      'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap',
      meta.badgeClass
    )}>
      <Icon className="h-3 w-3 shrink-0" />
      {meta.label}
    </span>
  )
}

// ─── Summary Donuts ───────────────────────────

interface DonutCardProps {
  title: string
  data: { name: string; value: number; color: string }[]
  centerLabel: string
}

function DonutCard({ title, data, centerLabel }: DonutCardProps) {
  const total = data.reduce((s, d) => s + d.value, 0)
  if (total === 0) return null
  return (
    <div className="rounded-xl border bg-card p-4 flex flex-col items-center gap-2 min-w-[160px]">
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{title}</p>
      <div className="relative h-24 w-24">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} cx="50%" cy="50%" innerRadius={28} outerRadius={40} dataKey="value" strokeWidth={0}>
              {data.map((entry, i) => <Cell key={i} fill={entry.color} />)}
            </Pie>
            <Tooltip formatter={(v: number) => [`${v} txn`, '']} contentStyle={{ fontSize: 11 }} />
          </PieChart>
        </ResponsiveContainer>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-base font-bold">{centerLabel}</span>
        </div>
      </div>
      <div className="flex flex-wrap justify-center gap-x-3 gap-y-1">
        {data.map((d) => (
          <div key={d.name} className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full shrink-0" style={{ background: d.color }} />
            <span className="text-xs text-muted-foreground">{d.name} ({d.value})</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Transaction row ──────────────────────────

function TxRow({ tx }: { tx: Transaction }) {
  const currency = useUIStore((s) => s.currency)
  const amount = BigInt(tx.amount)
  const meta = TYPE_META[tx.type]
  const sign = meta?.amountSign ?? 'neutral'
  const gainBig = tx.realizedGain ? BigInt(tx.realizedGain) : null

  const amountClass = cn(
    'text-sm font-medium',
    sign === 'positive' && 'text-green-600 dark:text-green-400',
    sign === 'negative' && 'text-destructive',
    sign === 'neutral'  && 'text-muted-foreground',
  )
  const amountPrefix = sign === 'positive' ? '+' : sign === 'negative' ? '−' : ''

  return (
    <tr className="border-b last:border-0 hover:bg-muted/20 transition-colors">
      {/* Date */}
      <td className="py-2.5 px-3 text-sm text-muted-foreground tabular-nums whitespace-nowrap">
        {tx.date}
      </td>
      {/* Type */}
      <td className="py-2.5 px-3">
        <TypeBadge type={tx.type} />
      </td>
      {/* Security / Account / Description */}
      <td className="py-2.5 px-3 max-w-[180px]">
        {tx.holding ? (
          <div>
            <span className="text-sm font-medium">{tx.holding.tickerSymbol}</span>
            <span className="text-xs text-muted-foreground ml-1.5 hidden sm:inline truncate">
              {tx.holding.name}
            </span>
          </div>
        ) : tx.cashAccount ? (
          <span className="text-sm text-muted-foreground">{tx.cashAccount.name}</span>
        ) : tx.notes ? (
          <span className="text-sm text-muted-foreground truncate">{tx.notes}</span>
        ) : (
          <span className="text-sm text-muted-foreground">—</span>
        )}
      </td>
      {/* Shares + price per share */}
      <td className="py-2.5 px-3 text-right tabular-nums hidden sm:table-cell">
        {tx.shares ? (
          <div>
            <span className="text-sm text-muted-foreground">
              {parseFloat(tx.shares).toLocaleString()}
            </span>
            {tx.pricePerShare && (
              <div className="text-xs text-muted-foreground/70">
                @ {formatCurrency(BigInt(tx.pricePerShare), currency)}
              </div>
            )}
          </div>
        ) : (
          <span className="text-sm text-muted-foreground">—</span>
        )}
      </td>
      {/* Amount + optional realized gain */}
      <td className="py-2.5 px-3 text-right tabular-nums">
        <div>
          <span className={amountClass}>
            {amountPrefix}{formatCurrency(amount, currency)}
          </span>
          {gainBig !== null && tx.type === 'SECURITY_SELL' && (
            <div className={cn('text-xs', gainBig >= 0n ? 'text-gain' : 'text-loss')}>
              {gainBig >= 0n ? '+' : '−'}
              {formatCurrency(gainBig < 0n ? -gainBig : gainBig, currency)} gain
            </div>
          )}
        </div>
      </td>
      {/* Notes (hidden on small screens; for FX/Commission always shown) */}
      <td className="py-2.5 px-3 text-sm text-muted-foreground text-right hidden md:table-cell max-w-[160px] truncate">
        {tx.type !== 'SECURITY_BUY' && tx.type !== 'SECURITY_SELL'
          ? (tx.notes ?? '—')
          : (tx.notes ?? '—')}
      </td>
    </tr>
  )
}

// ─── Pagination ───────────────────────────────

interface PaginationBarProps {
  currentPage: number
  totalPages: number
  activeType: string
  total: number
  isPending: boolean
  navigate: (type: string, page: number) => void
}

function PaginationBar({
  currentPage, totalPages, activeType, total, isPending, navigate,
}: PaginationBarProps) {
  if (totalPages <= 1) return null

  const pageStart = (currentPage - 1) * 50 + 1
  const pageEnd   = Math.min(currentPage * 50, total)

  // Compact page list: first, current±1, last — with ellipsis gaps
  const pages: (number | '…')[] = []
  const seen = new Set<number>()
  const add = (n: number) => {
    if (n >= 1 && n <= totalPages && !seen.has(n)) { seen.add(n); pages.push(n) }
  }
  add(1)
  if (currentPage - 2 > 2) pages.push('…')
  for (let p = Math.max(2, currentPage - 1); p <= Math.min(totalPages - 1, currentPage + 1); p++) add(p)
  if (currentPage + 2 < totalPages - 1) pages.push('…')
  add(totalPages)

  return (
    <div className="flex items-center justify-between px-3 py-2.5 border-t flex-wrap gap-2">
      <span className="text-xs text-muted-foreground tabular-nums">
        {pageStart}–{pageEnd} of {total}
      </span>
      <div className="flex items-center gap-0.5">
        <button
          disabled={currentPage <= 1 || isPending}
          onClick={() => navigate(activeType, currentPage - 1)}
          className="rounded p-1 text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          aria-label="Previous page"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        {pages.map((p, i) =>
          p === '…' ? (
            <span key={`e${i}`} className="px-1 text-xs text-muted-foreground">…</span>
          ) : (
            <button
              key={p}
              disabled={p === currentPage || isPending}
              onClick={() => navigate(activeType, p as number)}
              className={cn(
                'h-7 min-w-[28px] rounded px-1.5 text-xs transition-colors',
                p === currentPage
                  ? 'bg-primary text-primary-foreground font-medium cursor-default'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted',
              )}
            >
              {p}
            </button>
          )
        )}
        <button
          disabled={currentPage >= totalPages || isPending}
          onClick={() => navigate(activeType, currentPage + 1)}
          className="rounded p-1 text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          aria-label="Next page"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}

// ─── Main Component ───────────────────────────

export function ActivityClient({
  transactions,
  summary,
  total,
  currentPage,
  totalPages,
  activeType,
}: ActivityClientProps) {
  const currency  = useUIStore((s) => s.currency)
  const router    = useRouter()
  const [isPending, startTransition] = useTransition()

  function navigate(type: string, page: number) {
    startTransition(() => {
      const p = new URLSearchParams()
      if (type !== 'all') p.set('type', type)
      if (page > 1) p.set('page', page.toString())
      const qs = p.toString()
      router.push(qs ? `/activity?${qs}` : '/activity')
    })
  }

  // All-time counts + totals (always from full summary, unaffected by filter)
  const countByType: Record<string, number> = {}
  const amountByType: Record<string, bigint> = {}
  const allTotal = summary.reduce((s, x) => s + x.count, 0)
  for (const s of summary) {
    countByType[s.type]  = s.count
    amountByType[s.type] = BigInt(s.totalAmount)
  }

  const totalInvested   = amountByType['SECURITY_BUY']  ?? 0n
  const totalDividends  = amountByType['DIVIDEND']       ?? 0n
  const totalDeposited  = amountByType['CASH_DEPOSIT']   ?? 0n
  const totalCommission = amountByType['COMMISSION']     ?? 0n

  // Donut data
  const tradesData = [
    { name: 'Buy',  value: countByType['SECURITY_BUY']  ?? 0, color: TYPE_META.SECURITY_BUY.color  },
    { name: 'Sell', value: countByType['SECURITY_SELL'] ?? 0, color: TYPE_META.SECURITY_SELL.color },
  ].filter(d => d.value > 0)

  const dividendData = [
    { name: 'Dividend', value: countByType['DIVIDEND'] ?? 0, color: TYPE_META.DIVIDEND.color },
  ].filter(d => d.value > 0)

  const cashData = [
    { name: 'Deposit',    value: countByType['CASH_DEPOSIT']    ?? 0, color: TYPE_META.CASH_DEPOSIT.color    },
    { name: 'Withdrawal', value: countByType['CASH_WITHDRAWAL'] ?? 0, color: TYPE_META.CASH_WITHDRAWAL.color },
    { name: 'Commission', value: countByType['COMMISSION']      ?? 0, color: TYPE_META.COMMISSION.color      },
    { name: 'FX',         value: countByType['FX_CONVERSION']   ?? 0, color: TYPE_META.FX_CONVERSION.color   },
  ].filter(d => d.value > 0)

  return (
    <div className={cn('space-y-5 transition-opacity', isPending && 'opacity-60 pointer-events-none')}>

      {/* ── Header ── */}
      <div>
        <h1 className="text-xl font-semibold">Activity</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          {activeType === 'all'
            ? `${allTotal} transaction${allTotal !== 1 ? 's' : ''}`
            : `${total} ${TYPE_META[activeType]?.label ?? activeType} transaction${total !== 1 ? 's' : ''}`}
        </p>
      </div>

      {/* ── Summary cards — always all-time totals ── */}
      {allTotal > 0 && (
        <div className="flex flex-wrap gap-4">

          {tradesData.length > 0 && (
            <DonutCard
              title="Trades"
              data={tradesData}
              centerLabel={`${(countByType['SECURITY_BUY'] ?? 0) + (countByType['SECURITY_SELL'] ?? 0)}`}
            />
          )}

          {dividendData.length > 0 && (
            <DonutCard
              title="Dividends"
              data={dividendData}
              centerLabel={`${countByType['DIVIDEND'] ?? 0}`}
            />
          )}

          {cashData.length > 0 && (
            <DonutCard
              title="Cash flows"
              data={cashData}
              centerLabel={`${cashData.reduce((s, d) => s + d.value, 0)}`}
            />
          )}

          {totalInvested > 0n && (
            <div className="rounded-xl border bg-card p-4 min-w-[140px] flex flex-col justify-between">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Invested</p>
              <p className="text-2xl font-bold tabular-nums mt-2">
                {formatCurrency(totalInvested, currency, { compact: true })}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {countByType['SECURITY_BUY'] ?? 0} buy{(countByType['SECURITY_BUY'] ?? 0) !== 1 ? 's' : ''}
              </p>
            </div>
          )}

          {totalDeposited > 0n && (
            <div className="rounded-xl border bg-card p-4 min-w-[140px] flex flex-col justify-between">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Deposited</p>
              <p className="text-2xl font-bold tabular-nums mt-2">
                {formatCurrency(totalDeposited, currency, { compact: true })}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {countByType['CASH_DEPOSIT'] ?? 0} deposit{(countByType['CASH_DEPOSIT'] ?? 0) !== 1 ? 's' : ''}
              </p>
            </div>
          )}

          {totalDividends > 0n && (
            <div className="rounded-xl border bg-card p-4 min-w-[140px] flex flex-col justify-between">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Dividends</p>
              <p className="text-2xl font-bold tabular-nums mt-2 text-primary">
                {formatCurrency(totalDividends, currency, { compact: true })}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {countByType['DIVIDEND'] ?? 0} payment{(countByType['DIVIDEND'] ?? 0) !== 1 ? 's' : ''}
              </p>
            </div>
          )}

          {totalCommission > 0n && (
            <div className="rounded-xl border bg-card p-4 min-w-[140px] flex flex-col justify-between">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Commissions</p>
              <p className="text-2xl font-bold tabular-nums mt-2 text-destructive">
                {formatCurrency(totalCommission, currency, { compact: true })}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {countByType['COMMISSION'] ?? 0} fee{(countByType['COMMISSION'] ?? 0) !== 1 ? 's' : ''}
              </p>
            </div>
          )}
        </div>
      )}

      {/* ── Filter tabs ── */}
      <div className="flex gap-1 flex-wrap">
        {FILTER_TABS.map((tab) => {
          const count = tab.key === 'all' ? allTotal : (countByType[tab.key] ?? 0)
          if (tab.key !== 'all' && count === 0) return null
          const isActive = activeType === tab.key
          return (
            <button
              key={tab.key}
              onClick={() => navigate(tab.key, 1)}
              disabled={isPending}
              className={cn(
                'rounded-full px-3 py-1 text-sm transition-colors',
                isActive
                  ? 'bg-primary text-primary-foreground font-medium'
                  : 'bg-muted text-muted-foreground hover:text-foreground',
              )}
            >
              {tab.label}
              {count > 0 && (
                <span className="ml-1.5 tabular-nums text-xs opacity-70">{count}</span>
              )}
            </button>
          )
        })}
      </div>

      {/* ── Transaction table ── */}
      <div className="rounded-xl border bg-card overflow-hidden">
        {transactions.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            {allTotal === 0 ? 'No transactions recorded yet.' : 'No transactions match this filter.'}
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b bg-muted/30">
                    <th className="py-2 px-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide whitespace-nowrap">Date</th>
                    <th className="py-2 px-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">Type</th>
                    <th className="py-2 px-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">Security / Account</th>
                    <th className="py-2 px-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wide hidden sm:table-cell">Shares</th>
                    <th className="py-2 px-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wide">Amount</th>
                    <th className="py-2 px-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wide hidden md:table-cell">Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.map((tx) => <TxRow key={tx.id} tx={tx} />)}
                </tbody>
              </table>
            </div>
            <PaginationBar
              currentPage={currentPage}
              totalPages={totalPages}
              activeType={activeType}
              total={total}
              isPending={isPending}
              navigate={navigate}
            />
          </>
        )}
      </div>
    </div>
  )
}
