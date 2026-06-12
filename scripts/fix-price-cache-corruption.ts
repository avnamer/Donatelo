/**
 * fix-price-cache-corruption.ts
 *
 * Scans every ticker in price_cache for unit-scale corruptions:
 * e.g. SMSH.TA had prices stored as 22 (ILS?) then jumped to 2125+ (agora).
 *
 * Detection: a consecutive price ratio > SCALE_JUMP_THRESHOLD (5×) between
 * adjacent dates is physically impossible — it signals a unit change, not
 * real movement.
 *
 * Action: delete all rows BEFORE the last such scale jump. The remaining
 * rows (in the correct scale) are kept intact.
 *
 * Run:
 *   npx tsx scripts/fix-price-cache-corruption.ts [--dry-run]
 */

import { readFileSync } from 'fs'
import { resolve } from 'path'
try {
  const e = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8')
  for (const l of e.split('\n')) {
    const t = l.trim()
    if (!t || t.startsWith('#')) continue
    const eq = t.indexOf('=')
    if (eq < 0) continue
    const k = t.slice(0, eq).trim()
    const v = t.slice(eq + 1).trim().replace(/^"(.*)"$/, '$1')
    if (!process.env[k]) process.env[k] = v
  }
} catch {}

import { PrismaClient } from '@prisma/client'

const SCALE_JUMP_THRESHOLD = 5   // 5× jump between consecutive days = unit error
const DRY_RUN = process.argv.includes('--dry-run')

async function main() {
  const prisma = new PrismaClient()

  console.log(DRY_RUN ? '=== DRY RUN — no deletions ===' : '=== LIVE RUN — will delete corrupted rows ===')
  console.log()

  // Get all distinct tickers in the cache
  const tickers = await prisma.priceCache.findMany({
    distinct: ['tickerSymbol'],
    select: { tickerSymbol: true, exchange: true },
    orderBy: { tickerSymbol: 'asc' },
  })

  console.log(`Found ${tickers.length} distinct tickers in price_cache\n`)

  let totalDeleted = 0
  let corruptedCount = 0

  for (const { tickerSymbol, exchange } of tickers) {
    // Fetch all rows for this ticker, sorted by date ascending
    const rows = await prisma.priceCache.findMany({
      where: { tickerSymbol },
      orderBy: { priceDate: 'asc' },
      select: { id: true, price: true, priceDate: true },
    })

    if (rows.length < 2) continue

    // Find the last scale-jump index
    let lastJump = -1
    for (let i = 1; i < rows.length; i++) {
      const prev = Number(rows[i - 1].price)
      const curr = Number(rows[i].price)
      if (prev > 0 && curr > 0) {
        const ratio = curr / prev
        if (ratio > SCALE_JUMP_THRESHOLD || ratio < 1 / SCALE_JUMP_THRESHOLD) {
          lastJump = i
        }
      }
    }

    if (lastJump < 0) continue  // no corruption detected

    // Rows to delete: everything before lastJump
    const toDelete = rows.slice(0, lastJump)
    const toKeep   = rows[lastJump]

    corruptedCount++
    console.log(`⚠  ${tickerSymbol} (${exchange}): ${toDelete.length} corrupted rows`)
    console.log(`   Last bad price : ${Number(rows[lastJump - 1].price)} on ${rows[lastJump - 1].priceDate.toISOString().slice(0, 10)}`)
    console.log(`   First good price: ${Number(toKeep.price)} on ${toKeep.priceDate.toISOString().slice(0, 10)}`)

    if (!DRY_RUN) {
      const ids = toDelete.map(r => r.id)
      const { count } = await prisma.priceCache.deleteMany({ where: { id: { in: ids } } })
      console.log(`   ✓  Deleted ${count} rows`)
      totalDeleted += count
    } else {
      console.log(`   (dry-run) would delete ${toDelete.length} rows`)
    }
    console.log()
  }

  if (corruptedCount === 0) {
    console.log('✅  No corrupted tickers found.')
  } else {
    console.log(`\nSummary: ${corruptedCount} ticker(s) with corruption.`)
    if (!DRY_RUN) console.log(`Deleted ${totalDeleted} corrupted rows total.`)
  }

  await prisma.$disconnect()
}

main().catch(err => { console.error(err); process.exit(1) })
