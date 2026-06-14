# Watchlist (Follow) Folder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a watchlist folder type where users track securities they intend to buy, with automatic migration to the target folder upon purchase.

**Architecture:** Add `isWatchlist` flag to `Folder` and `targetFolderId` to `Holding` via Prisma migration. A new API endpoint `POST /api/holdings/[id]/purchase` atomically creates a lot and moves the holding to its target folder. UI changes: `AddFolderDialog` gains an isWatchlist toggle; `AddHoldingDialog` gains a target-folder picker when in watchlist context; a new `MarkAsPurchasedDialog` handles the purchase form; `FolderPageClient` renders a simplified watchlist view when `folder.isWatchlist` is true.

**Tech Stack:** Next.js 14 App Router, Prisma ORM (PostgreSQL/Supabase), React, Zod, Tailwind CSS, lucide-react

---

## File Map

| Action | File |
|--------|------|
| Modify | `prisma/schema.prisma` |
| Create | `prisma/migrations/<timestamp>_watchlist/migration.sql` (generated) |
| Modify | `src/lib/db/queries/folders.ts` |
| Modify | `src/lib/db/queries/holdings.ts` |
| Modify | `src/lib/db/queries/index.ts` |
| Modify | `src/app/api/folders/route.ts` |
| Modify | `src/app/api/holdings/route.ts` |
| Create | `src/app/api/holdings/[id]/purchase/route.ts` |
| Modify | `src/components/portfolio/AddFolderDialog.tsx` |
| Modify | `src/components/portfolio/AddHoldingDialog.tsx` |
| Create | `src/components/portfolio/MarkAsPurchasedDialog.tsx` |
| Modify | `src/components/portfolio/FolderPageClient.tsx` |
| Modify | `src/app/(dashboard)/folders/[id]/page.tsx` |
| Modify | `src/components/portfolio/HoldingsTree.tsx` |

---

## Task 1: Prisma schema changes + migration

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Add `isWatchlist` to Folder model**

In `prisma/schema.prisma`, inside the `model Folder` block, add after the `isHiddenWhenShared` line:

```prisma
isWatchlist         Boolean   @default(false) @map("is_watchlist")
```

- [ ] **Step 2: Add `targetFolderId` to Holding model**

In `prisma/schema.prisma`, inside the `model Holding` block, add after the `isActive` line:

```prisma
targetFolderId      String?        @map("target_folder_id")
targetFolder        Folder?        @relation("WatchlistTarget", fields: [targetFolderId], references: [id])
```

And in the `model Folder` block add the back-relation after the `holdings` relation:

```prisma
watchlistSources    Holding[]  @relation("WatchlistTarget")
```

- [ ] **Step 3: Run migration**

```bash
cd C:/Users/Avner/donatelo
npx prisma migrate dev --name watchlist
```

Expected: migration created and applied, Prisma client regenerated. Output ends with "Your database is now in sync with your schema."

- [ ] **Step 4: Commit**

```bash
cd C:/Users/Avner/donatelo
git add prisma/
git commit -m "feat: add isWatchlist to Folder and targetFolderId to Holding"
```

---

## Task 2: Update DB queries

**Files:**
- Modify: `src/lib/db/queries/folders.ts`
- Modify: `src/lib/db/queries/holdings.ts`
- Modify: `src/lib/db/queries/index.ts`

- [ ] **Step 1: Add `isWatchlist` to `getFolders` select**

In `src/lib/db/queries/folders.ts`, in the `getFolders` function's `select` block, add after `isHiddenWhenShared`:

```ts
isWatchlist: true,
```

- [ ] **Step 2: Add `isWatchlist` to `createFolder`**

In `src/lib/db/queries/folders.ts`, update the `createFolder` function signature's `data` parameter to add:

```ts
isWatchlist?: boolean
```

And in the `prisma.folder.create({ data: { ... } })` call, add:

```ts
isWatchlist: data.isWatchlist ?? false,
```

- [ ] **Step 3: Add `isWatchlist` to `getFolderById` select**

In `src/lib/db/queries/folders.ts`, in the `getFolderById` function's `select` block, add after `isHiddenWhenShared`:

```ts
isWatchlist: true,
```

