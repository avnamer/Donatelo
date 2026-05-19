'use client'

import { useState, useEffect, useCallback } from 'react'
import { RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { AgentInsight } from '@/types/agents'

interface Props {
  portfolioId: string
}

const severityBg: Record<AgentInsight['severity'], string> = {
  info: 'bg-blue-50 border-blue-200 dark:bg-blue-950/40 dark:border-blue-800',
  warning: 'bg-yellow-50 border-yellow-200 dark:bg-yellow-950/40 dark:border-yellow-800',
  alert: 'bg-red-50 border-red-200 dark:bg-red-950/40 dark:border-red-800',
}

const severityDot: Record<AgentInsight['severity'], string> = {
  info: 'bg-blue-500',
  warning: 'bg-yellow-500',
  alert: 'bg-red-500',
}

const healthLabel: Record<string, string> = {
  good: '✓ On track',
  attention: '⚠ Attention',
  alert: '⚡ Alert',
}

const healthColor: Record<string, string> = {
  good: 'text-green-600 dark:text-green-400',
  attention: 'text-yellow-600 dark:text-yellow-400',
  alert: 'text-red-600 dark:text-red-400',
}

export function InsightsTab({ portfolioId }: Props) {
  const [insights, setInsights] = useState<AgentInsight[]>([])
  const [loading, setLoading] = useState(false)
  const [summary, setSummary] = useState<string | null>(null)
  const [health, setHealth] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async (force = false, signal?: AbortSignal) => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(
        `/api/agents/insights?portfolioId=${portfolioId}&force=${force}`,
        { signal }
      )
      if (!res.ok) {
        setError('Failed to load insights.')
        return
      }
      const data = await res.json()
      setInsights(data.insights ?? [])
      setSummary(data.summary ?? null)
      setHealth(data.portfolioHealth ?? null)
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        setError('Failed to load insights.')
      }
    } finally {
      setLoading(false)
    }
  }, [portfolioId])

  // Auto-load cached insights on mount; abort on unmount or portfolioId change
  useEffect(() => {
    const controller = new AbortController()
    refresh(false, controller.signal)
    return () => controller.abort()
  }, [refresh])

  return (
    <div className="flex flex-col gap-3 h-full">
      {/* Header row */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          {health && (
            <p className={cn('text-sm font-medium', healthColor[health])}>
              {healthLabel[health] ?? health}
            </p>
          )}
          {summary && (
            <p className="text-xs text-muted-foreground mt-0.5 leading-snug">{summary}</p>
          )}
          {error && <p className="text-xs text-red-500 mt-0.5">{error}</p>}
        </div>
        <button
          onClick={() => refresh(true)}
          disabled={loading}
          className="shrink-0 flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md border hover:bg-muted transition-colors disabled:opacity-50"
        >
          <RefreshCw className={cn('h-3 w-3', loading && 'animate-spin')} />
          {loading ? 'Analyzing…' : 'Refresh'}
        </button>
      </div>

      {/* Empty state */}
      {insights.length === 0 && !loading && !error && (
        <div className="flex-1 flex flex-col items-center justify-center gap-2 text-center">
          <p className="text-sm text-muted-foreground">No insights yet.</p>
          <button
            onClick={() => refresh(true)}
            className="text-sm px-3 py-1.5 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            Analyze Portfolio
          </button>
        </div>
      )}

      {/* Insights list */}
      <div className="flex flex-col gap-2 overflow-y-auto flex-1 pr-0.5">
        {insights.map((insight) => (
          <div
            key={insight.id}
            className={cn('rounded-lg border p-3 text-sm', severityBg[insight.severity])}
          >
            <div className="flex items-start gap-2">
              <span
                className={cn(
                  'mt-1 h-2 w-2 shrink-0 rounded-full',
                  severityDot[insight.severity]
                )}
              />
              <div className="min-w-0">
                <p className="font-medium leading-tight">{insight.title}</p>
                <p className="text-xs text-muted-foreground mt-0.5 leading-snug">{insight.body}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
