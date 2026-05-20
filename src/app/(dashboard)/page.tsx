import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { getCurrentUser } from '@/lib/db/supabase-server'
import { getPortfolios, getHoldingsForPortfolio } from '@/lib/db/queries'
import { HomeDashboardClient } from '@/components/portfolio/HomeDashboardClient'
import { CreatePortfolioForm } from '@/components/portfolio/CreatePortfolioForm'
import type { ServerHolding } from '@/hooks/usePortfolio'
import type { Lot } from '@/types'

export default async function HomePage() {
  const user = await getCurrentUser()
  if (!user) redirect('/auth/login')

  const portfolios = await getPortfolios(user.id)

  if (portfolios.length === 0) {
    return <EmptyState />
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

  return <HomeDashboardClient holdings={holdings} />
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center space-y-6 max-w-sm mx-auto">
      <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center">
        <svg className="w-8 h-8 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4v16m8-8H4" />
        </svg>
      </div>
      <div>
        <h2 className="text-lg font-semibold">Create your first portfolio</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Name your portfolio to get started tracking your investments
        </p>
      </div>
      <CreatePortfolioForm />
    </div>
  )
}
