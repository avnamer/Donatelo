import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getCurrentUser } from '@/lib/db/supabase-server'
import { createPortfolio } from '@/lib/db/queries'

const CreatePortfolioSchema = z.object({
  name: z.string().min(1).max(100),
  baseCurrency: z.enum(['ILS', 'USD']).default('ILS'),
})

export async function POST(request: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const parsed = CreatePortfolioSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 })
  }

  const portfolio = await createPortfolio(user.id, parsed.data)
  return NextResponse.json(portfolio, { status: 201 })
}
