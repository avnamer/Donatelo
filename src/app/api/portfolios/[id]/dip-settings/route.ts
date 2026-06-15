// PATCH /api/portfolios/[id]/dip-settings
import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/db/supabase-server'
import { prisma } from '@/lib/db/prisma'

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

  await prisma.portfolio.update({
    where: { id },
    data: { globalDipThreshold, globalBuyNowThreshold },
  })

  return NextResponse.json({ ok: true })
}
