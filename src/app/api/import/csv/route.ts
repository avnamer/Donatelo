import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/db/supabase-server'
import { prisma } from '@/lib/db/prisma'
import { z } from 'zod'

// One classified transaction from the client
const ClassifiedTxSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('SECURITY_BUY'),
    date: z.string(),
    ticker: z.string(),
    exchange: z.string(),
    shares: z.number().positive(),
    pricePerShare: z.number().positive(),    // display units
    currency: z.enum(['ILS', 'USD']),
    accountType: z.string().optional(),
    notes: z.string().optional(),
  }),
  z.object({
    type: z.literal('SECURITY_SELL'),
    date: z.string(),
    ticker: z.string(),
    exchange: z.string(),
    shares: z.number().positive(),
    pricePerShare: z.number().positive(),
    currency: z.enum(['ILS', 'USD']),
    notes: z.string().optional(),
  }),
  z.object({
    type: z.literal('DIVIDEND'),
    date: z.string(),
    ticker: z.string(),
    exchange: z.string(),
    amount: z.number().positive(),           // total dividend received
    currency: z.enum(['ILS', 'USD']),
    cashAccountName: z.string().optional(),
    notes: z.string().optional(),
  }),
  z.object({
    type: z.literal('CASH_DEPOSIT'),
    date: z.string(),
    amount: z.number().positive(),
    currency: z.enum(['ILS', 'USD']),
    cashAccountName: z.string(),
    notes: z.string().optional(),
  }),
  z.object({
    type: z.literal('CASH_WITHDRAWAL'),
    date: z.string(),
    amount: z.number().positive(),
    currency: z.enum(['ILS', 'USD']),
    cashAccountName: z.string(),
    notes: z.string().optional(),
  }),
  z.object({
    type: z.literal('COMMISSION'),
    date: z.string(),
    amount: z.number().positive(),
    currency: z.enum(['ILS', 'USD']),
    notes: z.string().optional(),
  }),
  z.object({
    type: z.literal('TAX_ILS'),
    date: z.string(),
    amount: z.number().positive(),
    notes: z.string().optional(),
  }),
  z.object({
    type: z.literal('TAX_USD'),
    date: z.string(),
    amount: z.number().positive(),
    notes: z.string().optional(),
  }),
  z.object({
    type: z.literal('FX_CONVERSION'),
    date: z.string(),
    // ILS side
    ilsAmount: z.number().positive(),
    ilsCashAccountName: z.string(),
    // USD side
    usdAmount: z.number().positive(),
    usdCashAccountName: z.string(),
    notes: z.string().optional(),
  }),
  z.object({
    type: z.literal('IGNORE'),
    date: z.string().optional(),
  }),
])

const ImportCsvBodySchema = z.object({
  portfolioId: z.string().uuid(),
  transactions: z.array(ClassifiedTxSchema),
})

type ClassifiedTx = z.infer<typeof ClassifiedTxSchema>

async function findOrCreateHolding(
  portfolioId: string,
  ticker: string,
  exchange: string,
): Promise<string | null> {
  // Find in any folder of this portfolio
  const existing = await prisma.holding.findFirst({
    where: {
      tickerSymbol: ticker.toUpperCase(),
      folder: { portfolioId },
    },
    select: { id: true },
  })
  if (existing) return existing.id

  // Find or create a default "Imported" folder
  let folder = await prisma.folder.findFirst({
    where: { portfolioId, name: 'Imported' },
    select: { id: true },
  })
  if (!folder) {
    folder = await prisma.folder.create({
      data: { portfolioId, name: 'Imported', sortOrder: 999 },
      select: { id: true },
    })
  }

  const holding = await prisma.holding.create({
    data: {
      folderId: folder.id,
      tickerSymbol: ticker.toUpperCase(),
      exchange,
      name: ticker.toUpperCase(),
    },
    select: { id: true },
  })
  return holding.id
}

async function findOrCreateCashAccount(
  portfolioId: string,
  name: string,
  currency: 'ILS' | 'USD',
): Promise<string> {
  let account = await prisma.cashAccount.findFirst({
    where: { portfolioId, name },
    select: { id: true },
  })
  if (!account) {
    account = await prisma.cashAccount.create({
      data: { portfolioId, name, currency, balance: 0n },
      select: { id: true },
    })
  }
  return account.id
}

