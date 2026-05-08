// ─────────────────────────────────────────────
// Explore page — browse curated portfolio profiles
// Profiles are pre-seeded in the DB (explore_profiles table)
// ─────────────────────────────────────────────

import { prisma } from '@/lib/db/prisma'
import { ExploreClient } from '@/components/explore/ExploreClient'

export const dynamic = 'force-dynamic'

export default async function ExplorePage() {
  const profiles = await prisma.exploreProfile.findMany({
    orderBy: [{ isFeatured: 'desc' }, { name: 'asc' }],
  })

  const serialized = profiles.map((p) => ({
    id: p.id,
    name: p.name,
    description: p.description,
    isFeatured: p.isFeatured,
    allocations: p.allocations as Array<{ name: string; pct: number; color: string }>,
  }))

  return <ExploreClient profiles={serialized} />
}
