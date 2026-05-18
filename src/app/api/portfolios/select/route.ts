import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getCurrentUser } from '@/lib/db/supabase-server'
import { getPortfolios } from '@/lib/db/queries'
import { z } from 'zod'

const schema = z.object({ portfolioId: z.string().uuid() })

export async function POST(req: Request) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = schema.safeParse(await req.json())
  if (!body.success) return NextResponse.json({ error: 'Invalid body' }, { status: 400 })

  // Verify the portfolio belongs to this user
  const portfolios = await getPortfolios(user.id)
  const valid = portfolios.some((p) => p.id === body.data.portfolioId)
  if (!valid) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const cookieStore = await cookies()
  cookieStore.set('portfolio-id', body.data.portfolioId, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
  })

  return NextResponse.json({ ok: true })
}
