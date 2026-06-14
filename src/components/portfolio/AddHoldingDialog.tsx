'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Modal } from '@/components/ui/modal'

interface FolderOption {
  id: string
  name: string
  isWatchlist: boolean
}

interface AddHoldingDialogProps {
  open: boolean
  onClose: () => void
  folderId?: string
  folderName?: string
  isWatchlistFolder?: boolean
  folders?: FolderOption[]
}

const EXCHANGES = [
  { value: 'TASE', label: 'TASE (Israeli)' },
  { value: 'NYSE', label: 'NYSE (US)' },
  { value: 'NASDAQ', label: 'NASDAQ (US)' },
  { value: 'OTHER', label: 'Other' },
] as const

export function AddHoldingDialog({
  open,
  onClose,
  folderId: propFolderId,
  folderName: propFolderName,
  isWatchlistFolder,
  folders,
}: AddHoldingDialogProps) {
  const router = useRouter()
  const [selectedFolderId, setSelectedFolderId] = useState(propFolderId ?? folders?.[0]?.id ?? '')
  const [ticker, setTicker] = useState('')
  const [exchange, setExchange] = useState<'TASE' | 'NYSE' | 'NASDAQ' | 'OTHER'>('TASE')
  const [name, setName] = useState('')
  const [expenseRatio, setExpenseRatio] = useState('')
  const [targetFolderId, setTargetFolderId] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const effectiveFolderId = propFolderId ?? selectedFolderId
  const effectiveFolderName =
    propFolderName ??
    folders?.find((f) => f.id === selectedFolderId)?.name ??
    ''

  const effectiveIsWatchlist =
    isWatchlistFolder ??
    (folders?.find((f) => f.id === selectedFolderId)?.isWatchlist ?? false)

  const nonWatchlistFolders = folders?.filter((f) => !f.isWatchlist) ?? []

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!ticker.trim() || !name.trim() || !effectiveFolderId) return
    if (effectiveIsWatchlist && !targetFolderId) return
    setLoading(true)
    setError('')

    const body: Record<string, unknown> = {
      folderId: effectiveFolderId,
      tickerSymbol: ticker.trim().toUpperCase(),
      exchange,
      name: name.trim(),
    }
    if (expenseRatio) body.expenseRatio = parseFloat(expenseRatio) / 100
    if (effectiveIsWatchlist && targetFolderId) body.targetFolderId = targetFolderId

    const res = await fetch('/api/holdings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

    if (!res.ok) {
      setError('Failed to add holding. Please try again.')
      setLoading(false)
      return
    }

    router.refresh()
    handleClose()
  }

  function handleClose() {
    setSelectedFolderId(propFolderId ?? folders?.[0]?.id ?? '')
    setTicker('')
    setExchange('TASE')
    setName('')
    setExpenseRatio('')
    setTargetFolderId('')
    setError('')
    setLoading(false)
    onClose()
  }

  const description = effectiveFolderName ? `Adding to: ${effectiveFolderName}` : undefined

  return (
    <Modal open={open} onClose={handleClose} title="Add Holding" description={description}>
      <form onSubmit={handleSubmit} className="space-y-4">
        {!propFolderId && folders && folders.length > 0 && (
          <div>
            <label className="block text-sm font-medium mb-1.5">Folder</label>
            <select
              value={selectedFolderId}
              onChange={(e) => setSelectedFolderId(e.target.value)}
              className="w-full rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            >
              {folders.map((f) => (
                <option key={f.id} value={f.id}>{f.name}{f.isWatchlist ? ' 👁' : ''}</option>
              ))}
            </select>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium mb-1.5">Ticker Symbol</label>
            <input
              type="text"
              value={ticker}
              onChange={(e) => setTicker(e.target.value.toUpperCase())}
              placeholder="e.g. AAPL or 1082209"
              maxLength={20}
              autoFocus
              className="w-full rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary uppercase"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5">Exchange</label>
            <select
              value={exchange}
              onChange={(e) => setExchange(e.target.value as typeof exchange)}
              className="w-full rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            >
              {EXCHANGES.map((ex) => (
                <option key={ex.value} value={ex.value}>{ex.label}</option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1.5">Security Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Apple Inc. or מחקה S&P500"
            maxLength={200}
            className="w-full rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />
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

        {effectiveIsWatchlist && (
          <div>
            <label className="block text-sm font-medium mb-1.5">
              Target folder after purchase <span className="text-destructive">*</span>
            </label>
            <select
              value={targetFolderId}
              onChange={(e) => setTargetFolderId(e.target.value)}
              className="w-full rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="">— select folder —</option>
              {nonWatchlistFolders.map((f) => (
                <option key={f.id} value={f.id}>{f.name}</option>
              ))}
            </select>
          </div>
        )}

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
            disabled={
              loading ||
              !ticker.trim() ||
              !name.trim() ||
              !effectiveFolderId ||
              (effectiveIsWatchlist && !targetFolderId)
            }
            className="rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {loading ? 'Adding…' : 'Add Holding'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
