'use client'

import { useState, useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { RefreshCw } from 'lucide-react'
import { DipAlertCard } from './DipAlertCard'
import { DipAlertModal } from './DipAlertModal'
import { DipAlertSettings } from './DipAlertSettings'
import type { DipAlertRow } from '@/lib/db/queries/dip-alerts'

export type PeakView = '52w' | 'ath' | '90d'

const VIEW_LABELS: Record<PeakView, string> = {
  '52w': '52w',
  ath: 'Historical',
  '90d': '90d',
}

interface DipAlertsSectionProps {
  portfolioId: string
}

interface AlertsResponse {
  alerts: DipAlertRow[]
  computedAt: string
  alertCount: number
  globalDipThreshold: number
  globalBuyNowThreshold: number
}

async function fetchDipAlerts(portfolioId: string, force = false): Promise<AlertsResponse> {
  const url = `/api/dip-alerts?portfolioId=${portfolioId}${force ? '&force=true' : ''}`
  const res = await fetch(url)
  if (!res.ok) throw new Error('Failed to fetch dip alerts')
  return res.json()
}

export function DipAlertsSection({ portfolioId }: DipAlertsSectionProps) {
  const [selectedAlert, setSelectedAlert] = useState<DipAlertRow | null>(null)
  const [forceKey, setForceKey] = useState(0)
  const [view, setView] = useState<PeakView>('52w')
  const queryClient = useQueryClient()

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['dip-alerts', portfolioId, forceKey],
    queryFn: () => fetchDipAlerts(portfolioId, forceKey > 0),
    staleTime: 1000 * 60 * 60,
  })

  const handleRefresh = useCallback(() => {
    setForceKey((k) => k + 1)
  }, [])

  const handleSettingsSaved = useCallback((dipThreshold: number, buyNowThreshold: number) => {
    // Optimistically update cached data and force refresh
    queryClient.invalidateQueries({ queryKey: ['dip-alerts', portfolioId] })
    setForceKey((k) => k + 1)
  }, [portfolioId, queryClient])

  const alerts = data?.alerts ?? []
  const globalDipThreshold = data?.globalDipThreshold ?? 0.10
  const globalBuyNowThreshold = data?.globalBuyNowThreshold ?? 0.20

  const buyNowAlerts = alerts.filter((a) => a.buyNowTriggered)
  const buyNowIds = new Set(buyNowAlerts.map((a) => a.id))
  const dipAlerts = alerts.filter((a) => a.dipTriggered && !buyNowIds.has(a.id))

  // Check if any alert has a non-null ATH (to decide whether to show Hist. toggle)
  const hasATH = alerts.some((a) => a.highATH != null && a.highATH !== a.high52w)

  const ViewToggle = () => (
    <div className="flex gap-1 rounded-lg bg-muted p-1">
      {(['52w', 'ath', '90d'] as PeakView[]).map((v) => {
        const disabled = v === 'ath' && !hasATH
        return (
          <button
            key={v}
            type="button"
            onClick={() => { if (!disabled) setView(v) }}
            disabled={disabled}
            title={disabled ? 'No historical data beyond 52w' : undefined}
            className={[
              'rounded-md px-3 py-1 text-xs font-medium transition-colors',
              view === v
                ? 'bg-background shadow text-foreground'
                : disabled
                  ? 'text-muted-foreground/40 cursor-not-allowed'
                  : 'text-muted-foreground hover:text-foreground cursor-pointer',
            ].join(' ')}
          >
            {VIEW_LABELS[v]}
          </button>
        )
      })}
    </div>
  )

  const Controls = () => (
    <div className="flex items-center gap-3">
      {alerts.length > 0 && <ViewToggle />}
      <DipAlertSettings
        portfolioId={portfolioId}
        globalDipThreshold={globalDipThreshold}
        globalBuyNowThreshold={globalBuyNowThreshold}
        onSaved={handleSettingsSaved}
      />
      <button
        onClick={handleRefresh}
        disabled={isFetching}
        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
      >
        <RefreshCw className={`w-3 h-3 ${isFetching ? 'animate-spin' : ''}`} />
        Refresh
      </button>
    </div>
  )

  const CardList = ({ items, variant }: { items: DipAlertRow[]; variant: 'dip' | 'buy-now' }) => (
    <div className="flex gap-3 overflow-x-auto pb-2">
      {items.map((alert) => (
        <DipAlertCard
          key={`${variant}-${alert.id}`}
          alert={alert}
          view={view}
          variant={variant}
          globalDipThreshold={globalDipThreshold}
          globalBuyNowThreshold={globalBuyNowThreshold}
          onClick={() => setSelectedAlert(alert)}
          onThresholdSaved={() => {
            queryClient.invalidateQueries({ queryKey: ['dip-alerts', portfolioId] })
            setForceKey((k) => k + 1)
          }}
        />
      ))}
    </div>
  )

  return (
    <section className="mt-8 flex flex-col gap-8">
      {/* ── Buy the Dip section ── */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-semibold">📉 Buy the Dip</h2>
            {dipAlerts.length > 0 && (
              <span className="inline-flex items-center rounded-full bg-destructive/10 text-destructive text-xs font-semibold px-2 py-0.5">
                {dipAlerts.length}
              </span>
            )}
          </div>
          <Controls />
        </div>

        {isLoading && (
          <div className="flex gap-3 overflow-x-auto pb-2">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="min-w-[220px] h-[180px] rounded-xl border border-border bg-muted animate-pulse"
              />
            ))}
          </div>
        )}

        {!isLoading && dipAlerts.length === 0 && (
          <div className="rounded-xl border border-border bg-green-500/5 p-4 text-sm text-muted-foreground flex items-center gap-2">
            <span className="text-green-500">✓</span>
            All holdings are within {Math.round(globalDipThreshold * 100)}% of their 52-week high.
          </div>
        )}

        {!isLoading && dipAlerts.length > 0 && (
          <CardList items={dipAlerts} variant="dip" />
        )}
      </div>

      {/* ── Buy Now section ── */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-semibold">🚨 Buy Now</h2>
            {buyNowAlerts.length > 0 && (
              <span className="inline-flex items-center rounded-full bg-orange-500/10 text-orange-500 text-xs font-semibold px-2 py-0.5">
                {buyNowAlerts.length}
              </span>
            )}
          </div>
        </div>

        {isLoading && (
          <div className="flex gap-3 overflow-x-auto pb-2">
            {[1, 2].map((i) => (
              <div
                key={i}
                className="min-w-[220px] h-[180px] rounded-xl border border-border bg-muted animate-pulse"
              />
            ))}
          </div>
        )}

        {!isLoading && buyNowAlerts.length === 0 && (
          <div className="rounded-xl border border-border bg-green-500/5 p-4 text-sm text-muted-foreground flex items-center gap-2">
            <span className="text-green-500">✓</span>
            No holdings have dropped {Math.round(globalBuyNowThreshold * 100)}%+ from their all-time high.
          </div>
        )}

        {!isLoading && buyNowAlerts.length > 0 && (
          <CardList items={buyNowAlerts} variant="buy-now" />
        )}
      </div>

      {/* Detail modal */}
      <DipAlertModal
        alert={selectedAlert}
        open={selectedAlert !== null}
        onClose={() => setSelectedAlert(null)}
      />
    </section>
  )
}
