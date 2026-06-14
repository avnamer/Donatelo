import { notFound, redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/db/supabase-server'
import { getFolderById, getFolders, getHoldingsForPortfolio } from '@/lib/db/queries'
import { FolderPageClient } from '@/components/portfolio/FolderPageClient'
import type { ServerHolding } from '@/hooks/usePortfolio'
import type { Lot } from '@/types'

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function FolderPage({ params }: PageProps) {
  const user = await getCurrentUser()
  if (!user) redirect('/auth/login')

  const { id } = await params
  const folder = await getFolderById(id, user.id)
  if (!folder) notFound()

  const [rawHoldings, allFolders] = await Promise.all([
    getHoldingsForPortfolio(folder.portfolioId, user.id),
    getFolders(folder.portfolioId, user.id),
  ])

  const holdings: ServerHolding[] = rawHoldings.map((h) => ({
    id: h.id,
    tickerSymbol: h.tickerSymbol,
    name: h.name,
    exchange: h.exchange,
    folderId: h.folderId,
    expenseRatio: h.expenseRatio ? Number(h.expenseRatio) : null,
    targetFolderId: h.targetFolderId ?? null,
    folder: {
      name: h.folder.name,
      color: h.folder.color,
      parentId: h.folder.parentId,
    },
    lots: h.lots.map((lot) => ({
      ...lot,
      shares: Number(lot.shares),
      soldShares: Number(lot.soldShares),
    })) as unknown as Lot[],
  }))

  // Target allocation per holding (from DB) — shown alongside actual % in folder view
  const holdingTargets: Record<string, number> = {}
  for (const h of rawHoldings) {
    holdingTargets[h.id] = h.targetAllocationPct ? Number(h.targetAllocationPct) : 0
  }

  const serializedFolder = {
    id: folder.id,
    portfolioId: folder.portfolioId,
    parentId: folder.parentId,
    name: folder.name,
    color: folder.color,
    isWatchlist: folder.isWatchlist,
    targetAllocationPct: folder.targetAllocationPct ? Number(folder.targetAllocationPct) : null,
    parent: folder.parent,
    children: folder.children.map((c) => ({
      ...c,
      targetAllocationPct: c.targetAllocationPct ? Number(c.targetAllocationPct) : null,
    })),
  }

  const serializedFolders = allFolders.map((f) => ({
    ...f,
    targetAllocationPct: f.targetAllocationPct ? Number(f.targetAllocationPct) : null,
    createdAt: f.createdAt.toISOString(),
  }))

  return (
    <FolderPageClient
      folder={serializedFolder}
      holdings={holdings}
      folders={serializedFolders as any}
      holdingTargets={holdingTargets}
    />
  )
}
