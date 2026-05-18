import { redirect, notFound } from 'next/navigation'
import { getCurrentUser } from '@/lib/db/supabase-server'
import { getHoldingWithLots } from '@/lib/db/queries'
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
      }}
      lots={lots}
    />
  )
}
