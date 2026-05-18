'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Modal } from '@/components/ui/modal'
import type { Lot } from '@/types'

interface SellLotDialogProps {
  open: boolean
  onClose: () => void
  lot: Lot
  tickerSymbol: string
  currentPriceDisplay?: number
}

export function SellLotDialog({ open, onClose, lot, tickerSymbol, currentPriceDisplay }: SellLotDialogProps) {
  const router = useRouter()
  const maxShares = lot.shares - lot.soldShares
  const defaultCurrency = lot.costCurrency

  const [soldDate, setSoldDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [soldShares, setSoldShares] = useState(String(maxShares))
  const [soldPrice, setSoldPrice] = useState(currentPriceDisplay ? String(currentPriceDisplay) : '')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const sharesNum = parseFloat(soldShares)
    const priceNum = parseFloat(soldPrice)
    if (!sharesNum || !priceNum) return
    if (sharesNum > maxShares) {
      setError(`Cannot sell more than ${maxShares} shares`)
      return
    }
    setLoading(true)
    setError('')

    const res = await fetch(`/api/lots/${lot.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'sell',
        soldShares: sharesNum,
        soldDate,
        soldPricePerShareDisplay: priceNum,
        currency: defaultCurrency,
      }),
    })

    if (!res.ok) {
      setError('Failed to record sale. Please try again.')
      setLoading(false)
      return
    }

    router.refresh()
    handleClose()
  }

  function handleClose() {
    setSoldDate(new Date().toISOString().slice(0, 10))
    setSoldShares(String(maxShares))
    setSoldPrice(currentPriceDisplay ? String(currentPriceDisplay) : '')
    setError('')
    setLoading(false)
    onClose()
  }

  const proceeds = soldShares && soldPrice
    ? (parseFloat(soldShares) * parseFloat(soldPrice)).toFixed(2)
    : null

  const symbol = defaultCurrency === 'ILS' ? '₪' : '$'
  const costBasisDisplay = (Number(lot.costPerShare) / 100).toFixed(2)

  return (
    <Modal open={open} onClose={handleClose} title={`Sell — ${tickerSymbol}`}
      description={`Lot: ${maxShares} shares @ ${symbol}${costBasisDisplay}`}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium mb-1.5">Sale Date</label>
            <input
              type="date"
              value={soldDate}
              onChange={(e) => setSoldDate(e.target.value)}
              max={new Date().toISOString().slice(0, 10)}
              className="w-full rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5">Shares to Sell</label>
            <input
              type="number"
              value={soldShares}
              onChange={(e) => setSoldShares(e.target.value)}
              min="0.000001"
              max={maxShares}
              step="any"
              autoFocus
              className="w-full rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
            <p className="text-xs text-muted-foreground mt-1">Max: {maxShares}</p>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1.5">
            Sale Price / Share ({symbol})
          </label>
          <input
            type="number"
            value={soldPrice}
            onChange={(e) => setSoldPrice(e.target.value)}
            placeholder="e.g. 200.00"
            min="0.01"
            step="0.01"
            className="w-full rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>

        {proceeds && (
          <p className="text-sm text-muted-foreground">
            Proceeds: {symbol}{parseFloat(proceeds).toLocaleString()}
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
            disabled={loading || !soldShares || !soldPrice}
            className="rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {loading ? 'Recording…' : 'Record Sale'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
