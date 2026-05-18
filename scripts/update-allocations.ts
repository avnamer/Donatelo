/**
 * update-allocations.ts
 * Imports target allocation percentages from Donatello into the new app DB.
 *
 * Sources:
 *  - Root folder %: from Donatello's /allocations page (% of total portfolio)
 *  - Sub-folder %:  from Donatello's folder store  (% within parent → converted to % of total)
 *  - Holding %:     relative weight within its folder (used by auto-invest)
 *
 * Run:  npx tsx scripts/update-allocations.ts
 */

import { createClient } from '@supabase/supabase-js'
import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'

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

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

const USER_ID = '9c7b80d3-9d53-4b41-9e93-8433e377804d'

// ─── Allocation data scraped from Donatello ──────────────────────────────────

/**
 * Root folder target allocations — % of TOTAL portfolio.
 * Source: Donatello /allocations page
 */
const ROOT_FOLDER_TARGETS: Record<string, number> = {
  'ישראל':             28,
  'ארהב':              31,
  'אנרגיות מתחדשות':  6,
  'מדד עולמי':         5,
  'אסיה':              9,
  'פיינטק':            6,
  'אירופה':            8,
  'קריפטו':            3,
  'שווקים מתפתחים':   4,
  'רכישות חדשות':     0,
  'Archive':           0,
}

/**
 * Sub-folder target allocations.
 * Donatello stores these as % within the parent folder.
 * We convert to % of TOTAL: subPct × parentPct / 100
 * so the auto-invest algorithm works correctly.
 */
const SUB_FOLDER_TARGETS: Array<{ parent: string; name: string; pctWithinParent: number }> = [
  // ישראל (28% of total)
  { parent: 'ישראל', name: 'מדדים',          pctWithinParent: 50 }, // → 14%
  { parent: 'ישראל', name: 'דיבידנד',        pctWithinParent: 25 }, // → 7%
  { parent: 'ישראל', name: 'בנקים',          pctWithinParent: 20 }, // → 5.6%
  { parent: 'ישראל', name: 'אג"ח',           pctWithinParent:  5 }, // → 1.4%
  // ארהב (31% of total)
  { parent: 'ארהב',  name: 'מדדים',          pctWithinParent: 60 }, // → 18.6%
  { parent: 'ארהב',  name: 'Big tec',        pctWithinParent: 30 }, // → 9.3%
  { parent: 'ארהב',  name: 'Reit & Dividend',pctWithinParent: 10 }, // → 3.1%
  // אסיה (9% of total)
  { parent: 'אסיה',  name: 'טכנולוגיה סין', pctWithinParent: 50 }, // → 4.5%
  { parent: 'אסיה',  name: 'הודו',           pctWithinParent: 50 }, // → 4.5%
]

/**
 * Per-holding target allocations — relative weight within the folder.
 * Used by auto-invest to split the folder's budget across its holdings.
 * Source: Donatello's heldSecurities Vuex store.
 *
 * Format: [tickerSymbol, targetPct]
 * Note: ETOR appears twice — 25% in פיינטק, none in ארהב/פיננסים.
 *       We set it only for the פיינטק instance.
 */