Also add `isWatchlist` to the `children` sub-select:

```ts
children: {
  select: {
    id: true,
    name: true,
    color: true,
    targetAllocationPct: true,
    parentId: true,
    isWatchlist: true,   // add this
  },
  orderBy: { sortOrder: 'asc' },
},
```

- [ ] **Step 4: Update `createHolding` to accept `targetFolderId`**

In `src/lib/db/queries/holdings.ts`, update the `createHolding` function's `data` parameter:

```ts
data: {
  tickerSymbol: string
  exchange: string
  name: string
  expenseRatio?: number
  targetAllocationPct?: number
  targetFolderId?: string   // add this
}
```

And in `prisma.holding.create({ data: { ... } })`, add:

```ts
targetFolderId: data.targetFolderId ?? null,
```

- [ ] **Step 5: Add `purchaseWatchlistHolding` query**

In `src/lib/db/queries/holdings.ts`, add this new function at the end of the file:

```ts
/**
 * Atomically creates a lot and moves a watchlist holding to its targetFolder.
 * Also creates a SECURITY_BUY transaction.
 */
export async function purchaseWatchlistHolding(
  holdingId: string,
  userId: string,
  data: {
    purchaseDate: Date
    shares: number
    costPerShare: bigint
    costCurrency: string
    accountType?: string
    notes?: string
  }
) {
  const holding = await prisma.holding.findFirst({
    where: { id: holdingId, folder: { portfolio: { userId } } },
    select: { id: true, targetFolderId: true, folder: { select: { portfolioId: true } } },
  })
  if (!holding) return null
  if (!holding.targetFolderId) return null

  return prisma.$transaction(async (tx) => {
    const lot = await tx.lot.create({
      data: {
        holdingId,
        purchaseDate: data.purchaseDate,
        shares: new Prisma.Decimal(data.shares),
        costPerShare: data.costPerShare,
        costCurrency: data.costCurrency,
        accountType: data.accountType ?? null,
        notes: data.notes ?? null,
      },
    })

    await tx.holding.update({
      where: { id: holdingId },
      data: { folderId: holding.targetFolderId!, targetFolderId: null },
    })

    const totalCost = BigInt(Math.round(data.shares * Number(data.costPerShare)))
    await tx.transaction.create({
      data: {
        portfolioId: holding.folder.portfolioId,
        userId,
        type: 'SECURITY_BUY',
        date: data.purchaseDate,
        amount: totalCost,
        currency: data.costCurrency,
        holdingId,
        lotId: lot.id,
        shares: new Prisma.Decimal(data.shares),
        pricePerShare: data.costPerShare,
        notes: data.notes ?? null,
      },
    })

    return lot
  })
}
```

- [ ] **Step 6: Export new function from index**

In `src/lib/db/queries/index.ts`, add `purchaseWatchlistHolding` to the export from holdings:

```ts
export { ..., purchaseWatchlistHolding } from './holdings'
```

(Keep the existing exports, just add the new one.)

- [ ] **Step 7: Commit**

```bash
cd C:/Users/Avner/donatelo
git add src/lib/db/queries/
git commit -m "feat: update folder/holding queries for watchlist support"
```

---

## Task 3: Update API routes + new purchase endpoint

**Files:**
- Modify: `src/app/api/folders/route.ts`
- Modify: `src/app/api/holdings/route.ts`
- Create: `src/app/api/holdings/[id]/purchase/route.ts`

- [ ] **Step 1: Accept `isWatchlist` in folders API**

Replace the entire content of `src/app/api/folders/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getCurrentUser } from '@/lib/db/supabase-server'
import { createFolder } from '@/lib/db/queries'

const CreateFolderSchema = z.object({
  portfolioId: z.string().uuid(),
  name: z.string().min(1).max(100),
  parentId: z.string().uuid().nullable().optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  isWatchlist: z.boolean().optional(),
})

export async function POST(request: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const parsed = CreateFolderSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 })
  }

  const { portfolioId, ...data } = parsed.data
  const folder = await createFolder(portfolioId, user.id, data)
  if (!folder) return NextResponse.json({ error: 'Portfolio not found' }, { status: 404 })

  return NextResponse.json(folder, { status: 201 })
}
```

