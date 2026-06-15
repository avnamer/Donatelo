// GET /api/portfolios/[id]/dip-settings
// PATCH /api/portfolios/[id]/dip-settings
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
  const rows = await prisma.$queryRaw<Array<{ global_dip_threshold: number; global_buy_now_threshold: number }>>`
    SELECT global_dip_threshold, global_buy_now_threshold
    FROM portfolios WHERE id = ${id} AND user_id = ${user.id}
  `
  if (rows.length === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  return NextResponse.json({
    globalDipThreshold: rows[0].global_dip_threshold,
    globalBuyNowThreshold: rows[0].global_buy_now_threshold,
  })
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const portfolio = await prisma.portfolio.findFirst({
    where: { id, userId: user.id },
    select: { id: true },
  })
  if (!portfolio) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = await request.json()
  const { globalDipThreshold, globalBuyNowThreshold } = body

  if (
    typeof globalDipThreshold !== 'number' ||
    typeof globalBuyNowThreshold !== 'number' ||
    globalDipThreshold <= 0 || globalDipThreshold >= 1 ||
    globalBuyNowThreshold <= 0 || globalBuyNowThreshold >= 1
  ) {
    return NextResponse.json({ error: 'Invalid thresholds' }, { status: 400 })
  }

  await prisma.$executeRaw`
    UPDATE portfolios
    SET global_dip_threshold = ${globalDipThreshold}, global_buy_now_threshold = ${globalBuyNowThreshold}
    WHERE id = ${id}
  `

  return NextResponse.json({ ok: true })
}
