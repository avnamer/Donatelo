import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function generateDipSuggestion(
  ticker: string,
  name: string,
  dropFrom52w: number,
  currentPrice: number,
  high52w: number
): Promise<string> {
  const dropPct = Math.abs(dropFrom52w * 100).toFixed(1)
  const message = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 120,
    messages: [
      {
        role: 'user',
        content: `${name} (${ticker}) is down ${dropPct}% from its 52-week high of ${high52w.toFixed(2)} and currently trades at ${currentPrice.toFixed(2)}. In one sentence, give a brief investor consideration for whether this dip may be worth buying. Be neutral and factual, not financial advice.`,
      },
    ],
  })
  const block = message.content[0]
  return block.type === 'text' ? block.text.trim() : ''
}
