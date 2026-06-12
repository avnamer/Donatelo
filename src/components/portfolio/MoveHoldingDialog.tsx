'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Modal } from '@/components/ui/modal'
import type { FolderRow } from '@/lib/db/queries'

interface MoveHoldingDialogProps {
  open: boolean
  onClose: () => void
  holdingId: string
  tickerSymbol: string
  currentFolderId: string
  folders: FolderRow[]
}

export function MoveHoldingDialog({
  open,
  onClose,
  holdingId,
  tickerSymbol,
  currentFolderId,
  folders,
}: MoveHoldingDialogProps) {
  const router = useRouter()
  const [targetFolderId, setTargetFolderId] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const availableFolders = folders.filter((f) => f.id !== currentFolderId)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!targetFolderId) return
    setLoading(true)
    setError('')

    const res = await fetch(`/api/holdings/${holdingId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ folderId: targetFolderId }),
    })

    if (!res.ok) {
      setError('Failed to move holding. Please try again.')
      setLoading(false)
      return
    }

    router.refresh()
    handleClose()
  }

  function handleClose() {
    setTargetFolderId('')
    setError('')
    setLoading(false)
    onClose()
  }

  return (
    <Modal open={open} onClose={handleClose} title={`Move ${tickerSymbol}`}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1.5">Move to folder</label>
          <select
            value={targetFolderId}
            onChange={(e) => setTargetFolderId(e.target.value)}
            autoFocus
            className="w-full rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          >
            <option value="">Select a folder…</option>
            {availableFolders.map((f) => (
              <option key={f.id} value={f.id}>
                {f.parentId ? '  ' : ''}{f.name}
              </option>
            ))}
          </select>
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
            disabled={loading || !targetFolderId}
            className="rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {loading ? 'Moving…' : 'Move'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