async function processTransaction(
  tx: ClassifiedTx,
  portfolioId: string,
  userId: string,
): Promise<'ok' | 'skip' | string> {
  if (tx.type === 'IGNORE') return 'skip'

  const date = new Date(tx.date)

  if (tx.type === 'SECURITY_BUY') {
    const holdingId = await findOrCreateHolding(portfolioId, tx.ticker, tx.exchange)
    if (!holdingId) return 'Holding not found'
    const costPerShare = BigInt(Math.round(tx.pricePerShare * 100))
    const totalCost = BigInt(Math.round(tx.shares * tx.pricePerShare * 100))

    const lot = await prisma.lot.create({
      data: {
        holdingId,
        purchaseDate: date,
        shares: tx.shares,
        costPerShare,
        costCurrency: tx.currency,
        accountType: (tx as any).accountType,
        notes: tx.notes,
      },
    })

    await prisma.transaction.create({
      data: {
        portfolioId,
        type: 'SECURITY_BUY',
        date,
        holdingId,
        lotId: lot.id,
        shares: tx.shares,
        pricePerShare: costPerShare,
        amount: totalCost,
        currency: tx.currency,
        notes: tx.notes,
      },
    })
    return 'ok'
  }

  if (tx.type === 'SECURITY_SELL') {
    const holdingId = await findOrCreateHolding(portfolioId, tx.ticker, tx.exchange)
    if (!holdingId) return 'Holding not found'
    const pricePerShare = BigInt(Math.round(tx.pricePerShare * 100))
    const totalProceeds = BigInt(Math.round(tx.shares * tx.pricePerShare * 100))

    // Just create a SECURITY_SELL transaction (simplified — no FIFO lot matching)
    await prisma.transaction.create({
      data: {
        portfolioId,
        type: 'SECURITY_SELL',
        date,
        holdingId,
        shares: tx.shares,
        pricePerShare,
        amount: totalProceeds,
        currency: tx.currency,
        notes: tx.notes,
      },
    })
    return 'ok'
  }

  if (tx.type === 'DIVIDEND') {
    const holdingId = await findOrCreateHolding(portfolioId, tx.ticker, tx.exchange)
    if (!holdingId) return 'Holding not found'
    const amount = BigInt(Math.round(tx.amount * 100))

    let cashAccountId: string | undefined
    if (tx.cashAccountName) {
      cashAccountId = await findOrCreateCashAccount(portfolioId, tx.cashAccountName, tx.currency)
    }

    await prisma.transaction.create({
      data: {
        portfolioId,
        type: 'DIVIDEND',
        date,
        holdingId,
        cashAccountId,
        amount,
        currency: tx.currency,
        notes: tx.notes,
      },
    })

    // Update cash account balance if specified
    if (cashAccountId) {
      await prisma.cashAccount.update({
        where: { id: cashAccountId },
        data: { balance: { increment: amount } },
      })
    }
    return 'ok'
  }

  if (tx.type === 'CASH_DEPOSIT') {
    const cashAccountId = await findOrCreateCashAccount(portfolioId, tx.cashAccountName, tx.currency)
    const amount = BigInt(Math.round(tx.amount * 100))

    await prisma.transaction.create({
      data: {
        portfolioId,
        type: 'CASH_DEPOSIT',
        date,
        cashAccountId,
        amount,
        currency: tx.currency,
        notes: tx.notes,
      },
    })
    await prisma.cashAccount.update({
      where: { id: cashAccountId },
      data: { balance: { increment: amount } },
    })
    return 'ok'
  }

  if (tx.type === 'CASH_WITHDRAWAL') {
    const cashAccountId = await findOrCreateCashAccount(portfolioId, tx.cashAccountName, tx.currency)
    const amount = BigInt(Math.round(tx.amount * 100))

    await prisma.transaction.create({
      data: {
        portfolioId,
        type: 'CASH_WITHDRAWAL',
        date,
        cashAccountId,
        amount,
        currency: tx.currency,
        notes: tx.notes,
      },
    })
    await prisma.cashAccount.update({
      where: { id: cashAccountId },
      data: { balance: { decrement: amount } },
    })
    return 'ok'
  }

  if (tx.type === 'FX_CONVERSION') {
    const ilsId = await findOrCreateCashAccount(portfolioId, tx.ilsCashAccountName, 'ILS')
    const usdId = await findOrCreateCashAccount(portfolioId, tx.usdCashAccountName, 'USD')
    const ilsAmount = BigInt(Math.round(tx.ilsAmount * 100))
    const usdAmount = BigInt(Math.round(tx.usdAmount * 100))

    await prisma.transaction.create({
      data: {
        portfolioId,
        type: 'CASH_WITHDRAWAL',
        date,
        cashAccountId: ilsId,
        amount: ilsAmount,
        currency: 'ILS',
        notes: tx.notes ?? 'FX conversion to USD',
      },
    })
    await prisma.cashAccount.update({
      where: { id: ilsId },
      data: { balance: { decrement: ilsAmount } },
    })

    await prisma.transaction.create({
      data: {
        portfolioId,
        type: 'CASH_DEPOSIT',
        date,
        cashAccountId: usdId,
        amount: usdAmount,
        currency: 'USD',
        notes: tx.notes ?? 'FX conversion from ILS',
      },
    })
    await prisma.cashAccount.update({
      where: { id: usdId },
      data: { balance: { increment: usdAmount } },
    })
    return 'ok'
  }

  if (tx.type === 'COMMISSION') {
    const amount = BigInt(Math.round(tx.amount * 100))
    await prisma.transaction.create({
      data: {
        portfolioId,
        type: 'COMMISSION',
        date,
        amount,
        currency: tx.currency,
        notes: tx.notes,
      },
    })
    return 'ok'
  }

  if (tx.type === 'TAX_ILS') {
    const amount = BigInt(Math.round(tx.amount * 100))
    await prisma.transaction.create({
      data: { portfolioId, type: 'TAX_ILS', date, amount, currency: 'ILS', notes: tx.notes },
    })
    return 'ok'
  }

  if (tx.type === 'TAX_USD') {
    const amount = BigInt(Math.round(tx.amount * 100))
    await prisma.transaction.create({
      data: { portfolioId, type: 'TAX_USD', date, amount, currency: 'USD', notes: tx.notes },
    })
    return 'ok'
  }

  return 'Unknown type'
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const parsed = ImportCsvBodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 })
  }

  const { portfolioId, transactions } = parsed.data

  // Verify portfolio ownership
  const portfolio = await prisma.portfolio.findFirst({
    where: { id: portfolioId, userId: user.id },
    select: { id: true },
  })
  if (!portfolio) {
    return NextResponse.json({ error: 'Portfolio not found' }, { status: 404 })
  }

  let imported = 0
  let skipped = 0
  const errors: string[] = []

  for (const tx of transactions) {
    const result = await processTransaction(tx, portfolioId, user.id)
    if (result === 'ok') imported++
    else if (result === 'skip') skipped++
    else errors.push(result)
  }

  return NextResponse.json({ imported, skipped, errors })
}