- [ ] **Step 2: Accept `targetFolderId` in holdings API**

Replace the entire content of `src/app/api/holdings/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getCurrentUser } from '@/lib/db/supabase-server'
import { createHolding } from '@/lib/db/queries'

const CreateHoldingSchema = z.object({
  folderId: z.string().uuid(),
  tickerSymbol: z.string().min(1).max(20),
  exchange: z.enum(['TASE', 'NYSE', 'NASDAQ', 'OTHER']),
  name: z.string().min(1).max(200),
  expenseRatio: z.number().min(0).max(1).optional(),
  targetFolderId: z.string().uuid().optional(),
})

export async function POST(request: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const parsed = CreateHoldingSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 })
  }

  const { folderId, ...data } = parsed.data
  const holding = await createHolding(folderId, user.id, data)
  if (!holding) return NextResponse.json({ error: 'Folder not found' }, { status: 404 })

  return NextResponse.json(holding, { status: 201 })
}
```

- [ ] **Step 3: Create purchase endpoint**

Create `src/app/api/holdings/[id]/purchase/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getCurrentUser } from '@/lib/db/supabase-server'
import { purchaseWatchlistHolding } from '@/lib/db/queries'

const PurchaseSchema = z.object({
  purchaseDate: z.string().date(),
  shares: z.number().positive(),
  costPerShareDisplay: z.number().positive(),
  costCurrency: z.enum(['ILS', 'USD']),
  accountType: z.string().max(50).optional(),
  notes: z.string().max(500).optional(),
})

interface RouteParams {
  params: Promise<{ id: string }>
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const body = await request.json()
  const parsed = PurchaseSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 })
  }

  const { costPerShareDisplay, costCurrency, purchaseDate, ...rest } = parsed.data
  const costPerShare = BigInt(Math.round(costPerShareDisplay * 100))

  const lot = await purchaseWatchlistHolding(id, user.id, {
    ...rest,
    purchaseDate: new Date(purchaseDate),
    costPerShare,
    costCurrency,
  })

  if (!lot) return NextResponse.json({ error: 'Holding not found or has no target folder' }, { status: 404 })

  return NextResponse.json({ ...lot, costPerShare: lot.costPerShare.toString() }, { status: 201 })
}
```

- [ ] **Step 4: Commit**

```bash
cd C:/Users/Avner/donatelo
git add src/app/api/
git commit -m "feat: add purchase endpoint and watchlist params to folder/holding APIs"
```

---

## Task 4: AddFolderDialog — isWatchlist toggle

**Files:**
- Modify: `src/components/portfolio/AddFolderDialog.tsx`

- [ ] **Step 1: Add isWatchlist state and UI**

Replace the entire content of `src/components/portfolio/AddFolderDialog.tsx`:

```tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Modal } from '@/components/ui/modal'

const PRESET_COLORS = [
  '#1d4ed8', '#059669', '#d97706', '#7c3aed',
  '#dc2626', '#0891b2', '#65a30d', '#9333ea',
]

interface AddFolderDialogProps {
  open: boolean
  onClose: () => void
  portfolioId: string
}

export function AddFolderDialog({ open, onClose, portfolioId }: AddFolderDialogProps) {
  const router = useRouter()
  const [name, setName] = useState('')
  const [color, setColor] = useState(PRESET_COLORS[0])
  const [isWatchlist, setIsWatchlist] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    setLoading(true)
    setError('')

    const res = await fetch('/api/folders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ portfolioId, name: name.trim(), color, isWatchlist }),
    })

    if (!res.ok) {
      setError('Failed to create folder. Please try again.')
      setLoading(false)
      return
    }

    router.refresh()
    handleClose()
  }

  function handleClose() {
    setName('')
    setColor(PRESET_COLORS[0])
    setIsWatchlist(false)
    setError('')
    setLoading(false)
    onClose()
  }

  return (
    <Modal open={open} onClose={handleClose} title="Add Folder">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1.5">Folder name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Israeli ETFs"
            maxLength={100}
            autoFocus
            className="w-full rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1.5">Color</label>
          <div className="flex gap-2 flex-wrap">
            {PRESET_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                className="w-7 h-7 rounded-full border-2 transition-all"
                style={{
                  backgroundColor: c,
                  borderColor: color === c ? 'white' : c,
                  outline: color === c ? `2px solid ${c}` : 'none',
                }}
                aria-label={c}
              />
            ))}
          </div>
        </div>

        <label className="flex items-center gap-2 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={isWatchlist}
            onChange={(e) => setIsWatchlist(e.target.checked)}
            className="rounded border"
          />
          <span className="text-sm font-medium">Watchlist (Follow)</span>
          <span className="text-xs text-muted-foreground">— track securities before buying</span>
        </label>

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
            {loading ? 'Creating…' : 'Create Folder'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
```

