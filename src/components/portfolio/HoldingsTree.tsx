'use client'

import React, { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import {
  MoreHorizontal, Plus, Pencil, Trash2, FolderPlus, ChevronDown, Banknote, Eye,
} from 'lucide-react'
import { formatCurrency, formatPercent } from '@/lib/calculations'
import { useUIStore } from '@/store/ui'
import { cn } from '@/lib/utils'
import { AddFolderDialog } from './AddFolderDialog'
import { RenameFolderDialog } from './RenameFolderDialog'
import { AddHoldingDialog } from './AddHoldingDialog'
import { AddCashDialog } from './AddCashDialog'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import type { HoldingMetrics } from '@/hooks/usePortfolio'
import type { FolderRow } from '@/lib/db/queries'

// ─── Types ────────────────────────────────────

interface RootFolderGroup {
  folderId: string
  folderName: string
  folderColor: string | null
  isWatchlist: boolean
  targetPct: number | null
  holdings: HoldingMetrics[]
  totalValue: bigint
  totalUnrealizedGains: bigint
  allocationPct: number
}

interface HoldingsTreeProps {
  holdings: HoldingMetrics[]
  folders: FolderRow[]
  portfolioId: string
  sectionTitle?: string
  loading?: boolean
  onFolderHover?: (id: string | null) => void
}

// ─── Build root-folder groups ─────────────────

function buildRootFolderGroups(
  holdings: HoldingMetrics[],
  folders: FolderRow[]
): RootFolderGroup[] {
  const rootFolders = folders.filter((f) => f.parentId === null)

  const map = new Map<string, RootFolderGroup>()
  for (const f of rootFolders) {
    map.set(f.id, {
      folderId: f.id,
      folderName: f.name,
      folderColor: f.color,
      isWatchlist: f.isWatchlist ?? false,
      targetPct: f.targetAllocationPct ? Number(f.targetAllocationPct) : null,
      holdings: [],
      totalValue: 0n,
      totalUnrealizedGains: 0n,
      allocationPct: 0,
    })
  }

  for (const h of holdings) {
    const group = map.get(h.rootFolderId)
    if (group) {
      group.holdings.push(h)
      group.totalValue += h.currentValue
      group.totalUnrealizedGains += h.unrealizedGains
      group.allocationPct += h.allocationPct
    }
  }

  return Array.from(map.values())
}

// ─── Dropdown Menu ────────────────────────────

interface DropdownItem {
  label: string
  icon: React.ReactNode
  onClick: () => void
  danger?: boolean
}

function DropdownMenu({ items, trigger }: { items: DropdownItem[]; trigger?: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  return (
    <div ref={ref} className="relative" onClick={(e) => e.stopPropagation()}>
      <button
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'rounded p-1 hover:bg-muted transition-colors',
          trigger ? 'flex items-center gap-1 text-sm px-2 py-1.5' : 'opacity-0 group-hover:opacity-100'
        )}
        aria-label="Actions"
      >
        {trigger ?? <MoreHorizontal className="h-4 w-4 text-muted-foreground" />}
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 w-44 rounded-lg border bg-card shadow-lg z-30 py-1">
          {items.map((item) => (
            <button
              key={item.label}
              onClick={() => { item.onClick(); setOpen(false) }}
              className={cn(
                'w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted transition-colors',
                item.danger && 'text-destructive'
              )}
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Delete helpers ───────────────────────────

function useDeleteFolder(router: ReturnType<typeof useRouter>) {
  return async (folderId: string) => {
    await fetch(`/api/folders/${folderId}`, { method: 'DELETE' })
    router.refresh()
  }
}

// ─── Folder Row ───────────────────────────────

function FolderRow({
  group,
  currency,
  onRename,
  onDelete,
  onHover,
}: {
  group: RootFolderGroup
  currency: 'ILS' | 'USD'
  onRename: () => void
  onDelete: () => void
  onHover: (id: string | null) => void
}) {
  const router = useRouter()
  const isPositive = group.totalUnrealizedGains >= 0n
  const totalCostBasis = group.holdings.reduce((s, h) => s + h.costBasis, 0n)
  const returnPct = totalCostBasis > 0n
    ? Number(group.totalUnrealizedGains) / Number(totalCostBasis) * 100
    : 0

  const menuItems: DropdownItem[] = [
    {
      label: 'Edit Folder',
      icon: <Pencil className="h-3.5 w-3.5" />,
      onClick: onRename,
    },
    {
      label: 'Delete Folder',
      icon: <Trash2 className="h-3.5 w-3.5" />,
      onClick: onDelete,
      danger: true,
    },
  ]

  return (
    <tr
      className="border-b border-muted cursor-pointer hover:bg-muted/30 transition-colors group"
      onClick={() => router.push(`/folders/${group.folderId}`)}
      onMouseEnter={() => onHover(group.folderId)}
      onMouseLeave={() => onHover(null)}
    >
      <td className="py-2.5 px-3">
        <div className="flex items-center gap-2 font-semibold text-sm">
          <span
            className="w-2.5 h-2.5 rounded-full flex-shrink-0"
            style={{ backgroundColor: group.folderColor ?? 'hsl(var(--muted-foreground))' }}
          />
          <span className="font-medium">{group.folderName}</span>
          {group.isWatchlist && <Eye className="h-3.5 w-3.5 text-muted-foreground ml-1 inline-block" />}
          <span className="text-xs text-muted-foreground font-normal">
            ({group.holdings.length})
          </span>
        </div>
      </td>
      <td className="py-2.5 px-3 text-right tabular-nums text-sm font-semibold">
        {formatCurrency(group.totalValue, currency, { compact: true })}
      </td>
      <td className={cn(
        'hidden sm:table-cell py-2.5 px-3 text-right tabular-nums text-sm font-medium',
        isPositive ? 'text-gain' : 'text-loss'
      )}>
        <div className="flex flex-col items-end">
          <span>{formatCurrency(group.totalUnrealizedGains, currency, { compact: true })}</span>
          <span className="text-xs">{formatPercent(returnPct, 1)}</span>
        </div>
      </td>
      <td className="hidden sm:table-cell py-2.5 px-3 text-right tabular-nums text-sm text-muted-foreground">
        <div className="flex flex-col items-end">
          <span>{group.allocationPct.toFixed(1)}%</span>
          {group.targetPct !== null && (
            <span className="text-xs">{group.targetPct.toFixed(0)}% target</span>
          )}
        </div>
      </td>
      <td className="py-2.5 px-3 w-10">
        <DropdownMenu items={menuItems} />
      </td>
    </tr>
  )
}

// ─── Main Component ───────────────────────────

export function HoldingsTree({ holdings, folders, portfolioId, sectionTitle, loading, onFolderHover }: HoldingsTreeProps) {
  const router = useRouter()
  const currency = useUIStore((s) => s.currency)

  const [addFolderOpen, setAddFolderOpen] = useState(false)
  const [addCashOpen, setAddCashOpen] = useState(false)
  const [renameFolderTarget, setRenameFolderTarget] = useState<RootFolderGroup | null>(null)
  const [addHoldingTarget, setAddHoldingTarget] = useState<{ folderId: string; folderName: string } | null>(null)
  const [deleteFolderTarget, setDeleteFolderTarget] = useState<RootFolderGroup | null>(null)

  const deleteFolder = useDeleteFolder(router)
  const groups = buildRootFolderGroups(holdings, folders)

  const addMenuItems: DropdownItem[] = [
    {
      label: 'New Folder',
      icon: <FolderPlus className="h-3.5 w-3.5" />,
      onClick: () => setAddFolderOpen(true),
    },
    {
      label: 'Add Holding',
      icon: <Plus className="h-3.5 w-3.5" />,
      onClick: () => setAddHoldingTarget({ folderId: '', folderName: '' }),
    },
    {
      label: 'Add Cash Account',
      icon: <Banknote className="h-3.5 w-3.5" />,
      onClick: () => setAddCashOpen(true),
    },
  ]

  if (loading) {
    return (
      <div className="space-y-3">
        {sectionTitle && <div className="h-8 w-48 animate-pulse rounded bg-muted" />}
        <div className="rounded-xl border bg-card overflow-hidden">
          <div className="p-4 space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-10 animate-pulse rounded bg-muted" />
            ))}
          </div>
        </div>
      </div>
    )
  }

  return (
    <>
      {/* Section header — title + Add button */}
      {sectionTitle && (
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold">{sectionTitle}</h2>
          <DropdownMenu
            items={addMenuItems}
            trigger={
              <span className="flex items-center gap-1.5 rounded-md bg-primary text-primary-foreground px-3 py-1.5 text-sm font-medium hover:opacity-90 transition-opacity">
                Add <ChevronDown className="h-3.5 w-3.5" />
              </span>
            }
          />
        </div>
      )}

      <div className="rounded-xl border bg-card overflow-hidden">
        {/* Table header */}
        <div className="flex items-center justify-between px-3 py-2 bg-muted/30 border-b">
          <div className="grid grid-cols-[1fr_80px_40px] sm:grid-cols-[1fr_100px_120px_80px_40px] w-full text-xs font-medium text-muted-foreground uppercase tracking-wide">
            <span className="px-0">Name</span>
            <span className="text-right">Value</span>
            <span className="hidden sm:block text-right">Gain / Return</span>
            <span className="hidden sm:block text-right">Alloc</span>
            <span />
          </div>
        </div>

        <table className="w-full">
          <colgroup>
            <col />
            <col className="w-[80px] sm:w-[100px]" />
            <col className="hidden sm:table-column w-[120px]" />
            <col className="hidden sm:table-column w-[80px]" />
            <col className="w-[40px]" />
          </colgroup>
          <tbody>
            {groups.length === 0 && (
              <tr>
                <td colSpan={5} className="py-8 text-center text-sm text-muted-foreground">
                  No folders yet. Click + to add a folder.
                </td>
              </tr>
            )}
            {groups.map((group) => (
              <FolderRow
                key={group.folderId}
                group={group}
                currency={currency}
                onRename={() => setRenameFolderTarget(group)}
                onDelete={() => setDeleteFolderTarget(group)}
                onHover={onFolderHover ?? (() => {})}
              />
            ))}
          </tbody>
        </table>
      </div>

      {/* Dialogs */}
      <AddFolderDialog
        open={addFolderOpen}
        onClose={() => setAddFolderOpen(false)}
        portfolioId={portfolioId}
      />
      <AddCashDialog
        open={addCashOpen}
        onClose={() => setAddCashOpen(false)}
        portfolioId={portfolioId}
      />
      {renameFolderTarget && (
        <RenameFolderDialog
          open={renameFolderTarget !== null}
          onClose={() => setRenameFolderTarget(null)}
          folderId={renameFolderTarget.folderId}
          currentName={renameFolderTarget.folderName}
          currentColor={renameFolderTarget.folderColor}
        />
      )}
      {addHoldingTarget !== null && (
        <AddHoldingDialog
          open
          onClose={() => setAddHoldingTarget(null)}
          folders={folders.filter((f) => f.parentId === null).map((f) => ({ id: f.id, name: f.name, isWatchlist: f.isWatchlist ?? false }))}
        />
      )}
      <ConfirmDialog
        open={deleteFolderTarget !== null}
        title="Delete folder"
        message={`Delete "${deleteFolderTarget?.folderName}" and all its holdings? This cannot be undone.`}
        confirmLabel="Delete folder"
        onConfirm={() => { if (deleteFolderTarget) deleteFolder(deleteFolderTarget.folderId); setDeleteFolderTarget(null) }}
        onCancel={() => setDeleteFolderTarget(null)}
      />
    </>
  )
}
