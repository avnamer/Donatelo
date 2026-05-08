// ─────────────────────────────────────────────
// Dividends page — dividend income overview
// ─────────────────────────────────────────────

import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/db/supabase-server'
import { getPortfolios, getHoldingsForPortfolio, getDividendsForHolding } from '@/lib/db/queries'
import { DividendsClient } from '@/components/dividends/DividendsClient'
import type { ServerHolding } from '@/hooks/usePortfolio'
import type { Lot } from '@/types'

export const dynamic = 'force-dynamic'

export default async function DividendsPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/auth/login')

  const portfolios = await getPortfolios(user.id)
  if (portfolios.length === 0) {
    return <div className="py-24 text-center text-muted-foreground text-sm">No portfolio found.</div>
  }

  const portfolioId = portfolios[0].id
  const rawHoldings = await getHoldingsForPortfolio(portfolioId, user.id)

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

  // Fetch dividend transaction history per holding
  const oneYearAgo = new Date()
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1)

  const dividendResults = await Promise.all(
    rawHoldings.map(async (h) => {
      const dividends = await getDividendsForHolding(h.id, user.id, oneYearAgo)
      const total = dividends.reduce((s, d) => s + d.amount, 0n)
      return {
        holdingId: h.id,
        tickerSymbol: h.tickerSymbol,
        name: h.name,
        trailingIncome: total.toString(),
        currency: portfolios[0].baseCurrency,
      }
    })
  )

  const dividendsByHolding = Object.fromEntries(
    dividendResults
      .filter((d) => BigInt(d.trailingIncome) > 0n)
      .map((d) => [d.holdingId, d])
  )

  return (
    <DividendsClient
      holdings={holdings}
      dividendsByHolding={dividendsByHolding}
      upcomingEvents={[]} // populated by /api/dividends in Phase 2.3
    />
  )
}
