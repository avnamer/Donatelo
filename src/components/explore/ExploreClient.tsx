'use client'

// ─────────────────────────────────────────────
// ExploreClient — browse curated portfolio profiles
// Each card shows a donut chart + allocation breakdown
// ─────────────────────────────────────────────

import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'
import { Star } from 'lucide-react'
import { cn } from '@/lib/utils'

// ─── Types ────────────────────────────────────

interface Allocation {
  name: string
  pct: number
  color: string
}

interface ExploreProfile {
  id: string
  name: string
  description: string
  isFeatured: boolean
  allocations: Allocation[]
}

// ─── Profile Card ─────────────────────────────

function ProfileCard({ profile }: { profile: ExploreProfile }) {
  const total = profile.allocations.reduce((s, a) => s + a.pct, 0)

  return (
    <div className={cn(
      'rounded-xl border bg-card p-4 space-y-3 hover:shadow-md transition-shadow',
      profile.isFeatured && 'border-primary/40 ring-1 ring-primary/20'
    )}>
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div>
          {profile.isFeatured && (
            <div className="flex items-center gap-1 text-primary text-xs font-medium mb-1">
              <Star className="h-3 w-3 fill-primary" />
              Featured
            </div>
          )}
          <h3 className="text-sm font-semibold">{profile.name}</h3>
          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
            {profile.description}
          </p>
        </div>
      </div>

      {/* Donut */}
      <div className="flex items-center gap-4">
        <div className="flex-shrink-0">
          <ResponsiveContainer width={80} height={80}>
            <PieChart>
              <Pie
                data={profile.allocations}
                cx="50%"
                cy="50%"
                innerRadius={25}
                outerRadius={38}
                dataKey="pct"
                stroke="none"
              >
                {profile.allocations.map((a, i) => (
                  <Cell key={a.name} fill={a.color} />
                ))}
              </Pie>
              <Tooltip
                formatter={(v: number) => `${v}%`}
                contentStyle={{
                  background: 'hsl(var(--card))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: 6,
                  fontSize: 11,
                }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Allocation list */}
        <div className="flex-1 space-y-1 min-w-0">
          {profile.allocations.slice(0, 5).map((a) => (
            <div key={a.name} className="flex items-center justify-between gap-2 text-xs">
              <div className="flex items-center gap-1.5 min-w-0">
                <span
                  className="w-2 h-2 rounded-full flex-shrink-0"
                  style={{ backgroundColor: a.color }}
                />
                <span className="truncate text-muted-foreground">{a.name}</span>
              </div>
              <span className="font-medium tabular-nums flex-shrink-0">{a.pct}%</span>
            </div>
          ))}
          {profile.allocations.length > 5 && (
            <p className="text-xs text-muted-foreground">
              +{profile.allocations.length - 5} more
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Main Component ───────────────────────────

export function ExploreClient({ profiles }: { profiles: ExploreProfile[] }) {
  const featured = profiles.filter((p) => p.isFeatured)
  const others = profiles.filter((p) => !p.isFeatured)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Explore</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Browse curated portfolio allocation strategies
        </p>
      </div>

      {profiles.length === 0 ? (
        <div className="rounded-xl border bg-card p-8 text-center text-sm text-muted-foreground">
          No profiles available yet.
        </div>
      ) : (
        <>
          {featured.length > 0 && (
            <section>
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
                Featured
              </h2>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {featured.map((p) => <ProfileCard key={p.id} profile={p} />)}
              </div>
            </section>
          )}
          {others.length > 0 && (
            <section>
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
                All Profiles
              </h2>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {others.map((p) => <ProfileCard key={p.id} profile={p} />)}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  )
}
