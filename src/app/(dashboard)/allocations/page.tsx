// ─────────────────────────────────────────────
// Allocations page — set target % per folder
// ─────────────────────────────────────────────

import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/db/supabase-server'
import { getPortfolios, getPortfolioWithStructure, getHoldingsForPortfolio } from '@/lib/db/queries'
import { AllocationsClient } from '@/components/allocations/AllocationsClient'
import { saveTargetAllocation } from '@/app/actions/allocations'
import type { ServerHolding } from '@/hooks/usePortfolio'
import type { Lot } from '@/types'

export default async function AllocationsPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/auth/login')

  const portfolios = await getPortfolios(user.id)
  if (portfolios.length === 0) {
    return (
      <div className="py-24 text-center text-muted-foreground text-sm">
        Create a portfolio first.
      </div>
    )
  }

  const portfolio = await getPortfolioWithStructure(portfolios[0].id, user.id)
  if (!portfolio) redirect('/')

  const rawHoldings = await getHoldingsForPortfolio(portfolios[0].id, user.id)

  const folders = portfolio.folders.map((f) => ({
    id: f.id,
    name: f.name,
    color: f.color,
    targetPct: f.targetAllocationPct ? Number(f.targetAllocationPct) : 0,
    currentValue: 0n, // computed client-side via metrics
    currentPct: 0,    // computed client-side
  }))

  const holdings: ServerHolding[] = rawHoldings.map((h) => ({
    id: h.id,
    tickerSymbol: h.tickerSymbol,
    name: h.name,
    exchange: h.exchange,
    folderId: h.folderId,
    folder: { name: h.folder.name, color: h.folder.color },
    lots: h.lots.map((l) => ({
      ...l,
      shares: Number(l.shares),
      soldShares: Number(l.soldShares),
    })) as unknown as Lot[],
  }))

  return (
    <AllocationsClient
      folders={folders}
      holdings={holdings}
      onSave={async (folderId, targetPct) => {
        'use server'
        await saveTargetAllocation(folderId, targetPct)
      }}
    />
  )
}
