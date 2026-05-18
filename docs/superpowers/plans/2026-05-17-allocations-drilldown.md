# Allocations Drill-Down Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the flat root-folder-only allocations table with a hierarchical drill-down tree that lets users expand folders to see subfolders and holdings, and set target allocation % at every level.

**Architecture:** The page server component passes ALL folders (not just root) plus per-holding target values to a rewritten `AllocationsClient`. The client builds the tree in-memory, uses a `Set<string>` for expand/collapse state, and computes current % relative to the parent's value at each level. Folder targets save via the existing `saveTargetAllocation` action (already works for any folderId). Holding targets save via a new `saveHoldingTargetAllocation` action.

**Tech Stack:** Next.js 14 App Router, React, TypeScript, Prisma, Tailwind CSS, lucide-react

---

## File Map

| File | Change |
|------|--------|
| `src/app/actions/allocations.ts` | Add `saveHoldingTargetAllocation` server action |
| `src/app/(dashboard)/allocations/page.tsx` | Pass `allFolders` + `holdingTargets` instead of root-only `folders` |
| `src/components/allocations/AllocationsClient.tsx` | Complete rewrite — drill-down tree with TargetInput at every level |

No new files. No schema changes. No type changes to shared types.

---

## Task 1: Add `saveHoldingTargetAllocation` server action

**Files:**
- Modify: `src/app/actions/allocations.ts`

- [ ] **Replace the entire file** with the version below, which adds the holding action alongside the existing folder action:

```typescript
'use server'

// ─────────────────────────────────────────────
// Server actions — target allocation updates
// ─────────────────────────────────────────────

import { revalidatePath } from 'next/cache'
import { getCurrentUser } from '@/lib/db/supabase-server'
import { updateFolder, updateHolding } from '@/lib/db/queries'

export async function saveTargetAllocation(
  folderId: string,
  targetPct: number
): Promise<{ success: boolean; error?: string }> {
  const user = await getCurrentUser()
  if (!user) return { success: false, error: 'Unauthorized' }

  if (targetPct < 0 || targetPct > 100) {
    return { success: false, error: 'Target must be between 0 and 100' }
  }

  const result = await updateFolder(folderId, user.id, {
    targetAllocationPct: targetPct,
  })

  if (!result) return { success: false, error: 'Folder not found' }

  revalidatePath('/allocations')
  revalidatePath('/invest')
  return { success: true }
}

export async function saveHoldingTargetAllocation(
  holdingId: string,
  targetPct: number
): Promise<{ success: boolean; error?: string }> {
  const user = await getCurrentUser()
  if (!user) return { success: false, error: 'Unauthorized' }

  if (targetPct < 0 || targetPct > 100) {
    return { success: false, error: 'Target must be between 0 and 100' }
  }

  const result = await updateHolding(holdingId, user.id, {
    targetAllocationPct: targetPct,
  })

  if (!result) return { success: false, error: 'Holding not found' }

  revalidatePath('/allocations')
  revalidatePath('/invest')
  return { success: true }
}
```

- [ ] **Verify TypeScript compiles** — `updateHolding` already accepts `targetAllocationPct?: number | null` (confirmed in `src/lib/db/queries/holdings.ts` line 110–115). No type errors expected.

---

## Task 2: Update the allocations page server component

**Files:**
- Modify: `src/app/(dashboard)/allocations/page.tsx`

The page currently passes only root folders and omits `parentId` from holdings. It needs to:
1. Pass **all** folders (with `parentId`) as `allFolders`
2. Pass a `holdingTargets` map (holdingId → target %)
3. Wire up both save callbacks

- [ ] **Replace the entire file:**

