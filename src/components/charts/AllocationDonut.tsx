'use client'

import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'
import { formatPercent } from '@/lib/calculations'
import { getChartColor } from '@/lib/utils'
import { cn } from '@/lib/utils'

interface Segment {
  folderId: string
  folderName: string
  folderColor: string | null
  value: number          // numeric (not bigint) for recharts
  actualPct: number
  targetPct: number | null
}

interface AllocationDonutProps {
  segments: Segment[]
  centerLabel: string    // e.g. "77.39%"
  centerSub?: string     // e.g. "RETURN"
  highlightedId?: string | null
  className?: string
}

// Custom tooltip
function CustomTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: Segment }> }) {
  if (!active || !payload?.length) return null
  const seg = payload[0].payload
  return (
    <div className="rounded-lg border bg-card shadow-lg px-3 py-2 text-sm">
      <p className="font-semibold">{seg.folderName}</p>
      <p className="text-muted-foreground">{seg.actualPct.toFixed(1)}%</p>
      {seg.targetPct !== null && (
        <p className="text-muted-foreground">Target: {seg.targetPct.toFixed(0)}%</p>
      )}
    </div>
  )
}

export function AllocationDonut({
  segments, centerLabel, centerSub = 'RETURN', highlightedId, className,
}: AllocationDonutProps) {
  if (segments.length === 0) {
    return (
      <div className={cn('flex items-center justify-center rounded-xl border bg-card', className)} style={{ height: 288 }}>
        <p className="text-sm text-muted-foreground">Add holdings to see allocation</p>
      </div>
    )
  }

  const data = segments.map((s, i) => ({
    ...s,
    fill: s.folderColor ?? getChartColor(i),
  }))

  return (
    <div className={cn('relative flex items-center justify-center', className)}>
      <ResponsiveContainer width="100%" height={280}>
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius="60%"
            outerRadius="85%"
            paddingAngle={1}
            dataKey="value"
            strokeWidth={0}
          >
            {data.map((entry, index) => (
              <Cell
                key={entry.folderId}
                fill={entry.fill}
                opacity={highlightedId && highlightedId !== entry.folderId ? 0.35 : 1}
              />
            ))}
          </Pie>
          <Tooltip content={<CustomTooltip />} />
        </PieChart>
      </ResponsiveContainer>
      {/* Center label */}
      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
        <span className="text-2xl font-bold text-gain tabular-nums">{centerLabel}</span>
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mt-0.5">
          {centerSub}
        </span>
      </div>
    </div>
  )
}
