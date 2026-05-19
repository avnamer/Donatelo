'use client'

// ─────────────────────────────────────────────
// AllocationsClient — hierarchical drill-down allocation editor
// Root folders → subfolders → holdings, all with editable target %
// Sub-total rows per level + warnings when level ≠ 100%
// ─────────────────────────────────────────────

import React, { useState, useCallback, useMemo, useRef } from 'react'
import { ChevronRight, ChevronDown, AlertCircle } from 'lucide-react'
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

function GapCell({ gap, compact }: { gap: number; compact?: boolean }) {
  return (
    <td
      className={cn(
        'text-right tabular-nums text-xs font-medium',
        compact ? 'py-1 px-3' : 'py-2.5 px-3',
        gap < -1 ? 'text-loss' : gap > 1 ? 'text-gain' : 'text-muted-foreground'
      )}
    >
      {gap >= 0 ? '+' : ''}
      {gap.toFixed(1)}%
    </td>
  )
}

// ─── Sub-total Row ────────────────────────────
// Appears after each group of children to show whether targets sum to 100%.
// - total = 0%          → neutral/muted (nothing set yet)
// - total = 100%        → green + ✓
// - total > 0 and ≠ 100 → red + how much is needed

function SubTotalRow({
  indent,
  label,
  total,
}: {
  indent: string   // tailwind padding-left class, e.g. "pl-8"
  label: string
  total: number
}) {
  const isActive = total > 0.009
  const isOk = isActive && Math.abs(total - 100) < 0.01
  const needed = 100 - total

  return (
    <tr className="border-b border-dashed">
      <td className={cn('py-1 px-3 text-xs text-muted-foreground italic', indent)}>
        {label}
      </td>
      <td colSpan={2} />
      <td
        className={cn(
          'py-1 px-3 text-right tabular-nums text-xs font-semibold',
          !isActive
            ? 'text-muted-foreground/40'
            : isOk
            ? 'text-gain'
            : 'text-loss'
        )}
      >
        {total.toFixed(1)}%
        {isActive && isOk && <span className="ml-1">✓</span>}
        {isActive && !isOk && (
          <span className="ml-1 font-normal text-[10px]">
            ({needed > 0 ? '+' : ''}
            {needed.toFixed(1)}% needed)
          </span>
        )}
      </td>
      <td />
    </tr>
  )
}

// ─── Issue check helper ───────────────────────
// Returns true when targets have been partially set (sum > 0) but don't sum to 100%

