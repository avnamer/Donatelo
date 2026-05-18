// ─────────────────────────────────────────────
// POST /api/explore/[id]/use-template
//
// Copies an explore profile's allocation structure
// into the user's portfolio as root-level folders.
//
// Each allocation becomes a folder with:
//   - name, color, and targetAllocationPct set
// ─────────────────────────────────────────────

import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/db/supabase-server'
import { getPortfolios } from '@/lib/db/queries'
import { createFolder } from '@/lib/db/queries'
import { prisma } from '@/lib/db/prisma'
import { Prisma } from '@prisma/client'

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  // Auth
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Load profile
  const profile = await prisma.exploreProfile.findUnique({
    where: { id },
  })
  if (!profile) {
    return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
  }

  const allocations = profile.allocations as Array<{
    name: string
    pct: number
    color: string
  }>

  if (!Array.isArray(allocations) || allocations.length === 0) {
    return NextResponse.json({ error: 'Profile has no allocations' }, { status: 422 })
  }

  // Get user's first portfolio
  const portfolios = await getPortfolios(user.id)
  if (portfolios.length === 0) {
    return NextResponse.json({ error: 'No portfolio found' }, { status: 422 })
  }
  const portfolioId = portfolios[0].id

  // Create a folder for each allocation (root level)
  const created: string[] = []
  for (let i = 0; i < allocations.length; i++) {
    const a = allocations[i]
    const folder = await createFolder(portfolioId, user.id, {
      name: a.name,
      color: a.color,
      targetAllocationPct: a.pct,
      sortOrder: i,
    })
    if (folder) created.push(folder.id)
  }

  return NextResponse.json({
    foldersCreated: created.length,
    profileName: profile.name,
  })
}