const HOLDING_TARGETS: Array<{ ticker: string; folderName: string; pct: number }> = [
  // ישראל / מדדים
  { ticker: '1150259', folderName: 'מדדים',          pct: 60 },  // MTF ת"א 90
  { ticker: '5118997', folderName: 'מדדים',          pct: 20 },  // MTF SME60
  { ticker: '1194380', folderName: 'מדדים',          pct: 20 },  // מור סל ת"א-35

  // ישראל / דיבידנד
  { ticker: '230011',  folderName: 'דיבידנד',        pct: 10 },  // בזק

  // ארהב / מדדים
  { ticker: '5124284', folderName: 'מדדים',          pct: 10 },  // IBI Russell 2000
  { ticker: '5123179', folderName: 'מדדים',          pct: 50 },  // תכלית NASDAQ 100 (was 100% within nasdaq sub-sub)

  // ארהב / Big tec
  { ticker: 'GOOGL',   folderName: 'Big tec',        pct: 18 },
  { ticker: 'AMZN',    folderName: 'Big tec',        pct: 18 },
  { ticker: 'AAPL',    folderName: 'Big tec',        pct: 18 },
  { ticker: 'NVDA',    folderName: 'Big tec',        pct: 18 },
  { ticker: 'RIVN',    folderName: 'Big tec',        pct: 10 },

  // ארהב / Reit & Dividend
  { ticker: 'VICI',    folderName: 'Reit & Dividend', pct: 100 },

  // אנרגיות מתחדשות
  { ticker: 'ENPH',    folderName: 'אנרגיות מתחדשות', pct: 19 },
  { ticker: 'SEDG',    folderName: 'אנרגיות מתחדשות', pct: 19 },
  { ticker: '720011',  folderName: 'אנרגיות מתחדשות', pct: 19 },  // אנלייט
  { ticker: '1166768', folderName: 'אנרגיות מתחדשות', pct: 19 },  // דוראל
  { ticker: '1134402', folderName: 'אנרגיות מתחדשות', pct: 24 },  // אורמת

  // אסיה / טכנולוגיה סין
  { ticker: '5132923', folderName: 'טכנולוגיה סין',  pct: 50 },  // תכלית Big Tech China
  { ticker: 'BABA',    folderName: 'טכנולוגיה סין',  pct: 14 },

  // פיינטק
  { ticker: 'NYAX',    folderName: 'פיינטק',          pct: 25 },
  { ticker: 'ETOR',    folderName: 'פיינטק',          pct: 25 },  // only the פיינטק ETOR

  // שווקים מתפתחים
  { ticker: '1150275', folderName: 'שווקים מתפתחים', pct: 100 }, // MTF MSCI EM

  // קריפטו
  { ticker: 'IBIT',    folderName: 'קריפטו',          pct: 100 },

  // רכישות חדשות
  { ticker: '273011',  folderName: 'רכישות חדשות',   pct: 99 },  // נייס
  { ticker: '1172527', folderName: 'רכישות חדשות',   pct:  1 },  // רייזור
]

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  // 0. Find our portfolio
  const { data: port, error: pErr } = await sb
    .from('portfolios').select('id').eq('user_id', USER_ID).eq('name', 'השתלמות').single()
  if (pErr || !port) throw new Error('Portfolio not found: ' + pErr?.message)
  const pid = port.id
  console.log(`✓ Portfolio: ${pid}`)

  // 1. Load all folders for this portfolio
  const { data: folders, error: fErr } = await sb
    .from('folders').select('id, name, parent_id').eq('portfolio_id', pid)
  if (fErr || !folders) throw new Error('Could not load folders: ' + fErr?.message)

  // Build lookup maps
  const rootFolderMap = new Map<string, string>() // name → id  (no parent)
  const subFolderMap  = new Map<string, string>() // "parent/name" → id

  for (const f of folders) {
    if (!f.parent_id) {
      rootFolderMap.set(f.name, f.id)
    } else {
      const parent = folders.find(p => p.id === f.parent_id)
      if (parent) subFolderMap.set(`${parent.name}/${f.name}`, f.id)
    }
  }

  // 2. Update root folder targets
  let updated = 0
  for (const [name, pct] of Object.entries(ROOT_FOLDER_TARGETS)) {
    const id = rootFolderMap.get(name)
    if (!id) { console.warn(`  ⚠ Root folder not found: ${name}`); continue }
    const { error } = await sb.from('folders').update({ target_allocation_pct: pct }).eq('id', id)
    if (error) throw new Error(`Update folder ${name}: ${error.message}`)
    updated++
  }
  console.log(`✓ Root folders updated: ${updated}`)

  // 3. Update sub-folder targets (convert % within parent → % of total)
  updated = 0
  for (const sf of SUB_FOLDER_TARGETS) {
    const key = `${sf.parent}/${sf.name}`
    const id  = subFolderMap.get(key)
    if (!id) { console.warn(`  ⚠ Sub-folder not found: ${key}`); continue }

    const parentPct = ROOT_FOLDER_TARGETS[sf.parent] ?? 0
    const pctOfTotal = parseFloat((sf.pctWithinParent * parentPct / 100).toFixed(2))

    const { error } = await sb.from('folders').update({ target_allocation_pct: pctOfTotal }).eq('id', id)
    if (error) throw new Error(`Update sub-folder ${key}: ${error.message}`)
    updated++
  }
  console.log(`✓ Sub-folders updated: ${updated}`)

  // 4. Load all holdings for this portfolio (via folder join)
  const folderIds = folders.map(f => f.id)
  const { data: holdings, error: hErr } = await sb
    .from('holdings').select('id, ticker_symbol, folder_id').in('folder_id', folderIds)
  if (hErr || !holdings) throw new Error('Could not load holdings: ' + hErr?.message)

  // Build: ticker → [ {holdingId, folderName} ]  (one ticker can appear in multiple folders)
  const holdingsByTicker = new Map<string, Array<{ id: string; folderName: string }>>()
  for (const h of holdings) {
    const folder = folders.find(f => f.id === h.folder_id)
    if (!folder) continue
    const folderName = folder.parent_id
      ? folders.find(p => p.id === folder.parent_id)?.name + '/' + folder.name
      : folder.name

    if (!holdingsByTicker.has(h.ticker_symbol)) holdingsByTicker.set(h.ticker_symbol, [])
    holdingsByTicker.get(h.ticker_symbol)!.push({ id: h.id, folderName: folder.name })
  }

  // 5. Update holdings
  updated = 0
  let skipped = 0
  for (const { ticker, folderName, pct } of HOLDING_TARGETS) {
    const entries = holdingsByTicker.get(ticker)
    if (!entries) { console.warn(`  ⚠ Holding not found: ${ticker}`); skipped++; continue }

    // Match by folder name (handles ETOR in two folders)
    const match = entries.find(e => e.folderName === folderName)
    if (!match) {
      // Fallback: if only one instance exists, use it
      if (entries.length === 1) {
        const { error } = await sb.from('holdings').update({ target_allocation_pct: pct }).eq('id', entries[0].id)
        if (error) throw new Error(`Update holding ${ticker}: ${error.message}`)
        updated++
      } else {
        console.warn(`  ⚠ No folder match for ${ticker} in "${folderName}" (found in: ${entries.map(e => e.folderName).join(', ')})`)
        skipped++
      }
      continue
    }

    const { error } = await sb.from('holdings').update({ target_allocation_pct: pct }).eq('id', match.id)
    if (error) throw new Error(`Update holding ${ticker} in ${folderName}: ${error.message}`)
    updated++
  }
  console.log(`✓ Holdings updated: ${updated}  (skipped: ${skipped})`)

  console.log('\n🎉 Allocations import complete!')
  console.log('   Root folders:  % of total portfolio')
  console.log('   Sub-folders:   % of total (converted from % within parent)')
  console.log('   Holdings:      relative weight within folder (for auto-invest)')
}

main().catch(err => { console.error('❌ Failed:', err.message); process.exit(1) })
