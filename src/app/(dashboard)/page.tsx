import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { QueryClient, dehydrate, HydrationBoundary } from '@tanstack/react-query'
import { getCurrentUser } from '@/lib/db/supabase-server'
import { getPortfolios, getHoldingsForPortfolio, getFolders, getFxRate } from '@/lib/db/queries'
import { prisma } from '@/lib/db/prisma'
import { HomeClient } from '@/components/portfolio/HomeClient'
import { CreatePortfolioForm } from '@/components/portfolio/CreatePortfolioForm'
import { getTimeRangeCutoff } from '@/lib/utils'
import type { Prisma } from '@prisma/client'
import type { ServerHolding } from '@/hooks/usePortfolio'
import type { DailySeriesMap } from '@/hooks/useDailySeries'
import type { Lot } from '@/types'

type DailyCloseRow = Prisma.DailyCloseGetPayload<{ select: { closeDate: true; close: true } }>
type PriceCacheRow = Prisma.PriceCacheGetPayload<{ select: { priceDate: true; price: true } }>

// ─── Server-side daily-series prefetch ───────
// Reads from the DB only (daily_closes + price_cache fallback).
// Never calls Yahoo here — the route handler does that on the client's first request.
// This populates the chart data for users who have fresh data already in DB.

async function prefetchDailySeries(
  tickers: string[],  // format: "AAPL:US"
  fromDate: Date
): Promise<DailySeriesMap> {
  const entries = tickers.map((t) => {
    const [symbol, exchange = 'US'] = t.split(':')
    return { symbol: symbol.toUpperCase(), exchange: exchange.toUpperCase() }
  })

  const result: DailySeriesMap = {}

  await Promise.all(
    entries.map(async ({ symbol, exchange }) => {
      const isNumericTase = /^\d+$/.test(symbol) || /^\d+\.TA$/i.test(symbol)

      if (!isNumericTase) {
        // Named ticker: read from daily_closes (persisted by the route handler)
        const rows = await prisma.dailyClose.findMany({
          where: { tickerSymbol: symbol, closeDate: { gte: fromDate } },
          orderBy: { closeDate: 'asc' },
          select: { closeDate: true, close: true },
        })
        if (rows.length > 0) {
          result[symbol] = rows.map((r: DailyCloseRow) => ({
            date: r.closeDate.toISOString().slice(0, 10),
            close: Number(r.close),
          }))
        }
      } else {
        // Numeric TASE fund ID: read from price_cache
        const rows = await prisma.priceCache.findMany({
          where: { tickerSymbol: symbol, priceDate: { gte: fromDate } },
          orderBy: { priceDate: 'asc' },
          select: { priceDate: true, price: true },
        })
        if (rows.length > 0) {
          result[symbol] = rows.map((r: PriceCacheRow) => ({
            date: r.priceDate.toISOString().slice(0, 10),
            close: exchange === 'TASE' ? Number(r.price) : Number(r.price) / 100,
          }))
        }
      }
    })
  )

  return result
}

// ─── Page ─────────────────────────────────────

export default async function HomePage() {
  const user = await getCurrentUser()
  if (!user) redirect('/auth/login')

  const portfolios = await getPortfolios(user.id)

  if (portfolios.length === 0) {
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

  const cookieStore = await cookies()
  const savedId = cookieStore.get('portfolio-id')?.value
  const portfolio = portfolios.find((p) => p.id === savedId) ?? portfolios[0]
  const [rawHoldings, folders] = await Promise.all([
    getHoldingsForPortfolio(portfolio.id, user.id),
    getFolders(portfolio.id, user.id),
  ])

  const holdings: ServerHolding[] = rawHoldings.map((h) => ({
    id: h.id,
    tickerSymbol: h.tickerSymbol,
    name: h.name,
    exchange: h.exchange,
    folderId: h.folderId,
    expenseRatio: h.expenseRatio ? Number(h.expenseRatio) : null,
    targetFolderId: h.targetFolderId ?? null,
    plannedAmount: h.plannedAmount != null ? Number(h.plannedAmount) / 100 : null,
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

  const serializedFolders = folders.map((f) => ({
    ...f,
    targetAllocationPct: f.targetAllocationPct ? Number(f.targetAllocationPct) : null,
    createdAt: f.createdAt.toISOString(),
  }))

  // ─── Server prefetch for chart + FX ──────────
  // Prefetch using the default '1Y' time range (matches Zustand store default).
  // Users with a saved different range will refetch on the client — that's fine.
  // We skip prefetching prices here because PriceMap uses bigint which JSON
  // (used by dehydrate/hydrate) cannot serialize. Phase 1 localStorage handles
  // repeat visits for prices.

  const today = new Date()
  const fromDate = getTimeRangeCutoff('1Y', today)
  const fromKey = fromDate.toISOString().slice(0, 10)

  const tickers = rawHoldings.map(
    (h) => `${h.tickerSymbol}:${h.exchange.toUpperCase() === 'TASE' ? 'TASE' : 'US'}`
  )
  const sortedTickers = [...tickers].sort()

  const queryClient = new QueryClient()

  await Promise.all([
    // Prefetch daily series (chart data) — reads from DB, no network call
    queryClient.prefetchQuery({
      queryKey: ['daily-series', fromKey, ...sortedTickers],
      queryFn: () => prefetchDailySeries(tickers, fromDate),
    }),
    // Prefetch FX rate — DB-cached daily, pure number
    queryClient.prefetchQuery({
      queryKey: ['fx', 'USD', 'ILS'],
      queryFn: async () => {
        const rate = await getFxRate('USD', 'ILS')
        return rate ?? 3.72
      },
    }),
  ])

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <HomeClient
        holdings={holdings}
        portfolioName={portfolio.name}
        portfolioId={portfolio.id}
        folders={serializedFolders as any}
      />
    </HydrationBoundary>
  )
}
