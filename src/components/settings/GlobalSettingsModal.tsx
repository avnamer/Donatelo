'use client'

import { useState, useEffect } from 'react'
import { X, Settings } from 'lucide-react'

interface GlobalSettingsModalProps {
  portfolioId: string
  open: boolean
  onClose: () => void
}

export function GlobalSettingsModal({ portfolioId, open, onClose }: GlobalSettingsModalProps) {
  const [dip, setDip] = useState('')
  const [buyNow, setBuyNow] = useState('')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open || !portfolioId) return
    setLoading(true)
    setError(null)
    fetch(`/api/portfolios/${portfolioId}/dip-settings`)
      .then((r) => r.json())
      .then((data) => {
        setDip(String(Math.round((data.globalDipThreshold ?? 0.10) * 100)))
        setBuyNow(String(Math.round((data.globalBuyNowThreshold ?? 0.20) * 100)))
      })
      .catch(() => {
        setDip('10')
        setBuyNow('20')
      })
      .finally(() => setLoading(false))
  }, [open, portfolioId])

  const handleSave = async () => {
    const dipVal = parseInt(dip)
    const buyNowVal = parseInt(buyNow)
    if (isNaN(dipVal) || dipVal <= 0 || dipVal >= 100 ||
        isNaN(buyNowVal) || buyNowVal <= 0 || buyNowVal >= 100) {
      setError('Enter values between 1 and 99')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/portfolios/${portfolioId}/dip-settings`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          globalDipThreshold: dipVal / 100,
          globalBuyNowThreshold: buyNowVal / 100,
        }),
      })
      if (!res.ok) throw new Error()
      onClose()
    } catch {
      setError('Failed to save settings')
    } finally {
      setSaving(false)
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-card border border-border rounded-xl shadow-xl w-96 p-6">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <Settings className="w-4 h-4 text-muted-foreground" />
            <h2 className="font-semibold text-base">Settings</h2>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="w-4 h-4" />
          </button>
        </div>

        {loading ? (
          <div className="py-8 text-center text-sm text-muted-foreground">Loading…</div>
        ) : (
          <>
            <div className="mb-2">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                Alert Thresholds — Global Defaults
              </h3>
              <p className="text-xs text-muted-foreground mb-4">
                Applied to all stocks that don't have a custom threshold set in their holding settings.
              </p>

              <div className="flex gap-4">
                <label className="flex-1 flex flex-col gap-1.5">
                  <span className="text-sm font-medium">📉 Buy the Dip</span>
                  <span className="text-xs text-muted-foreground">% drop from 52w high</span>
                  <div className="flex items-center gap-2 mt-1">
                    <input
                      type="number"
                      min={1}
                      max={99}
                      value={dip}
                      onChange={(e) => setDip(e.target.value)}
                      className="w-20 rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                    <span className="text-sm text-muted-foreground">%</span>
                  </div>
                </label>

                <label className="flex-1 flex flex-col gap-1.5">
                  <span className="text-sm font-medium">🚨 Buy Now</span>
                  <span className="text-xs text-muted-foreground">% drop from all-time high</span>
                  <div className="flex items-center gap-2 mt-1">
                    <input
                      type="number"
                      min={1}
                      max={99}
                      value={buyNow}
                      onChange={(e) => setBuyNow(e.target.value)}
                      className="w-20 rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                    <span className="text-sm text-muted-foreground">%</span>
                  </div>
                </label>
              </div>
            </div>

            {error && <p className="text-xs text-destructive mt-3">{error}</p>}

            <div className="flex gap-2 mt-6 justify-end">
              <button
                onClick={onClose}
                className="text-sm px-4 py-2 rounded-lg border border-border hover:bg-muted transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="text-sm px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
