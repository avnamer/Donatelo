import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getCurrentUser } from '@/lib/db/supabase-server'
import { sellLot, editLot, deleteLot, createTransaction } from '@/lib/db/queries'
import { prisma } from '@/lib/db/prisma'

const SellLotSchema = z.object({
  action: z.literal('sell'),
  soldShares: z.number().positive(),
  soldDate: z.string().date(),
  soldPricePerShareDisplay: z.number().positive(),
  currency: z.enum(['ILS', 'USD']),
})

const EditLotSchema = z.object({
  action: z.literal('edit'),
  purchaseDate: z.string().date(),
  shares: z.number().positive(),
  costPerShareDisplay: z.number().positive(),
  costCurrency: z.enum(['ILS', 'USD']),
  accountType: z.string().max(50).optional().nullable(),
  notes: z.string().max(500).optional().nullable(),
})

const PatchSchema = z.discriminatedUnion('action', [SellLotSchema, EditLotSchema])

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const body = await request.json()
  const parsed = PatchSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 })
  }

  if (parsed.data.action === 'sell') {
    const { soldShares, soldDate, soldPricePerShareDisplay } = parsed.data
    const soldPricePerShare = BigInt(Math.round(soldPricePerShareDisplay * 100))
    const proceedsFromSale = BigInt(Math.round(soldShares * soldPricePerShareDisplay * 100))

    const lot = await sellLot(id, user.id, {
      soldShares,
      soldDate: new Date(soldDate),
      soldPricePerShare,
      proceedsFromSale,
    })
    if (!lot) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    // Auto-create SECURITY_SELL transaction
    const holding = await prisma.lot.findFirst({
      where: { id },
      select: { holdingId: true, holding: { select: { folder: { select: { portfolioId: true } } } } },
    })
    if (holding) {
      await createTransaction(holding.holding.folder.portfolioId, user.id, {
        type: 'SECURITY_SELL',
        date: new Date(soldDate),
        amount: proceedsFromSale,
        currency: parsed.data.currency,
        holdingId: holding.holdingId,
        lotId: id,
        shares: soldShares,
        pricePerShare: soldPricePerShare,
      })
    }

    return NextResponse.json({
      ...lot,
      costPerShare: lot.costPerShare.toString(),
      soldPricePerShare: lot.soldPricePerShare?.toString() ?? null,
      proceedsFromSale: lot.proceedsFromSale?.toString() ?? null,
    })
  }

  // action === 'edit'
  const { purchaseDate, shares, costPerShareDisplay, costCurrency, accountType, notes } = parsed.data
  const costPerShare = BigInt(Math.round(costPerShareDisplay * 100))

  const lot = await editLot(id, user.id, {
    purchaseDate: new Date(purchaseDate),
    shares,
    costPerShare,
    costCurrency,
    accountType: accountType ?? undefined,
    notes: notes ?? undefined,
  })
  if (!lot) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  return NextResponse.json({
    ...lot,
    costPerShare: lot.costPerShare.toString(),
    soldPricePerShare: lot.soldPricePerShare?.toString() ?? null,
    proceedsFromSale: lot.proceedsFromSale?.toString() ?? null,
  })
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const result = await deleteLot(id, user.id)
  if (!result) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  return new NextResponse(null, { status: 204 })
}
