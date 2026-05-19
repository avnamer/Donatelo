// GET /api/agents/insights?portfolioId=xxx&force=false
import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/db/supabase-server'
import { getPortfolioWithStructure } from '@/lib/db/queries/portfolios'
import { getAgentInsights, saveAgentInsights, getLatestInsightAge, getThesesForPortfolio } from '@/lib/db/queries'
import { runOrchestrator } from '@/lib/agents/orchestrator'

const CACHE_TTL_MS = 24 * 60 * 60 * 1000

export async function GET(request: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const portfolioId = request.nextUrl.searchParams.get('portfolioId')
  if (!portfolioId) return NextResponse.json({ error: 'portfolioId required' }, { status: 400 })

  const force = request.nextUrl.searchParams.get('force') === 'true'
  const lastRun = await getLatestInsightAge(portfolioId)
  const isStale = !lastRun || Date.now() - lastRun.getTime() > CACHE_TTL_MS

  if (!force && !isStale) {
    const insights = await getAgentInsights(portfolioId)
    return NextResponse.json({ insights, fresh: false })
  }

  const portfolio = await getPortfolioWithStructure(portfolioId, user.id)
  if (!portfolio) return NextResponse.json({ error: 'Portfolio not found' }, { status: 404 })

  // Flatten holdings with their folder info
  const holdingsFlat = portfolio.folders.flatMap((f) =>
    f.holdings.map((h) => ({
      ...h,
      folderId: f.id,
      folderName: f.name,
      folderTarget: f.targetAllocationPct,
    }))
  )

  // Compute cost basis per holding
  const holdingCosts = holdingsFlat.map((h) => {
    const costBasis = h.lots.reduce((sum, lot) => {
      const activeShares = Number(lot.shares) - Number(lot.soldShares)
      return sum + activeShares * Number(lot.costPerShare)
    }, 0)
    return { holding: h, costBasis }
  })

  const totalCost = holdingCosts.reduce((sum, { costBasis }) => sum + costBasis, 0)

  const holdingsForOrchestrator = holdingCosts.map(({ holding, costBasis }) => ({
    id: holding.id,
    tickerSymbol: holding.tickerSymbol,
    exchange: holding.exchange,
    name: holding.name,
    actualAllocationPct: totalCost > 0 ? (costBasis / totalCost) * 100 : 0,
  }))

  // Aggregate folder cost sums
  const folderCosts = new Map<string, number>()
  for (const { holding, costBasis } of holdingCosts) {
    const prev = folderCosts.get(holding.folderId) ?? 0
    folderCosts.set(holding.folderId, prev + costBasis)
  }

  const foldersForOrchestrator = portfolio.folders.map((f) => ({
    id: f.id,
    name: f.name,
    actualAllocationPct: totalCost > 0 ? ((folderCosts.get(f.id) ?? 0) / totalCost) * 100 : 0,
    targetAllocationPct: f.targetAllocationPct ? Number(f.targetAllocationPct) : null,
  }))

  const theses = await getThesesForPortfolio(portfolioId)

  const output = await runOrchestrator({
    portfolioId,
    userId: user.id,
    holdings: holdingsForOrchestrator,
    folders: foldersForOrchestrator,
    theses,
  })

  await saveAgentInsights(output.insights)
  const insights = await getAgentInsights(portfolioId)

  return NextResponse.json({
    insights,
    summary: output.summary,
    portfolioHealth: output.portfolioHealth,
    fresh: true,
  })
}
