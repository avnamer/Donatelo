'use client'

import { useState } from 'react'
import { SlidersHorizontal, X } from 'lucide-react'

interface StockThresholdEditorProps {
  holdingId: string
  ticker: string
  dipThreshold: number | null
  buyNowThreshold: number | null
  globalDipThreshold: number
  globalBuyNowThreshold: number
  onSaved: (dip: number | null, buyNow: number | null) => void
}

export function StockThresholdEditor({
  holdingId,
  ticker,
  dipThreshold,
  buyNowThreshold,
  globalDipThreshold,
  globalBuyNowThreshold,
  onSaved,
}: StockThresholdEditorProps) {
  const [open, setOpen] = useState(false)
  const [dip, setDip] = useState(
    dipThreshold != null ? String(Math.round(dipThreshold * 100)) : ''
  )
  const [buyNow, setBuyNow] = useState(
    buyNowThreshold != null ? String(Math.round(buyNowThreshold * 100)) : ''
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleOpen = (e: React.MouseEvent) => {
    e.stopPropagation()
    setDip(dipThreshold != null ? String(Math.round(dipThreshold * 100)) : '')
    setBuyNow(buyNowThreshold != null ? String(Math.round(buyNowThreshold * 100)) : '')
    setError(null)
    setOpen(true)
  }

  const parseOpt = (val: string): number | null => {
    if (val.trim() === '') return null
    const n = parseInt(val)
    if (isNaN(n) || n <= 0 || n >= 100) return undefined as unknown as null // invalid
    return n / 100
  }

  const handleSave = async (e: React.MouseEvent) => {
    e.stopPropagation()
    const dipVal = parseOpt(dip)
    const buyNowVal = parseOpt(buyNow)

    if (dipVal === undefined || buyNowVal === undefined) {
      setError('Enter values between 1 and 99, or leave empty to use global')
      return
    }

    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/holdings/${holdingId}/dip-thresholds`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dipThreshold: dipVal, buyNowThreshold: buyNowVal }),
      })
      if (!res.ok) throw new Error('Failed')
      onSaved(dipVal, buyNowVal)
      setOpen(false)
    } catch {
      setError('Failed to save')
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <button
        onClick={handleOpen}
        className="text-muted-foreground hover:text-foreground transition-colors"
        title="Custom threshold for this stock"
      >
        <SlidersHorizontal className="w-3 h-3" />
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="bg-card border border-border rounded-xl shadow-xl w-80 p-6">
            <div className="flex items-center justify-between mb-1">
              <h3 className="font-semibold text-sm">Custom Thresholds — {ticker}</h3>
              <button
                onClick={(e) => { e.stopPropagation(); setOpen(false) }}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-muted-foreground mb-4">
              Leave empty to use global defaults ({Math.round(globalDipThreshold * 100)}% / {Math.round(globalBuyNowThreshold * 100)}%).
            </p>

            <div className="flex flex-col gap-4">
              <label className="flex flex-col gap-1">
                <span className="text-xs font-medium">Buy the Dip — drop from 52w high</span>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={1}
                    max={99}
                    placeholder={String(Math.round(globalDipThreshold * 100))}
                    value={dip}
                    onChange={(e) => setDip(e.target.value)}
                    onClick={(e) => e.stopPropagation()}
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
                    placeholder={String(Math.round(globalBuyNowThreshold * 100))}
                    value={buyNow}
                    onChange={(e) => setBuyNow(e.target.value)}
                    onClick={(e) => e.stopPropagation()}
                    className="w-20 rounded-md border border-border bg-background px-3 py-1.5 text-sm"
                  />
                  <span className="text-sm text-muted-foreground">%</span>
                </div>
              </label>
            </div>

            {error && <p className="text-xs text-destructive mt-3">{error}</p>}

            <div className="flex gap-2 mt-5 justify-end">
              <button
                onClick={(e) => { e.stopPropagation(); setOpen(false) }}
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
