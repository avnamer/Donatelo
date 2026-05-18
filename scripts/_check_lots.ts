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
  const lots = await prisma.lot.findMany({
    where: {
      holding: {
        tickerSymbol: { in: ['TCH-F4.TA', 'KSM-F55.TA', 'TCH-F165.TA', 'LUMI.TA', 'BEZQ.TA', 'POLI.TA'] }
      }
    },
    include: { holding: { select: { tickerSymbol: true } } },
    orderBy: { purchaseDate: 'asc' }
  })
  for (const l of lots) {
    const costIls = Number(l.costPerShare) / 100
    console.log(`${l.holding.tickerSymbol} | date=${l.purchaseDate.toISOString().slice(0,10)} | shares=${l.shares} | costPerShare=${l.costPerShare} (${costIls.toFixed(2)} ILS) | currency=${l.costCurrency}`)
  }
  await prisma.$disconnect()
}
main().catch(console.error)