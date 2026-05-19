// src/lib/agents/market-agent.ts

import Anthropic from '@anthropic-ai/sdk'
import { fetchUSPriceHistory } from '@/lib/api/polygon'
import { fetchTasePriceHistory } from '@/lib/api/tase'
import type { MarketUpdate } from '@/types/agents'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const SIGNIFICANT_CHANGE_THRESHOLD = 3 // percent

interface HoldingInput {
  tickerSymbol: string
  exchange: string
  name: string
}

export async function runMarketAgent(holdings: HoldingInput[]): Promise<MarketUpdate[]> {
  const results = await Promise.allSettled(holdings.map(analyzeHolding))
  return results
    .filter((r): r is PromiseFulfilledResult<MarketUpdate | null> => r.status === 'fulfilled')
    .map((r) => r.value)
    .filter((v): v is MarketUpdate => v !== null)
}

async function analyzeHolding(holding: HoldingInput): Promise<MarketUpdate | null> {
  const isTase = holding.exchange === 'TASE'

  const to = new Date()
  const from = new Date()
  from.setDate(from.getDate() - 45) // fetch ~45 calendar days to get ~30 trading days

  const history = isTase
    ? await fetchTasePriceHistory(holding.tickerSymbol, from, to)
    : await fetchUSPriceHistory(holding.tickerSymbol, from, to)

  if (!history || history.length < 2) return null

  const startPrice = Number(history[0].price)
  const endPrice = Number(history[history.length - 1].price)
  const priceChangePct = ((endPrice - startPrice) / startPrice) * 100
  // Prices from both APIs are already stored as cents/agorot (integer units × 100)
  const currentPriceCents = Math.round(endPrice)

  // Only call Claude for significant movers to save API cost
  if (Math.abs(priceChangePct) < SIGNIFICANT_CHANGE_THRESHOLD) {
    return {
      tickerSymbol: holding.tickerSymbol,
      exchange: holding.exchange,
      priceChangePct,
      currentPriceCents,
      trend: 'neutral',
      trendReason: `Price change of ${priceChangePct.toFixed(1)}% is within normal range.`,
    }
  }

  const direction = priceChangePct > 0 ? 'up' : 'down'
  const prices = history.map((b) => Number(b.price))
  const highPrice = Math.max(...prices)
  const lowPrice = Math.min(...prices)

  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 200,
    system:
      'You are a financial analyst. Analyze price data and respond ONLY with valid JSON. No markdown, no explanation outside the JSON.',
    messages: [
      {
        role: 'user',
        content: `${holding.name} (${holding.tickerSymbol}) moved ${direction} ${Math.abs(priceChangePct).toFixed(1)}% over the last 30 trading days.
High: ${highPrice.toFixed(2)}, Low: ${lowPrice.toFixed(2)}.
Respond: { "trend": "bullish|bearish|neutral", "trendReason": "one sentence explanation" }`,
      },
    ],
  })

  const text = message.content[0]?.type === 'text' ? message.content[0].text : null
  if (!text) {
    return {
      tickerSymbol: holding.tickerSymbol,
      exchange: holding.exchange,
      priceChangePct,
      currentPriceCents,
      trend: priceChangePct > 0 ? 'bullish' : 'bearish',
      trendReason: `Moved ${priceChangePct.toFixed(1)}% in 30 days.`,
    }
  }

  try {
    const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
    const parsed = JSON.parse(cleaned) as { trend: MarketUpdate['trend']; trendReason: string }
    return {
      tickerSymbol: holding.tickerSymbol,
      exchange: holding.exchange,
      priceChangePct,
      currentPriceCents,
      trend: parsed.trend,
      trendReason: parsed.trendReason,
    }
  } catch {
    return {
      tickerSymbol: holding.tickerSymbol,
      exchange: holding.exchange,
      priceChangePct,
      currentPriceCents,
      trend: priceChangePct > 0 ? 'bullish' : 'bearish',
      trendReason: `Moved ${priceChangePct.toFixed(1)}% in 30 days.`,
    }
  }
}
