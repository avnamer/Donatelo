import { redirect, notFound } from 'next/navigation'
import { getCurrentUser } from '@/lib/db/supabase-server'
import { getHoldingWithLots, getFolders } from '@/lib/db/queries'
import { prisma } from '@/lib/db/prisma'
import { HoldingDetail } from '@/components/portfolio/HoldingDetail'
import type { Lot } from '@/types'

interface Props {
  params: Promise<{ id: string }>
}

export default async function HoldingPage({ params }: Props) {
  const user = await getCurrentUser()
  if (!user) redirect('/auth/login')

  const { id } = await params
  const holding = await getHoldingWithLots(id, user.id)
  if (!holding) notFound()

  const [folders, thresholdRows] = await Promise.all([
    getFolders(holding.folder.portfolioId, user.id),
    prisma.$queryRaw<Array<{ dip_threshold: number | null; buy_now_threshold: number | null }>>`
      SELECT dip_threshold, buy_now_threshold FROM holdings WHERE id = ${id}
    `,
  ])
  const thresholds = thresholdRows[0] ?? { dip_threshold: null, buy_now_threshold: null }

  // Serialize BigInt fields for client component
  const lots: Lot[] = holding.lots.map((lot) => ({
    ...lot,
    shares: Number(lot.shares),
    soldShares: Number(lot.soldShares),
    // Keep BigInts as numbers for display (will lose precision for huge values but acceptable)
    costPerShare: lot.costPerShare,
    soldPricePerShare: lot.soldPricePerShare ?? null,
    proceedsFromSale: lot.proceedsFromSale ?? null,
    activeShares: Number(lot.shares) - Number(lot.soldShares),
  })) as unknown as Lot[]

  return (
    <HoldingDetail
      holding={{
        id: holding.id,
        tickerSymbol: holding.tickerSymbol,
        name: holding.name,
        exchange: holding.exchange,
        expenseRatio: holding.expenseRatio ? Number(holding.expenseRatio) : null,
        folderId: holding.folderId,
        folderName: holding.folder.name,
        portfolioId: holding.folder.portfolioId,
        isWatchlist: holding.folder.isWatchlist,
        targetFolderId: holding.targetFolderId ?? null,
        plannedAmount: holding.plannedAmount != null ? Number(holding.plannedAmount) / 100 : null,
        dipThreshold: thresholds.dip_threshold,
        buyNowThreshold: thresholds.buy_now_threshold,
      }}
      lots={lots}
      folders={folders}
    />
  )
}
