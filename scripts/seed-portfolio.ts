/**
 * seed-portfolio.ts
 * Seeds the "השתלמות" portfolio from scraped Donatello data.
 *
 * Uses the Supabase JS client (HTTPS/REST) — no direct DB connection needed.
 *
 * Run:
 *   npx tsx scripts/seed-portfolio.ts
 */

import { createClient } from '@supabase/supabase-js'
import { randomUUID } from 'crypto'
import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'

// ─── Bootstrap ────────────────────────────────────────────────────────────────

const __dirname = path.dirname(fileURLToPath(import.meta.url))

function loadEnvFile(filePath: string) {
  if (!fs.existsSync(filePath)) return
  const lines = fs.readFileSync(filePath, 'utf-8').split('\n')
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eqIdx = trimmed.indexOf('=')
    if (eqIdx < 0) continue
    const key = trimmed.slice(0, eqIdx).trim()
    const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '')
    if (!process.env[key]) process.env[key] = val
  }
}
loadEnvFile(path.join(__dirname, '..', '.env.local'))

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY!
const USER_EMAIL   = 'avnamer@gmail.com'

if (!SUPABASE_URL || !SERVICE_KEY) throw new Error('Missing Supabase env vars')

// Service-role client bypasses RLS — gives full DB access
const sb = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** TASE: price already in agorot (integer), store as-is */
const agr = (n: number) => Math.round(n)

/** USD: dollars → cents */
const usd = (n: number) => Math.round(n * 100)

const NOW = new Date().toISOString()

// Tables that have updated_at (Prisma @updatedAt fields)
const TABLES_WITH_UPDATED_AT = new Set(['portfolios', 'cash_accounts'])

/** Insert a row and return its id */
async function insert<T extends { id: string }>(table: string, data: Record<string, unknown>): Promise<T> {
  const base: Record<string, unknown> = { id: randomUUID(), created_at: NOW, ...data }
  if (TABLES_WITH_UPDATED_AT.has(table)) base.updated_at = NOW
  const { data: row, error } = await sb.from(table).insert(base).select('*').single()
  if (error) throw new Error(`Insert ${table}: ${error.message} — ${JSON.stringify(data).slice(0, 200)}`)
  return row as T
}

