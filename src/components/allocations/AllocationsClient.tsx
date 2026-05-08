'use client'

// ─────────────────────────────────────────────
// AllocationsClient — set target % per folder
// Auto-saves on change (debounced), shows donut chart
// ─────────────────────────────────────────────

import { useState, useCallback, useMemo } from 'react'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'
import { usePortfolioMetrics } from '@/hooks/usePortfolio'
import { formatCurrency } from '@/lib/calculations'
import { useUIStore } from '@/store/ui'
import { cn } from '@/lib/utils'
import { getChartColor } from '@/lib/utils'
import type { ServerHolding } from '@/hooks/usePortfolio'

// ─── Types ────────────────────────────────────

interface FolderTarget {
  id: string
  name: string
  color: string | null
  targetPct: number
  currentValue: bigint
  currentPct: number
}

interface AllocationsClientProps {
  folders: FolderTarget[]
  holdings: ServerHolding[]
  onSave: (folderId: string, targetPct: number) => Promise<void>
}

// ─── Donut chart ──────────────────────────────

function AllocationDonut({
  current,
  target,
}: {
  current: Array<{ name: string; value: number; color: string }>
  target: Array<{ name: string; value: number; color: string }>
}) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <h3 className="text-sm font-semibold mb-2">Allocation Overview</h3>
      <ResponsiveContainer width="100%" height={240}>
        <PieChart>
          {/* Inner ring — current */}
          <Pie
            data={current}
            cx="50%"
            cy="50%"
            innerRadius={50}
            outerRadius={80}
            dataKey="value"
            stroke="none"
          >
            {current.map((entry, i) => (
              <Cell key={entry.name} fill={entry.color} opacity={0.7} />
            ))}
          </Pie>
          {/* Outer ring — target */}
          <Pie
            data={target}
            cx="50%"
            cy="50%"
            innerRadius={85}
            outerRadius={105}
            dataKey="value"
            stroke="none"
          >
            {target.map((entry, i) => (
              <Cell key={entry.name} fill={entry.color} />
            ))}
          </Pie>
          <Tooltip
            formatter={(value: number) => `${value.toFixed(1)}%`}
            contentStyle={{
              background: 'hsl(var(--card))',
              border: '1px solid hsl(var(--border))',
              borderRadius: '8px',
              fontSize: 12,
            }}
          />
        </PieChart>
      </ResponsiveContainer>
      <div className="flex justify-center gap-4 text-xs text-muted-foreground mt-1">
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 rounded-sm bg-muted-foreground opacity-70 inline-block" />
          Inner: Current
        </span>
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 rounded-sm bg-muted-foreground inline-block" />
          Outer: Target
        </span>
      </div>
    </div>
  )
}

// ─── Main Component ───────────────────────────

