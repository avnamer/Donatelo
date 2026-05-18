'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Modal } from '@/components/ui/modal'
import type { Lot } from '@/types'

interface EditLotDialogProps {
  open: boolean
  onClose: () => void
  lot: Lot
  tickerSymbol: string
}

export function EditLotDialog({ open, onClose, lot, tickerSymbol }: EditLotDialogProps) {
  const router = useRouter()

  const [purchaseDate, setPurchaseDate] = useState(() =>
    new Date(lot.purchaseDate).toISOString().slice(0, 10)
  )
  const [shares, setShares] = useState(String(lot.shares))
  const [costPerShare, setCostPerShare] = useState(
    String((Number(lot.costPerShare) / 100).toFixed(4))
  )
  const [costCurrency, setCostCurrency] = useState<'ILS' | 'USD'>(lot.costCurrency as 'ILS' | 'USD')
  const [accountType, setAccountType] = useState(lot.accountType ?? '')
  const [notes, setNotes] = useState(lot.notes ?? '')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const sharesNum = parseFloat(shares)
    const costNum = parseFloat(costPerShare)
    if (!sharesNum || !costNum || !purchaseDate) return

    setLoading(true)
    setError('')

    const res = await fetch(`/api/lots/${lot.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'edit',
        purchaseDate,
        shares: sharesNum,
        costPerShareDisplay: costNum,
        costCurrency,
        accountType: accountType || null,
        notes: notes || null,
      }),
    })

    if (!res.ok) {
      setError('Failed to update lot. Please try again.')
      setLoading(false)
      return
    }

    router.refresh()
    onClose()
  }

  const symbol = costCurrency === 'ILS' ? '₪' : '$'

  return (
    <Modal open={open} onClose={onClose} title={`Edit Lot — ${tickerSymbol}`}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium mb-1.5">Purchase Date</label>
            <input
              type="date"
              value={purchaseDate}
              onChange={(e) => setPurchaseDate(e.target.value)}
              max={new Date().toISOString().slice(0, 10)}
              className="w-full rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5">Shares</label>
            <input
              type="number"
              value={shares}
              onChange={(e) => setShares(e.target.value)}
              min="0.000001"
              step="any"
              className="w-full rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium mb-1.5">Cost / Share ({symbol})</label>
            <input
              type="number"
              value={costPerShare}
              onChange={(e) => setCostPerShare(e.target.value)}
              min="0.01"
              step="0.01"
              className="w-full rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5">Currency</label>
            <select
              value={costCurrency}
              onChange={(e) => setCostCurrency(e.target.value as 'ILS' | 'USD')}
              className="w-full rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="ILS">ILS (₪)</option>
              <option value="USD">USD ($)</option>
            </select>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1.5">
            Account <span className="text-muted-foreground font-normal">(optional)</span>
          </label>
          <input
            type="text"
            value={accountType}
            onChange={(e) => setAccountType(e.target.value)}
            placeholder="e.g. IRA, Brokerage"
            maxLength={50}
            className="w-full rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1.5">
            Notes <span className="text-muted-foreground font-normal">(optional)</span>
          </label>
          <input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Any notes about this lot"
            maxLength={500}
            className="w-full rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <div className="flex gap-2 justify-end pt-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border px-4 py-2 text-sm font-medium hover:bg-muted transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={loading || !shares || !costPerShare || !purchaseDate}
            className="rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {loading ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
