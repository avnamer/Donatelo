'use client'

// ─────────────────────────────────────────────
// ActivityClient — paginated transaction feed
// Shows all buys, sells, dividends, deposits, withdrawals
// ─────────────────────────────────────────────

import { formatCurrency, toDisplay } from '@/lib/calculations'
import { useUIStore } from '@/store/ui'
import { cn } from '@/lib/utils'
import { TrendingUp, TrendingDown, DollarSign, ArrowDownLeft, ArrowUpRight } from 'lucide-react'

// ─── Types ────────────────────────────────────

interface Transaction {
  id: string
  type: string
  date: string
  amount: string     // BigInt serialized as string
  currency: string
  shares: string | null
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
}

// ─── Helpers ──────────────────────────────────

const TYPE_META: Record<string, {
  label: string
  icon: React.ComponentType<{ className?: string }>
  colorClass: string
}> = {
  SECURITY_BUY: { label: 'Buy', icon: TrendingUp, colorClass: 'text-gain bg-gain-muted' },
  SECURITY_SELL: { label: 'Sell', icon: TrendingDown, colorClass: 'text-loss bg-loss/10' },
  DIVIDEND: { label: 'Dividend', icon: DollarSign, colorClass: 'text-primary bg-primary/10' },
  CASH_DEPOSIT: { label: 'Deposit', icon: ArrowDownLeft, colorClass: 'text-gain bg-gain-muted' },
  CASH_WITHDRAWAL: { label: 'Withdraw', icon: ArrowUpRight, colorClass: 'text-loss bg-loss/10' },
}

function TypeBadge({ type }: { type: string }) {
  const meta = TYPE_META[type] ?? { label: type, icon: DollarSign, colorClass: 'text-muted-foreground bg-muted' }
  const Icon = meta.icon

  return (
    <span className={cn(
      'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium',
      meta.colorClass
    )}>
      <Icon className="h-3 w-3" />
      {meta.label}
    </span>
  )
}

// ─── Summary bar ──────────────────────────────

function SummaryBar({ summary }: { summary: SummaryItem[] }) {
  const currency = useUIStore((s) => s.currency)

  if (summary.length === 0) return null

  return (
    <div className="flex flex-wrap gap-2">
      {summary.map((s) => {
        const amount = BigInt(s.totalAmount)
        const meta = TYPE_META[s.type]
        return (
          <div key={s.type} className="rounded-lg border bg-card px-3 py-2">
            <p className="text-xs text-muted-foreground">{meta?.label ?? s.type}</p>
            <p className="text-sm font-semibold tabular-nums">
              {formatCurrency(amount, currency, { compact: true })}
            </p>
            <p className="text-xs text-muted-foreground">{s.count} transactions</p>
          </div>
        )
      })}
    </div>
  )
}

// ─── Transaction row ──────────────────────────

function TxRow({ tx }: { tx: Transaction }) {
  const currency = useUIStore((s) => s.currency)
  const amount = BigInt(tx.amount)
  const isSell = tx.type === 'SECURITY_SELL' || tx.type === 'CASH_WITHDRAWAL'

  return (
    <tr className="border-b hover:bg-muted/20 transition-colors">
      <td className="py-2.5 px-3 text-sm text-muted-foreground tabular-nums whitespace-nowrap">
        {tx.date}
      </td>
      <td className="py-2.5 px-3">
        <TypeBadge type={tx.type} />
      </td>
      <td className="py-2.5 px-3">
        {tx.holding ? (
          <div>
            <span className="text-sm font-medium">{tx.holding.tickerSymbol}</span>
            <span className="text-xs text-muted-foreground ml-1.5">{tx.holding.name}</span>
          </div>
        ) : tx.cashAccount ? (
          <span className="text-sm text-muted-foreground">{tx.cashAccount.name}</span>
        ) : (
          <span className="text-sm text-muted-foreground">—</span>
        )}
      </td>
      <td className="py-2.5 px-3 text-right tabular-nums text-sm text-muted-foreground">
        {tx.shares ? `${parseFloat(tx.shares).toLocaleString()} shares` : '—'}
      </td>
      <td className={cn(
        'py-2.5 px-3 text-right tabular-nums text-sm font-medium',
        isSell ? 'text-loss' : 'text-gain'
      )}>
        {isSell ? '-' : '+'}{formatCurrency(amount, currency)}
      </td>
      <td className="py-2.5 px-3 text-sm text-muted-foreground text-right">
        {tx.notes ?? '—'}
      </td>
    </tr>
  )
}

// ─── Main Component ───────────────────────────

export function ActivityClient({ transactions, summary, total }: ActivityClientProps) {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Activity</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          {total} transaction{total !== 1 ? 's' : ''}
        </p>
      </div>

      <SummaryBar summary={summary} />

      <div className="rounded-xl border bg-card overflow-hidden">
        {transactions.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            No transactions recorded yet.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b bg-muted/30">
                  <th className="py-2 px-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide whitespace-nowrap">
                    Date
                  </th>
                  <th className="py-2 px-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    Type
                  </th>
                  <th className="py-2 px-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    Security / Account
                  </th>
                  <th className="py-2 px-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    Shares
                  </th>
                  <th className="py-2 px-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    Amount
                  </th>
                  <th className="py-2 px-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    Notes
                  </th>
                </tr>
              </thead>
              <tbody>
                {transactions.map((tx) => (
                  <TxRow key={tx.id} tx={tx} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
