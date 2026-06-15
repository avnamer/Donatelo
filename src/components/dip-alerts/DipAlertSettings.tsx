'use client'

import { useState } from 'react'
import { Settings, X } from 'lucide-react'

interface DipAlertSettingsProps {
  portfolioId: string
  globalDipThreshold: number
  globalBuyNowThreshold: number
  onSaved: (dipThreshold: number, buyNowThreshold: number) => void
}

export function DipAlertSettings({
  portfolioId,
  globalDipThreshold,
  globalBuyNowThreshold,
  onSaved,
}: DipAlertSettingsProps) {
  const [open, setOpen] = useState(false)
  const [dip, setDip] = useState(String(Math.round(globalDipThreshold * 100)))
  const [buyNow, setBuyNow] = useState(String(Math.round(globalBuyNowThreshold * 100)))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleOpen = () => {
    setDip(String(Math.round(globalDipThreshold * 100)))
    setBuyNow(String(Math.round(globalBuyNowThreshold * 100)))
    setError(null)
    setOpen(true)
  }

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
      if (!res.ok) throw new Error('Failed to save')
      onSaved(dipVal / 100, buyNowVal / 100)
      setOpen(false)
    } catch {
      setError('Failed to save settings')
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <button
        onClick={handleOpen}
        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
        title="Alert settings"
      >
        <Settings className="w-3 h-3" />
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-card border border-border rounded-xl shadow-xl w-80 p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-sm">Alert Thresholds (Global)</h3>
              <button onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground">
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-muted-foreground mb-4">
              Applied to stocks without a custom threshold.
            </p>

            <div className="flex flex-col gap-4">
              <label className="flex flex-col gap-1">
                <span className="text-xs font-medium">Buy the Dip — drop from 52w high</span>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={1}
                    max={99}
                    value={dip}
                    onChange={(e) => setDip(e.target.value)}
                    className="w-20 rounded-md border border-border bg-background px-3 py-1.5 text-sm"
                  />
                  <span className="text-sm text-muted-foreground">%</span>
                </div>
              </label>

              <label className="flex flex-col gap-1">
                <span className="text-xs font-medium">Buy Now — drop from all-time high</span>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={1}
                    max={99}
                    value={buyNow}
                    onChange={(e) => setBuyNow(e.target.value)}
                    className="w-20 rounded-md border border-border bg-background px-3 py-1.5 text-sm"
                  />
                  <span className="text-sm text-muted-foreground">%</span>
                </div>
              </label>
            </div>

            {error && <p className="text-xs text-destructive mt-3">{error}</p>}

            <div className="flex gap-2 mt-5 justify-end">
              <button
                onClick={() => setOpen(false)}
                className="text-xs px-3 py-1.5 rounded-md border border-border hover:bg-muted transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="text-xs px-3 py-1.5 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