/** Insert many rows at once */
async function insertMany(table: string, rows: Record<string, unknown>[]): Promise<void> {
  if (rows.length === 0) return
  const rowsWithIds = rows.map(r => {
    const base: Record<string, unknown> = { id: randomUUID(), created_at: NOW, ...r }
    if (TABLES_WITH_UPDATED_AT.has(table)) base.updated_at = NOW
    return base
  })
  const { error } = await sb.from(table).insert(rowsWithIds)
  if (error) throw new Error(`InsertMany ${table}: ${error.message}`)
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  // 1. Resolve user ID
  const { data: { users }, error: uErr } = await sb.auth.admin.listUsers({ perPage: 1000 })
  if (uErr) throw uErr
  const user = users.find(u => u.email === USER_EMAIL)
  if (!user) throw new Error(`User ${USER_EMAIL} not found`)
  const userId = user.id
  console.log(`✓ User: ${USER_EMAIL} → ${userId}`)

  // 2. Guard against double-seeding
  const { data: existing } = await sb.from('portfolios').select('id').eq('user_id', userId).eq('name', 'השתלמות').maybeSingle()
  if (existing) {
    console.log('⚠️  Portfolio "השתלמות" already exists — skipping. Delete it first to re-seed.')
    return
  }

  // 3. Portfolio
  const portfolio = await insert<{ id: string }>('portfolios', {
    user_id: userId, name: 'השתלמות', base_currency: 'ILS',
  })
  const pid = portfolio.id
  console.log(`✓ Portfolio: ${pid}`)

  // ─── 4. Root Folders ──────────────────────────────────────────────────────

  const rootFolders = await Promise.all([
    insert<{ id: string }>('folders', { portfolio_id: pid, name: 'ישראל',            color: '#3b82f6', sort_order: 0 }),
    insert<{ id: string }>('folders', { portfolio_id: pid, name: 'ארהב',             color: '#8b5cf6', sort_order: 1 }),
    insert<{ id: string }>('folders', { portfolio_id: pid, name: 'אסיה',             color: '#f59e0b', sort_order: 2 }),
    insert<{ id: string }>('folders', { portfolio_id: pid, name: 'אנרגיות מתחדשות', color: '#10b981', sort_order: 3 }),
    insert<{ id: string }>('folders', { portfolio_id: pid, name: 'מדד עולמי',        color: '#06b6d4', sort_order: 4 }),
    insert<{ id: string }>('folders', { portfolio_id: pid, name: 'פיינטק',           color: '#ec4899', sort_order: 5 }),
    insert<{ id: string }>('folders', { portfolio_id: pid, name: 'קריפטו',           color: '#f97316', sort_order: 6 }),
    insert<{ id: string }>('folders', { portfolio_id: pid, name: 'שווקים מתפתחים',  color: '#84cc16', sort_order: 7 }),
    insert<{ id: string }>('folders', { portfolio_id: pid, name: 'רכישות חדשות',    color: '#6b7280', sort_order: 8 }),
    insert<{ id: string }>('folders', { portfolio_id: pid, name: 'אירופה',           color: '#a78bfa', sort_order: 9 }),
    insert<{ id: string }>('folders', { portfolio_id: pid, name: 'Archive',          color: '#9ca3af', sort_order: 10 }),
  ])
  const [fIsrael, fUS, fAsia, fEnergy, fGlobal, fFintech, fCrypto, fEmerging, fNew, fEurope] = rootFolders
  console.log('✓ Root folders')

  // ─── 5. Sub-folders ───────────────────────────────────────────────────────

  // ישראל
  const [fILMadad, fILDiv, fILBank, fILAgach] = await Promise.all([
    insert<{ id: string }>('folders', { portfolio_id: pid, parent_id: fIsrael.id, name: 'מדדים',   sort_order: 0 }),
    insert<{ id: string }>('folders', { portfolio_id: pid, parent_id: fIsrael.id, name: 'דיבידנד', sort_order: 1 }),
    insert<{ id: string }>('folders', { portfolio_id: pid, parent_id: fIsrael.id, name: 'בנקים',   sort_order: 2 }),
    insert<{ id: string }>('folders', { portfolio_id: pid, parent_id: fIsrael.id, name: 'אג"ח',    sort_order: 3 }),
  ])
  await insert<{ id: string }>('folders', { portfolio_id: pid, parent_id: fIsrael.id, name: 'בטחוניות', sort_order: 4 })

  // ארהב
  const [fUSMadad, fUSFin, fUSBig, fUSReit] = await Promise.all([
    insert<{ id: string }>('folders', { portfolio_id: pid, parent_id: fUS.id, name: 'מדדים',          sort_order: 0 }),
    insert<{ id: string }>('folders', { portfolio_id: pid, parent_id: fUS.id, name: 'פיננסים',         sort_order: 1 }),
    insert<{ id: string }>('folders', { portfolio_id: pid, parent_id: fUS.id, name: 'Big tec',         sort_order: 2 }),
    insert<{ id: string }>('folders', { portfolio_id: pid, parent_id: fUS.id, name: 'Reit & Dividend', sort_order: 3 }),
  ])

  // אסיה
  const [fChina, fIndia] = await Promise.all([
    insert<{ id: string }>('folders', { portfolio_id: pid, parent_id: fAsia.id, name: 'טכנולוגיה סין', sort_order: 0 }),
    insert<{ id: string }>('folders', { portfolio_id: pid, parent_id: fAsia.id, name: 'הודו',           sort_order: 1 }),
  ])
  console.log('✓ Sub-folders')

  // ─── 6. Holdings helper ────────────────────────────────────────────────────

  type LotSpec = {
    date: string          // YYYY-MM-DD
    shares: number
    cost: number          // agorot (ILS) or cents (USD)
    currency: 'ILS' | 'USD'
    soldShares?: number
  }

  async function addHolding(
    folderId: string,
    ticker: string,
    exchange: string,
    name: string,
    lots: LotSpec[],
    expenseRatio?: number
  ) {
    const h = await insert<{ id: string }>('holdings', {
      folder_id:    folderId,
      ticker_symbol: ticker,
      exchange,
      name,
      expense_ratio: expenseRatio ?? null,
    })
    await insertMany('lots', lots.map(l => ({
      holding_id:    h.id,
      purchase_date: l.date,
      shares:        l.shares,
      cost_per_share: l.cost,
      cost_currency: l.currency,
      sold_shares:   l.soldShares ?? 0,
      account_type:  'השתלמות',
    })))
  }

  // ─── 7. ישראל / מדדים ─────────────────────────────────────────────────────

  await addHolding(fILMadad.id, '1150259', 'TASE', 'MTF סל (4A) ת"א 90', [
    { date: '2024-01-24', shares: 695,  cost: agr(2769),   currency: 'ILS' },
    { date: '2024-01-24', shares: 388,  cost: agr(2769),   currency: 'ILS', soldShares: 388 },
  ], 0.0061)

  await addHolding(fILMadad.id, '5118997', 'TASE', 'MTF מחקה (4A) ת"א SME60', [
    { date: '2024-06-03', shares: 8280, cost: agr(108.69), currency: 'ILS' },
    { date: '2025-01-16', shares: 1347, cost: agr(153),    currency: 'ILS' },
  ], 0.0053)

  await addHolding(fILMadad.id, '1194380', 'TASE', 'מור סל (4A) ת"א-35', [
    { date: '2024-06-03', shares: 157, cost: agr(5727), currency: 'ILS' },
  ], 0.0022)

  console.log('✓ ישראל/מדדים')

  // ─── 8. ישראל / דיבידנד ───────────────────────────────────────────────────

  await addHolding(fILDiv.id, '1175934', 'TASE', 'קיסטון אינפרא', [
    { date: '2024-10-29', shares: 965, cost: agr(559.4), currency: 'ILS' },
    { date: '2024-12-12', shares: 582, cost: agr(618.3), currency: 'ILS' },
  ])

  await addHolding(fILDiv.id, '1096106', 'TASE', 'אטראו שוקי הון', [
    { date: '2024-01-22', shares: 149, cost: agr(5226), currency: 'ILS', soldShares: 149 },
    { date: '2024-01-22', shares: 90,  cost: agr(5226), currency: 'ILS', soldShares: 90  },
    { date: '2024-01-22', shares: 24,  cost: agr(5226), currency: 'ILS', soldShares: 24  },
    { date: '2024-01-22', shares: 119, cost: agr(5226), currency: 'ILS' },
    { date: '2024-06-23', shares: 42,  cost: agr(4687), currency: 'ILS' },
  ])

  await addHolding(fILDiv.id, '230011', 'TASE', 'בזק', [
    { date: '2024-04-18', shares: 110, cost: agr(447.5), currency: 'ILS' },
  ])

  console.log('✓ ישראל/דיבידנד')

  // ─── 9. ישראל / בנקים ─────────────────────────────────────────────────────

  // לאומי: 310 bought, 74 sold (FIFO from first lot)
  await addHolding(fILBank.id, '604611', 'TASE', 'לאומי', [
    { date: '2024-06-03', shares: 166, cost: agr(3104), currency: 'ILS', soldShares: 74 },
    { date: '2024-06-03', shares: 53,  cost: agr(3104), currency: 'ILS' },
    { date: '2024-06-03', shares: 21,  cost: agr(3104), currency: 'ILS' },
    { date: '2024-12-12', shares: 70,  cost: agr(4285), currency: 'ILS' },
  ])

  // פועלים: 297 bought, 20 sold (second lot fully sold)
  await addHolding(fILBank.id, '662577', 'TASE', 'פועלים', [
    { date: '2024-01-23', shares: 208, cost: agr(3064), currency: 'ILS' },
    { date: '2024-01-23', shares: 20,  cost: agr(3064), currency: 'ILS', soldShares: 20 },
    { date: '2024-12-12', shares: 69,  cost: agr(4305), currency: 'ILS' },
  ])

  console.log('✓ ישראל/בנקים')

  // ─── 10. ישראל / אג"ח ─────────────────────────────────────────────────────

  await addHolding(fILAgach.id, '1380104', 'TASE', 'ארזים אגח 4', [
    { date: '2024-01-25', shares: 2830, cost: agr(106), currency: 'ILS' },
  ], 0)

  console.log('✓ ישראל/אג"ח')

  // ─── 11. ארהב / מדדים (flattened from 3-level sub-sub-folders) ─────────────

  await addHolding(fUSMadad.id, '5123179', 'TASE', 'תכלית NASDAQ 100 (4A) TTF מנוטרלת מט"ח', [
    { date: '2024-05-09', shares: 166, cost: agr(359.88), currency: 'ILS' },
    { date: '2024-06-03', shares: 227, cost: agr(370.44), currency: 'ILS' },
    { date: '2024-06-17', shares: 237, cost: agr(395.02), currency: 'ILS' },
    { date: '2024-06-20', shares: 582, cost: agr(395.11), currency: 'ILS' },
    { date: '2025-03-17', shares: 450, cost: agr(388.57), currency: 'ILS' },
    { date: '2025-04-16', shares: 214, cost: agr(355.85), currency: 'ILS' },
  ], 0.0003)

  await addHolding(fUSMadad.id, '5122627', 'TASE', 'MTF מחקה (S&P 500 (4D', [
    { date: '2024-05-09', shares: 221, cost: agr(270.3),  currency: 'ILS' },
    { date: '2024-06-17', shares: 318, cost: agr(282.91), currency: 'ILS' },
    { date: '2024-06-20', shares: 802, cost: agr(286.47), currency: 'ILS' },
  ], 0.0003)

  await addHolding(fUSMadad.id, '5124284', 'TASE', 'IBI מחקה (4D) Russell 2000', [
    { date: '2024-04-04', shares: 244, cost: agr(157.35), currency: 'ILS' },
    { date: '2024-05-09', shares: 379, cost: agr(156.88), currency: 'ILS' },
    { date: '2024-08-22', shares: 358, cost: agr(164.87), currency: 'ILS' },
    { date: '2024-09-16', shares: 549, cost: agr(163.83), currency: 'ILS' },
    { date: '2024-11-12', shares: 328, cost: agr(188.8),  currency: 'ILS' },
  ], 0.0043)

  // אינ.חוץ S&P500: 2 bought, 1 sold
  await addHolding(fUSMadad.id, '1183441', 'TASE', 'אינ.חוץ S&P500', [
    { date: '2024-01-22', shares: 1, cost: agr(356400), currency: 'ILS' },
    { date: '2024-01-22', shares: 1, cost: agr(356400), currency: 'ILS', soldShares: 1 },
  ], 0.0005)

  console.log('✓ ארהב/מדדים')

  // ─── 12. ארהב / פיננסים ────────────────────────────────────────────────────

  await addHolding(fUSFin.id, 'ETOR', 'NASDAQ', 'eToro Group Ltd. Class A Common Shares', [
    { date: '2026-01-14', shares: 56, cost: usd(31.28), currency: 'USD' },
  ])

  await addHolding(fUSFin.id, 'PYPL', 'NASDAQ', 'PayPal Holdings, Inc. Common Stock', [
    { date: '2026-01-07', shares: 17, cost: usd(58.83), currency: 'USD' },
  ])

  console.log('✓ ארהב/פיננסים')

  // ─── 13. ארהב / Big tec ────────────────────────────────────────────────────

  // GOOGL: 7.88 active + 6 sold
  await addHolding(fUSBig.id, 'GOOGL', 'NASDAQ', 'Alphabet Inc. Class A Common Stock', [
    { date: '2024-02-05', shares: 6,    cost: usd(143.63), currency: 'USD', soldShares: 6 },
    { date: '2024-11-19', shares: 7.88, cost: usd(177.42), currency: 'USD' },
  ])

  await addHolding(fUSBig.id, 'AMZN', 'NASDAQ', 'Amazon.Com Inc', [
    { date: '2024-11-11', shares: 6.5,  cost: usd(199.13), currency: 'USD' },
    { date: '2025-11-11', shares: 4.03, cost: usd(248),    currency: 'USD' },
  ])

  // AAPL: 6 active + 6 sold
  await addHolding(fUSBig.id, 'AAPL', 'NASDAQ', 'Apple Inc.', [
    { date: '2024-02-15', shares: 5, cost: usd(181.87), currency: 'USD' },
    { date: '2024-06-20', shares: 1, cost: usd(210.01), currency: 'USD' },
    { date: '2024-06-20', shares: 6, cost: usd(210.01), currency: 'USD', soldShares: 6 },
  ])

  // NVDA: 8 active + 9 sold (combined same-date lots)
  await addHolding(fUSBig.id, 'NVDA', 'NASDAQ', 'Nvidia Corp', [
    { date: '2024-06-07', shares: 10, cost: usd(120.63), currency: 'USD', soldShares: 9 },
    { date: '2024-06-20', shares: 7,  cost: usd(133.92), currency: 'USD' },
  ])

  await addHolding(fUSBig.id, 'QCOM', 'NASDAQ', 'Qualcomm Inc', [
    { date: '2025-10-03', shares: 6.19, cost: usd(169.7), currency: 'USD' },
  ])

  await addHolding(fUSBig.id, 'RIVN', 'NASDAQ', 'Rivian Automotive, Inc.', [
    { date: '2024-01-24', shares: 49, cost: usd(16.04), currency: 'USD' },
  ])

  console.log('✓ ארהב/Big tec')

  // ─── 14. ארהב / Reit & Dividend ────────────────────────────────────────────

  await addHolding(fUSReit.id, 'VICI', 'NYSE', 'VICI Properties Inc. Common Stock', [
    { date: '2024-07-04', shares: 22, cost: usd(33.84), currency: 'USD' },
  ])

  console.log('✓ ארהב/Reit & Dividend')

  // ─── 15. אסיה / טכנולוגיה סין ─────────────────────────────────────────────

  await addHolding(fChina.id, '5132923', 'TASE', 'תכלית TTF (4D) אינדקס ביג טק 30 סין', [
    { date: '2025-04-15', shares: 1853, cost: agr(46.75), currency: 'ILS' },
    { date: '2025-06-11', shares: 3667, cost: agr(52.6),  currency: 'ILS' },
    { date: '2025-07-14', shares: 3646, cost: agr(53.63), currency: 'ILS' },
    { date: '2025-08-19', shares: 3198, cost: agr(56.65), currency: 'ILS' },
    { date: '2025-09-16', shares: 3333, cost: agr(65.45), currency: 'ILS' },
  ], 0.0083)

  // BABA: 17 active + 21 sold
  await addHolding(fChina.id, 'BABA', 'NYSE', 'Alibaba Group Holding', [
    { date: '2024-02-20', shares: 21, cost: usd(72.77), currency: 'USD', soldShares: 21 },
    { date: '2025-01-16', shares: 17, cost: usd(82.35), currency: 'USD' },
  ])

  console.log('✓ אסיה')

  // ─── 16. אנרגיות מתחדשות ──────────────────────────────────────────────────

  await addHolding(fEnergy.id, '1166768', 'TASE', 'דוראל אנרגיה', [
    { date: '2024-05-06', shares: 241, cost: agr(1038), currency: 'ILS' },
  ])

  await addHolding(fEnergy.id, '720011', 'TASE', 'אנלייט אנרגיה', [
    { date: '2024-04-16', shares: 9,  cost: agr(6121), currency: 'ILS' },
    { date: '2024-05-06', shares: 29, cost: agr(6522), currency: 'ILS' },
    { date: '2024-08-14', shares: 10, cost: agr(6019), currency: 'ILS' },
  ])

  await addHolding(fEnergy.id, '1134402', 'TASE', 'אורמת טכנו', [
    { date: '2024-04-18', shares: 3, cost: agr(22750), currency: 'ILS' },
    { date: '2024-04-30', shares: 2, cost: agr(24660), currency: 'ILS' },
    { date: '2024-05-06', shares: 5, cost: agr(25190), currency: 'ILS' },
    { date: '2024-08-14', shares: 3, cost: agr(26890), currency: 'ILS' },
  ])

  await addHolding(fEnergy.id, 'SEDG', 'NASDAQ', 'SolarEdge Technologies, Inc.', [
    { date: '2024-01-24', shares: 9,  cost: usd(71.84), currency: 'USD' },
    { date: '2024-07-18', shares: 27, cost: usd(28.11), currency: 'USD' },
  ])

  await addHolding(fEnergy.id, 'ENPH', 'NASDAQ', 'Enphase Energy, Inc.', [
    { date: '2024-01-24', shares: 6,     cost: usd(111.3), currency: 'USD' },
    { date: '2026-01-06', shares: 17.03, cost: usd(35.23), currency: 'USD' },
  ])

  console.log('✓ אנרגיות מתחדשות')

  // ─── 17. מדד עולמי ─────────────────────────────────────────────────────────

  // 115 bought, 52 sold (FIFO from first 53-lot)
  await addHolding(fGlobal.id, '1159235', 'TASE', 'אשס.חוץ MS ACWI', [
    { date: '2024-01-22', shares: 53, cost: agr(28520), currency: 'ILS', soldShares: 52 },
    { date: '2024-01-22', shares: 24, cost: agr(28520), currency: 'ILS' },
    { date: '2024-03-11', shares: 9,  cost: agr(28520), currency: 'ILS' },
    { date: '2024-05-06', shares: 19, cost: agr(28520), currency: 'ILS' },
    { date: '2024-07-01', shares: 5,  cost: agr(31720), currency: 'ILS' },
    { date: '2024-10-14', shares: 5,  cost: agr(33840), currency: 'ILS' },
  ], 0.002)

  console.log('✓ מדד עולמי')

  // ─── 18. פיינטק ────────────────────────────────────────────────────────────

  await addHolding(fFintech.id, 'NYAX', 'NASDAQ', 'Nayax Ltd. Ordinary Shares', [
    { date: '2024-12-25', shares: 36, cost: usd(27.86), currency: 'USD' },
  ])

  await addHolding(fFintech.id, 'ETOR', 'NASDAQ', 'eToro Group Ltd. Class A Common Shares', [
    { date: '2026-01-14', shares: 56, cost: usd(31.28), currency: 'USD' },
  ])

  console.log('✓ פיינטק')

  // ─── 19. קריפטו ────────────────────────────────────────────────────────────

  // IBIT: 67 bought, 40 sold (FIFO)
  await addHolding(fCrypto.id, 'IBIT', 'NASDAQ', 'iShares Bitcoin Trust ETF', [
    { date: '2024-02-20', shares: 27, cost: usd(29.85), currency: 'USD', soldShares: 27 },
    { date: '2024-03-11', shares: 13, cost: usd(41.52), currency: 'USD', soldShares: 13 },
    { date: '2024-03-11', shares: 13, cost: usd(41.52), currency: 'USD' },
    { date: '2024-12-16', shares: 14, cost: usd(60.9),  currency: 'USD' },
  ], 0.047)

  console.log('✓ קריפטו')

  // ─── 20. שווקים מתפתחים ────────────────────────────────────────────────────

  await addHolding(fEmerging.id, '1150275', 'TASE', 'MTF סל (MSCI Emerging Markets (4D', [
    { date: '2024-11-12', shares: 15, cost: agr(3869), currency: 'ILS' },
  ], 0.0038)

  console.log('✓ שווקים מתפתחים')

  // ─── 21. רכישות חדשות ──────────────────────────────────────────────────────

  await addHolding(fNew.id, '273011', 'TASE', 'נייס', [
    { date: '2024-03-04', shares: 0.01, cost: agr(88110), currency: 'ILS' },
  ])

  await addHolding(fNew.id, '1172527', 'TASE', 'רייזור', [
    { date: '2024-03-04', shares: 0.01, cost: agr(426.6), currency: 'ILS' },
  ])

  console.log('✓ רכישות חדשות')

  // ─── 22. אירופה ────────────────────────────────────────────────────────────

  await addHolding(fEurope.id, '5125158', 'TASE', 'קסם DAX (4A) KTF מנוטרלת מט"ח', [
    { date: '2025-05-12', shares: 976, cost: agr(179.28), currency: 'ILS' },
  ], 0.0028)

  // DB: 100 bought, 22 sold
  await addHolding(fEurope.id, 'DB', 'NYSE', 'Deutsche Bank Aktiengesellschaft', [
    { date: '2025-05-06', shares: 48, cost: usd(26.81), currency: 'USD' },
    { date: '2025-05-22', shares: 30, cost: usd(28.61), currency: 'USD' },
    { date: '2025-05-22', shares: 22, cost: usd(28.61), currency: 'USD', soldShares: 22 },
  ])

  console.log('✓ אירופה')

  // ─── Done ─────────────────────────────────────────────────────────────────

  const { count: hCount } = await sb.from('holdings')
    .select('*', { count: 'exact', head: true })
    .in('folder_id', rootFolders.map(f => f.id))
  console.log(`\n🎉 Done! Seeded portfolio "השתלמות" with ~${hCount} holdings`)
}

main().catch(e => { console.error('❌ Seed failed:', e.message ?? e); process.exit(1) })
