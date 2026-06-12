import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/db/supabase-server'
import { getPortfolios, backfillTransactionsFromLots } from '@/lib/db/queries'
import { cookies } from 'next/headers'

/**
 * POST /api/lots/backfill
 * Creates SECURITY_BUY / SECURITY_SELL transactions for existing lots
 * that don't yet have a corresponding transaction row.
 * Safe to call multiple times — skips lots already linked to a transaction.
 */
export async function POST(request: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Determine portfolio from body or cookie
  let portfolioId: string | undefined
  try {
    const body = await request.json().catch(() => ({}))
    portfolioId = body?.portfolioId
  } catch {
    // ignore
  }

  if (!portfolioId) {
    const cookieStore = await cookies()
    const savedId = cookieStore.get('portfolio-id')?.value
    const portfolios = await getPortfolios(user.id)
    const portfolio = portfolios.find((p) => p.id === savedId) ?? portfolios[0]
    portfolioId = portfolio?.id
  }

  if (!portfolioId) {
    return NextResponse.json({ error: 'No portfolio found' }, { status: 404 })
  }

  const result = await backfillTransactionsFromLots(portfolioId, user.id)
  return NextResponse.json(result)
}
