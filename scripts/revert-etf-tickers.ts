// Revert the 6 incorrectly-mapped TASE ETF tickers back to their numeric IDs.
// These funds are not available on Yahoo Finance; the SAL/regular series tickers
// that were previously mapped belong to different, higher-priced fund series.
//
// Run: npx tsx scripts/revert-etf-tickers.ts

import { readFileSync } from 'fs'
import { resolve } from 'path'

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

// Wrong Yahoo Finance ticker → correct TASE numeric ID
// Each wrong ticker belongs to a DIFFERENT fund series (e.g. SAL, regular KSM)
// than the user actually holds (MTF מחקה, IBI מחקה, תכלית TTF, קסם KTF).
const REVERT_MAP: Record<string, string> = {
  'KSM-F55.TA':  '5118997',  // MTF מחקה (4A) ת"א SME60 — NOT KSM ETF SME60
  'TCH-F76.TA':  '5122627',  // MTF מחקה (S&P 500 (4D) — NOT Tachlit SAL S&P 500
  'TCH-F4.TA':   '5123179',  // תכלית NASDAQ 100 (4A) TTF — NOT Tachlit SAL NASDAQ
  'PSG-F60.TA':  '5124284',  // IBI מחקה (4D) Russell 2000 — NOT Psagot ETF Russell
  'KSM-F92.TA':  '5125158',  // קסם DAX (4A) KTF — NOT KSM ETF DAX SAL
  'TCH-F165.TA': '5132923',  // תכלית TTF (4D) ביג טק 30 סין — NOT Tachlit SAL Big Tech
}

async function main() {
  let updated = 0

  for (const [wrongTicker, numericId] of Object.entries(REVERT_MAP)) {
    const holding = await prisma.holding.findFirst({
      where: { tickerSymbol: wrongTicker, exchange: 'TASE' },
      select: { id: true, name: true },
    })

    if (!holding) {
      console.log(`  ${wrongTicker} — no holding found, skipping`)
      continue
    }

    console.log(`  ${holding.name}: ${wrongTicker} → ${numericId}`)

    await prisma.holding.update({
      where: { id: holding.id },
      data: { tickerSymbol: numericId },
    })

    // Remove wrong price cache entries
    const deleted = await prisma.priceCache.deleteMany({
      where: { tickerSymbol: wrongTicker, exchange: 'TASE' },
    })
    if (deleted.count > 0) {
      console.log(`    cleared ${deleted.count} stale cache entries for ${wrongTicker}`)
    }

    updated++
  }

  console.log(`\n─── Summary ───`)
  console.log(`  Reverted: ${updated}`)
  console.log(`  These holdings will appear in the "unavailable prices" panel.`)
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
