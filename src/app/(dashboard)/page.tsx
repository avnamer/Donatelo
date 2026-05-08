// ─────────────────────────────────────────────
// Home page — Server Component
// Fetches portfolio data server-side, passes to client shell
// ─────────────────────────────────────────────

import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/db/supabase-server'
import { getPortfolios, getHoldingsForPortfolio } from '@/lib/db/queries'
import { HomeClient } from '@/components/portfolio/HomeClient'
import type { ServerHolding } from '@/hooks/usePortfolio'
import type { Lot } from '@/types'

export default async function HomePage() {
  // Auth — middleware handles redirect but double-check here
  const user = await getCurrentUser()
  if (!user) redirect('/auth/login')

  // Fetch portfolios
  const portfolios = await getPortfolios(user.id)

  // If user has no portfolios, show an onboarding prompt
  if (portfolios.length === 0) {
    return <EmptyState />
  }

  // Use the first portfolio (TODO: support switching portfolios)
  const portfolio = portfolios[0]

  // Fetch all holdings with lots for this portfolio
  const rawHoldings = await getHoldingsForPortfolio(portfolio.id, user.id)

  // Shape into the ServerHolding type the client hook expects
  const holdings: ServerHolding[] = rawHoldings.map((h) => ({
    id: h.id,
    tickerSymbol: h.tickerSymbol,
    name: h.name,
    exchange: h.exchange,
    folderId: h.folderId,
    folder: {
      name: h.folder.name,
      color: h.folder.color,
    },
    lots: h.lots.map((lot) => ({
      ...lot,
      // Prisma returns Decimal for shares — convert to number for calcs
      shares: Number(lot.shares),
      soldShares: Number(lot.soldShares),
    })) as unknown as Lot[],
  }))

  return (
    <HomeClient
      holdings={holdings}
      portfolioName={portfolio.name}
    />
  )
}

// ─── Onboarding empty state ───────────────────

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center space-y-4">
      <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center">
        <svg
          className="w-8 h-8 text-muted-foreground"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M12 4v16m8-8H4"
          />
        </svg>
      </div>
      <div>
        <h2 className="text-lg font-semibold">Create your first portfolio</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Start by creating a portfolio and adding your holdings
        </p>
      </div>
      <button className="rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:opacity-90 transition-opacity">
        Create Portfolio
      </button>
    </div>
  )
}
