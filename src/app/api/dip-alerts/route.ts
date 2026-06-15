// GET /api/dip-alerts?portfolioId=xxx&force=false
import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/db/supabase-server'
import { getPortfolioWithStructure } from '@/lib/db/queries/portfolios'
import {
  getDipAlertsForPortfolio,
  getLatestDipAlertAge,
  upsertDipAlerts,
  deleteStaleDipAlerts,
  type DipAlertInsert,
} from '@/lib/db/queries'
import { computePeaks, backfillPriceHistories } from '@/lib/dip-alerts/compute'
import { generateDipSuggestion } from '@/lib/dip-alerts/ai-suggestion'

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

  // Ownership check — applies to both cached and recompute paths
  const portfolio = await getPortfolioWithStructure(portfolioId, user.id)
  if (!portfolio) return NextResponse.json({ error: 'Portfolio not found' }, { status: 404 })

  const globalDipThreshold = -(portfolio as any).globalDipThreshold
  const globalBuyNowThreshold = -(portfolio as any).globalBuyNowThreshold

  if (!force && isFresh) {
    const alerts = await getDipAlertsForPortfolio(portfolioId)
    return NextResponse.json({
      alerts,
      computedAt: lastRun.toISOString(),
      totalHoldings: null,
      alertCount: alerts.length,
      cached: true,
      globalDipThreshold: (portfolio as any).globalDipThreshold,
      globalBuyNowThreshold: (portfolio as any).globalBuyNowThreshold,
    })
  }

  // Deduplicate by ticker — if same stock appears in multiple folders,
  // keep the first occurrence (avoid duplicate alert cards)
  const seenTickers = new Set<string>()
  const holdings = portfolio.folders
    .flatMap((f) =>
      f.holdings
        .map((h) => ({
          id: h.id,
          ticker: h.tickerSymbol,
          name: h.name,
          exchange: h.exchange,
          dipThreshold: (h as any).dipThreshold as number | null,
          buyNowThreshold: (h as any).buyNowThreshold as number | null,
        }))
    )
    .filter((h) => {
      if (seenTickers.has(h.ticker)) return false
      seenTickers.add(h.ticker)
      return true
    })

  const now = new Date()

  // Backfill 52w price history sequentially (respects Polygon rate limit)
  const from52w = new Date(now)
  from52w.setFullYear(from52w.getFullYear() - 1)
  await backfillPriceHistories(
    holdings.map((h) => ({ ticker: h.ticker, exchange: h.exchange })),
    from52w,
    now
  )

  // Track holdings for which we successfully computed peaks (regardless of trigger status).
  // This is separate from newAlerts so we only delete stale rows for removed holdings,
  // not for holdings that are currently healthy (not triggering a dip alert).
  const computedHoldingIds = new Set<string>()

  const results = await Promise.allSettled(
    holdings.map(async (holding) => {
      const peaks = await computePeaks(holding.ticker, holding.exchange)
      if (!peaks) return null

      // Mark that we have valid price data for this holding
      computedHoldingIds.add(holding.id)

      const effectiveDipThreshold = holding.dipThreshold != null
        ? -holding.dipThreshold
        : globalDipThreshold
      const effectiveBuyNowThreshold = holding.buyNowThreshold != null
        ? -holding.buyNowThreshold
        : globalBuyNowThreshold

      const dipTriggered = peaks.dropFrom52w <= effectiveDipThreshold
      const buyNowTriggered = peaks.dropFromATH != null && peaks.dropFromATH <= effectiveBuyNowThreshold

      if (!dipTriggered && !buyNowTriggered) return null

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
        dipTriggered,
        buyNowTriggered,
        computedAt: now,
      }
    })
  )

  type AlertData = DipAlertInsert
  const newAlerts = results
    .filter((r): r is PromiseFulfilledResult<AlertData> =>
      r.status === 'fulfilled' && r.value != null
    )
    .map((r) => r.value)

  await upsertDipAlerts(newAlerts)

  // Delete stale alerts only for holdings where we successfully fetched price data.
  // This removes rows for holdings removed from the portfolio while preserving
  // alerts for holdings that are currently healthy (not triggering any threshold).
  if (computedHoldingIds.size > 0) {
    await deleteStaleDipAlerts(portfolioId, [...computedHoldingIds])
  }

  const alerts = await getDipAlertsForPortfolio(portfolioId)
  return NextResponse.json({
    alerts,
    computedAt: now.toISOString(),
    totalHoldings: holdings.length,
    alertCount: alerts.length,
    cached: false,
    globalDipThreshold: (portfolio as any).globalDipThreshold,
    globalBuyNowThreshold: (portfolio as any).globalBuyNowThreshold,
  })
}
