import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/db/supabase-server'
import { getPortfolios } from '@/lib/db/queries'
import { prisma } from '@/lib/db/prisma'
import { z } from 'zod'
import { Prisma } from '@prisma/client'

// ─── JSON backup schema ───────────────────────

const LotSchema = z.object({
  purchaseDate: z.string(),
  shares: z.number().positive(),
  costPerShare: z.string(),   // BigInt as string (agorot/cents)
  costCurrency: z.string().default('ILS'),
  accountType: z.string().nullable().optional(),
  soldShares: z.number().default(0),
  soldDate: z.string().nullable().optional(),
  soldPricePerShare: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
})

const HoldingSchema = z.object({
  tickerSymbol: z.string(),
  exchange: z.string(),
  name: z.string(),
  expenseRatio: z.number().nullable().optional(),
  lots: z.array(LotSchema),
})

const FolderSchema = z.object({
  name: z.string(),
  color: z.string().nullable().optional(),
  parentId: z.string().nullable().optional(),
  targetAllocationPct: z.number().nullable().optional(),
  holdings: z.array(HoldingSchema),
})

const ImportSchema = z.object({
  portfolio: z.object({
    name: z.string().optional(),
    folders: z.array(FolderSchema),
    cashAccounts: z.array(z.object({
      name: z.string(),
      currency: z.string(),
      balance: z.string(),
    })).optional(),
  }),
})

export async function POST(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = ImportSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const { portfolio: data } = parsed.data

  // Get or create portfolio
  const portfolios = await getPortfolios(user.id)
  const portfolioId = portfolios[0]?.id

  if (!portfolioId) {
    return NextResponse.json({ error: 'No portfolio found. Create one first.' }, { status: 400 })
  }

  let foldersCreated = 0
  let holdingsCreated = 0
  let lotsCreated = 0

  // Import folders sequentially (parentId dependencies)
  // First pass: root folders (parentId = null)
  for (const folder of data.folders.filter((f) => !f.parentId)) {
    const created = await prisma.folder.create({
      data: {
        portfolioId,
        name: folder.name,
        color: folder.color ?? null,
        targetAllocationPct: folder.targetAllocationPct
          ? new Prisma.Decimal(folder.targetAllocationPct)
          : null,
      },
    })
    foldersCreated++

    for (const holding of folder.holdings) {
      const h = await prisma.holding.create({
        data: {
          folderId: created.id,
          tickerSymbol: holding.tickerSymbol.toUpperCase(),
          exchange: holding.exchange,
          name: holding.name,
          expenseRatio: holding.expenseRatio != null
            ? new Prisma.Decimal(holding.expenseRatio)
            : null,
        },
      })
      holdingsCreated++

      for (const lot of holding.lots) {
        await prisma.lot.create({
          data: {
            holdingId: h.id,
            purchaseDate: new Date(lot.purchaseDate),
            shares: new Prisma.Decimal(lot.shares),
            costPerShare: BigInt(lot.costPerShare),
            costCurrency: lot.costCurrency,
            accountType: lot.accountType ?? null,
            soldShares: new Prisma.Decimal(lot.soldShares ?? 0),
            soldDate: lot.soldDate ? new Date(lot.soldDate) : null,
            soldPricePerShare: lot.soldPricePerShare ? BigInt(lot.soldPricePerShare) : null,
            notes: lot.notes ?? null,
          },
        })
        lotsCreated++
      }
    }
  }

  // Import cash accounts
  if (data.cashAccounts) {
    for (const ca of data.cashAccounts) {
      await prisma.cashAccount.create({
        data: {
          portfolioId,
          name: ca.name,
          currency: ca.currency,
          balance: BigInt(ca.balance),
        },
      })
    }
  }

  return NextResponse.json({
    foldersCreated,
    holdingsCreated,
    lotsCreated,
  })
}