export function AllocationsClient({
  folders: initialFolders,
  holdings,
  onSave,
}: AllocationsClientProps) {
  const currency = useUIStore((s) => s.currency)
  const metrics = usePortfolioMetrics(holdings)

  // Local target state (editable)
  const [targets, setTargets] = useState<Record<string, number>>(
    Object.fromEntries(initialFolders.map((f) => [f.id, f.targetPct]))
  )
  const [saving, setSaving] = useState<Record<string, boolean>>({})
  const [saved, setSaved] = useState<Record<string, boolean>>({})

  const total = Object.values(targets).reduce((s, v) => s + v, 0)
  const totalOk = Math.abs(total - 100) < 0.01

  // Compute current values per folder from metrics
  const folderValues = useMemo(() => {
    const map = new Map<string, bigint>()
    for (const h of metrics.holdings) {
      map.set(h.folderId, (map.get(h.folderId) ?? 0n) + h.currentValue)
    }
    return map
  }, [metrics.holdings])

  const totalValue = metrics.totalValue

  const handleChange = useCallback(
    async (folderId: string, value: string) => {
      const num = parseFloat(value)
      if (isNaN(num)) return

      setTargets((prev) => ({ ...prev, [folderId]: num }))

      // Debounced save
      setSaving((prev) => ({ ...prev, [folderId]: true }))
      setSaved((prev) => ({ ...prev, [folderId]: false }))

      try {
        await onSave(folderId, num)
        setSaved((prev) => ({ ...prev, [folderId]: true }))
        setTimeout(() => setSaved((prev) => ({ ...prev, [folderId]: false })), 2000)
      } finally {
        setSaving((prev) => ({ ...prev, [folderId]: false }))
      }
    },
    [onSave]
  )

  // Chart data
  const currentChartData = initialFolders.map((f, i) => ({
    name: f.name,
    value: totalValue > 0n
      ? Number(((folderValues.get(f.id) ?? 0n) * 10000n) / totalValue) / 100
      : 0,
    color: f.color ?? getChartColor(i),
  }))

  const targetChartData = initialFolders.map((f, i) => ({
    name: f.name,
    value: targets[f.id] ?? 0,
    color: f.color ?? getChartColor(i),
  }))

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Target Allocations</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Set target percentages for each folder. Changes auto-save.
        </p>
      </div>

      <div className="grid lg:grid-cols-[1fr_280px] gap-4">
        {/* Table */}
        <div className="rounded-xl border bg-card overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b bg-muted/30">
                <th className="py-2 px-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Folder
                </th>
                <th className="py-2 px-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Current Value
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
              {initialFolders.map((folder, i) => {
                const folderValue = folderValues.get(folder.id) ?? 0n
                const currentPct = totalValue > 0n
                  ? Number(folderValue * 10000n / totalValue) / 100
                  : 0
                const targetPct = targets[folder.id] ?? 0
                const gap = currentPct - targetPct
                const isSaving = saving[folder.id]
                const isSaved = saved[folder.id]

                return (
                  <tr key={folder.id} className="border-b hover:bg-muted/20 transition-colors">
                    <td className="py-2.5 px-3">
                      <div className="flex items-center gap-2">
                        <span
                          className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                          style={{ backgroundColor: folder.color ?? getChartColor(i) }}
                        />
                        <span className="text-sm font-medium">{folder.name}</span>
                      </div>
                    </td>
                    <td className="py-2.5 px-3 text-right tabular-nums text-sm">
                      {metrics.pricesLoading
                        ? <span className="inline-block w-16 h-4 animate-pulse rounded bg-muted" />
                        : formatCurrency(folderValue, currency, { compact: true })
                      }
                    </td>
                    <td className="py-2.5 px-3 text-right tabular-nums text-sm text-muted-foreground">
                      {currentPct.toFixed(1)}%
                    </td>
                    <td className="py-2.5 px-3 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {isSaving && (
                          <span className="text-xs text-muted-foreground">saving…</span>
                        )}
                        {isSaved && (
                          <span className="text-xs text-gain">✓</span>
                        )}
                        <div className="relative">
                          <input
                            type="number"
                            min="0"
                            max="100"
                            step="0.5"
                            value={targets[folder.id] ?? 0}
                            onChange={(e) => handleChange(folder.id, e.target.value)}
                            className="w-16 text-right pr-5 py-1 rounded border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring tabular-nums"
                          />
                          <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                            %
                          </span>
                        </div>
                      </div>
                    </td>
                    <td className={cn(
                      'py-2.5 px-3 text-right tabular-nums text-xs font-medium',
                      gap < -1 ? 'text-loss' : gap > 1 ? 'text-gain' : 'text-muted-foreground'
                    )}>
                      {gap >= 0 ? '+' : ''}{gap.toFixed(1)}%
                    </td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr className="bg-muted/20">
                <td className="py-2 px-3 text-xs font-medium text-muted-foreground" colSpan={3}>
                  Total
                </td>
                <td className={cn(
                  'py-2 px-3 text-right tabular-nums text-sm font-bold',
                  totalOk ? 'text-gain' : 'text-loss'
                )}>
                  {total.toFixed(1)}%
                  {!totalOk && (
                    <span className="ml-1 text-xs font-normal">
                      (must equal 100%)
                    </span>
                  )}
                </td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>

        {/* Donut chart */}
        <AllocationDonut current={currentChartData} target={targetChartData} />
      </div>
    </div>
  )
}
