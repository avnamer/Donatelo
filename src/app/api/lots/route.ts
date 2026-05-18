import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getCurrentUser } from '@/lib/db/supabase-server'
import { createLot, createTransaction } from '@/lib/db/queries'
import { prisma } from '@/lib/db/prisma'

const CreateLotSchema = z.object({
  holdingId: z.string().uuid(),
  purchaseDate: z.string().date(),   // ISO date string "YYYY-MM-DD"
  shares: z.number().positive(),
  // costPerShareDisplay: in display units (ILS or USD) — server converts to agorot/cents
  costPerShareDisplay: z.number().positive(),
  costCurrency: z.enum(['ILS', 'USD']),
  accountType: z.string().max(50).optional(),
  notes: z.string().max(500).optional(),
})

export async function POST(request: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const parsed = CreateLotSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 })
  }

  const { holdingId, costPerShareDisplay, costCurrency, purchaseDate, ...rest } = parsed.data
  const costPerShare = BigInt(Math.round(costPerShareDisplay * 100))

  const lot = await createLot(holdingId, user.id, {
    ...rest,
    purchaseDate: new Date(purchaseDate),
    costPerShare,
    costCurrency,
  })
  if (!lot) return NextResponse.json({ error: 'Holding not found' }, { status: 404 })

  // Auto-create SECURITY_BUY transaction
  const holding = await prisma.holding.findFirst({
    where: { id: holdingId },
    select: { folder: { select: { portfolioId: true } } },
  })
  if (holding) {
    const totalCost = BigInt(Math.round(parsed.data.shares * costPerShareDisplay * 100))
    await createTransaction(holding.folder.portfolioId, user.id, {
      type: 'SECURITY_BUY',
      date: new Date(purchaseDate),
      amount: totalCost,
      currency: costCurrency,
      holdingId,
      lotId: lot.id,
      shares: parsed.data.shares,
      pricePerShare: costPerShare,
      notes: rest.notes,
    })
  }

  return NextResponse.json({ ...lot, costPerShare: lot.costPerShare.toString() }, { status: 201 })
}
