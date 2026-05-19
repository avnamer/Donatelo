'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ChevronRight, Plus, Pencil, Trash2 } from 'lucide-react'
import { usePortfolioMetrics } from '@/hooks/usePortfolio'
import { formatCurrency, formatPercent } from '@/lib/calculations'
import { useUIStore } from '@/store/ui'
import { cn, formatHoldingDurationLong, calcAnnualizedReturn } from '@/lib/utils'
import { AddHoldingDialog } from './AddHoldingDialog'
import { RenameFolderDialog } from './RenameFolderDialog'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import type { ServerHolding } from '@/hooks/usePortfolio'
import type { FolderRow } from '@/lib/db/queries'

// ─── Types ────────────────────────────────────

interface SerializedFolder {
  id: string
  portfolioId: string
  parentId: string | null
  name: string
  color: string | null
  targetAllocationPct: number | null
  parent: { id: string; name: string; parentId: string | null } | null
  children: Array<{
    id: string
    name: string
    color: string | null
    targetAllocationPct: number | null
    parentId: string | null
  }>
}

interface FolderPageClientProps {
  folder: SerializedFolder
  holdings: ServerHolding[]
  folders: FolderRow[]
  holdingTargets?: Record<string, number>
}

// ─── Component ────────────────────────────────

export function FolderPageClient({ folder, holdings, folders, holdingTargets = {} }: FolderPageClientProps) {
  const router = useRouter()
  const currency = useUIStore((s) => s.currency)
  const metrics = usePortfolioMetrics(holdings, buildFolderMap(folders))

  const [addHoldingOpen, setAddHoldingOpen] = useState(false)
  const [renameOpen, setRenameOpen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<{ type: 'folder' } | { type: 'holding'; id: string; ticker: string } | null>(null)

  // Holdings whose direct folderId is this folder
  const directHoldings = metrics.holdings.filter((h) => h.folderId === folder.id)

  // Holdings in sub-folders of this folder
  const subFolderIds = new Set(folder.children.map((c) => c.id))
  const subFolderHoldings = metrics.holdings.filter((h) => subFolderIds.has(h.folderId))

  // Aggregate metrics for this folder (direct + sub-folder holdings)
  const allHere = [...directHoldings, ...subFolderHoldings]
  const totalValue = allHere.reduce((s, h) => s + h.currentValue, 0n)
  const totalUnrealizedGains = allHere.reduce((s, h) => s + h.unrealizedGains, 0n)
  const totalCostBasis = allHere.reduce((s, h) => s + h.costBasis, 0n)
  const returnPct = totalCostBasis > 0n
    ? Number(totalUnrealizedGains) / Number(totalCostBasis) * 100
    : 0

  async function handleDeleteFolder() {
    await fetch(`/api/folders/${folder.id}`, { method: 'DELETE' })
    router.push('/')
    router.refresh()
  }

  async function handleDeleteHolding(holdingId: string) {
    await fetch(`/api/holdings/${holdingId}`, { method: 'DELETE' })
    router.refresh()
  }

  const isPositive = totalUnrealizedGains >= 0n

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1 text-sm text-muted-foreground">
        <Link href="/" className="hover:text-foreground transition-colors">Portfolio</Link>
        {folder.parent && (
          <>
            <ChevronRight className="h-3.5 w-3.5" />
            <Link
              href={`/folders/${folder.parent.id}`}
              className="hover:text-foreground transition-colors"
            >
              {folder.parent.name}
            </Link>
          </>
        )}
        <ChevronRight className="h-3.5 w-3.5" />
        <span className="text-foreground font-medium">{folder.name}</span>
      </nav>

      {/* Folder header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {folder.color && (
            <span
              className="w-4 h-4 rounded-full flex-shrink-0"
              style={{ backgroundColor: folder.color }}
            />
          )}
          <h1 className="text-2xl font-bold">{folder.name}</h1>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setAddHoldingOpen(true)}
            className="flex items-center gap-1.5 rounded-lg border bg-background px-3 py-1.5 text-sm font-medium hover:bg-muted transition-colors"
          >
            <Plus className="h-3.5 w-3.5" />
            Add Holding
          </button>
          <button
            onClick={() => setRenameOpen(true)}
            className="rounded-lg border p-1.5 hover:bg-muted transition-colors"
            title="Edit folder"
          >
            <Pencil className="h-4 w-4 text-muted-foreground" />
          </button>
          <button
            onClick={() => setConfirmDelete({ type: 'folder' })}
            className="rounded-lg border p-1.5 hover:bg-muted transition-colors"
            title="Delete folder"
          >
            <Trash2 className="h-4 w-4 text-destructive" />
          </button>
        </div>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-3 gap-4">
        <KpiCard label="VALUE" value={formatCurrency(totalValue, currency)} loading={metrics.pricesLoading} />
        <KpiCard
          label="UNREALIZED GAIN"
          value={formatCurrency(totalUnrealizedGains, currency)}
          positive={isPositive}
          loading={metrics.pricesLoading}
        />
        <KpiCard
          label="RETURN"
          value={formatPercent(returnPct, 2)}
          positive={isPositive}
          loading={metrics.pricesLoading}
        />
      </div>

      {/* Sub-folders */}
      {folder.children.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">
            Sub-folders
          </h2>
          <div className="rounded-xl border bg-card overflow-hidden">
            <table className="w-full">
              <colgroup>
                <col />
                <col className="w-[120px]" />
                <col className="w-[130px]" />
                <col className="w-[80px]" />
              </colgroup>
              <tbody>
                {folder.children.map((child) => {
                  const childHoldings = metrics.holdings.filter((h) => h.folderId === child.id)
                  const childValue = childHoldings.reduce((s, h) => s + h.currentValue, 0n)
                  const childGains = childHoldings.reduce((s, h) => s + h.unrealizedGains, 0n)
                  const childCost = childHoldings.reduce((s, h) => s + h.costBasis, 0n)
                  const childReturn = childCost > 0n ? Number(childGains) / Number(childCost) * 100 : 0
                  const childAlloc = totalValue > 0n ? Number(childValue) / Number(totalValue) * 100 : 0
                  const childPositive = childGains >= 0n
                  const childTarget = child.targetAllocationPct
                  const childGap = childTarget != null ? childAlloc - childTarget : null

                  return (
                    <tr
                      key={child.id}
                      className="border-b last:border-0 cursor-pointer hover:bg-muted/30 transition-colors"
                      onClick={() => router.push(`/folders/${child.id}`)}
                    >
                      <td className="py-2.5 px-3">
                        <div className="flex items-center gap-2 font-semibold text-sm">
                          <span
                            className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                            style={{ backgroundColor: child.color ?? 'hsl(var(--muted-foreground))' }}
                          />
                          {child.name}
                          <span className="text-xs text-muted-foreground font-normal">
                            ({childHoldings.length})
                          </span>
                        </div>
                      </td>
                      <td className="py-2.5 px-3 text-right tabular-nums text-sm font-semibold">
                        {formatCurrency(childValue, currency, { compact: true })}
                      </td>
                      <td className={cn(
                        'py-2.5 px-3 text-right tabular-nums text-sm',
                        childPositive ? 'text-gain' : 'text-loss'
                      )}>
                        <div className="flex flex-col items-end">
                          <span>{formatCurrency(childGains, currency, { compact: true })}</span>
                          <span className="text-xs">{formatPercent(childReturn, 1)}</span>
                        </div>
                      </td>
                      <td className="py-2.5 px-3 text-right tabular-nums text-sm">
                        <div className="flex flex-col items-end gap-0.5">
                          <span className="text-muted-foreground">{childAlloc.toFixed(1)}%</span>
                          {childTarget != null && (
                            <span className="text-[10px] text-muted-foreground/60">
                              {childTarget.toFixed(1)}% target{' '}
                              {childGap != null && Math.abs(childGap) >= 0.5 && (
                                <span className={childGap > 0 ? 'text-gain' : 'text-loss'}>
                                  ({childGap > 0 ? '+' : ''}{childGap.toFixed(1)}%)
                                </span>
                              )}
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Direct holdings */}
      <div>
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">
          Holdings
        </h2>
        <div className="rounded-xl border bg-card overflow-hidden">
          {/* Table header */}
          <div className="px-3 py-2 bg-muted/30 border-b text-xs font-medium text-muted-foreground uppercase tracking-wide">
            <div className="grid grid-cols-[1fr_120px_130px_80px_40px]">
              <span>Name</span>
              <span className="text-right">Value</span>
              <span className="text-right">Gain / Return</span>
              <span className="text-right">Alloc</span>
              <span />
            </div>
          </div>
          <table className="w-full">
            <colgroup>
              <col />
              <col className="w-[120px]" />
              <col className="w-[130px]" />
              <col className="w-[80px]" />
              <col className="w-[40px]" />
            </colgroup>
            <tbody>
              {directHoldings.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-sm text-muted-foreground">
                    No holdings yet. Click "Add Holding" to get started.
                  </td>
                </tr>
              )}
              {directHoldings.map((h) => {
                const hPositive = h.unrealizedGains >= 0n
                const hAlloc = totalValue > 0n ? Number(h.currentValue) / Number(totalValue) * 100 : 0
                const hTarget = holdingTargets[h.holdingId] ?? 0
                const hGap = hTarget > 0 ? hAlloc - hTarget : null

                const oldestLot = h.lots.reduce<Date | null>((min, lot) => {
                  const d = new Date(lot.purchaseDate)
                  return min === null || d < min ? d : min
                }, null)
                const duration       = oldestLot ? formatHoldingDurationLong(oldestLot) : null
                const annualizedReturn = oldestLot
                  ? calcAnnualizedReturn(h.unrealizedReturnPct, oldestLot)
                  : null

                return (
                  <tr key={h.holdingId} className="border-b last:border-0 hover:bg-muted/20 transition-colors group">
                    <td className="py-2 px-3">
                      <Link
                        href={`/holdings/${h.holdingId}`}
                        className="flex flex-col hover:underline"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <span className="text-sm font-medium">{h.tickerSymbol}</span>
                        <span className="text-xs text-muted-foreground truncate max-w-[200px]">{h.name}</span>
                      </Link>
                    </td>
                    <td className="py-2 px-3 text-right tabular-nums text-sm">
                      {formatCurrency(h.currentValue, currency)}
                    </td>
                    <td className={cn(
                      'py-2 px-3 text-right tabular-nums text-sm',
                      hPositive ? 'text-gain' : 'text-loss'
                    )}>
                      <div className="flex flex-col items-end">
                        <span>{formatCurrency(h.unrealizedGains, currency)}</span>
                        <span className="text-xs">{formatPercent(h.unrealizedReturnPct, 1)}</span>
                        {duration && (
                          <span className="text-xs text-muted-foreground font-normal mt-0.5">
                            {duration}
                            {annualizedReturn !== null && (
                              <span className={cn(
                                'ml-1.5',
                                annualizedReturn >= 0 ? 'text-gain' : 'text-loss'
                              )}>
                                ({annualizedReturn >= 0 ? '+' : ''}{annualizedReturn.toFixed(1)}%/yr)
                              </span>
                            )}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-2 px-3 text-right tabular-nums text-sm">
                      <div className="flex flex-col items-end gap-0.5">
                        <span className="text-muted-foreground">{hAlloc.toFixed(1)}%</span>
                        {hTarget > 0 && (
                          <span className="text-[10px] text-muted-foreground/60">
                            {hTarget.toFixed(1)}% target{' '}
                            {hGap != null && Math.abs(hGap) >= 0.5 && (
                              <span className={hGap > 0 ? 'text-gain' : 'text-loss'}>
                                ({hGap > 0 ? '+' : ''}{hGap.toFixed(1)}%)
                              </span>
                            )}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-2 px-3 w-10">
                      <button
                        onClick={(e) => { e.stopPropagation(); setConfirmDelete({ type: 'holding', id: h.holdingId, ticker: h.tickerSymbol }) }}
                        className="rounded p-1 opacity-0 group-hover:opacity-100 hover:bg-muted transition-colors"
                        title="Delete holding"
                      >
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Dialogs */}
      <AddHoldingDialog
        open={addHoldingOpen}
        onClose={() => setAddHoldingOpen(false)}
        folderId={folder.id}
        folderName={folder.name}
      />
      <RenameFolderDialog
        open={renameOpen}
        onClose={() => setRenameOpen(false)}
        folderId={folder.id}
        currentName={folder.name}
        currentColor={folder.color}
      />
      <ConfirmDialog
        open={confirmDelete !== null}
        title={confirmDelete?.type === 'folder' ? 'Delete folder' : 'Remove holding'}
        message={
          confirmDelete?.type === 'folder'
            ? `Delete "${folder.name}" and all its holdings? This cannot be undone.`
            : `Remove "${confirmDelete?.ticker}" from this portfolio?`
        }
        confirmLabel={confirmDelete?.type === 'folder' ? 'Delete folder' : 'Remove'}
        onConfirm={() => {
          if (confirmDelete?.type === 'folder') handleDeleteFolder()
          else if (confirmDelete?.type === 'holding') handleDeleteHolding(confirmDelete.id)
          setConfirmDelete(null)
        }}
        onCancel={() => setConfirmDelete(null)}
      />
    </div>
  )
}

// ─── KPI Card ─────────────────────────────────

function KpiCard({
  label, value, positive, loading,
}: {
  label: string
  value: string
  positive?: boolean
  loading: boolean
}) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">
        {label}
      </p>
      {loading ? (
        <div className="h-7 w-28 animate-pulse rounded bg-muted" />
      ) : (
        <p className={cn(
          'text-2xl font-bold tabular-nums',
          positive === true && 'text-gain',
          positive === false && 'text-loss',
        )}>
          {value}
        </p>
      )}
    </div>
  )
}

// ─── Helper ───────────────────────────────────

function buildFolderMap(folders: FolderRow[]) {
  return new Map(folders.map((f) => [f.id, {
    name: f.name,
    color: f.color,
    parentId: f.parentId,
  }]))
}
