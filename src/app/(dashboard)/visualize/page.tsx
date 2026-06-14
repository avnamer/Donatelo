// Visualize page

import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { getCurrentUser } from '@/lib/db/supabase-server'
import { getPortfolios, getHoldingsForPortfolio } from '@/lib/db/queries'
import { VisualizeClient } from '@/components/visualize/VisualizeClient'
import type { ServerHolding } from '@/hooks/usePortfolio'
import type { Lot } from '@/types'

export default async function VisualizePage() {
  const user = await getCurrentUser()
  if (!user) redirect('/auth/login')

  const portfolios = await getPortfolios(user.id)
  if (portfolios.length === 0) {
    return <div className="py-24 text-center text-muted-foreground text-sm">No portfolio found.</div>
  }

  const cookieStore = await cookies()
  const savedId = cookieStore.get('portfolio-id')?.value
  const portfolio = portfolios.find((p) => p.id === savedId) ?? portfolios[0]
  const rawHoldings = await getHoldingsForPortfolio(portfolio.id, user.id)

  const holdings: ServerHolding[] = rawHoldings.map((h) => ({
    id: h.id,
    tickerSymbol: h.tickerSymbol,
    name: h.name,
    exchange: h.exchange,
    folderId: h.folderId,
    expenseRatio: h.expenseRatio ? Number(h.expenseRatio) : null,
    targetFolderId: h.targetFolderId ?? null,
    folder: { name: h.folder.name, color: h.folder.color },
    lots: h.lots.map((l) => ({
      ...l,
      shares: Number(l.shares),
      soldShares: Number(l.soldShares),
    })) as unknown as Lot[],
  }))

  return <VisualizeClient holdings={holdings} />
}
