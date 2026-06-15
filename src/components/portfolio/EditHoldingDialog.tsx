'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Modal } from '@/components/ui/modal'
import { Check } from 'lucide-react'
import type { FolderRow } from '@/lib/db/queries'

interface EditHoldingDialogProps {
  open: boolean
  onClose: () => void
  holdingId: string
  currentName: string
  currentExpenseRatio: number | null
  currentFolderId: string
  folders: FolderRow[]
  currentDipThreshold: number | null
  currentBuyNowThreshold: number | null
}

function buildFolderOptions(folders: FolderRow[]): { id: string; label: string }[] {
  const byId = new Map(folders.map((f) => [f.id, f]))
  return folders.map((f) => {
    const parent = f.parentId ? byId.get(f.parentId) : null
    const label = parent ? `${parent.name} › ${f.name}` : f.name
    return { id: f.id, label }
  })
}

export function EditHoldingDialog({
  open,
  onClose,
  holdingId,
  currentName,
  currentExpenseRatio,
  currentFolderId,
  folders,
  currentDipThreshold,
  currentBuyNowThreshold,
}: EditHoldingDialogProps) {
  const router = useRouter()

  // ── Main form state ──
  const [name, setName] = useState(currentName)
  const [folderId, setFolderId] = useState(currentFolderId)
  const [expenseRatio, setExpenseRatio] = useState(
    currentExpenseRatio != null ? (currentExpenseRatio * 100).toFixed(2) : ''
  )
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // ── Threshold section state ──
  const toStr = (v: number | null) => v != null ? String(Math.round(v * 100)) : ''

  // committedDip/BuyNow tracks the last confirmed-saved value (survives dialog close/open)
  // Initialized from props; updated immediately on successful save (before router.refresh completes)
  const [committedDip, setCommittedDip] = useState(toStr(currentDipThreshold))
  const [committedBuyNow, setCommittedBuyNow] = useState(toStr(currentBuyNowThreshold))
  const [dipThreshold, setDipThreshold] = useState(toStr(currentDipThreshold))
  const [buyNowThreshold, setBuyNowThreshold] = useState(toStr(currentBuyNowThreshold))
  const [threshDirty, setThreshDirty] = useState(false)
  const [threshSaving, setThreshSaving] = useState(false)
  const [threshSaved, setThreshSaved] = useState(false)
  const [threshError, setThreshError] = useState('')

  // When dialog opens, fetch the real saved values from the API
  useEffect(() => {
    if (!open) return
    setThreshDirty(false)
    setThreshSaved(false)

    // If we already have committed values (from a save in this session), show them immediately
    if (committedDip !== '' || committedBuyNow !== '') {
      setDipThreshold(committedDip)
      setBuyNowThreshold(committedBuyNow)
    }

    // Always fetch fresh from server to get the true saved state
    fetch(`/api/holdings/${holdingId}/dip-thresholds`)
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (!data) return
        const fetchedDip = toStr(data.dipThreshold)
        const fetchedBuyNow = toStr(data.buyNowThreshold)
        setDipThreshold(fetchedDip)
        setBuyNowThreshold(fetchedBuyNow)
        setCommittedDip(fetchedDip)
        setCommittedBuyNow(fetchedBuyNow)
      })
      .catch(() => {})
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, holdingId])

  const hasExistingThresholds = committedDip !== '' || committedBuyNow !== ''

  function handleDipChange(v: string) { setDipThreshold(v); setThreshDirty(true); setThreshSaved(false) }
  function handleBuyNowChange(v: string) { setBuyNowThreshold(v); setThreshDirty(true); setThreshSaved(false) }

  async function handleSaveThresholds() {
    setThreshSaving(true)
    setThreshError('')
    try {
      const res = await fetch(`/api/holdings/${holdingId}/dip-thresholds`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dipThreshold: dipThreshold !== '' ? parseInt(dipThreshold) / 100 : null,
          buyNowThreshold: buyNowThreshold !== '' ? parseInt(buyNowThreshold) / 100 : null,
        }),
      })
      if (!res.ok) throw new Error()
      // Update committed values immediately — don't wait for router.refresh()
      setCommittedDip(dipThreshold)
      setCommittedBuyNow(buyNowThreshold)
      setThreshDirty(false)
      setThreshSaved(true)
      router.refresh()
    } catch {
      setThreshError('Failed to save')
    } finally {
      setThreshSaving(false)
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    setLoading(true)
    setError('')

    const body: Record<string, unknown> = { name: name.trim(), folderId }
    body.expenseRatio = expenseRatio !== '' ? parseFloat(expenseRatio) / 100 : null

    const res = await fetch(`/api/holdings/${holdingId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

    if (!res.ok) {
      setError('Failed to save changes. Please try again.')
      setLoading(false)
      return
    }

    router.refresh()
    handleClose()
  }

  function handleClose() {
    setName(currentName)
    setFolderId(currentFolderId)
    setExpenseRatio(currentExpenseRatio != null ? (currentExpenseRatio * 100).toFixed(2) : '')
    setDipThreshold(committedDip)
    setBuyNowThreshold(committedBuyNow)
    setThreshDirty(false)
    setThreshSaved(false)
    setThreshError('')
    setError('')
    setLoading(false)
    onClose()
  }

  const folderOptions = buildFolderOptions(folders)

  const threshButtonLabel = threshSaving
    ? 'Saving…'
    : threshSaved
      ? '✓ Saved'
      : hasExistingThresholds
        ? 'Save changes'
        : 'שמור ייעדים'

  const showThreshButton = !hasExistingThresholds || threshDirty || threshSaved

  return (
    <Modal open={open} onClose={handleClose} title="Edit Holding">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1.5">Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={200}
            autoFocus
            className="w-full rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1.5">Folder</label>
          <select
            value={folderId}
            onChange={(e) => setFolderId(e.target.value)}
            className="w-full rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          >
            {folderOptions.map(({ id, label }) => (
              <option key={id} value={id}>{label}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1.5">
            Expense Ratio <span className="text-muted-foreground font-normal">(%, optional)</span>
          </label>
          <input
            type="number"
            value={expenseRatio}
            onChange={(e) => setExpenseRatio(e.target.value)}
            placeholder="e.g. 0.06"
            min="0"
            max="5"
            step="0.01"
            className="w-full rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <div className="flex gap-2 justify-end pt-2">
          <button
            type="button"
            onClick={handleClose}
            className="rounded-lg border px-4 py-2 text-sm font-medium hover:bg-muted transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={loading || !name.trim()}
            className="rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {loading ? 'Saving…' : 'Save'}
          </button>
        </div>
      </form>

      {/* ── Alert thresholds — independent section ── */}
      <div className="border-t border-border mt-5 pt-4">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
          Alert Thresholds
        </p>
        <p className="text-xs text-muted-foreground mb-3">
          {hasExistingThresholds
            ? 'Custom thresholds for this stock. Leave empty to use global defaults.'
            : 'Leave empty to use global defaults.'}
        </p>
        <div className="flex gap-3 mb-3">
          <div className="flex-1">
            <label className="block text-xs font-medium mb-1.5">
              📉 Buy the Dip <span className="text-muted-foreground font-normal">(% from 52w high)</span>
            </label>
            <input
              type="number"
              value={dipThreshold}
              onChange={(e) => handleDipChange(e.target.value)}
              placeholder="e.g. 10"
              min="1"
              max="99"
              step="1"
              className="w-full rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
          <div className="flex-1">
            <label className="block text-xs font-medium mb-1.5">
              🚨 Buy Now <span className="text-muted-foreground font-normal">(% from ATH)</span>
            </label>
            <input
              type="number"
              value={buyNowThreshold}
              onChange={(e) => handleBuyNowChange(e.target.value)}
              placeholder="e.g. 20"
              min="1"
              max="99"
              step="1"
              className="w-full rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
        </div>

        {threshError && <p className="text-xs text-destructive mb-2">{threshError}</p>}

        {showThreshButton && (
          <button
            type="button"
            onClick={handleSaveThresholds}
            disabled={threshSaving || threshSaved}
            className={[
              'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50',
              threshSaved
                ? 'bg-green-500/10 text-green-600'
                : 'bg-primary/10 text-primary hover:bg-primary/20',
            ].join(' ')}
          >
            {threshSaved && <Check className="w-3 h-3" />}
            {threshButtonLabel}
          </button>
        )}
      </div>
    </Modal>
  )
}
