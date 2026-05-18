/**
 * update-sale-prices.ts
 * Imports sold_price_per_share, sold_date, and proceeds_from_sale
 * for every lot that has sold shares.
 *
 * Three cases handled:
 *  A) Simple — lot in DB maps 1:1 to a Donatello sold lot → direct update
 *  B) Restructure — DB has soldShares combined into one lot, but Donatello
 *     has sub-lots with different prices → move soldShares to the right lots
 *
 * Run: npx tsx scripts/update-sale-prices.ts
 */

import { createClient } from '@supabase/supabase-js'
import { randomUUID } from 'crypto'
import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
function loadEnvFile(p: string) {
  if (!fs.existsSync(p)) return
  for (const line of fs.readFileSync(p, 'utf-8').split('\n')) {
    const t = line.trim(); if (!t || t.startsWith('#')) continue
    const eq = t.indexOf('='); if (eq < 0) continue
    const k = t.slice(0, eq).trim(), v = t.slice(eq + 1).trim().replace(/^["']|["']$/g, '')
    if (!process.env[k]) process.env[k] = v
  }
}
loadEnvFile(path.join(__dirname, '..', '.env.local'))

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)
const USER_ID  = '9c7b80d3-9d53-4b41-9e93-8433e377804d'
const NOW      = new Date().toISOString()

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** ILS prices are already in agorot — store as-is */
const agr = (n: number) => Math.round(n)
/** USD prices in dollars → cents */
const usd = (n: number) => Math.round(n * 100)

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  // 1. Locate portfolio
  const { data: port } = await sb.from('portfolios').select('id')
    .eq('user_id', USER_ID).eq('name', 'השתלמות').single()
  if (!port) throw new Error('Portfolio not found')
  const pid = port.id

  // 2. Load all folders → holdings → lots for this portfolio
  const { data: folders } = await sb.from('folders').select('id').eq('portfolio_id', pid)
  if (!folders) throw new Error('No folders')
  const folderIds = folders.map((f: any) => f.id)

  const { data: allHoldings } = await sb.from('holdings')
    .select('id, ticker_symbol, folder_id').in('folder_id', folderIds)
  if (!allHoldings) throw new Error('No holdings')

  // ticker → [holdingId, …]  (ETOR appears in two folders)
  const byTicker = new Map<string, string[]>()
  for (const h of allHoldings as any[]) {
    if (!byTicker.has(h.ticker_symbol)) byTicker.set(h.ticker_symbol, [])
    byTicker.get(h.ticker_symbol)!.push(h.id)
  }

  const holdingIds = (allHoldings as any[]).map((h: any) => h.id)
  const { data: allLots } = await sb.from('lots')
    .select('id, holding_id, purchase_date, shares, sold_shares, cost_per_share, cost_currency')
    .in('holding_id', holdingIds)
  if (!allLots) throw new Error('No lots')

  /** Find lots for a ticker, optionally filtered by purchaseDate prefix and shares */
  function getLots(ticker: string, purchaseDatePrefix?: string, sharesEq?: number) {
    const hIds = byTicker.get(ticker) ?? []
    return (allLots as any[]).filter(l =>
      hIds.includes(l.holding_id) &&
      (!purchaseDatePrefix || l.purchase_date.startsWith(purchaseDatePrefix)) &&
      (sharesEq === undefined || Number(l.shares) === sharesEq)
    )
  }

  let updated = 0
  let inserted = 0

  // ─── Case A: simple 1-to-1 lot updates ───────────────────────────────────

  const simpleUpdates: Array<{
    ticker: string
    purchaseDate: string
    shares: number
    /** number of sold_shares to confirm match (undefined = match first found) */
    soldShares?: number
    // New values
    newSoldShares: number
    soldDate: string
    soldPrice: number   // agorot or cents (already converted)
    proceeds: number
  }> = [
    // ── ישראל / מדדים ──────────────────────────────────────────────────────
    // MTF ת"א 90 (1150259): lot of 388 soldShares → sell 2827 agr on 2024-06-03
    {
      ticker: '1150259', purchaseDate: '2024-01-24', shares: 388,
      newSoldShares: 388, soldDate: '2024-06-03',
      soldPrice: agr(2827), proceeds: 388 * agr(2827),
    },
    // ── ישראל / דיבידנד ────────────────────────────────────────────────────
    // אטראו שוקי הון (1096106): three separate fully-sold lots, same buy date
    {
      ticker: '1096106', purchaseDate: '2024-01-22', shares: 149,
      newSoldShares: 149, soldDate: '2024-06-03',
      soldPrice: agr(5309), proceeds: 149 * agr(5309),
    },
    {
      ticker: '1096106', purchaseDate: '2024-01-22', shares: 90,
      newSoldShares: 90,  soldDate: '2024-10-29',
      soldPrice: agr(6041), proceeds: 90 * agr(6041),
    },
    {
      ticker: '1096106', purchaseDate: '2024-01-22', shares: 24,
      newSoldShares: 24,  soldDate: '2025-02-17',
      soldPrice: agr(8039), proceeds: 24 * agr(8039),
    },
    // ── ישראל / בנקים ──────────────────────────────────────────────────────
    // פועלים (662577): lot of 20 soldShares → sell 4852 agr on 2025-02-17
    {
      ticker: '662577',  purchaseDate: '2024-01-23', shares: 20,
      newSoldShares: 20, soldDate: '2025-02-17',
      soldPrice: agr(4852), proceeds: 20 * agr(4852),
    },
    // ── ארהב / מדדים ───────────────────────────────────────────────────────
    // אינ.חוץ S&P500 (1183441): 1 share fully sold → 399800 agr on 2024-07-14
    {
      ticker: '1183441', purchaseDate: '2024-01-22', shares: 1,
      newSoldShares: 1,  soldDate: '2024-07-14',
      soldPrice: agr(399800), proceeds: 1 * agr(399800),
    },
    // ── ארהב / Big tec ─────────────────────────────────────────────────────
    // GOOGL: 6 shares sold at $137.95 on 2024-02-26
    {
      ticker: 'GOOGL',   purchaseDate: '2024-02-05', shares: 6,
      newSoldShares: 6,  soldDate: '2024-02-26',
      soldPrice: usd(137.95), proceeds: 6 * usd(137.95),
    },
    // AAPL: 6 shares sold at $230 on 2024-11-19
    {
      ticker: 'AAPL',    purchaseDate: '2024-06-20', shares: 6,
      newSoldShares: 6,  soldDate: '2024-11-19',
      soldPrice: usd(230), proceeds: 6 * usd(230),
    },
    // ── אסיה / טכנולוגיה סין ───────────────────────────────────────────────
    // BABA: 21 shares sold at $74.39 on 2024-06-20
    {
      ticker: 'BABA',    purchaseDate: '2024-02-20', shares: 21,
      newSoldShares: 21, soldDate: '2024-06-20',
      soldPrice: usd(74.39), proceeds: 21 * usd(74.39),
    },
    // ── קריפטו ─────────────────────────────────────────────────────────────
    // IBIT: two lots both sold at $55.17 on 2025-01-16
    {
      ticker: 'IBIT', purchaseDate: '2024-03-11', shares: 13,
      newSoldShares: 13, soldDate: '2025-01-16',
      soldPrice: usd(55.17), proceeds: 13 * usd(55.17),
    },
    {
      ticker: 'IBIT', purchaseDate: '2024-02-20', shares: 27,
      newSoldShares: 27, soldDate: '2025-01-16',
      soldPrice: usd(55.17), proceeds: 27 * usd(55.17),
    },
    // ── אירופה ─────────────────────────────────────────────────────────────
    // DB: 22 shares sold at $35.43 on 2025-09-30
    {
      ticker: 'DB',      purchaseDate: '2025-05-22', shares: 22,
      newSoldShares: 22, soldDate: '2025-09-30',
      soldPrice: usd(35.43), proceeds: 22 * usd(35.43),
    },
  ]

  for (const u of simpleUpdates) {
    const lots = getLots(u.ticker, u.purchaseDate, u.shares)
    if (lots.length === 0) {
      console.warn(`  ⚠ No lot found: ${u.ticker} ${u.purchaseDate} ${u.shares}sh`)
      continue
    }
    const lot = lots[0]
    const { error } = await sb.from('lots').update({
      sold_shares:          u.newSoldShares,
      sold_date:            u.soldDate,
      sold_price_per_share: u.soldPrice,
      proceeds_from_sale:   u.proceeds,
    }).eq('id', lot.id)
    if (error) throw new Error(`Update lot ${u.ticker}: ${error.message}`)
    updated++
  }
  console.log(`✓ Simple lot updates: ${updated}`)

  // ─── Case B: לאומי (604611) ───────────────────────────────────────────────
  // DB has soldShares=74 on the 166-share lot.
  // Donatello: 53sh sold at 7777 (2026-01-13) + 21sh sold at 4703 (2025-02-17)
  // Fix: clear soldShares from 166-lot; apply sales to the correct 53 and 21 lots.
  {
    const ticker = '604611'
    // Clear the incorrectly marked 74 soldShares from the 166-share lot
    const lot166 = getLots(ticker, '2024-06-03', 166)[0]
    if (!lot166) console.warn('  ⚠ לאומי 166-share lot not found')
    else {
      const { error } = await sb.from('lots').update({
        sold_shares: 0, sold_date: null, sold_price_per_share: null, proceeds_from_sale: null,
      }).eq('id', lot166.id)
      if (error) throw new Error(`Reset לאומי 166-lot: ${error.message}`)
    }

    // 53-share lot → sold 2026-01-13 at 7777 agr
    const lot53 = getLots(ticker, '2024-06-03', 53)[0]
    if (!lot53) console.warn('  ⚠ לאומי 53-share lot not found')
    else {
      const { error } = await sb.from('lots').update({
        sold_shares: 53, sold_date: '2026-01-13',
        sold_price_per_share: agr(7777), proceeds_from_sale: 53 * agr(7777),
      }).eq('id', lot53.id)
      if (error) throw new Error(`Update לאומי 53-lot: ${error.message}`)
      updated++
    }

    // 21-share lot → sold 2025-02-17 at 4703 agr
    const lot21 = getLots(ticker, '2024-06-03', 21)[0]
    if (!lot21) console.warn('  ⚠ לאומי 21-share lot not found')
    else {
      const { error } = await sb.from('lots').update({
        sold_shares: 21, sold_date: '2025-02-17',
        sold_price_per_share: agr(4703), proceeds_from_sale: 21 * agr(4703),
      }).eq('id', lot21.id)
      if (error) throw new Error(`Update לאומי 21-lot: ${error.message}`)
      updated++
    }
    console.log(`✓ לאומי restructured`)
  }

  // ─── Case B: NVDA ─────────────────────────────────────────────────────────
  // DB: lot of 10sh (soldShares=9) + lot of 7sh (active)
  // Donatello: 7sh (buy 2024-06-20 $133.92, sold $140) + 2sh (buy 2024-06-06 $120.63, sold $140)
  //            + remaining ~8sh active
  // Fix: 10sh lot → 8sh active; 7sh lot → fully sold; insert new 2sh sold lot
  {
    const ticker = 'NVDA'
    const hIds = byTicker.get(ticker) ?? []

    // Resize the 10-share lot to 8 active shares (drop soldShares)
    const lot10 = getLots(ticker, undefined, 10)[0]
    if (!lot10) console.warn('  ⚠ NVDA 10-share lot not found')
    else {
      const { error } = await sb.from('lots').update({
        shares: 8, sold_shares: 0,
        sold_date: null, sold_price_per_share: null, proceeds_from_sale: null,
      }).eq('id', lot10.id)
      if (error) throw new Error(`Resize NVDA 10-lot: ${error.message}`)
    }

    // 7-share lot → fully sold at $140 on 2024-11-19
    const lot7 = getLots(ticker, '2024-06-20', 7)[0]
    if (!lot7) console.warn('  ⚠ NVDA 7-share lot not found')
    else {
      const { error } = await sb.from('lots').update({
        sold_shares: 7, sold_date: '2024-11-19',
        sold_price_per_share: usd(140), proceeds_from_sale: 7 * usd(140),
      }).eq('id', lot7.id)
      if (error) throw new Error(`Update NVDA 7-lot: ${error.message}`)
      updated++
    }

    // Insert new lot: 2sh, buy 2024-06-06, cost $120.63, fully sold $140 on 2024-11-19
    const { error: insErr } = await sb.from('lots').insert({
      id: randomUUID(), created_at: NOW,
      holding_id:          hIds[0],
      purchase_date:       '2024-06-06',
      shares:              2,
      cost_per_share:      usd(120.63),
      cost_currency:       'USD',
      sold_shares:         2,
      sold_date:           '2024-11-19',
      sold_price_per_share: usd(140),
      proceeds_from_sale:  2 * usd(140),
      account_type:        'השתלמות',
    })
    if (insErr) throw new Error(`Insert NVDA 2-lot: ${insErr.message}`)
    inserted++
    console.log(`✓ NVDA restructured`)
  }

  // ─── Case B: אשס.חוץ MS ACWI (1159235) ───────────────────────────────────
  // DB: lot of 53sh (soldShares=52, buy 2024-01-22) + lots of 24sh/9sh/19sh (active)
  // Donatello: 24sh sold 2024-12-12 at 32820 agr | 9sh sold 2024-03-11 at 28820
  //            | 19sh sold 2024-05-06 at 30340 | 53sh remain active
  // Fix: clear soldShares from 53-lot; apply sales to the 24, 9, 19 lots
  {
    const ticker = '1159235'

    // Clear soldShares=52 from the 53-share lot (these 53 are now all ACTIVE)
    const lot53 = getLots(ticker, '2024-01-22', 53)[0]
    if (!lot53) console.warn('  ⚠ ACWI 53-share lot not found')
    else {
      const { error } = await sb.from('lots').update({
        sold_shares: 0, sold_date: null, sold_price_per_share: null, proceeds_from_sale: null,
      }).eq('id', lot53.id)
      if (error) throw new Error(`Reset ACWI 53-lot: ${error.message}`)
    }

    // 24-share lot (buy 2024-01-22) → sold 2024-12-12 at 32820 agr
    const lot24 = getLots(ticker, '2024-01-22', 24)[0]
    if (!lot24) console.warn('  ⚠ ACWI 24-share lot not found')
    else {
      const { error } = await sb.from('lots').update({
        sold_shares: 24, sold_date: '2024-12-12',
        sold_price_per_share: agr(32820), proceeds_from_sale: 24 * agr(32820),
      }).eq('id', lot24.id)
      if (error) throw new Error(`Update ACWI 24-lot: ${error.message}`)
      updated++
    }

    // 9-share lot (buy 2024-03-11) → sold 2024-03-11 at 28820 agr
    const lot9 = getLots(ticker, '2024-03-11', 9)[0]
    if (!lot9) console.warn('  ⚠ ACWI 9-share lot not found')
    else {
      const { error } = await sb.from('lots').update({
        sold_shares: 9, sold_date: '2024-03-11',
        sold_price_per_share: agr(28820), proceeds_from_sale: 9 * agr(28820),
      }).eq('id', lot9.id)
      if (error) throw new Error(`Update ACWI 9-lot: ${error.message}`)
      updated++
    }

    // 19-share lot (buy 2024-05-06) → sold 2024-05-06 at 30340 agr
    const lot19 = getLots(ticker, '2024-05-06', 19)[0]
    if (!lot19) console.warn('  ⚠ ACWI 19-share lot not found')
    else {
      const { error } = await sb.from('lots').update({
        sold_shares: 19, sold_date: '2024-05-06',
        sold_price_per_share: agr(30340), proceeds_from_sale: 19 * agr(30340),
      }).eq('id', lot19.id)
      if (error) throw new Error(`Update ACWI 19-lot: ${error.message}`)
      updated++
    }
    console.log(`✓ MS ACWI restructured`)
  }

  console.log(`\n🎉 Done! Updated ${updated} lots, inserted ${inserted} new lot`)
  console.log('   All sold_price_per_share, sold_date and proceeds_from_sale are now set.')
}

main().catch(err => { console.error('❌ Failed:', err.message); process.exit(1) })
