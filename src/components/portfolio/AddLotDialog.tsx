'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Modal } from '@/components/ui/modal'

interface AddLotDialogProps {
  open: boolean
  onClose: () => void
  holdingId: string
  tickerSymbol: string
  exchange: string
}

const ACCOUNT_TYPES = [
  { value: '', label: 'None (regular account)' },
  { value: 'השתלמות', label: 'קרן השתלמות' },
  { value: 'פנסיה', label: 'פנסיה' },
  { value: 'IRA', label: 'IRA' },
  { value: 'אחר', label: 'אחר' },
]

export function AddLotDialog({ open, onClose, holdingId, tickerSymbol, exchange }: AddLotDialogProps) {
  const router = useRouter()
  const defaultCurrency = exchange === 'TASE' ? 'ILS' : 'USD'

  const [purchaseDate, setPurchaseDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [shares, setShares] = useState('')
  const [costPerShare, setCostPerShare] = useState('')
  const [currency, setCurrency] = useState<'ILS' | 'USD'>(defaultCurrency as 'ILS' | 'USD')
  const [accountType, setAccountType] = useState('')
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const sharesNum = parseFloat(shares)
    const costNum = parseFloat(costPerShare)
    if (!sharesNum || !costNum) return
    setLoading(true)
    setError('')

    const res = await fetch('/api/lots', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        holdingId,
        purchaseDate,
        shares: sharesNum,
        costPerShareDisplay: costNum,
        costCurrency: currency,
        accountType: accountType || undefined,
        notes: notes || undefined,
      }),
    })

    if (!res.ok) {
      setError('Failed to add lot. Please try again.')
      setLoading(false)
      return
    }

    router.refresh()
    handleClose()
  }

  function handleClose() {
    setPurchaseDate(new Date().toISOString().slice(0, 10))
    setShares('')
    setCostPerShare('')
    setCurrency(defaultCurrency as 'ILS' | 'USD')
    setAccountType('')
    setNotes('')
    setError('')
    setLoading(false)
    onClose()
  }

  const total = shares && costPerShare
    ? (parseFloat(shares) * parseFloat(costPerShare)).toFixed(2)
    : null

  return (
    <Modal open={open} onClose={handleClose} title={`Add Lot — ${tickerSymbol}`}>
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
            <label className="block text-sm font-medium mb-1.5">Currency</label>
            <select
              value={currency}
              onChange={(e) => setCurrency(e.target.value as 'ILS' | 'USD')}
              className="w-full rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="ILS">ILS (₪)</option>
              <option value="USD">USD ($)</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium mb-1.5">Shares</label>
            <input
              type="number"
              value={shares}
              onChange={(e) => setShares(e.target.value)}
              placeholder="e.g. 10"
              min="0.000001"
              step="any"
              autoFocus
              className="w-full rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5">
              Cost / Share ({currency === 'ILS' ? '₪' : '$'})
            </label>
            <input
              type="number"
              value={costPerShare}
              onChange={(e) => setCostPerShare(e.target.value)}
              placeholder="e.g. 150.00"
              min="0.01"
              step="0.01"
              className="w-full rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
        </div>

        {total && (
          <p className="text-sm text-muted-foreground">
            Total cost: {currency === 'ILS' ? '₪' : '$'}{parseFloat(total).toLocaleString()}
          </p>
        )}

        <div>
          <label className="block text-sm font-medium mb-1.5">Account Type</label>
          <select
            value={accountType}
            onChange={(e) => setAccountType(e.target.value)}
            className="w-full rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          >
            {ACCOUNT_TYPES.map((a) => (
              <option key={a.value} value={a.value}>{a.label}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1.5">
            Notes <span className="text-muted-foreground font-normal">(optional)</span>
          </label>
          <input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="e.g. DCA purchase"
            maxLength={500}
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
            disabled={loading || !shares || !costPerShare}
            className="rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {loading ? 'Adding…' : 'Add Lot'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
