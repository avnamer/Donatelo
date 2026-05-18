// ─────────────────────────────────────────────
// Dividends page — auto-fetches dividend schedule client-side per holding
// ─────────────────────────────────────────────

import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { getCurrentUser } from '@/lib/db/supabase-server'
import { getPortfolios, getHoldingsForPortfolio } from '@/lib/db/queries'
import { DividendsClient } from '@/components/dividends/DividendsClient'

export const dynamic = 'force-dynamic'

export default async function DividendsPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/auth/login')

  const portfolios = await getPortfolios(user.id)
  if (portfolios.length === 0) {
    return <div className="py-24 text-center text-muted-foreground text-sm">No portfolio found.</div>
  }

  const cookieStore = await cookies()
  const savedId = cookieStore.get('portfolio-id')?.value
  const portfolioId = (portfolios.find((p) => p.id === savedId) ?? portfolios[0]).id
  const rawHoldings = await getHoldingsForPortfolio(portfolioId, user.id)

  const holdings = rawHoldings.map((h) => ({
    id: h.id,
    tickerSymbol: h.tickerSymbol,
    name: h.name,
    exchange: h.exchange,
    lots: h.lots.map((l) => ({
      purchaseDate: l.purchaseDate,
      shares: Number(l.shares),
      soldShares: Number(l.soldShares),
      soldDate: l.soldDate ?? null,
    })),
  }))

  return <DividendsClient holdings={holdings} />
}
