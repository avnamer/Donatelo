'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Modal } from '@/components/ui/modal'
import type { FolderRow } from '@/lib/db/queries'

interface EditHoldingDialogProps {
  open: boolean
  onClose: () => void
  holdingId: string
  currentName: string
  currentExpenseRatio: number | null
  currentFolderId: string
  folders: FolderRow[]
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
}: EditHoldingDialogProps) {
  const router = useRouter()
  const [name, setName] = useState(currentName)
  const [folderId, setFolderId] = useState(currentFolderId)
  const [expenseRatio, setExpenseRatio] = useState(
    currentExpenseRatio != null ? (currentExpenseRatio * 100).toFixed(2) : ''
  )
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    setLoading(true)
    setError('')

    const body: Record<string, unknown> = { name: name.trim(), folderId }
    if (expenseRatio !== '') {
      body.expenseRatio = parseFloat(expenseRatio) / 100
    } else {
      body.expenseRatio = null
    }

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
    setError('')
    setLoading(false)
    onClose()
  }

  const folderOptions = buildFolderOptions(folders)

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
    </Modal>
  )
}
