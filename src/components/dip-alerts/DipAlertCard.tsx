'use client'

import { LineChart, Line, ResponsiveContainer, Tooltip } from 'recharts'
import type { DipAlertRow } from '@/lib/db/queries/dip-alerts'
import type { PeakView } from './DipAlertsSection'

const VIEW_HIGH_LABEL: Record<PeakView, string> = {
  '52w': '52w high',
  ath: 'Hist. high',
  '90d': '90d high',
}

interface DipAlertCardProps {
  alert: DipAlertRow
  view: PeakView
  onClick: () => void
}

export function DipAlertCard({ alert, view, onClick }: DipAlertCardProps) {
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

  const selectedPeak = peakMap[view] ?? alert.high52w
  const selectedDrop = dropMap[view] ?? alert.dropFrom52w
  const dropPct = (Math.abs(selectedDrop) * 100).toFixed(1)

  return (
    <div
      className="min-w-[220px] max-w-[240px] rounded-xl border border-border bg-card p-4 flex flex-col gap-3 cursor-pointer hover:border-destructive/50 hover:shadow-md transition-all"
      onClick={onClick}
    >
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

      {/* Prices — label updates with global view */}
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>Current <span className="text-foreground font-medium">{alert.currentPrice.toFixed(2)}</span></span>
        <span>{VIEW_HIGH_LABEL[view]} <span className="text-foreground font-medium">{selectedPeak.toFixed(2)}</span></span>
      </div>

      {/* Sparkline */}
      {alert.priceHistory.length > 1 && (
        <div className="h-12">
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

      <button className="mt-auto text-xs text-primary underline underline-offset-2 self-start">
        Details →
      </button>
    </div>
  )
}
