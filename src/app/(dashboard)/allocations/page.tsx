// ─────────────────────────────────────────────
// Allocations page — drill-down target allocation editor
// ─────────────────────────────────────────────

import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { getCurrentUser } from '@/lib/db/supabase-server'
import { getPortfolios, getPortfolioWithStructure, getHoldingsForPortfolio } from '@/lib/db/queries'
import { AllocationsClient } from '@/components/allocations/AllocationsClient'
import { saveTargetAllocation, saveHoldingTargetAllocation } from '@/app/actions/allocations'
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

  const cookieStore = await cookies()
  const savedId = cookieStore.get('portfolio-id')?.value
  const selectedPortfolio = portfolios.find((p) => p.id === savedId) ?? portfolios[0]
  const portfolio = await getPortfolioWithStructure(selectedPortfolio.id, user.id)
  if (!portfolio) redirect('/')

  const rawHoldings = await getHoldingsForPortfolio(selectedPortfolio.id, user.id)

  // All folders (root + subfolders) with parentId for tree building
  const allFolders = portfolio.folders.map((f) => ({
    id: f.id,
    name: f.name,
    color: f.color,
    parentId: f.parentId,
    targetPct: f.targetAllocationPct ? Number(f.targetAllocationPct) : 0,
  }))

  // Holdings with parentId so usePortfolioMetrics resolves rootFolderId correctly
  const holdings: ServerHolding[] = rawHoldings.map((h) => ({
    id: h.id,
    tickerSymbol: h.tickerSymbol,
    name: h.name,
    exchange: h.exchange,
    folderId: h.folderId,
    expenseRatio: h.expenseRatio ? Number(h.expenseRatio) : null,
    targetFolderId: h.targetFolderId ?? null,
    plannedAmount: h.plannedAmount != null ? Number(h.plannedAmount) / 100 : null,
    folder: {
      name: h.folder.name,
      color: h.folder.color,
      parentId: h.folder.parentId,
    },
    lots: h.lots.map((l) => ({
      ...l,
      shares: Number(l.shares),
      soldShares: Number(l.soldShares),
    })) as unknown as Lot[],
  }))

  // Initial target % per holding (0 if unset)
  const holdingTargets: Record<string, number> = {}
  for (const h of rawHoldings) {
    holdingTargets[h.id] = h.targetAllocationPct ? Number(h.targetAllocationPct) : 0
  }

  return (
    <AllocationsClient
      allFolders={allFolders}
      holdings={holdings}
      holdingTargets={holdingTargets}
      onSaveFolder={async (folderId, targetPct) => {
        'use server'
        await saveTargetAllocation(folderId, targetPct)
      }}
      onSaveHolding={async (holdingId, targetPct) => {
        'use server'
        await saveHoldingTargetAllocation(holdingId, targetPct)
      }}
    />
  )
}
