'use client'

// ─────────────────────────────────────────────
// InvestClient — Auto-Invest UI
// Enter new cash amount → see suggested buys to reach target allocations
// ─────────────────────────────────────────────

import { useState, useMemo } from 'react'
import { calcAutoInvest, formatCurrency, formatPercent, toStorage } from '@/lib/calculations'
import { usePrices } from '@/hooks/usePrices'
import { useFxRate } from '@/hooks/useFxRate'
import { useUIStore } from '@/store/ui'
import { cn } from '@/lib/utils'
import type { AutoInvestSuggestion } from '@/types'

// ─── Types ────────────────────────────────────

interface HoldingData {
  id: string
  tickerSymbol: string
  name: string
  exchange: string
  targetAllocationPct: number | null
  lots: Array<{ shares: number; soldShares: number; costPerShare: bigint; costCurrency: string }>
}

interface FolderData {
  id: string
  name: string
  targetAllocationPct: number | null
  holdings: HoldingData[]
}

interface PortfolioData {
  id: string
  name: string
  folders: FolderData[]
}

interface InvestClientProps {
  portfolio: PortfolioData
}

// ─── Suggestion Row ───────────────────────────

function SuggestionRow({
  s,
  currency,
}: {
  s: AutoInvestSuggestion
  currency: 'ILS' | 'USD'
}) {
  const deviation = s.deviation

  return (
    <tr className="border-b hover:bg-muted/20 transition-colors">
      <td className="py-2.5 px-3">
        <div className="flex flex-col">
          <span className="text-sm font-medium">{s.tickerSymbol}</span>
          <span className="text-xs text-muted-foreground">{s.folderName}</span>
        </div>
      </td>
      <td className="py-2.5 px-3 text-right tabular-nums text-sm">
        {formatCurrency(s.suggestedAmount, currency)}
      </td>
      <td className="py-2.5 px-3 text-right tabular-nums text-sm">
        {s.suggestedShares % 1 === 0
          ? s.suggestedShares.toFixed(0)
          : s.suggestedShares.toFixed(4)}{' '}
        shares
      </td>
      <td className="py-2.5 px-3 text-right tabular-nums text-xs">
        <span className="text-muted-foreground">{s.actualPct.toFixed(1)}%</span>
        {' → '}
        <span className="font-medium">{(s.targetPct * 100).toFixed(1)}%</span>
      </td>
      <td className={cn(
        'py-2.5 px-3 text-right tabular-nums text-xs font-medium',
        deviation < 0 ? 'text-loss' : 'text-muted-foreground'
      )}>
        {deviation >= 0 ? '+' : ''}{deviation.toFixed(1)}%
      </td>
    </tr>
  )
}

// ─── Main Component ───────────────────────────

