'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Modal } from '@/components/ui/modal'

interface RecordDividendDialogProps {
  open: boolean
  onClose: () => void
  holdingId: string
  tickerSymbol: string
  portfolioId: string
}

export function RecordDividendDialog({
  open,
  onClose,
  holdingId,
  tickerSymbol,
  portfolioId,
}: RecordDividendDialogProps) {
  const router = useRouter()

  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [amountPerShare, setAmountPerShare] = useState('')
  const [shares, setShares] = useState('')
  const [totalAmount, setTotalAmount] = useState('')
  const [currency, setCurrency] = useState<'ILS' | 'USD'>('USD')
  const [inputMode, setInputMode] = useState<'total' | 'perShare'>('total')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const computedTotal = inputMode === 'perShare' && amountPerShare && shares
    ? (parseFloat(amountPerShare) * parseFloat(shares)).toFixed(4)
    : null

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    let total: number
    if (inputMode === 'total') {
      total = parseFloat(totalAmount)
    } else {
      total = parseFloat(amountPerShare) * parseFloat(shares)
    }
    if (!total || total <= 0) return

    setLoading(true)
    setError('')

    const res = await fetch('/api/dividends', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        portfolioId,
        holdingId,
        date,
        amount: Math.round(total * 100),
        currency,
        shares: inputMode === 'perShare' ? parseFloat(shares) : undefined,
        amountPerShare: inputMode === 'perShare' ? parseFloat(amountPerShare) : undefined,
      }),
    })

    if (!res.ok) {
      setError('Failed to record dividend. Please try again.')
      setLoading(false)
      return
    }

    router.refresh()
    handleClose()
  }

  function handleClose() {
    setDate(new Date().toISOString().slice(0, 10))
    setAmountPerShare('')
    setShares('')
    setTotalAmount('')
    setError('')
    setLoading(false)
    onClose()
  }

  const symbol = currency === 'ILS' ? '₪' : '$'

  return (
    <Modal open={open} onClose={handleClose} title={`Record Dividend — ${tickerSymbol}`}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium mb-1.5">Date</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
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
              <option value="USD">USD ($)</option>
              <option value="ILS">ILS (₪)</option>
            </select>
          </div>
        </div>

        {/* Input mode toggle */}
        <div className="flex rounded-lg border overflow-hidden text-sm">
          <button
            type="button"
            onClick={() => setInputMode('total')}
            className={`flex-1 py-1.5 px-3 transition-colors ${inputMode === 'total' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}
          >
            Total Amount
          </button>
          <button
            type="button"
            onClick={() => setInputMode('perShare')}
            className={`flex-1 py-1.5 px-3 transition-colors ${inputMode === 'perShare' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}
          >
            Per Share
          </button>
        </div>

        {inputMode === 'total' ? (
          <div>
            <label className="block text-sm font-medium mb-1.5">Total Dividend ({symbol})</label>
            <input
              type="number"
              value={totalAmount}
              onChange={(e) => setTotalAmount(e.target.value)}
              placeholder="e.g. 150.00"
              min="0.01"
              step="0.01"
              autoFocus
              className="w-full rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium mb-1.5">Amount / Share ({symbol})</label>
              <input
                type="number"
                value={amountPerShare}
                onChange={(e) => setAmountPerShare(e.target.value)}
                placeholder="e.g. 0.25"
                min="0.000001"
                step="any"
                autoFocus
                className="w-full rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5">Shares Held</label>
              <input
                type="number"
                value={shares}
                onChange={(e) => setShares(e.target.value)}
                placeholder="e.g. 100"
                min="0.000001"
                step="any"
                className="w-full rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
          </div>
        )}

        {computedTotal && (
          <p className="text-sm text-muted-foreground">
            Total: {symbol}{parseFloat(computedTotal).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}
          </p>
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
            disabled={loading || !date || (inputMode === 'total' ? !totalAmount : !amountPerShare || !shares)}
            className="rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {loading ? 'Recording…' : 'Record Dividend'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