```typescript
// ─────────────────────────────────────────────
// Allocations page — drill-down target allocation editor
// ─────────────────────────────────────────────

import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/db/supabase-server'
import { getPortfolios, getPortfolioWithStructure, getHoldingsForPortfolio } from '@/lib/db/queries'
import { AllocationsClient } from '@/components/allocations/AllocationsClient'
import { saveTargetAllocation, saveHoldingTargetAllocation } from '@/app/actions/allocations'
import type { ServerHolding } from '@/hooks/usePortfolio'
import type { Lot } from '@/types'

export default async function AllocationsPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/auth/login')

  const portfolios = await getPortfolios(user.id)
  if (portfolios.length === 0) {
    return (
      <div className="py-24 text-center text-muted-foreground text-sm">
        Create a portfolio first.
      </div>
    )
  }

  const portfolio = await getPortfolioWithStructure(portfolios[0].id, user.id)
  if (!portfolio) redirect('/')

  const rawHoldings = await getHoldingsForPortfolio(portfolios[0].id, user.id)

  // All folders (root + subfolders) with parentId for tree building
  const allFolders = portfolio.folders.map((f) => ({
    id: f.id,
    name: f.name,
    color: f.color,
    parentId: f.parentId,
    targetPct: f.targetAllocationPct ? Number(f.targetAllocationPct) : 0,
  }))

  // Holdings with parentId so usePortfolioMetrics resolves rootFolderId correctly
  const holdings: ServerHolding[] = rawHoldings.map((h) => ({
    id: h.id,
    tickerSymbol: h.tickerSymbol,
    name: h.name,
    exchange: h.exchange,
    folderId: h.folderId,
    expenseRatio: h.expenseRatio ? Number(h.expenseRatio) : null,
    folder: {
      name: h.folder.name,
      color: h.folder.color,
      parentId: h.folder.parentId,
    },
    lots: h.lots.map((l) => ({
      ...l,
      shares: Number(l.shares),
      soldShares: Number(l.soldShares),
    })) as unknown as Lot[],
  }))

  // Initial target % per holding (0 if unset)
  const holdingTargets: Record<string, number> = {}
  for (const h of rawHoldings) {
    holdingTargets[h.id] = h.targetAllocationPct ? Number(h.targetAllocationPct) : 0
  }

  return (
    <AllocationsClient
      allFolders={allFolders}
      holdings={holdings}
      holdingTargets={holdingTargets}
      onSaveFolder={async (folderId, targetPct) => {
        'use server'
        await saveTargetAllocation(folderId, targetPct)
      }}
      onSaveHolding={async (holdingId, targetPct) => {
        'use server'
        await saveHoldingTargetAllocation(holdingId, targetPct)
      }}
    />
  )
}
```

---

## Task 3: Rewrite `AllocationsClient` with drill-down tree

**Files:**
- Modify: `src/components/allocations/AllocationsClient.tsx`

The component needs to:
- Build a folder tree from `allFolders`
- Compute total value per folder recursively (so root folder = sum of all descendant holdings)
- Track expand/collapse state with `Set<string>`
- Show root folders → subfolders → holdings as indented rows
- Show `current %` relative to parent value at each level
- Show editable `target %` input with debounced auto-save at every level
- Show gap = current % − target %
- Footer shows root-folder total target (must sum to 100%)

- [ ] **Replace the entire file:**

