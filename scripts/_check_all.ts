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
    include: { holding: { select: { tickerSymbol: true, exchange: true } } }
  })

  const grouped: Record<string, { name: string; costs: number[]; shares: number[] }> = {}
  for (const l of lots) {
    if (l.holding.exchange !== 'TASE') continue
    const sym = l.holding.tickerSymbol
    if (!grouped[sym]) grouped[sym] = { name: sym, costs: [], shares: [] }
    grouped[sym].costs.push(Number(l.costPerShare))
    grouped[sym].shares.push(Number(l.shares))
  }

  for (const [sym, d] of Object.entries(grouped)) {
    const avgCost = d.costs.reduce((a, b) => a + b, 0) / d.costs.length
    const totalShares = d.shares.reduce((a, b) => a + b, 0)
    console.log(`${sym} | shares=${totalShares.toFixed(0)} | avgCost=${avgCost.toFixed(0)} agorot = ₪${(avgCost/100).toFixed(2)}`)
  }

  await prisma.$disconnect()
}
main().catch(console.error)