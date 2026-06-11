'use client'

import { useState } from 'react'
import { LineChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Modal } from '@/components/ui/modal'
import type { DipAlertRow } from '@/lib/db/queries/dip-alerts'

type PeakView = '52w' | 'ath' | '90d'

interface DipAlertModalProps {
  alert: DipAlertRow | null
  open: boolean
  onClose: () => void
}

export function DipAlertModal({ alert, open, onClose }: DipAlertModalProps) {
  const [view, setView] = useState<PeakView>('52w')

  if (!alert) return null

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

  const selectedPeak = peakMap[view]
  const selectedDrop = dropMap[view]
  const dropPct = selectedDrop != null ? (Math.abs(selectedDrop) * 100).toFixed(1) : '—'

  const viewLabels: Record<PeakView, string> = {
    '52w': '52-week high',
    ath: 'Historical high',
    '90d': '90-day high',
  }

  return (
    <Modal open={open} onClose={onClose} title={`${alert.ticker} — ${alert.name}`}>
      {/* Toggle */}
      <div className="flex gap-1 rounded-lg bg-muted p-1 mb-4">
        {(['52w', 'ath', '90d'] as PeakView[]).map((v) => (
          <button
            key={v}
            onClick={() => { if (peakMap[v] != null) setView(v) }}
            disabled={peakMap[v] == null}
            className={[
              'flex-1 rounded-md px-2 py-1 text-xs font-medium transition-colors',
              view === v
                ? 'bg-background shadow text-foreground'
                : 'text-muted-foreground hover:text-foreground',
              peakMap[v] == null ? 'opacity-40 cursor-not-allowed' : '',
            ].join(' ')}
          >
            {viewLabels[v]}
          </button>
        ))}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        <div className="rounded-lg border border-border p-3 text-center">
          <p className="text-xs text-muted-foreground mb-1">Current</p>
          <p className="font-semibold text-sm">{alert.currentPrice.toFixed(2)}</p>
        </div>
        <div className="rounded-lg border border-border p-3 text-center">
          <p className="text-xs text-muted-foreground mb-1">Peak</p>
          <p className="font-semibold text-sm">{selectedPeak?.toFixed(2) ?? '—'}</p>
        </div>
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-center">
          <p className="text-xs text-muted-foreground mb-1">Drop</p>
          <p className="font-semibold text-sm text-destructive">-{dropPct}%</p>
        </div>
      </div>

      {/* Sparkline */}
      {alert.priceHistory.length > 1 && (
        <div className="h-36 mb-4">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={alert.priceHistory}>
              <XAxis
                dataKey="date"
                tick={{ fontSize: 10 }}
                tickFormatter={(d: string) => d.slice(5)}
                interval="preserveStartEnd"
              />
              <YAxis
                tick={{ fontSize: 10 }}
                domain={['auto', 'auto']}
                width={45}
                tickFormatter={(v: number) => v.toFixed(0)}
              />
              <Tooltip
                contentStyle={{ fontSize: '11px', padding: '4px 8px' }}
                formatter={(v: number) => [v.toFixed(2), 'Price']}
              />
              <Line
                type="monotone"
                dataKey="price"
                stroke="hsl(var(--destructive))"
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* AI suggestion */}
      {alert.aiSuggestion && (
        <div className="rounded-lg bg-muted p-3 text-sm text-muted-foreground">
          🤖 {alert.aiSuggestion}
        </div>
      )}
    </Modal>
  )
}
