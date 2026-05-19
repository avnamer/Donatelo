// GET  /api/agents/thesis?holdingId=xxx
// POST /api/agents/thesis  body: { holdingId, rawText, thesis, horizon, catalysts, riskFactors }
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getCurrentUser } from '@/lib/db/supabase-server'
import { getHoldingThesis, upsertHoldingThesis } from '@/lib/db/queries'

const UpsertSchema = z.object({
  holdingId: z.string(),
  rawText: z.string(),
  thesis: z.string(),
  horizon: z.enum(['short', 'medium', 'long']).nullable(),
  catalysts: z.array(z.string()),
  riskFactors: z.array(z.string()),
})

export async function GET(request: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const holdingId = request.nextUrl.searchParams.get('holdingId')
  if (!holdingId) return NextResponse.json({ error: 'holdingId required' }, { status: 400 })

  const thesis = await getHoldingThesis(holdingId)
  return NextResponse.json({ thesis })
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const raw = UpsertSchema.safeParse(await request.json())
  if (!raw.success) return NextResponse.json({ error: 'Invalid body' }, { status: 400 })

  const thesis = await upsertHoldingThesis({ ...raw.data, userId: user.id })
  return NextResponse.json({ thesis })
}
