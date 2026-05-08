// ─────────────────────────────────────────────
// GET /api/fx
//
// Returns current USD ↔ ILS rate.
// Fetches from FreeCurrencyAPI once daily, caches in DB.
//
// Response: { rate: number, date: string, cached: boolean }
// ─────────────────────────────────────────────

import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/db/supabase-server'
import { getFxRate, upsertFxRate } from '@/lib/db/queries'
import { fetchUSDtoILS } from '@/lib/api/fx'

export async function GET() {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // 1. Try DB cache (today's rate)
  const cached = await getFxRate('USD', 'ILS')
  if (cached !== null) {
    return NextResponse.json({
      rate: cached,
      pair: 'USD/ILS',
      cached: true,
    })
  }

  // 2. Fetch fresh from FreeCurrencyAPI
  try {
    const rate = await fetchUSDtoILS()
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    await upsertFxRate({
      fromCurrency: 'USD',
      toCurrency: 'ILS',
      rate,
      rateDate: today,
    })

    return NextResponse.json({
      rate,
      pair: 'USD/ILS',
      cached: false,
    })
  } catch (err) {
    console.error('[/api/fx] Failed to fetch rate:', err)
    return NextResponse.json({ error: 'Failed to fetch FX rate' }, { status: 502 })
  }
}
