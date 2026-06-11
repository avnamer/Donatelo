// GET /api/dip-alerts?portfolioId=xxx&force=false
import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/db/supabase-server'
import { getPortfolioWithStructure } from '@/lib/db/queries/portfolios'
import {
  getDipAlertsForPortfolio,
  getLatestDipAlertAge,
  upsertDipAlerts,
  deleteStaleDipAlerts,
} from '@/lib/db/queries'
import { computePeaks } from '@/lib/dip-alerts/compute'
import { generateDipSuggestion } from '@/lib/dip-alerts/ai-suggestion'

const DIP_THRESHOLD = -0.10

function isSameDay(date: Date): boolean {
  const today = new Date()
  return (
    date.getFullYear() === today.getFullYear() &&
    date.getMonth() === today.getMonth() &&
    date.getDate() === today.getDate()
  )
}

export async function GET(request: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const portfolioId = request.nextUrl.searchParams.get('portfolioId')
  if (!portfolioId) return NextResponse.json({ error: 'portfolioId required' }, { status: 400 })

  const force = request.nextUrl.searchParams.get('force') === 'true'
  const lastRun = await getLatestDipAlertAge(portfolioId)
  const isFresh = lastRun != null && isSameDay(lastRun)

  if (!force && isFresh) {
    const alerts = await getDipAlertsForPortfolio(portfolioId)
    return NextResponse.json({
      alerts,
      computedAt: lastRun.toISOString(),
      totalHoldings: null,
      alertCount: alerts.length,
      cached: true,
    })
  }

  // Recompute
  const portfolio = await getPortfolioWithStructure(portfolioId, user.id)
  if (!portfolio) return NextResponse.json({ error: 'Portfolio not found' }, { status: 404 })

  const holdings = portfolio.folders.flatMap((f) =>
    f.holdings.map((h) => ({
      id: h.id,
      ticker: h.tickerSymbol,
      name: h.name,
      exchange: h.exchange,
    }))
  )

  const now = new Date()

  const results = await Promise.allSettled(
    holdings.map(async (holding) => {
      const peaks = await computePeaks(holding.ticker)
      if (!peaks) return null
      if (peaks.dropFrom52w > DIP_THRESHOLD) return null

      let aiSuggestion: string | null = null
      try {
        aiSuggestion = await generateDipSuggestion(
          holding.ticker,
          holding.name,
          peaks.dropFrom52w,
          peaks.currentPrice,
          peaks.high52w
        )
      } catch {
        // Non-fatal: alert still surfaces without AI suggestion
      }

      return {
        userId: user.id,
        portfolioId,
        holdingId: holding.id,
        ticker: holding.ticker,
        name: holding.name,
        currentPrice: peaks.currentPrice,
        high52w: peaks.high52w,
        highATH: peaks.highATH,
        high90d: peaks.high90d,
        dropFrom52w: peaks.dropFrom52w,
        dropFromATH: peaks.dropFromATH,
        dropFrom90d: peaks.dropFrom90d,
        priceHistory: peaks.priceHistory90d,
        aiSuggestion,
        computedAt: now,
      }
    })
  )

  const newAlerts = results
    .filter((r): r is PromiseFulfilledResult<NonNullable<Awaited<ReturnType<typeof computePeaks>> extends null ? never : object>> =>
      r.status === 'fulfilled' && r.value != null
    )
    .map((r) => r.value) as Parameters<typeof upsertDipAlerts>[0]

  await upsertDipAlerts(newAlerts)
  await deleteStaleDipAlerts(portfolioId, newAlerts.map((a) => a.holdingId))

  const alerts = await getDipAlertsForPortfolio(portfolioId)
  return NextResponse.json({
    alerts,
    computedAt: now.toISOString(),
    totalHoldings: holdings.length,
    alertCount: alerts.length,
    cached: false,
  })
}
