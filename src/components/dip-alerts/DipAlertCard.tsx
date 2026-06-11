'use client'

import { LineChart, Line, ResponsiveContainer, Tooltip } from 'recharts'
import type { DipAlertRow } from '@/lib/db/queries/dip-alerts'

interface DipAlertCardProps {
  alert: DipAlertRow
  onClick: () => void
}

export function DipAlertCard({ alert, onClick }: DipAlertCardProps) {
  const dropPct = (Math.abs(alert.dropFrom52w) * 100).toFixed(1)
  const currentFormatted = alert.currentPrice.toFixed(2)
  const peakFormatted = alert.high52w.toFixed(2)

  return (
    <div
      className="min-w-[220px] max-w-[240px] rounded-xl border border-border bg-card p-4 flex flex-col gap-3 cursor-pointer hover:border-destructive/50 hover:shadow-md transition-all"
      onClick={onClick}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-semibold text-sm leading-tight">{alert.ticker}</p>
          <p className="text-xs text-muted-foreground truncate max-w-[140px]">{alert.name}</p>
        </div>
        <span className="shrink-0 inline-flex items-center rounded-full bg-destructive/10 text-destructive text-xs font-semibold px-2 py-0.5">
          -{dropPct}%
        </span>
      </div>

      {/* Prices */}
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>Current <span className="text-foreground font-medium">{currentFormatted}</span></span>
        <span>52w high <span className="text-foreground font-medium">{peakFormatted}</span></span>
      </div>

      {/* Sparkline */}
      {alert.priceHistory.length > 1 && (
        <div className="h-12">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={alert.priceHistory}>
              <Line
                type="monotone"
                dataKey="price"
                stroke="hsl(var(--destructive))"
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
