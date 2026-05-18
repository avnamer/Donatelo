'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Modal } from '@/components/ui/modal'

interface AddCashDialogProps {
  open: boolean
  onClose: () => void
  portfolioId: string
}

export function AddCashDialog({ open, onClose, portfolioId }: AddCashDialogProps) {
  const router = useRouter()
  const [name, setName] = useState('')
  const [currency, setCurrency] = useState<'ILS' | 'USD'>('ILS')
  const [balance, setBalance] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    setLoading(true)
    setError('')

    const balanceFloat = parseFloat(balance || '0')
    // Convert to smallest unit (agorot for ILS, cents for USD)
    const balanceSmallest = BigInt(Math.round(balanceFloat * 100))

    const res = await fetch('/api/cash-accounts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        portfolioId,
        name: name.trim(),
        currency,
        balance: balanceSmallest.toString(),
      }),
    })

    if (!res.ok) {
      setError('Failed to create cash account. Please try again.')
      setLoading(false)
      return
    }

    router.refresh()
    handleClose()
  }

  function handleClose() {
    setName('')
    setCurrency('ILS')
    setBalance('')
    setError('')
    setLoading(false)
    onClose()
  }

  return (
    <Modal open={open} onClose={handleClose} title="Add Cash Account">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1.5">Account name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Emergency Fund"
            maxLength={100}
            autoFocus
            className="w-full rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1.5">Currency</label>
          <div className="flex gap-2">
            {(['ILS', 'USD'] as const).map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCurrency(c)}
                className={`flex-1 rounded-lg border py-2 text-sm font-medium transition-colors ${
                  currency === c
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'hover:bg-muted'
                }`}
              >
                {c === 'ILS' ? '₪ ILS' : '$ USD'}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1.5">
            Balance <span className="text-muted-foreground font-normal">(optional)</span>
          </label>
          <input
            type="number"
            value={balance}
            onChange={(e) => setBalance(e.target.value)}
            placeholder="0.00"
            min="0"
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
            {loading ? 'Creating…' : 'Create Account'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
