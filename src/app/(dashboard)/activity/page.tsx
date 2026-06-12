// ─────────────────────────────────────────────
// Activity page — transaction history feed
// ─────────────────────────────────────────────

import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { getCurrentUser } from '@/lib/db/supabase-server'
import {
  getPortfolios,
  getTransactions,
  getTransactionSummary,
  syncActivityData,
} from '@/lib/db/queries'
import type { TransactionType } from '@/lib/db/queries/transactions'
import { ActivityClient } from '@/components/activity/ActivityClient'

export const dynamic = 'force-dynamic'

const PAGE_SIZE = 50

export default async function ActivityPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; type?: string }>
}) {
  const user = await getCurrentUser()
  if (!user) redirect('/auth/login')

  const params = await searchParams
  const page = Math.max(1, Number(params.page) || 1)
  const typeFilter =
    params.type && params.type !== 'all' ? (params.type as TransactionType) : undefined

  const portfolios = await getPortfolios(user.id)
  if (portfolios.length === 0) {
    return (
      <div className="py-24 text-center text-muted-foreground text-sm">
        No portfolio found.
      </div>
    )
  }

  const cookieStore = await cookies()
  const savedId = cookieStore.get('portfolio-id')?.value
  const portfolioId = (portfolios.find((p) => p.id === savedId) ?? portfolios[0]).id

  // Single call: dedup + backfill, skipped entirely when data is already clean.
  await syncActivityData(portfolioId, user.id)

  const [txResult, summary] = await Promise.all([
    getTransactions(portfolioId, user.id, { page, pageSize: PAGE_SIZE, type: typeFilter }),
    getTransactionSummary(portfolioId, user.id),
  ])

  // Serialize for client (BigInt → string)
  const transactions = txResult.items.map((t) => ({
    id: t.id,
    type: t.type,
    date: t.date.toISOString().slice(0, 10),
    amount: t.amount.toString(),
    currency: t.currency,
    shares: t.shares ? t.shares.toString() : null,
    pricePerShare: t.pricePerShare ? t.pricePerShare.toString() : null,
    realizedGain: t.realizedGain ? t.realizedGain.toString() : null,
    notes: t.notes,
    holding: t.holding
      ? { tickerSymbol: t.holding.tickerSymbol, name: t.holding.name }
      : null,
    cashAccount: t.cashAccount ? { name: t.cashAccount.name } : null,
  }))

  const summaryData = summary.map((s) => ({
    type: s.type,
    totalAmount: s.totalAmount.toString(),
    count: s.count,
  }))

  const totalPages = Math.max(1, Math.ceil(txResult.total / PAGE_SIZE))

  return (
    <ActivityClient
      transactions={transactions}
      summary={summaryData}
      total={txResult.total}
      portfolioId={portfolioId}
      currentPage={page}
      totalPages={totalPages}
      activeType={params.type ?? 'all'}
    />
  )
}