```typescript
'use client'

// ─────────────────────────────────────────────
// AllocationsClient — hierarchical drill-down allocation editor
// Root folders → subfolders → holdings, all with editable target %
// ─────────────────────────────────────────────

import React, { useState, useCallback, useMemo, useRef } from 'react'
import { ChevronRight, ChevronDown } from 'lucide-react'
import { usePortfolioMetrics } from '@/hooks/usePortfolio'
import { formatCurrency } from '@/lib/calculations'
import { useUIStore } from '@/store/ui'
import { cn } from '@/lib/utils'
import type { ServerHolding } from '@/hooks/usePortfolio'

// ─── Types ────────────────────────────────────

interface FolderInfo {
  id: string
  name: string
  color: string | null
  parentId: string | null
  targetPct: number
}

interface AllocationsClientProps {
  allFolders: FolderInfo[]
  holdings: ServerHolding[]
  holdingTargets: Record<string, number>
  onSaveFolder: (folderId: string, targetPct: number) => Promise<void>
  onSaveHolding: (holdingId: string, targetPct: number) => Promise<void>
}

// ─── Target Input ─────────────────────────────

function TargetInput({
  id,
  value,
  saving,
  saved,
  onChange,
}: {
  id: string
  value: number
  saving?: boolean
  saved?: boolean
  onChange: (id: string, v: string) => void
}) {
  return (
    <div className="flex items-center justify-end gap-1.5">
      {saving && <span className="text-xs text-muted-foreground">saving…</span>}
      {saved && <span className="text-xs text-gain">✓</span>}
      <div className="relative">
        <input
          type="number"
          min="0"
          max="100"
          step="0.5"
          value={value}
          onChange={(e) => onChange(id, e.target.value)}
          className="w-16 text-right pr-5 py-1 rounded border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring tabular-nums"
        />
        <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
          %
        </span>
      </div>
    </div>
  )
}

// ─── Gap Cell ─────────────────────────────────

function GapCell({ gap }: { gap: number }) {
  return (
    <td
      className={cn(
        'py-2.5 px-3 text-right tabular-nums text-xs font-medium',
        gap < -1 ? 'text-loss' : gap > 1 ? 'text-gain' : 'text-muted-foreground'
      )}
    >
      {gap >= 0 ? '+' : ''}
      {gap.toFixed(1)}%
    </td>
  )
}

// ─── Main Component ───────────────────────────

export function AllocationsClient({
  allFolders,
  holdings,
  holdingTargets: initialHoldingTargets,
  onSaveFolder,
  onSaveHolding,
}: AllocationsClientProps) {
  const currency = useUIStore((s) => s.currency)

  // Build folderMap for usePortfolioMetrics root-folder resolution
  const folderMap = useMemo(
    () =>
      new Map(
        allFolders.map((f) => [f.id, { name: f.name, color: f.color, parentId: f.parentId }])
      ),
    [allFolders]
  )

  const metrics = usePortfolioMetrics(holdings, folderMap)

  // ── State ──────────────────────────────────

  const [folderTargets, setFolderTargets] = useState<Record<string, number>>(
    Object.fromEntries(allFolders.map((f) => [f.id, f.targetPct]))
  )
  const [holdingTargets, setHoldingTargets] = useState<Record<string, number>>(
    initialHoldingTargets
  )
  const [saving, setSaving] = useState<Record<string, boolean>>({})
  const [saved, setSaved] = useState<Record<string, boolean>>({})
  const debounceTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({})
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  // ── Handlers ───────────────────────────────

  const toggleExpand = useCallback((id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }, [])

  const handleFolderChange = useCallback(
    (id: string, value: string) => {
      const num = parseFloat(value)
      if (isNaN(num)) return
      setFolderTargets((prev) => ({ ...prev, [id]: num }))
      clearTimeout(debounceTimers.current[`f:${id}`])
      debounceTimers.current[`f:${id}`] = setTimeout(async () => {
        setSaving((prev) => ({ ...prev, [`f:${id}`]: true }))
        try {
          await onSaveFolder(id, num)
          setSaved((prev) => ({ ...prev, [`f:${id}`]: true }))
          setTimeout(
            () => setSaved((prev) => ({ ...prev, [`f:${id}`]: false })),
            2000
          )
        } finally {
          setSaving((prev) => ({ ...prev, [`f:${id}`]: false }))
        }
      }, 600)
    },
    [onSaveFolder]
  )

  const handleHoldingChange = useCallback(
    (id: string, value: string) => {
      const num = parseFloat(value)
      if (isNaN(num)) return
      setHoldingTargets((prev) => ({ ...prev, [id]: num }))
      clearTimeout(debounceTimers.current[`h:${id}`])
      debounceTimers.current[`h:${id}`] = setTimeout(async () => {
        setSaving((prev) => ({ ...prev, [`h:${id}`]: true }))
        try {
          await onSaveHolding(id, num)
          setSaved((prev) => ({ ...prev, [`h:${id}`]: true }))
          setTimeout(
            () => setSaved((prev) => ({ ...prev, [`h:${id}`]: false })),
            2000
          )
        } finally {
          setSaving((prev) => ({ ...prev, [`h:${id}`]: false }))
        }
      }, 600)
    },
    [onSaveHolding]
  )

  // ── Derived data ────────────────────────────

  const rootFolders = useMemo(
    () => allFolders.filter((f) => f.parentId === null),
    [allFolders]
  )

  // childrenOf: parentId → list of child FolderInfo
  const childrenOf = useMemo(() => {
    const map = new Map<string, FolderInfo[]>()
    for (const f of allFolders) {
      if (f.parentId) {
        const arr = map.get(f.parentId) ?? []
        arr.push(f)
        map.set(f.parentId, arr)
      }
    }
    return map
  }, [allFolders])

  // holdingsByFolder: direct folderId → HoldingMetrics[]
  const holdingsByFolder = useMemo(() => {
    const map = new Map<string, typeof metrics.holdings>()
    for (const h of metrics.holdings) {
      const arr = map.get(h.folderId) ?? []
      arr.push(h)
      map.set(h.folderId, arr)
    }
    return map
  }, [metrics.holdings])

  // folderTotalValue: recursive sum (direct holdings + all descendant holdings)
  const folderTotalValue = useMemo(() => {
    // Step 1: direct holding values per folder
    const direct = new Map<string, bigint>()
    for (const h of metrics.holdings) {
      direct.set(h.folderId, (direct.get(h.folderId) ?? 0n) + h.currentValue)
    }

    // Step 2: childIds map for recursive traversal
    const childIds = new Map<string, string[]>()
    for (const f of allFolders) {
      if (f.parentId) {
        const arr = childIds.get(f.parentId) ?? []
        arr.push(f.id)
        childIds.set(f.parentId, arr)
      }
    }

    // Step 3: recursive computation (handles arbitrary depth)
    function computeValue(folderId: string): bigint {
      const base = direct.get(folderId) ?? 0n
      const children = childIds.get(folderId) ?? []
      return children.reduce((s, cId) => s + computeValue(cId), base)
    }

    const result = new Map<string, bigint>()
    for (const f of allFolders) {
      result.set(f.id, computeValue(f.id))
    }
    return result
  }, [metrics.holdings, allFolders])

  const totalPortfolioValue = metrics.totalValue
  const rootTotal = rootFolders.reduce((s, f) => s + (folderTargets[f.id] ?? 0), 0)
  const rootTotalOk = Math.abs(rootTotal - 100) < 0.01

  // ── Render ──────────────────────────────────

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Target Allocations</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Set target percentages at each level. Click a folder to expand subfolders and
          holdings.
        </p>
      </div>

      <div className="rounded-xl border bg-card overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b bg-muted/30">
              <th className="py-2 px-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Name
              </th>
              <th className="py-2 px-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Value
              </th>
              <th className="py-2 px-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Current %
              </th>
              <th className="py-2 px-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Target %
              </th>
              <th className="py-2 px-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Gap
              </th>
            </tr>
          </thead>

          <tbody>
            {rootFolders.map((folder) => {
              const folderValue = folderTotalValue.get(folder.id) ?? 0n
              const currentPct =
                totalPortfolioValue > 0n
                  ? Number((folderValue * 10000n) / totalPortfolioValue) / 100
                  : 0
              const targetPct = folderTargets[folder.id] ?? 0
              const gap = currentPct - targetPct
              const isExpanded = expanded.has(folder.id)
              const subfolders = childrenOf.get(folder.id) ?? []
              const directHoldings = holdingsByFolder.get(folder.id) ?? []
              const hasChildren = subfolders.length > 0 || directHoldings.length > 0

              return (
                <React.Fragment key={folder.id}>
                  {/* ── Root folder row ─────────────────── */}
                  <tr
                    className={cn(
                      'border-b hover:bg-muted/20 transition-colors',
                      hasChildren && 'cursor-pointer'
                    )}
                    onClick={() => hasChildren && toggleExpand(folder.id)}
                  >
                    <td className="py-2.5 px-3">
                      <div className="flex items-center gap-2">
                        {hasChildren ? (
                          isExpanded ? (
                            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                          ) : (
                            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                          )
                        ) : (
                          <span className="w-3.5 h-3.5 flex-shrink-0" />
                        )}
                        <span
                          className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                          style={{
                            backgroundColor:
                              folder.color ?? 'hsl(var(--muted-foreground))',
                          }}
                        />
                        <span className="text-sm font-semibold">{folder.name}</span>
                      </div>
                    </td>
                    <td className="py-2.5 px-3 text-right tabular-nums text-sm">
                      {metrics.pricesLoading ? (
                        <span className="inline-block w-16 h-4 animate-pulse rounded bg-muted" />
                      ) : (
                        formatCurrency(folderValue, currency, { compact: true })
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-right tabular-nums text-sm text-muted-foreground">
                      {currentPct.toFixed(1)}%
                    </td>
                    <td
                      className="py-2.5 px-3 text-right"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <TargetInput
                        id={folder.id}
                        value={folderTargets[folder.id] ?? 0}
                        saving={saving[`f:${folder.id}`]}
                        saved={saved[`f:${folder.id}`]}
                        onChange={handleFolderChange}
                      />
                    </td>
                    <GapCell gap={gap} />
                  </tr>

                  {/* ── Subfolders (visible when root expanded) ── */}
                  {isExpanded &&
                    subfolders.map((sub) => {
                      const subValue = folderTotalValue.get(sub.id) ?? 0n
                      const subCurrentPct =
                        folderValue > 0n
                          ? Number((subValue * 10000n) / folderValue) / 100
                          : 0
                      const subTargetPct = folderTargets[sub.id] ?? 0
                      const subGap = subCurrentPct - subTargetPct
                      const subIsExpanded = expanded.has(sub.id)
                      const subHoldings = holdingsByFolder.get(sub.id) ?? []

                      return (
                        <React.Fragment key={sub.id}>
                          {/* Subfolder row */}
                          <tr
                            className={cn(
                              'border-b bg-muted/[0.03] hover:bg-muted/20 transition-colors',
                              subHoldings.length > 0 && 'cursor-pointer'
                            )}
                            onClick={() =>
                              subHoldings.length > 0 && toggleExpand(sub.id)
                            }
                          >
                            <td className="py-2 px-3 pl-8">
                              <div className="flex items-center gap-2">
                                {subHoldings.length > 0 ? (
                                  subIsExpanded ? (
                                    <ChevronDown className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                                  ) : (
                                    <ChevronRight className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                                  )
                                ) : (
                                  <span className="w-3 h-3 flex-shrink-0" />
                                )}
                                <span
                                  className="w-2 h-2 rounded-full flex-shrink-0"
                                  style={{
                                    backgroundColor:
                                      sub.color ?? 'hsl(var(--muted-foreground))',
                                  }}
                                />
                                <span className="text-sm font-medium">{sub.name}</span>
                                <span className="text-xs text-muted-foreground">
                                  ({subHoldings.length})
                                </span>
                              </div>
                            </td>
                            <td className="py-2 px-3 text-right tabular-nums text-sm">
                              {metrics.pricesLoading ? (
                                <span className="inline-block w-14 h-4 animate-pulse rounded bg-muted" />
                              ) : (
                                formatCurrency(subValue, currency, { compact: true })
                              )}
                            </td>
                            <td className="py-2 px-3 text-right tabular-nums text-sm text-muted-foreground">
                              <div className="flex flex-col items-end">
                                <span>{subCurrentPct.toFixed(1)}%</span>
                                <span className="text-[10px] text-muted-foreground/60">
                                  of {folder.name}
                                </span>
                              </div>
                            </td>
                            <td
                              className="py-2 px-3 text-right"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <TargetInput
                                id={sub.id}
                                value={folderTargets[sub.id] ?? 0}
                                saving={saving[`f:${sub.id}`]}
                                saved={saved[`f:${sub.id}`]}
                                onChange={handleFolderChange}
                              />
                            </td>
                            <GapCell gap={subGap} />
                          </tr>

                          {/* Holdings within subfolder (visible when subfolder expanded) */}
                          {subIsExpanded &&
                            subHoldings.map((h) => {
                              const hCurrentPct =
                                subValue > 0n
                                  ? Number((h.currentValue * 10000n) / subValue) / 100
                                  : 0
                              const hTargetPct = holdingTargets[h.holdingId] ?? 0
                              const hGap = hCurrentPct - hTargetPct

                              return (
                                <tr
                                  key={h.holdingId}
                                  className="border-b bg-muted/[0.06] hover:bg-muted/20 transition-colors"
                                >
                                  <td className="py-1.5 px-3 pl-14">
                                    <div className="flex flex-col">
                                      <span className="text-sm font-medium">
                                        {h.tickerSymbol}
                                      </span>
                                      <span className="text-xs text-muted-foreground truncate max-w-[200px]">
                                        {h.name}
                                      </span>
                                    </div>
                                  </td>
                                  <td className="py-1.5 px-3 text-right tabular-nums text-sm">
                                    {metrics.pricesLoading ? (
                                      <span className="inline-block w-14 h-4 animate-pulse rounded bg-muted" />
                                    ) : (
                                      formatCurrency(h.currentValue, currency, {
                                        compact: true,
                                      })
                                    )}
                                  </td>
                                  <td className="py-1.5 px-3 text-right tabular-nums text-sm text-muted-foreground">
                                    <div className="flex flex-col items-end">
                                      <span>{hCurrentPct.toFixed(1)}%</span>
                                      <span className="text-[10px] text-muted-foreground/60">
                                        of {sub.name}
                                      </span>
                                    </div>
                                  </td>
                                  <td
                                    className="py-1.5 px-3 text-right"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    <TargetInput
                                      id={h.holdingId}
                                      value={holdingTargets[h.holdingId] ?? 0}
                                      saving={saving[`h:${h.holdingId}`]}
                                      saved={saved[`h:${h.holdingId}`]}
                                      onChange={handleHoldingChange}
                                    />
                                  </td>
                                  <GapCell gap={hGap} />
                                </tr>
                              )
                            })}
                        </React.Fragment>
                      )
                    })}

                  {/* Direct holdings in root folder (no subfolder) */}
                  {isExpanded &&
                    directHoldings.map((h) => {
                      const hCurrentPct =
                        folderValue > 0n
                          ? Number((h.currentValue * 10000n) / folderValue) / 100
                          : 0
                      const hTargetPct = holdingTargets[h.holdingId] ?? 0
                      const hGap = hCurrentPct - hTargetPct

                      return (
                        <tr
                          key={h.holdingId}
                          className="border-b bg-muted/[0.03] hover:bg-muted/20 transition-colors"
                        >
                          <td className="py-1.5 px-3 pl-9">
                            <div className="flex flex-col">
                              <span className="text-sm font-medium">{h.tickerSymbol}</span>
                              <span className="text-xs text-muted-foreground truncate max-w-[200px]">
                                {h.name}
                              </span>
                            </div>
                          </td>
                          <td className="py-1.5 px-3 text-right tabular-nums text-sm">
                            {metrics.pricesLoading ? (
                              <span className="inline-block w-14 h-4 animate-pulse rounded bg-muted" />
                            ) : (
                              formatCurrency(h.currentValue, currency, { compact: true })
                            )}
                          </td>
                          <td className="py-1.5 px-3 text-right tabular-nums text-sm text-muted-foreground">
                            <div className="flex flex-col items-end">
                              <span>{hCurrentPct.toFixed(1)}%</span>
                              <span className="text-[10px] text-muted-foreground/60">
                                of {folder.name}
                              </span>
                            </div>
                          </td>
                          <td
                            className="py-1.5 px-3 text-right"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <TargetInput
                              id={h.holdingId}
                              value={holdingTargets[h.holdingId] ?? 0}
                              saving={saving[`h:${h.holdingId}`]}
                              saved={saved[`h:${h.holdingId}`]}
                              onChange={handleHoldingChange}
                            />
                          </td>
                          <GapCell gap={hGap} />
                        </tr>
                      )
                    })}
                </React.Fragment>
              )
            })}
          </tbody>

          <tfoot>
            <tr className="bg-muted/20">
              <td
                className="py-2 px-3 text-xs font-medium text-muted-foreground"
                colSpan={3}
              >
                Total
              </td>
              <td
                className={cn(
                  'py-2 px-3 text-right tabular-nums text-sm font-bold',
                  rootTotalOk ? 'text-gain' : 'text-loss'
                )}
              >
                {rootTotal.toFixed(1)}%
                {!rootTotalOk && (
                  <span className="ml-1 text-xs font-normal">(must equal 100%)</span>
                )}
              </td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}
```

