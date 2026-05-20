'use client'

// ─────────────────────────────────────────────
// PEMultiples — 30-year P/E history panel
// Shows tabs for 7 indices. Selected index gets a
// Recharts line chart. All indices show current P/E.
// ─────────────────────────────────────────────

import { useState, useMemo } from 'react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine,
} from 'recharts'
import { cn } from '@/lib/utils'
import { PE_DATA } from '@/data/pe-history'

// ─── Tooltip ──────────────────────────────────

interface TooltipProps { active?: boolean; payload?: Array<{ value: number }>; label?: string }

function PETooltip({ active, payload, label }: TooltipProps) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg border bg-card px-3 py-2 text-sm shadow-sm">
      <p className="text-xs text-muted-foreground mb-0.5">{label}</p>
      <p className="text-sm font-semibold tabular-nums">{payload[0].value.toFixed(1)}x</p>
    </div>
  )
}

// ─── Main component ───────────────────────────

export function PEMultiples() {
  const [selectedId, setSelectedId] = useState('sp500')

  const selected = PE_DATA.find((d) => d.id === selectedId) ?? PE_DATA[0]

  const median = useMemo(() => {
    const values = selected.history.map((p) => p.pe).sort((a, b) => a - b)
    const mid = Math.floor(values.length / 2)
    return values.length % 2 === 0
      ? (values[mid - 1] + values[mid]) / 2
      : values[mid]
  }, [selected])

  return (
    <div className="rounded-xl border bg-card p-4">
      {/* Header */}
      <p className="text-sm font-medium text-muted-foreground mb-3">מכפילי רווח (P/E) — 30 שנה</p>

      {/* Index selector tabs */}
      <div className="flex flex-wrap gap-2 mb-4">
        {PE_DATA.map((index) => {
          const isSelected = index.id === selectedId
          const avgPE = index.history.reduce((s, p) => s + p.pe, 0) / index.history.length
          const dotColor = index.currentPE > avgPE ? 'bg-loss' : 'bg-gain'

          return (
            <button
              key={index.id}
              onClick={() => setSelectedId(index.id)}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border',
                isSelected
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted border-transparent'
              )}
            >
              <span className={cn('w-1.5 h-1.5 rounded-full flex-shrink-0', dotColor)} />
              {index.label}
              <span className={cn(
                'font-semibold',
                !isSelected && 'text-muted-foreground'
              )}>
                {index.currentPE.toFixed(1)}x
              </span>
            </button>
          )
        })}
      </div>

      {/* Chart for selected index */}
      <ResponsiveContainer width="100%" height={200}>
        <LineChart
          data={selected.history}
          margin={{ top: 4, right: 0, left: -20, bottom: 0 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
          <XAxis
            dataKey="year"
            tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
            tickLine={false}
            axisLine={false}
            interval={4}
          />
          <YAxis
            tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v) => `${v}x`}
            domain={['auto', 'auto']}
          />
          <Tooltip content={<PETooltip />} />
          <ReferenceLine
            y={median}
            stroke="hsl(var(--muted-foreground))"
            strokeDasharray="4 4"
            strokeWidth={1}
            label={{
              value: `מדיאן ${median.toFixed(1)}x`,
              position: 'insideTopRight',
              fontSize: 9,
              fill: 'hsl(var(--muted-foreground))',
            }}
          />
          <Line
            type="monotone"
            dataKey="pe"
            stroke="#3b82f6"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4, strokeWidth: 0, fill: '#3b82f6' }}
          />
        </LineChart>
      </ResponsiveContainer>

      <p className="text-xs text-muted-foreground mt-1 text-center">
        נתונים היסטוריים שנתיים · הקו המקווקו = מדיאן {selected.history.length}-שנה
      </p>
    </div>
  )
}
