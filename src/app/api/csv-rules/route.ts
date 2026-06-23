import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/db/supabase-server'
import { prisma } from '@/lib/db/prisma'
import { z } from 'zod'

const PatternSchema = z.record(
  z.object({
    contains: z.string().optional(),
    equals: z.string().optional(),
    startsWith: z.string().optional(),
  }),
)

const CreateRuleSchema = z.object({
  pattern: PatternSchema,
  transactionType: z.enum([
    'SECURITY_BUY',
    'SECURITY_SELL',
    'DIVIDEND',
    'CASH_DEPOSIT',
    'CASH_WITHDRAWAL',
    'FX_CONVERSION',
    'COMMISSION',
    'TAX_ILS',
    'TAX_USD',
    'IGNORE',
  ]),
  ticker: z.string().optional(),
  exchange: z.string().optional(),
  cashAccountName: z.string().optional(),
  toCashAccountName: z.string().optional(),
  notes: z.string().optional(),
  tickerColumn: z.string().optional(),
  sharesColumn: z.string().optional(),
  priceColumn: z.string().optional(),
  amountColumn: z.string().optional(),
  currencyColumn: z.string().optional(),
  exchangeForUsd: z.enum(['NYSE', 'NASDAQ']).optional(),
})

export async function GET() {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const rules = await prisma.csvImportRule.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: 'asc' },
  })

  return NextResponse.json({ rules })
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const parsed = CreateRuleSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 })
  }

  const rule = await prisma.csvImportRule.create({
    data: {
      userId: user.id,
      pattern: parsed.data.pattern,
      transactionType: parsed.data.transactionType,
      ticker: parsed.data.ticker,
      exchange: parsed.data.exchange,
      cashAccountName: parsed.data.cashAccountName,
      toCashAccountName: parsed.data.toCashAccountName,
      notes: parsed.data.notes,
      tickerColumn: parsed.data.tickerColumn,
      sharesColumn: parsed.data.sharesColumn,
      priceColumn: parsed.data.priceColumn,
      amountColumn: parsed.data.amountColumn,
      currencyColumn: parsed.data.currencyColumn,
      exchangeForUsd: parsed.data.exchangeForUsd,
    },
  })

  return NextResponse.json({ rule })
}
