// Migration: Replace numeric TASE security IDs with Yahoo Finance .TA tickers
// Run: npx tsx scripts/migrate-tase-tickers.ts

import { readFileSync } from 'fs'
import { resolve } from 'path'

// Load .env.local manually
try {
  const envFile = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8')
  for (const line of envFile.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq === -1) continue
    const key = trimmed.slice(0, eq).trim()
    const val = trimmed.slice(eq + 1).trim().replace(/^"(.*)"$/, '$1')
    if (!process.env[key]) process.env[key] = val
  }
} catch { /* ignore */ }

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

// Hardcoded mapping: TASE numeric ID → Yahoo Finance .TA ticker
// Verified against Yahoo Finance v8/finance/chart endpoint
// 6 ETFs (5xxxxxxx) are not available on Yahoo Finance — left as numeric IDs
const TICKER_MAP: Record<string, string> = {
  '230011':  'BEZQ.TA',     // Bezeq
  '273011':  'NICE.TA',     // NICE Systems
  '604611':  'LUMI.TA',     // Bank Leumi
  '662577':  'POLI.TA',     // Bank Hapoalim
  '720011':  'ENLT.TA',     // Enlight Renewable Energy
  '1096106': 'ATRY.TA',     // Atreyu Capital
  '1134402': 'ORA.TA',      // Ormat Technologies
  '1150259': 'MTF-F17.TA',  // Mutual Funds F17 bond series
  '1150275': 'MTF-F34.TA',  // Mutual Funds F34 bond series
  '1159235': 'IS-FF505.TA', // iShares FF505
  '1166768': 'DORL.TA',     // Doral GP Renewable
  '1172527': 'RZR.TA',      // Razor Labs
  '1175934': 'KSTN.TA',     // Keystone Infrastructure
  '1183441': 'IN-FF1.TA',   // Invesco FF1
  '1194380': 'MORE-S7.TA',  // More Mutual Funds S7
  '1380104': '1380104.TA',  // Arazim 17 S4 FRN bond (no symbol, numeric ID works)
  // NOTE: The following 6 ETFs (5xxxxxxx series) are "class 4" tracker funds (TTF/KTF/מחקה series)
  // priced at ₪0.5–4/unit. They are NOT available on Yahoo Finance.
  // The SAL/regular series tickers for the same indices (e.g. TCH-F4.TA for Tachlit SAL NASDAQ)
  // belong to DIFFERENT, higher-priced fund series (~100× more expensive) and must NOT be used here.
  // These holdings remain as numeric TASE IDs and appear in the "unavailable prices" panel.
  //   5118997 = MTF מחקה (4A) ת"א SME60
  //   5122627 = MTF מחקה (S&P 500) (4D)
  //   5123179 = תכלית NASDAQ 100 (4A) TTF מנוטרלת מט"ח
  //   5124284 = IBI מחקה (4D) Russell 2000
  //   5125158 = קסם DAX (4A) KTF מנוטרלת מט"ח
  //   5132923 = תכלית TTF (4D) אינדקס ביג טק 30 סין
}

async function main() {
  const holdings = await prisma.holding.findMany({
    where: { exchange: 'TASE' },
    select: { id: true, tickerSymbol: true, name: true },
  })

  if (holdings.length === 0) {
    console.log('No TASE holdings found.')
    return
  }

  console.log(`Found ${holdings.length} TASE holdings\n`)

  let updated = 0
  let skipped = 0
  let notFound = 0

  for (const h of holdings) {
    const newTicker = TICKER_MAP[h.tickerSymbol]

    if (!newTicker) {
      console.log(`  ${h.name} (${h.tickerSymbol}) → NOT IN MAP (keeping as-is)`)
      notFound++
      continue
    }

    if (newTicker === h.tickerSymbol) {
      console.log(`  ${h.name} (${h.tickerSymbol}) → already correct`)
      skipped++
      continue
    }

    console.log(`  ${h.name}: ${h.tickerSymbol} → ${newTicker}`)

    await prisma.holding.update({
      where: { id: h.id },
      data: { tickerSymbol: newTicker },
    })

    await prisma.priceCache.updateMany({
      where: { tickerSymbol: h.tickerSymbol, exchange: 'TASE' },
      data: { tickerSymbol: newTicker },
    })

    updated++
  }

  console.log(`\n─── Summary ───`)
  console.log(`  Updated:  ${updated}`)
  console.log(`  Skipped:  ${skipped}`)
  console.log(`  No map:   ${notFound} (kept as numeric IDs)`)
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
