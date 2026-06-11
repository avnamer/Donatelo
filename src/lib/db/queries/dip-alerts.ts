import { prisma } from '@/lib/db/prisma'

export interface DipAlertRow {
  id: string
  userId: string
  portfolioId: string
  holdingId: string
  ticker: string
  name: string
  currentPrice: number
  high52w: number
  highATH: number | null
  high90d: number
  dropFrom52w: number
  dropFromATH: number | null
  dropFrom90d: number
  priceHistory: Array<{ date: string; price: number }>
  aiSuggestion: string | null
  computedAt: Date
}

export async function getDipAlertsForPortfolio(
  portfolioId: string
): Promise<DipAlertRow[]> {
  const rows = await prisma.dipAlert.findMany({
    where: { portfolioId },
    orderBy: { dropFrom52w: 'asc' }, // asc = most negative first = biggest drops first
  })
  return rows.map((r) => ({
    ...r,
    priceHistory: r.priceHistory as Array<{ date: string; price: number }>,
  }))
}

export async function getLatestDipAlertAge(
  portfolioId: string
): Promise<Date | null> {
  const row = await prisma.dipAlert.findFirst({
    where: { portfolioId },
    orderBy: { computedAt: 'desc' },
    select: { computedAt: true },
  })
  return row?.computedAt ?? null
}

export async function upsertDipAlerts(
  alerts: Omit<DipAlertRow, 'id'>[]
): Promise<void> {
  if (alerts.length === 0) return
  await Promise.all(
    alerts.map((a) =>
      prisma.dipAlert.upsert({
        where: {
          holdingId_portfolioId: {
            holdingId: a.holdingId,
            portfolioId: a.portfolioId,
          },
        },
        create: { ...a, priceHistory: a.priceHistory as any },
        update: {
          ticker: a.ticker,
          name: a.name,
          currentPrice: a.currentPrice,
          high52w: a.high52w,
          highATH: a.highATH,
          high90d: a.high90d,
          dropFrom52w: a.dropFrom52w,
          dropFromATH: a.dropFromATH,
          dropFrom90d: a.dropFrom90d,
          priceHistory: a.priceHistory as any,
          aiSuggestion: a.aiSuggestion,
          computedAt: a.computedAt,
        },
      })
    )
  )
}

export async function deleteStaleDipAlerts(
  portfolioId: string,
  keepHoldingIds: string[]
): Promise<void> {
  await prisma.dipAlert.deleteMany({
    where: {
      portfolioId,
      holdingId: { notIn: keepHoldingIds },
    },
  })
}