- [ ] **Step 2: Commit**

```bash
cd C:/Users/Avner/donatelo
git add src/components/portfolio/AddFolderDialog.tsx
git commit -m "feat: add isWatchlist toggle to AddFolderDialog"
```

---

## Task 5: AddHoldingDialog — target folder picker

**Files:**
- Modify: `src/components/portfolio/AddHoldingDialog.tsx`

- [ ] **Step 1: Update props and form**

The dialog needs to know (a) whether the current folder is a watchlist and (b) which non-watchlist folders exist for the target picker.

Replace the entire content of `src/components/portfolio/AddHoldingDialog.tsx`:

```tsx
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
```

- [ ] **Step 2: Commit**

```bash
cd C:/Users/Avner/donatelo
git add src/components/portfolio/AddHoldingDialog.tsx
git commit -m "feat: add target folder picker to AddHoldingDialog for watchlist folders"
```

---

## Task 6: MarkAsPurchasedDialog — new component

**Files:**
- Create: `src/components/portfolio/MarkAsPurchasedDialog.tsx`

- [ ] **Step 1: Create component**

Create `src/components/portfolio/MarkAsPurchasedDialog.tsx`:

```tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Modal } from '@/components/ui/modal'

interface MarkAsPurchasedDialogProps {
  open: boolean
  onClose: () => void
  holdingId: string
  tickerSymbol: string
  exchange: string
  targetFolderName: string
}

const ACCOUNT_TYPES = [
  { value: '', label: 'None (regular account)' },
  { value: 'השתלמות', label: 'קרן השתלמות' },
  { value: 'פנסיה', label: 'פנסיה' },
  { value: 'IRA', label: 'IRA' },
  { value: 'אחר', label: 'אחר' },
]

export function MarkAsPurchasedDialog({
  open,
  onClose,
  holdingId,
  tickerSymbol,
  exchange,
  targetFolderName,
}: MarkAsPurchasedDialogProps) {
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

    const res = await fetch(`/api/holdings/${holdingId}/purchase`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        purchaseDate,
        shares: sharesNum,
        costPerShareDisplay: costNum,
        costCurrency: currency,
        accountType: accountType || undefined,
        notes: notes || undefined,
      }),
    })

    if (!res.ok) {
      setError('Failed to record purchase. Please try again.')
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

  const total =
    shares && costPerShare
      ? (parseFloat(shares) * parseFloat(costPerShare)).toFixed(2)
      : null

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title={`Mark as Purchased — ${tickerSymbol}`}
      description={`Will move to: ${targetFolderName}`}
    >
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
            {loading ? 'Recording…' : 'Confirm Purchase'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
```

- [ ] **Step 2: Commit**

```bash
cd C:/Users/Avner/donatelo
git add src/components/portfolio/MarkAsPurchasedDialog.tsx
git commit -m "feat: add MarkAsPurchasedDialog component"
```

---

## Task 7: FolderPageClient — watchlist mode

**Files:**
- Modify: `src/components/portfolio/FolderPageClient.tsx`
- Modify: `src/app/(dashboard)/folders/[id]/page.tsx`

- [ ] **Step 1: Add `isWatchlist` to `SerializedFolder` type and props**

In `src/components/portfolio/FolderPageClient.tsx`, update the `SerializedFolder` interface to add:

```ts
isWatchlist: boolean
```

- [ ] **Step 2: Import `MarkAsPurchasedDialog` and `Eye` icon**

At the top of `FolderPageClient.tsx`, add to imports:

```ts
import { Eye } from 'lucide-react'
import { MarkAsPurchasedDialog } from './MarkAsPurchasedDialog'
```

