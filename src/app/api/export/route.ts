import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/db/supabase-server'
import { getPortfolios, getPortfolioWithStructure, getTransactions } from '@/lib/db/queries'
import { z } from 'zod'

const QuerySchema = z.object({
  format: z.enum(['json', 'holdings', 'lots', 'dividends']).default('json'),
})

function csvRow(values: (string | number | null | undefined)[]) {
  return values.map((v) => {
    const s = v == null ? '' : String(v)
    return s.includes(',') || s.includes('"') || s.includes('\n')
      ? `"${s.replace(/"/g, '""')}"`
      : s
  }).join(',')
}

function formatDate(d: Date | string | null | undefined) {
  if (!d) return ''
  return new Date(d).toISOString().slice(0, 10)
}

export async function GET(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const raw = Object.fromEntries(req.nextUrl.searchParams)
  const parsed = QuerySchema.safeParse(raw)
  if (!parsed.success) return NextResponse.json({ error: 'Invalid format' }, { status: 400 })
  const { format } = parsed.data

  const portfolios = await getPortfolios(user.id)
  if (portfolios.length === 0) return NextResponse.json({ error: 'No portfolio' }, { status: 404 })

  const portfolio = await getPortfolioWithStructure(portfolios[0].id, user.id)
  if (!portfolio) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // ── JSON full backup ──────────────────────────
  if (format === 'json') {
    const body = JSON.stringify({
      exportedAt: new Date().toISOString(),
      portfolio: {
        id: portfolio.id,
        name: portfolio.name,
        baseCurrency: portfolio.baseCurrency,
        folders: portfolio.folders.map((f) => ({
          id: f.id,
          name: f.name,
          color: f.color,
          parentId: f.parentId,
          targetAllocationPct: f.targetAllocationPct ? Number(f.targetAllocationPct) : null,
          holdings: f.holdings.map((h) => ({
            id: h.id,
            tickerSymbol: h.tickerSymbol,
            exchange: h.exchange,
            name: h.name,
            expenseRatio: h.expenseRatio ? Number(h.expenseRatio) : null,
            lots: h.lots.map((l) => ({
              purchaseDate: formatDate(l.purchaseDate),
              shares: Number(l.shares),
              costPerShare: l.costPerShare.toString(),
              costCurrency: l.costCurrency,
              accountType: l.accountType,
              soldShares: Number(l.soldShares),
              soldDate: formatDate(l.soldDate),
              soldPricePerShare: l.soldPricePerShare?.toString() ?? null,
              notes: l.notes,
            })),
          })),
        })),
        cashAccounts: portfolio.cashAccounts.map((c) => ({
          name: c.name,
          currency: c.currency,
          balance: c.balance.toString(),
        })),
      },
    }, null, 2)

    return new NextResponse(body, {
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="donatelo-backup-${formatDate(new Date())}.json"`,
      },
    })
  }

  // ── Holdings CSV ──────────────────────────────
  if (format === 'holdings') {
    const rows = [
      csvRow(['Ticker', 'Name', 'Exchange', 'Folder', 'Expense Ratio (%)', 'Target Allocation (%)']),
    ]
    for (const folder of portfolio.folders) {
      for (const h of folder.holdings) {
        rows.push(csvRow([
          h.tickerSymbol,
          h.name,
          h.exchange,
          folder.name,
          h.expenseRatio ? (Number(h.expenseRatio) * 100).toFixed(4) : '',
          h.targetAllocationPct ? Number(h.targetAllocationPct) : '',
        ]))
      }
    }
    return new NextResponse(rows.join('\n'), {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="holdings-${formatDate(new Date())}.csv"`,
      },
    })
  }

  // ── Lots CSV ──────────────────────────────────
  if (format === 'lots') {
    const rows = [
      csvRow(['Ticker', 'Folder', 'Purchase Date', 'Shares', 'Cost Per Share', 'Cost Currency',
        'Account Type', 'Sold Shares', 'Sold Date', 'Sold Price Per Share', 'Notes']),
    ]
    for (const folder of portfolio.folders) {
      for (const h of folder.holdings) {
        for (const l of h.lots) {
          rows.push(csvRow([
            h.tickerSymbol,
            folder.name,
            formatDate(l.purchaseDate),
            Number(l.shares),
            l.costPerShare.toString(),
            l.costCurrency,
            l.accountType ?? '',
            Number(l.soldShares),
            formatDate(l.soldDate),
            l.soldPricePerShare?.toString() ?? '',
            l.notes ?? '',
          ]))
        }
      }
    }
    return new NextResponse(rows.join('\n'), {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="lots-${formatDate(new Date())}.csv"`,
      },
    })
  }

  // ── Dividends CSV ─────────────────────────────
  const { items: dividends } = await getTransactions(portfolio.id, user.id, {
    type: 'DIVIDEND',
    pageSize: 10000,
  })

  const rows = [csvRow(['Date', 'Ticker', 'Amount', 'Currency', 'Shares'])]
  for (const tx of dividends) {
    rows.push(csvRow([
      formatDate(tx.date),
      tx.holding?.tickerSymbol ?? '',
      tx.amount.toString(),
      tx.currency,
      tx.shares ? Number(tx.shares) : '',
    ]))
  }
  return new NextResponse(rows.join('\n'), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="dividends-${formatDate(new Date())}.csv"`,
    },
  })
}
