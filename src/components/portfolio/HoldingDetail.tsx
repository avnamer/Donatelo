'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Plus, TrendingUp, TrendingDown, Trash2 } from 'lucide-react'
import { formatCurrency, formatPercent, calcCostBasis, calcUnrealizedGains, calcUnrealizedReturnPct } from '@/lib/calculations'
import { usePrices } from '@/hooks/usePrices'
import { useFxRate } from '@/hooks/useFxRate'
import { useUIStore } from '@/store/ui'
import { formatDate, cn } from '@/lib/utils'
import { AddLotDialog } from './AddLotDialog'
import { SellLotDialog } from './SellLotDialog'
import { EditLotDialog } from './EditLotDialog'
import { RecordDividendDialog } from './RecordDividendDialog'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { DrilldownChart } from '@/components/charts/DrilldownChart'
import type { Lot } from '@/types'
import type { Currency } from '@/types'

interface HoldingInfo {
  id: string
  tickerSymbol: string
  name: string
  exchange: string
  expenseRatio: number | null
  folderId: string
  folderName: string
  portfolioId: string
}

interface HoldingDetailProps {
  holding: HoldingInfo
  lots: Lot[]
}

export function HoldingDetail({ holding, lots }: HoldingDetailProps) {
  const router = useRouter()
  const currency = useUIStore((s) => s.currency)
  const { data: fxRate = 3.72 } = useFxRate()

  const tickerKey = `${holding.tickerSymbol}:${holding.exchange === 'TASE' ? 'TASE' : 'US'}`
  const { data: prices = {} } = usePrices([tickerKey])
  const priceData = prices[holding.tickerSymbol]
  const currentPrice = priceData?.price ?? 0n
  const priceCurrency = (priceData?.currency ?? (holding.exchange === 'TASE' ? 'ILS' : 'USD')) as Currency

  const [addLotOpen, setAddLotOpen] = useState(false)
  const [recordDividendOpen, setRecordDividendOpen] = useState(false)
  const [sellTarget, setSellTarget] = useState<Lot | null>(null)
  const [editLotTarget, setEditLotTarget] = useState<Lot | null>(null)
  const [deleteLotTarget, setDeleteLotTarget] = useState<string | null>(null)

  const activeLots = lots.filter((l) => l.shares - l.soldShares > 0)
  const soldLots = lots.filter((l) => l.soldShares > 0)

  const totalActiveShares = activeLots.reduce((s, l) => s + l.shares - l.soldShares, 0)
  const costBasis = calcCostBasis(lots, currency, fxRate)

  // Current value
  const valueInPriceCurrency = totalActiveShares * Number(currentPrice)
  const currentValue = priceCurrency === currency
    ? BigInt(Math.round(valueInPriceCurrency))
    : priceCurrency === 'USD' && currency === 'ILS'
      ? BigInt(Math.round(valueInPriceCurrency * fxRate))
      : BigInt(Math.round(valueInPriceCurrency / fxRate))

  const unrealizedGains = calcUnrealizedGains(currentValue, costBasis)
  const unrealizedReturnPct = calcUnrealizedReturnPct(unrealizedGains, costBasis)
  const isPositive = unrealizedGains >= 0n

  const currentPriceDisplay = currentPrice > 0n ? Number(currentPrice) / 100 : undefined

  async function handleDeleteLot(lotId: string) {
    await fetch(`/api/lots/${lotId}`, { method: 'DELETE' })
    router.refresh()
  }

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Back nav */}
      <div className="flex items-center gap-2">
        <Link
          href="/"
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Portfolio
        </Link>
        <span className="text-muted-foreground">/</span>
        <span className="text-sm text-muted-foreground">{holding.folderName}</span>
      </div>

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold">{holding.tickerSymbol}</h1>
            <span className="text-xs font-medium bg-muted rounded px-2 py-0.5">
              {holding.exchange}
            </span>
          </div>
          <p className="text-muted-foreground mt-0.5">{holding.name}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setRecordDividendOpen(true)}
            className="flex items-center gap-1.5 rounded-lg border bg-background px-3 py-2 text-sm font-medium hover:bg-muted transition-colors"
          >
            Record Dividend
          </button>
          <button
            onClick={() => setAddLotOpen(true)}
            className="flex items-center gap-1.5 rounded-lg bg-primary text-primary-foreground px-3 py-2 text-sm font-medium hover:opacity-90 transition-opacity"
          >
            <Plus className="h-4 w-4" />
            Add Lot
          </button>
        </div>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Current Value" value={formatCurrency(currentValue, currency, { compact: true })} />
        <StatCard label="Cost Basis" value={formatCurrency(costBasis, currency, { compact: true })} />
        <StatCard
          label="Unrealized P&L"
          value={formatCurrency(unrealizedGains, currency, { compact: true })}
          sub={formatPercent(unrealizedReturnPct, 1)}
          positive={isPositive}
        />
        <StatCard label="Shares" value={totalActiveShares.toLocaleString(undefined, { maximumFractionDigits: 4 })} />
      </div>

      {/* Performance chart */}
      {totalActiveShares > 0 && (
        <DrilldownChart
          holdings={[{
            tickerSymbol: holding.tickerSymbol,
            exchange: holding.exchange,
            activeShares: totalActiveShares,
            currentValue: Number(currentValue),
          }]}
          fxRate={fxRate}
          portfolioCurrency={currency}
          label={`${holding.tickerSymbol} — Performance`}
        />
      )}

      {/* Active Lots */}
      <section>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-2">
          Active Lots
        </h2>
        {activeLots.length === 0 ? (
          <div className="rounded-xl border bg-card p-6 text-center text-sm text-muted-foreground">
            No active lots. Click "Add Lot" to record a purchase.
          </div>
        ) : (
          <div className="rounded-xl border bg-card overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/30">
                  <th className="py-2 px-3 text-left font-medium text-muted-foreground">Date</th>
                  <th className="py-2 px-3 text-right font-medium text-muted-foreground">Shares</th>
                  <th className="py-2 px-3 text-right font-medium text-muted-foreground">Cost/Share</th>
                  <th className="py-2 px-3 text-right font-medium text-muted-foreground">Account</th>
                  <th className="py-2 px-3 text-right font-medium text-muted-foreground">Notes</th>
                  <th className="py-2 px-3 w-20" />
                </tr>
              </thead>
              <tbody>
                {activeLots.map((lot) => {
                  const activeShares = lot.shares - lot.soldShares
                  const costDisplay = (Number(lot.costPerShare) / 100).toFixed(2)
                  const sym = lot.costCurrency === 'ILS' ? '₪' : '$'
                  return (
                    <tr key={lot.id} className="border-b last:border-0 hover:bg-muted/20">
                      <td className="py-2.5 px-3 tabular-nums">{formatDate(lot.purchaseDate)}</td>
                      <td className="py-2.5 px-3 text-right tabular-nums">
                        {activeShares.toLocaleString(undefined, { maximumFractionDigits: 4 })}
                        {lot.soldShares > 0 && (
                          <span className="text-xs text-muted-foreground ml-1">
                            ({lot.shares} total)
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-right tabular-nums">{sym}{costDisplay}</td>
                      <td className="py-2.5 px-3 text-right text-muted-foreground">
                        {lot.accountType ?? '—'}
                      </td>
                      <td className="py-2.5 px-3 text-right text-muted-foreground text-xs max-w-[120px] truncate">
                        {lot.notes ?? '—'}
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="flex items-center gap-1 justify-end">
                          <button
                            onClick={() => setSellTarget(lot)}
                            className="rounded px-2 py-1 text-xs border hover:bg-muted transition-colors"
                          >
                            Sell
                          </button>
                          <button
                            onClick={() => setEditLotTarget(lot)}
                            className="rounded px-2 py-1 text-xs border hover:bg-muted transition-colors"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => setDeleteLotTarget(lot.id)}
                            className="rounded p-1 hover:bg-muted transition-colors text-muted-foreground hover:text-destructive"
                            aria-label="Delete lot"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Sold Lots */}
      {soldLots.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-2">
            Sold Lots
          </h2>
          <div className="rounded-xl border bg-card overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/30">
                  <th className="py-2 px-3 text-left font-medium text-muted-foreground">Bought</th>
                  <th className="py-2 px-3 text-right font-medium text-muted-foreground">Sold</th>
                  <th className="py-2 px-3 text-right font-medium text-muted-foreground">Shares Sold</th>
                  <th className="py-2 px-3 text-right font-medium text-muted-foreground">Sell Price</th>
                  <th className="py-2 px-3 text-right font-medium text-muted-foreground">Proceeds</th>
                </tr>
              </thead>
              <tbody>
                {soldLots.map((lot) => {
                  const sym = lot.costCurrency === 'ILS' ? '₪' : '$'
                  const sellPrice = lot.soldPricePerShare
                    ? `${sym}${(Number(lot.soldPricePerShare) / 100).toFixed(2)}`
                    : '—'
                  const proceeds = lot.proceedsFromSale
                    ? `${sym}${(Number(lot.proceedsFromSale) / 100).toLocaleString()}`
                    : '—'
                  return (
                    <tr key={lot.id} className="border-b last:border-0 hover:bg-muted/20">
                      <td className="py-2.5 px-3 tabular-nums">{formatDate(lot.purchaseDate)}</td>
                      <td className="py-2.5 px-3 text-right tabular-nums">
                        {lot.soldDate ? formatDate(lot.soldDate) : '—'}
                      </td>
                      <td className="py-2.5 px-3 text-right tabular-nums">{lot.soldShares}</td>
                      <td className="py-2.5 px-3 text-right tabular-nums">{sellPrice}</td>
                      <td className="py-2.5 px-3 text-right tabular-nums">{proceeds}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Holding info */}
      {holding.expenseRatio !== null && (
        <p className="text-sm text-muted-foreground">
          Expense ratio: {(holding.expenseRatio * 100).toFixed(2)}%
        </p>
      )}

      {/* Dialogs */}
      <AddLotDialog
        open={addLotOpen}
        onClose={() => setAddLotOpen(false)}
        holdingId={holding.id}
        tickerSymbol={holding.tickerSymbol}
        exchange={holding.exchange}
      />
      <RecordDividendDialog
        open={recordDividendOpen}
        onClose={() => setRecordDividendOpen(false)}
        holdingId={holding.id}
        tickerSymbol={holding.tickerSymbol}
        portfolioId={holding.portfolioId}
      />
      {sellTarget && (
        <SellLotDialog
          open={sellTarget !== null}
          onClose={() => setSellTarget(null)}
          lot={sellTarget}
          tickerSymbol={holding.tickerSymbol}
          currentPriceDisplay={currentPriceDisplay}
        />
      )}
      {editLotTarget && (
        <EditLotDialog
          open={editLotTarget !== null}
          onClose={() => setEditLotTarget(null)}
          lot={editLotTarget}
          tickerSymbol={holding.tickerSymbol}
        />
      )}
      <ConfirmDialog
        open={deleteLotTarget !== null}
        title="Delete lot"
        message="Delete this lot? This cannot be undone."
        confirmLabel="Delete"
        onConfirm={() => { if (deleteLotTarget) handleDeleteLot(deleteLotTarget); setDeleteLotTarget(null) }}
        onCancel={() => setDeleteLotTarget(null)}
      />
    </div>
  )
}

// ─── Stat Card ────────────────────────────────

function StatCard({
  label, value, sub, positive,
}: {
  label: string
  value: string
  sub?: string
  positive?: boolean
}) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</p>
      <p className="text-xl font-bold tabular-nums mt-1">{value}</p>
      {sub && (
        <p className={cn('text-sm font-medium mt-0.5', positive ? 'text-gain' : 'text-loss')}>
          {sub}
        </p>
      )}
    </div>
  )
}