- [ ] **Step 3: Add purchase dialog state**

Inside the `FolderPageClient` component, after the existing `useState` declarations, add:

```ts
const [purchaseTarget, setPurchaseTarget] = useState<{
  holdingId: string
  tickerSymbol: string
  exchange: string
  targetFolderName: string
} | null>(null)
```

- [ ] **Step 4: Render watchlist badge and purchase button in holdings table**

The component already renders a holdings table. Find the section that renders `directHoldings` rows (search for `directHoldings.map`). In the row for each holding, when `folder.isWatchlist` is true, replace or augment the action buttons column to show a "Mark as Purchased" button instead of the lot/value info.

Add this block inside the FolderPageClient return, just before the closing `</div>` of the main container, alongside the other dialogs:

```tsx
{purchaseTarget && (
  <MarkAsPurchasedDialog
    open={!!purchaseTarget}
    onClose={() => setPurchaseTarget(null)}
    holdingId={purchaseTarget.holdingId}
    tickerSymbol={purchaseTarget.tickerSymbol}
    exchange={purchaseTarget.exchange}
    targetFolderName={purchaseTarget.targetFolderName}
  />
)}
```

- [ ] **Step 5: In the holdings table, add watchlist-specific row rendering**

Find the place in `FolderPageClient.tsx` where `directHoldings` are rendered in a table (or list). After the loop that renders each holding row, add — for watchlist folders — a "Mark as Purchased" button. The exact location depends on the existing table structure. Look for `directHoldings.map((h) =>` and inside the row, add a conditional column:

```tsx
{folder.isWatchlist && (
  <td className="py-3 px-4 text-right">
    <button
      onClick={() =>
        setPurchaseTarget({
          holdingId: h.id,
          tickerSymbol: h.tickerSymbol,
          exchange: h.exchange,
          targetFolderName: folders.find((f) => f.id === h.targetFolderId)?.name ?? '—',
        })
      }
      className="rounded-lg bg-primary text-primary-foreground px-3 py-1 text-xs font-medium hover:opacity-90 transition-opacity"
    >
      Mark as Purchased
    </button>
  </td>
)}
```

Note: `h.targetFolderId` and `h.targetFolderName` are not yet on `HoldingMetrics` — see Step 6.

- [ ] **Step 6: Add `targetFolderId` to `ServerHolding` type**

In `src/hooks/usePortfolio.ts` (or wherever `ServerHolding` is defined), add `targetFolderId: string | null` to the type. Then ensure `FolderPageClient` passes it through from the `holdings` prop. The folder page server component already maps `rawHoldings` to `ServerHolding[]`; add `targetFolderId: h.targetFolderId ?? null` there.

- [ ] **Step 7: Show watchlist header badge**

In the folder header section of `FolderPageClient.tsx` (near the `<h1>` with `folder.name`), add a watchlist badge:

```tsx
{folder.isWatchlist && (
  <span className="flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
    <Eye className="h-3 w-3" />
    Watchlist
  </span>
)}
```

- [ ] **Step 8: Update server page to pass `isWatchlist`**

In `src/app/(dashboard)/folders/[id]/page.tsx`, update `serializedFolder` to include `isWatchlist`:

```ts
const serializedFolder = {
  id: folder.id,
  portfolioId: folder.portfolioId,
  parentId: folder.parentId,
  name: folder.name,
  color: folder.color,
  isWatchlist: folder.isWatchlist,   // add this
  targetAllocationPct: folder.targetAllocationPct ? Number(folder.targetAllocationPct) : null,
  parent: folder.parent,
  children: folder.children.map((c) => ({
    ...c,
    targetAllocationPct: c.targetAllocationPct ? Number(c.targetAllocationPct) : null,
  })),
}
```

Also update the `rawHoldings` mapping to include `targetFolderId`:

