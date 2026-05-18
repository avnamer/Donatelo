// ─────────────────────────────────────────────
// Invest page — Auto-invest calculator
// ─────────────────────────────────────────────

import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { getCurrentUser } from '@/lib/db/supabase-server'
import { getPortfolios, getPortfolioWithStructure } from '@/lib/db/queries'
import { InvestClient } from '@/components/invest/InvestClient'

export default async function InvestPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/auth/login')

  const portfolios = await getPortfolios(user.id)
  if (portfolios.length === 0) {
    return (
      <div className="py-24 text-center text-muted-foreground text-sm">
        Create a portfolio first to use Auto-Invest.
      </div>
    )
  }

  const cookieStore = await cookies()
  const savedId = cookieStore.get('portfolio-id')?.value
  const selectedPortfolio = portfolios.find((p) => p.id === savedId) ?? portfolios[0]
  const portfolio = await getPortfolioWithStructure(selectedPortfolio.id, user.id)
  if (!portfolio) redirect('/')

  // Shape data for the client
  const clientPortfolio = {
    id: portfolio.id,
    name: portfolio.name,
    folders: portfolio.folders.map((f) => ({
      id: f.id,
      name: f.name,
      targetAllocationPct: f.targetAllocationPct ? Number(f.targetAllocationPct) : null,
      holdings: f.holdings.map((h) => ({
        id: h.id,
        tickerSymbol: h.tickerSymbol,
        name: h.name,
        exchange: h.exchange,
        targetAllocationPct: h.targetAllocationPct ? Number(h.targetAllocationPct) : null,
        lots: h.lots.map((l) => ({
          shares: Number(l.shares),
          soldShares: Number(l.soldShares),
          costPerShare: l.costPerShare,
          costCurrency: l.costCurrency,
        })),
      })),
    })),
  }

  return <InvestClient portfolio={clientPortfolio} />
}
