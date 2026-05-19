// src/lib/agents/profile-agent.ts

import Anthropic from '@anthropic-ai/sdk'
import type { HoldingThesis, MarketUpdate, ThesisEvaluation } from '@/types/agents'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

// ─── Analysis Mode ────────────────────────────

export async function evaluateTheses(
  theses: HoldingThesis[],
  marketUpdates: MarketUpdate[],
  tickerByHoldingId: Map<string, string>
): Promise<ThesisEvaluation[]> {
  if (theses.length === 0) return []

  const updatesByTicker = Object.fromEntries(marketUpdates.map((u) => [u.tickerSymbol, u]))

  const results = await Promise.allSettled(
    theses.map((thesis) => {
      const ticker = tickerByHoldingId.get(thesis.holdingId) ?? thesis.holdingId
      const update = updatesByTicker[ticker] ?? null
      return evaluateSingleThesis(thesis, update, ticker)
    })
  )

  return results
    .map((r) => {
      if (r.status === 'fulfilled') return r.value
      return null
    })
    .filter((v): v is ThesisEvaluation => v !== null)
}

async function evaluateSingleThesis(
  thesis: HoldingThesis,
  marketUpdate: MarketUpdate | null,
  ticker: string
): Promise<ThesisEvaluation> {
  try {
    const marketContext = marketUpdate
      ? `Current market: ${marketUpdate.trend} trend, ${marketUpdate.priceChangePct.toFixed(1)}% change over 30 days. ${marketUpdate.trendReason}`
      : 'No recent market data available.'

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 250,
      system:
        'You are an investment psychology expert. Evaluate whether an investor\'s thesis is still valid. Respond ONLY with valid JSON.',
      messages: [
        {
          role: 'user',
          content: `Investment thesis for ${ticker}:
"${thesis.thesis}"
Catalysts: ${thesis.catalysts.join(', ') || 'none stated'}
Risk factors: ${thesis.riskFactors.join(', ') || 'none stated'}
Horizon: ${thesis.horizon ?? 'unspecified'}

${marketContext}

Respond: { "thesisIntact": true/false, "explanation": "2 sentences", "recommendation": "hold|review|rebalance" }`,
        },
      ],
    })

    const text = message.content[0]?.type === 'text' ? message.content[0].text : null
    if (!text) {
      return {
        holdingId: thesis.holdingId,
        tickerSymbol: ticker,
        thesisIntact: true,
        explanation: 'Could not evaluate — no response from AI.',
        recommendation: 'hold',
      }
    }

    const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
    const parsed = JSON.parse(cleaned) as {
      thesisIntact: boolean
      explanation: string
      recommendation: ThesisEvaluation['recommendation']
    }
    return {
      holdingId: thesis.holdingId,
      tickerSymbol: ticker,
      thesisIntact: parsed.thesisIntact,
      explanation: parsed.explanation,
      recommendation: parsed.recommendation,
    }
  } catch {
    return {
      holdingId: thesis.holdingId,
      tickerSymbol: ticker,
      thesisIntact: true,
      explanation: 'Evaluation failed — thesis assumed intact.',
      recommendation: 'hold',
    }
  }
}

// ─── Chat System Prompt ───────────────────────
// Used by /api/agents/chat to build the chat request

export function buildChatSystemPrompt(portfolioContext: string): string {
  return `You are Donatelo, a thoughtful personal investment advisor embedded in the user's portfolio tracker.
Your primary role: understand WHY the user holds each security — their thesis, time horizon, and key catalysts.
You ask focused follow-up questions to extract structured theses from natural conversation.

When you have extracted a clear thesis, output a JSON block (wrapped in <thesis> tags) alongside your conversational reply:
<thesis>
{
  "holdingId": "<exact holding id>",
  "rawText": "<the user's original words>",
  "thesis": "<structured 1-2 sentence thesis>",
  "horizon": "short|medium|long",
  "catalysts": ["catalyst 1", "catalyst 2"],
  "riskFactors": ["risk 1", "risk 2"]
}
</thesis>

Portfolio context:
${portfolioContext}

Rules:
- Respond in the same language the user writes (Hebrew or English)
- Never suggest executing trades — only help the user articulate and track their thinking
- Be concise, warm, and direct`
}
