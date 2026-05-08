'use client'

// ─────────────────────────────────────────────
// Holdings Tree — folder-grouped table of holdings
// Collapsible folders, shows per-holding metrics
// ─────────────────────────────────────────────

import { ChevronRight, ChevronDown } from 'lucide-react'
import { formatCurrency, formatPercent } from '@/lib/calculations'
import { useUIStore } from '@/store/ui'
import { cn } from '@/lib/utils'
import type { HoldingMetrics } from '@/hooks/usePortfolio'

// ─── Types ────────────────────────────────────

interface FolderGroup {
  folderId: string
  folderName: string
  folderColor: string | null
  holdings: HoldingMetrics[]
  totalValue: bigint
  totalUnrealizedGains: bigint
  allocationPct: number
}

interface HoldingsTreeProps {
  holdings: HoldingMetrics[]
  loading?: boolean
}

// ─── Build folder groups ──────────────────────

function buildFolderGroups(holdings: HoldingMetrics[]): FolderGroup[] {
  const map = new Map<string, FolderGroup>()

  for (const h of holdings) {
    if (!map.has(h.folderId)) {
      map.set(h.folderId, {
        folderId: h.folderId,
        folderName: h.folderName,
        folderColor: h.folderColor,
        holdings: [],
        totalValue: 0n,
        totalUnrealizedGains: 0n,
        allocationPct: 0,
      })
    }
    const group = map.get(h.folderId)!
    group.holdings.push(h)
    group.totalValue += h.currentValue
    group.totalUnrealizedGains += h.unrealizedGains
    group.allocationPct += h.allocationPct
  }

  return Array.from(map.values())
}

// ─── Folder Row ───────────────────────────────

function FolderRow({
  group,
  expanded,
  onToggle,
  currency,
}: {
  group: FolderGroup
  expanded: boolean
  onToggle: () => void
  currency: 'ILS' | 'USD'
}) {
  const isPositive = group.totalUnrealizedGains >= 0n

  return (
    <tr
      className="border-b border-muted cursor-pointer hover:bg-muted/30 transition-colors"
      onClick={onToggle}
    >
      <td className="py-2.5 px-3">
        <div className="flex items-center gap-2 font-semibold text-sm">
          {expanded
            ? <ChevronDown className="h-4 w-4 text-muted-foreground flex-shrink-0" />
            : <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
          }
          <span
            className="w-2.5 h-2.5 rounded-full flex-shrink-0"
            style={{ backgroundColor: group.folderColor ?? 'hsl(var(--muted-foreground))' }}
          />
          {group.folderName}
          <span className="text-xs text-muted-foreground font-normal">
            ({group.holdings.length})
          </span>
        </div>
      </td>
      <td className="py-2.5 px-3 text-right tabular-nums text-sm font-semibold">
        {formatCurrency(group.totalValue, currency, { compact: true })}
      </td>
      <td className={cn(
        'py-2.5 px-3 text-right tabular-nums text-sm font-medium',
        isPositive ? 'text-gain' : 'text-loss'
      )}>
        {formatCurrency(group.totalUnrealizedGains, currency, { compact: true })}
      </td>
      <td className="py-2.5 px-3 text-right tabular-nums text-sm text-muted-foreground">
        {group.allocationPct.toFixed(1)}%
      </td>
    </tr>
  )
}

// ─── Holding Row ──────────────────────────────

function HoldingRow({
  holding,
  currency,
}: {
  holding: HoldingMetrics
  currency: 'ILS' | 'USD'
}) {
  const isPositive = holding.unrealizedGains >= 0n

  return (
    <tr className="border-b border-muted/50 hover:bg-muted/20 transition-colors">
      <td className="py-2 px-3 pl-10">
        <div className="flex flex-col">
          <span className="text-sm font-medium">{holding.tickerSymbol}</span>
          <span className="text-xs text-muted-foreground truncate max-w-[180px]">
            {holding.name}
          </span>
        </div>
      </td>
      <td className="py-2 px-3 text-right tabular-nums text-sm">
        {formatCurrency(holding.currentValue, currency)}
      </td>
      <td className={cn(
        'py-2 px-3 text-right tabular-nums text-sm',
        isPositive ? 'text-gain' : 'text-loss'
      )}>
        <div className="flex flex-col items-end">
          <span>{formatCurrency(holding.unrealizedGains, currency)}</span>
          <span className="text-xs">
            {formatPercent(holding.unrealizedReturnPct, 1)}
          </span>
        </div>
      </td>
      <td className="py-2 px-3 text-right tabular-nums text-sm text-muted-foreground">
        {holding.allocationPct.toFixed(1)}%
      </td>
    </tr>
  )
}

// ─── Main Component ───────────────────────────

export function HoldingsTree({ holdings, loading }: HoldingsTreeProps) {
  const currency = useUIStore((s) => s.currency)
  const { expandedFolderIds, toggleFolder } = useUIStore()

  const groups = buildFolderGroups(holdings)

  if (loading) {
    return (
      <div className="rounded-xl border bg-card overflow-hidden">
        <div className="p-4 space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-10 animate-pulse rounded bg-muted" />
          ))}
        </div>
      </div>
    )
  }

  if (groups.length === 0) {
    return (
      <div className="rounded-xl border bg-card p-8 text-center text-muted-foreground">
        <p className="text-sm">No holdings yet. Start by adding a folder and buying your first security.</p>
      </div>
    )
  }

  return (
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
              Gain / Loss
            </th>
            <th className="py-2 px-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Alloc
            </th>
          </tr>
        </thead>
        <tbody>
          {groups.map((group) => {
            const expanded = expandedFolderIds.includes(group.folderId)
            return (
              <>
                <FolderRow
                  key={group.folderId}
                  group={group}
                  expanded={expanded}
                  onToggle={() => toggleFolder(group.folderId)}
                  currency={currency}
                />
                {expanded && group.holdings.map((h) => (
                  <HoldingRow key={h.holdingId} holding={h} currency={currency} />
                ))}
              </>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