```ts
const holdings: ServerHolding[] = rawHoldings.map((h) => ({
  id: h.id,
  tickerSymbol: h.tickerSymbol,
  name: h.name,
  exchange: h.exchange,
  folderId: h.folderId,
  targetFolderId: h.targetFolderId ?? null,   // add this
  expenseRatio: h.expenseRatio ? Number(h.expenseRatio) : null,
  folder: {
    name: h.folder.name,
    color: h.folder.color,
    parentId: h.folder.parentId,
  },
  lots: h.lots.map((lot) => ({
    ...lot,
    shares: Number(lot.shares),
    soldShares: Number(lot.soldShares),
  })) as unknown as Lot[],
}))
```

- [ ] **Step 9: Commit**

```bash
cd C:/Users/Avner/donatelo
git add src/components/portfolio/FolderPageClient.tsx src/app/\(dashboard\)/folders/
git commit -m "feat: watchlist mode in FolderPageClient with Mark as Purchased button"
```

---

## Task 8: HoldingsTree — watchlist icon + pass isWatchlist to AddHoldingDialog

**Files:**
- Modify: `src/components/portfolio/HoldingsTree.tsx`

- [ ] **Step 1: Add `isWatchlist` to `RootFolderGroup`**

In `HoldingsTree.tsx`, update the `RootFolderGroup` interface:

```ts
interface RootFolderGroup {
  folderId: string
  folderName: string
  folderColor: string | null
  isWatchlist: boolean   // add this
  targetPct: number | null
  holdings: HoldingMetrics[]
  totalValue: bigint
  totalUnrealizedGains: bigint
  allocationPct: number
}
```

- [ ] **Step 2: Populate `isWatchlist` in `buildRootFolderGroups`**

In `buildRootFolderGroups`, update the group initialization:

```ts
map.set(f.id, {
  folderId: f.id,
  folderName: f.name,
  folderColor: f.color,
  isWatchlist: f.isWatchlist,   // add this
  targetPct: f.targetAllocationPct ? Number(f.targetAllocationPct) : null,
  holdings: [],
  totalValue: 0n,
  totalUnrealizedGains: 0n,
  allocationPct: 0,
})
```

- [ ] **Step 3: Import `Eye` icon**

Add `Eye` to the lucide-react import at the top of `HoldingsTree.tsx`.

- [ ] **Step 4: Render 👁 icon next to watchlist folder names**

Find where `group.folderName` is rendered in the folder row (likely inside a `<td>` or `<div>`). Add the Eye icon next to it when `group.isWatchlist`:

```tsx
<span className="font-medium">{group.folderName}</span>
{group.isWatchlist && <Eye className="h-3.5 w-3.5 text-muted-foreground ml-1 inline" />}
```

- [ ] **Step 5: Pass `isWatchlist` to `AddHoldingDialog` when opened from HoldingsTree**

Find where `AddHoldingDialog` is rendered in `HoldingsTree.tsx`. The dialog currently receives a `folders` prop as `Array<{ id: string; name: string }>`. Update it to pass `FolderOption[]` (with `isWatchlist`) — `folders` is already available as `FolderRow[]` which now includes `isWatchlist`. Pass it as-is (the type is compatible since `FolderRow` now has `isWatchlist`).

- [ ] **Step 6: Commit**

```bash
cd C:/Users/Avner/donatelo
git add src/components/portfolio/HoldingsTree.tsx
git commit -m "feat: show watchlist icon in HoldingsTree and pass isWatchlist to AddHoldingDialog"
```

---

## Task 9: Verify end-to-end

- [ ] **Step 1: Start the dev server**

```bash
cd C:/Users/Avner/donatelo
npm run dev
```

- [ ] **Step 2: Test the full flow**

1. Create a new folder with "Watchlist (Follow)" checked → should appear in the tree with 👁 icon.
2. Click "Add Holding" on the watchlist folder → form should show "Target folder after purchase" selector with non-watchlist folders only.
3. Add a holding → it should appear in the watchlist folder with no value/KPIs.
4. Click "Mark as Purchased" → fill in the purchase form → confirm.
5. Verify the holding disappears from the watchlist and appears in the target folder with the lot.

- [ ] **Step 3: Fix any TypeScript errors**

```bash
cd C:/Users/Avner/donatelo
npx tsc --noEmit
```

Fix any type errors found.

- [ ] **Step 4: Final commit**

```bash
cd C:/Users/Avner/donatelo
git add -A
git commit -m "fix: resolve TypeScript errors for watchlist feature"
```
