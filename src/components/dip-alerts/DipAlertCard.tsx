'use client'

import { useState } from 'react'
import { LineChart, Line, ResponsiveContainer, Tooltip } from 'recharts'
import type { DipAlertRow } from '@/lib/db/queries/dip-alerts'

type PeakView = '52w' | 'ath' | '90d'

interface DipAlertCardProps {
  alert: DipAlertRow
  onClick: () => void
}

const VIEW_LABELS: Record<PeakView, string> = {
  '52w': '52w',
  ath: 'Hist.',
  '90d': '90d',
}

const VIEW_HIGH_LABEL: Record<PeakView, string> = {
  '52w': '52w high',
  ath: 'Hist. high',
  '90d': '90d high',
}

export function DipAlertCard({ alert, onClick }: DipAlertCardProps) {
  const [view, setView] = useState<PeakView>('52w')

  const peakMap: Record<PeakView, number | null> = {
    '52w': alert.high52w,
    ath: alert.highATH,
    '90d': alert.high90d,
  }
  const dropMap: Record<PeakView, number | null> = {
    '52w': alert.dropFrom52w,
    ath: alert.dropFromATH,
    '90d': alert.dropFrom90d,
  }

  // Disable a view if null or identical to 52w (would show no difference)
  const isDisabled = (v: PeakView) => {
    if (v === '52w') return false
    if (peakMap[v] == null) return true
    return peakMap[v] === alert.high52w
  }

  const selectedPeak = peakMap[view] ?? alert.high52w
  const selectedDrop = dropMap[view] ?? alert.dropFrom52w
  const dropPct = (Math.abs(selectedDrop) * 100).toFixed(1)

  return (
    <div className="min-w-[220px] max-w-[240px] rounded-xl border border-border bg-card p-4 flex flex-col gap-3">
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-semibold text-sm leading-tight">{alert.ticker}</p>
          <p className="text-xs text-muted-foreground truncate max-w-[120px]">{alert.name}</p>
        </div>
        <span className="shrink-0 inline-flex items-center rounded-full bg-destructive/10 text-destructive text-xs font-semibold px-2 py-0.5">
          -{dropPct}%
        </span>
      </div>

      {/* Toggle — bigger tap targets, clearly disabled when identical */}
      <div className="flex gap-1 rounded-lg bg-muted p-1">
        {(['52w', 'ath', '90d'] as PeakView[]).map((v) => {
          const disabled = isDisabled(v)
          const active = view === v
          return (
            <button
              key={v}
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                if (!disabled) setView(v)
              }}
              disabled={disabled}
              title={disabled && v !== '52w' ? (peakMap[v] == null ? 'No data' : 'Same as 52w') : undefined}
              className={[
                'flex-1 rounded-md py-1 px-2 text-xs font-medium transition-all select-none',
                active
                  ? 'bg-background shadow text-foreground'
                  : disabled
                    ? 'text-muted-foreground/40 cursor-not-allowed'
                    : 'text-muted-foreground hover:text-foreground hover:bg-background/50 cursor-pointer',
              ].join(' ')}
            >
              {VIEW_LABELS[v]}
            </button>
          )
        })}
      </div>

      {/* Prices — label changes with view so user sees the switch happened */}
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>Current <span className="text-foreground font-medium">{alert.currentPrice.toFixed(2)}</span></span>
        <span>{VIEW_HIGH_LABEL[view]} <span className="text-foreground font-medium">{selectedPeak.toFixed(2)}</span></span>
      </div>

      {/* Sparkline */}
      {alert.priceHistory.length > 1 && (
        <div className="h-12 cursor-pointer" onClick={onClick}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={alert.priceHistory}>
              <Line
                type="monotone"
                dataKey="price"
                stroke="#ef4444"
                strokeWidth={1.5}
                dot={false}
              />
              <Tooltip
                contentStyle={{ fontSize: '11px', padding: '4px 8px' }}
                formatter={(v: number) => [v.toFixed(2), '']}
                labelFormatter={(l: string) => l}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* AI suggestion */}
      {alert.aiSuggestion && (
        <p className="text-xs text-muted-foreground line-clamp-2 border-t border-border pt-2">
          {alert.aiSuggestion}
        </p>
      )}

      <button
        className="mt-auto text-xs text-primary underline underline-offset-2 self-start"
        onClick={onClick}
      >
        Details →
      </button>
    </div>
  )
}
