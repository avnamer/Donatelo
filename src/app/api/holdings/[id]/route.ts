import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/db/supabase-server'
import { updateHolding } from '@/lib/db/queries'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const body = await request.json()
  const { folderId, name, expenseRatio, plannedAmount, dipThreshold, buyNowThreshold } = body

  const result = await updateHolding(id, user.id, {
    ...(folderId !== undefined && { folderId }),
    ...(name !== undefined && { name }),
    ...(expenseRatio !== undefined && { expenseRatio }),
    ...(plannedAmount !== undefined && { plannedAmount: plannedAmount !== null ? BigInt(Math.round(plannedAmount * 100)) : null }),
    ...(dipThreshold !== undefined && { dipThreshold }),
    ...(buyNowThreshold !== undefined && { buyNowThreshold }),
  })
  if (!result) return NextResponse.json({ error: 'Not found or unauthorized' }, { status: 404 })

  return NextResponse.json(result)
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  // Soft-delete: mark as inactive rather than destroying data
  const result = await updateHolding(id, user.id, { isActive: false })
  if (!result) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  return new NextResponse(null, { status: 204 })
}
