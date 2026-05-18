import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getCurrentUser } from '@/lib/db/supabase-server'
import { createHolding } from '@/lib/db/queries'

const CreateHoldingSchema = z.object({
  folderId: z.string().uuid(),
  tickerSymbol: z.string().min(1).max(20),
  exchange: z.enum(['TASE', 'NYSE', 'NASDAQ', 'OTHER']),
  name: z.string().min(1).max(200),
  expenseRatio: z.number().min(0).max(1).optional(),
})

export async function POST(request: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const parsed = CreateHoldingSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 })
  }

  const { folderId, ...data } = parsed.data
  const holding = await createHolding(folderId, user.id, data)
  if (!holding) return NextResponse.json({ error: 'Folder not found' }, { status: 404 })

  return NextResponse.json(holding, { status: 201 })
}
