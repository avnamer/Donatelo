import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getCurrentUser } from '@/lib/db/supabase-server'
import { createFolder } from '@/lib/db/queries'

const CreateFolderSchema = z.object({
  portfolioId: z.string().uuid(),
  name: z.string().min(1).max(100),
  parentId: z.string().uuid().nullable().optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
})

export async function POST(request: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const parsed = CreateFolderSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 })
  }

  const { portfolioId, ...data } = parsed.data
  const folder = await createFolder(portfolioId, user.id, data)
  if (!folder) return NextResponse.json({ error: 'Portfolio not found' }, { status: 404 })

  return NextResponse.json(folder, { status: 201 })
}