function hasIssue(total: number): boolean {
  return total > 0.009 && Math.abs(total - 100) >= 0.01
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
          setTimeout(() => setSaved((prev) => ({ ...prev, [`f:${id}`]: false })), 2000)
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
          setTimeout(() => setSaved((prev) => ({ ...prev, [`h:${id}`]: false })), 2000)
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

  const holdingsByFolder = useMemo(() => {
    const map = new Map<string, typeof metrics.holdings>()
    for (const h of metrics.holdings) {
      const arr = map.get(h.folderId) ?? []
      arr.push(h)
      map.set(h.folderId, arr)
    }
    return map
  }, [metrics.holdings])

  // folderTotalValue: recursive sum of all descendant holdings
  const folderTotalValue = useMemo(() => {
    const direct = new Map<string, bigint>()
    for (const h of metrics.holdings) {
      direct.set(h.folderId, (direct.get(h.folderId) ?? 0n) + h.currentValue)
    }
    const childIds = new Map<string, string[]>()
    for (const f of allFolders) {
      if (f.parentId) {
        const arr = childIds.get(f.parentId) ?? []
        arr.push(f.id)
        childIds.set(f.parentId, arr)
      }
    }
    function computeValue(folderId: string): bigint {
      const base = direct.get(folderId) ?? 0n
      return (childIds.get(folderId) ?? []).reduce(
        (s, cId) => s + computeValue(cId),
        base
      )
    }
    const result = new Map<string, bigint>()
    for (const f of allFolders) result.set(f.id, computeValue(f.id))
    return result
  }, [metrics.holdings, allFolders])

  const totalPortfolioValue = metrics.totalValue
  const rootTotal = rootFolders.reduce((s, f) => s + (folderTargets[f.id] ?? 0), 0)
  const rootTotalOk = Math.abs(rootTotal - 100) < 0.01

  // True when at least one root folder is open — used to dim the others
  const anyRootExpanded = rootFolders.some((f) => expanded.has(f.id))

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

              // ── Sub-level issue detection (for root folder warning) ──────────
              // Subfolder targets sum
              const subFolderTotal = subfolders.reduce(
                (s, sub) => s + (folderTargets[sub.id] ?? 0),
                0
              )
              // Holdings-of-each-subfolder sum check
              const anySubHoldingIssue = subfolders.some((sub) => {
                const subH = holdingsByFolder.get(sub.id) ?? []
                if (subH.length === 0) return false
                const hTotal = subH.reduce(
                  (s, h) => s + (holdingTargets[h.holdingId] ?? 0),
                  0
                )
                return hasIssue(hTotal)
              })
              // Direct-holdings sum
              const directHoldingTotal = directHoldings.reduce(
                (s, h) => s + (holdingTargets[h.holdingId] ?? 0),
                0
              )
              const rootFolderHasIssue =
                (subfolders.length > 0 && hasIssue(subFolderTotal)) ||
                anySubHoldingIssue ||
                (directHoldings.length > 0 && hasIssue(directHoldingTotal))

              return (
                <React.Fragment key={folder.id}>
                  {/* ── Root folder row ─────────────────── */}
                  <tr
                    className={cn(
                      'border-b transition-all duration-200',
                      hasChildren && 'cursor-pointer',
                      // When this folder is expanded: subtle highlight to anchor the open section
                      isExpanded && 'bg-muted/[0.08]',
                      // When another folder is expanded: dim this one
                      anyRootExpanded && !isExpanded
                        ? 'opacity-40 hover:opacity-70'
                        : 'hover:bg-muted/20'
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
                            backgroundColor: folder.color ?? 'hsl(var(--muted-foreground))',
                          }}
                        />
                        <span
                          className={cn(
                            'text-sm font-semibold',
                            rootFolderHasIssue && 'text-loss'
                          )}
                        >
                          {folder.name}
                        </span>
                        {rootFolderHasIssue && (
                          <AlertCircle className="h-3.5 w-3.5 text-loss flex-shrink-0" />
                        )}
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

                  {/* ── Subfolders ─────────────────────── */}
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

                      // Holdings sum for this subfolder
                      const subHoldingTotal = subHoldings.reduce(
                        (s, h) => s + (holdingTargets[h.holdingId] ?? 0),
                        0
                      )
                      const subHasHoldingIssue =
                        subHoldings.length > 0 && hasIssue(subHoldingTotal)

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
                                <span
                                  className={cn(
                                    'text-sm font-medium',
                                    subHasHoldingIssue && 'text-loss'
                                  )}
                                >
                                  {sub.name}
                                </span>
                                <span className="text-xs text-muted-foreground">
                                  ({subHoldings.length})
                                </span>
                                {subHasHoldingIssue && (
                                  <AlertCircle className="h-3 w-3 text-loss flex-shrink-0" />
                                )}
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

                          {/* Holdings within subfolder */}
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
                                  <GapCell gap={hGap} compact />
                                </tr>
                              )
                            })}

                          {/* Sub-total: holdings within this subfolder */}
                          {subIsExpanded && subHoldings.length > 0 && (
                            <SubTotalRow
                              indent="pl-14"
                              label={`Total in ${sub.name}`}
                              total={subHoldingTotal}
                            />
                          )}
                        </React.Fragment>
                      )
                    })}

                  {/* Sub-total: subfolders within this root folder */}
                  {isExpanded && subfolders.length > 0 && (
                    <SubTotalRow
                      indent="pl-8"
                      label={`Total in ${folder.name}`}
                      total={subFolderTotal}
                    />
                  )}

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
                          <GapCell gap={hGap} compact />
                        </tr>
                      )
                    })}

                  {/* Sub-total: direct holdings in root folder */}
                  {isExpanded && directHoldings.length > 0 && (
                    <SubTotalRow
                      indent="pl-9"
                      label={`Total in ${folder.name}`}
                      total={directHoldingTotal}
                    />
                  )}
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
                  <span className="ml-1 text-xs font-normal">
                    ({(100 - rootTotal) > 0 ? '+' : ''}
                    {(100 - rootTotal).toFixed(1)}% needed)
                  </span>
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
