import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/db/supabase-server'
import { prisma } from '@/lib/db/prisma'
import { z } from 'zod'

const CreateCashAccountSchema = z.object({
  portfolioId: z.string().uuid(),
  name: z.string().min(1).max(100),
  currency: z.enum(['ILS', 'USD']),
  balance: z.string().regex(/^\d+$/).transform(BigInt).optional(),
})

export async function POST(req: Request) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const parsed = CreateCashAccountSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const { portfolioId, name, currency, balance } = parsed.data

  // Verify the portfolio belongs to the user
  const portfolio = await prisma.portfolio.findFirst({
    where: { id: portfolioId, userId: user.id },
    select: { id: true },
  })
  if (!portfolio) {
    return NextResponse.json({ error: 'Portfolio not found' }, { status: 404 })
  }

  const account = await prisma.cashAccount.create({
    data: {
      portfolioId,
      name,
      currency,
      balance: balance ?? 0n,
    },
  })

  return NextResponse.json(account, { status: 201 })
}
