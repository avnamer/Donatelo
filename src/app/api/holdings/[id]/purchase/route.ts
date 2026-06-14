import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getCurrentUser } from '@/lib/db/supabase-server'
import { purchaseWatchlistHolding } from '@/lib/db/queries'

const PurchaseSchema = z.object({
  purchaseDate: z.string().date(),
  shares: z.number().positive(),
  costPerShareDisplay: z.number().positive(),
  costCurrency: z.enum(['ILS', 'USD']),
  accountType: z.string().max(50).optional(),
  notes: z.string().max(500).optional(),
})

interface RouteParams {
  params: Promise<{ id: string }>
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const body = await request.json()
  const parsed = PurchaseSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 })
  }

  const { costPerShareDisplay, costCurrency, purchaseDate, ...rest } = parsed.data
  const costPerShare = BigInt(Math.round(costPerShareDisplay * 100))

  const lot = await purchaseWatchlistHolding(id, user.id, {
    ...rest,
    purchaseDate: new Date(purchaseDate),
    costPerShare,
    costCurrency,
  })

  if (!lot) return NextResponse.json({ error: 'Holding not found or has no target folder' }, { status: 404 })

  return NextResponse.json({ ...lot, costPerShare: lot.costPerShare.toString() }, { status: 201 })
}
