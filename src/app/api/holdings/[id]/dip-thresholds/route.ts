// PATCH /api/holdings/[id]/dip-thresholds
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

  await prisma.holding.update({
    where: { id },
    data: { dipThreshold, buyNowThreshold },
  })

  return NextResponse.json({ ok: true })
}
