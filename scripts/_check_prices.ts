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
    const v = t.slice(eq+1).trim().replace(/^"(.*)"$/, '$1')
    if (!process.env[k]) process.env[k] = v
  }
} catch {}

import { PrismaClient } from '@prisma/client'

async function main() {
  const prisma = new PrismaClient()

  // Check current DB prices for TASE ETFs
  const rows = await prisma.priceCache.findMany({
    where: { exchange: 'TASE' },
    orderBy: { fetchedAt: 'desc' },
    take: 20,
    select: { tickerSymbol: true, price: true, currency: true, priceDate: true, fetchedAt: true }
  })

  console.log('TASE price cache entries:')
  for (const r of rows) {
    const priceIls = Number(r.price) / 100
    console.log(`  ${r.tickerSymbol}: ${r.price} (stored) = ${priceIls.toFixed(2)} ILS | currency: ${r.currency} | fetched: ${r.fetchedAt.toISOString()}`)
  }

  // Check lots for the new ETFs
  const lots = await prisma.lot.findMany({
    where: {
      holding: {
        tickerSymbol: { in: ['TCH-F76.TA','TCH-F4.TA','PSG-F60.TA','KSM-F55.TA','KSM-F92.TA','TCH-F165.TA'] }
      }
    },
    include: { holding: { select: { tickerSymbol: true, name: true } } }
  })

  console.log('\nLot costPerShare for new ETFs:')
  for (const l of lots) {
    const costIls = Number(l.costPerShare) / 100
    console.log(`  ${l.holding.tickerSymbol} (${l.holding.name}): costPerShare=${l.costPerShare} = ${costIls.toFixed(2)} ILS, shares=${l.shares}, currency=${l.costCurrency}`)
  }

  await prisma.$disconnect()
}

main().catch(console.error)