- [ ] **Verify:** The old `AllocationsClient` imported `PieChart`, `Pie`, `Cell`, `Tooltip`, `ResponsiveContainer` from `recharts`. Those are no longer needed. Confirm no other file imports from `AllocationsClient` that would break (it's only used in the allocations page).

---

## Task 4: Verify TypeScript compiles and test manually

- [ ] **Run TypeScript check:**

```bash
cd C:\Users\Avner\donatelo
npx tsc --noEmit
```

Expected: zero errors. Common issues to watch for:
- `React.Fragment` with `key` — requires `import React` (already in the file via `import React, { ... } from 'react'`)
- `GapCell` used inside `<tr>` — valid, React supports components that render `<td>`
- `folderMap` second argument to `usePortfolioMetrics` — already typed as `Map<string, { name: string; color: string | null; parentId: string | null }>` in `src/hooks/usePortfolio.ts` line 91

- [ ] **Start dev server and open the allocations page:**

```bash
pnpm dev
```

Open `http://localhost:3000/allocations`

Manual checks:
1. Root folders show with correct current value (no longer 0 for ישראל/ארהב/אסיה)
2. Clicking a root folder reveals its subfolders indented below
3. Subfolder "current %" shows "X% of [parent name]"  
4. Clicking a subfolder reveals its holdings indented further
5. Holding "current %" shows "X% of [subfolder name]"
6. Editing any target % input auto-saves after 600ms (shows "saving…" then "✓")
7. Footer shows root-folder target total
8. Folders with no children are not clickable (no expand arrow shown)

- [ ] **Commit:**

```bash
git add src/app/actions/allocations.ts src/app/(dashboard)/allocations/page.tsx src/components/allocations/AllocationsClient.tsx
git commit -m "feat: add drill-down tree to allocations page with per-level target % editing"
```
