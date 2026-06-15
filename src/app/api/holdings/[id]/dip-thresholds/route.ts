// GET+PATCH /api/holdings/[id]/dip-thresholds
import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/db/supabase-server'
import { prisma } from '@/lib/db/prisma'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const rows = await prisma.$queryRaw<Array<{ dip_threshold: number | null; buy_now_threshold: number | null }>>`
    SELECT h.dip_threshold, h.buy_now_threshold
    FROM holdings h
    JOIN folders f ON f.id = h.folder_id
    JOIN portfolios p ON p.id = f.portfolio_id
    WHERE h.id = ${id} AND p.user_id = ${user.id}
  `
  if (rows.length === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  return NextResponse.json({
    dipThreshold: rows[0].dip_threshold,
    buyNowThreshold: rows[0].buy_now_threshold,
  })
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const holding = await prisma.holding.findFirst({
    where: { id },
    select: { id: true, folder: { select: { portfolio: { select: { userId: true } } } } },
  })
  if (!holding || holding.folder.portfolio.userId !== user.id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const body = await request.json()
  const { dipThreshold, buyNowThreshold } = body

  const validateThreshold = (v: unknown) =>
    v === null || (typeof v === 'number' && v > 0 && v < 1)

  if (!validateThreshold(dipThreshold) || !validateThreshold(buyNowThreshold)) {
    return NextResponse.json({ error: 'Invalid thresholds' }, { status: 400 })
  }

  await prisma.$executeRaw`
    UPDATE holdings
    SET dip_threshold = ${dipThreshold}, buy_now_threshold = ${buyNowThreshold}
    WHERE id = ${id}
  `

  return NextResponse.json({ ok: true })
}