export function InvestClient({ portfolio }: InvestClientProps) {
  const currency = useUIStore((s) => s.currency)
  const { data: fxRate = 3.72 } = useFxRate()

  const [amountInput, setAmountInput] = useState('')
  const [allowFractional, setAllowFractional] = useState(false)
  const [suggestions, setSuggestions] = useState<AutoInvestSuggestion[]>([])
  const [calculated, setCalculated] = useState(false)

  // Collect all tickers for price fetching
  const tickers = useMemo(
    () => portfolio.folders.flatMap((f) =>
      f.holdings.map((h) => `${h.tickerSymbol}:${h.exchange === 'TASE' ? 'TASE' : 'US'}`)
    ),
    [portfolio]
  )

  const { data: prices = {}, isLoading: pricesLoading } = usePrices(tickers)

  // Compute current values
  const folderTargets = useMemo(() => {
    return portfolio.folders
      .filter((f) => f.targetAllocationPct != null && f.targetAllocationPct > 0)
      .map((f) => {
        const holdings = f.holdings.map((h) => {
          const priceEntry = prices[h.tickerSymbol]
          const currentPrice = priceEntry?.price ?? 0n
          const activeShares = h.lots.reduce((s, l) => s + l.shares - l.soldShares, 0)
          const currentValue = BigInt(Math.round(activeShares * Number(currentPrice)))

          return {
            holdingId: h.id,
            tickerSymbol: h.tickerSymbol,
            holdingName: h.name,
            currentValue,
            targetPct: h.targetAllocationPct ?? 0,
            currentPrice,
          }
        })

        const folderValue = holdings.reduce((s, h) => s + h.currentValue, 0n)

        return {
          id: f.id,
          name: f.name,
          currentValue: folderValue,
          targetPct: f.targetAllocationPct ?? 0,
          holdings,
        }
      })
  }, [portfolio, prices])

  const totalCurrentValue = folderTargets.reduce((s, f) => s + f.currentValue, 0n)

  function handleCalculate() {
    const amountILS = parseFloat(amountInput.replace(/,/g, ''))
    if (isNaN(amountILS) || amountILS <= 0) return

    const amountStorage = toStorage(amountILS)

    const result = calcAutoInvest(
      folderTargets,
      totalCurrentValue,
      amountStorage,
      allowFractional
    )

    setSuggestions(result)
    setCalculated(true)
  }

  const totalSuggested = suggestions.reduce((s, r) => s + r.suggestedAmount, 0n)
  const remaining = toStorage(parseFloat(amountInput || '0')) - totalSuggested

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Auto-Invest</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Enter the amount you want to invest and see how to distribute it to reach your target allocations.
        </p>
      </div>

      {/* Input section */}
      <div className="rounded-xl border bg-card p-4 space-y-4">
        <div className="flex items-end gap-3 flex-wrap">
          <div className="space-y-1">
            <label className="text-sm font-medium">Amount to invest ({currency})</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">
                {currency === 'ILS' ? '₪' : '$'}
              </span>
              <input
                type="text"
                value={amountInput}
                onChange={(e) => setAmountInput(e.target.value)}
                placeholder="10,000"
                className="pl-7 pr-4 py-2 rounded-lg border bg-background text-sm w-40 focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm cursor-pointer pb-2">
            <input
              type="checkbox"
              checked={allowFractional}
              onChange={(e) => setAllowFractional(e.target.checked)}
              className="rounded"
            />
            Allow fractional shares
          </label>

          <button
            onClick={handleCalculate}
            disabled={pricesLoading || !amountInput}
            className="pb-2 self-end rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {pricesLoading ? 'Loading prices...' : 'Auto Invest'}
          </button>
        </div>

        {/* Folder targets summary */}
        <div className="flex flex-wrap gap-2">
          {folderTargets.map((f) => (
            <div key={f.id} className="flex items-center gap-1.5 rounded-lg bg-muted px-2.5 py-1.5 text-xs">
              <span className="font-medium">{f.name}</span>
              <span className="text-muted-foreground">{f.targetPct}%</span>
            </div>
          ))}
          {folderTargets.length === 0 && (
            <p className="text-xs text-muted-foreground">
              Set target allocations on the Allocations page first.
            </p>
          )}
        </div>
      </div>

      {/* Results */}
      {calculated && (
        <div className="rounded-xl border bg-card overflow-hidden">
          <div className="p-3 border-b flex items-center justify-between">
            <h2 className="text-sm font-semibold">Suggested Transactions</h2>
            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              <span>
                Total: <strong className="text-foreground">
                  {formatCurrency(totalSuggested, currency)}
                </strong>
              </span>
              <span className={cn(remaining < 0n ? 'text-loss' : '')}>
                Remaining: <strong className={remaining < 0n ? 'text-loss' : 'text-foreground'}>
                  {formatCurrency(remaining < 0n ? -remaining : remaining, currency)}
                  {remaining < 0n ? ' over' : ''}
                </strong>
              </span>
            </div>
          </div>

          {suggestions.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground">
              Portfolio is already well-balanced — no purchases needed.
            </div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b bg-muted/30">
                  <th className="py-2 px-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    Security
                  </th>
                  <th className="py-2 px-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    Amount
                  </th>
                  <th className="py-2 px-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    Shares
                  </th>
                  <th className="py-2 px-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    Current → Target
                  </th>
                  <th className="py-2 px-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    Gap
                  </th>
                </tr>
              </thead>
              <tbody>
                {suggestions.map((s) => (
                  <SuggestionRow key={s.holdingId} s={s} currency={currency} />
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  )
}
