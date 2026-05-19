// POST /api/agents/chat (SSE streaming)
import { NextRequest } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { z } from 'zod'
import { getCurrentUser } from '@/lib/db/supabase-server'
import { getPortfolioHoldingsSummary } from '@/lib/db/queries/portfolios'
import { upsertHoldingThesis } from '@/lib/db/queries'
import { buildChatSystemPrompt } from '@/lib/agents/profile-agent'
import type { ExtractedThesis } from '@/types/agents'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const BodySchema = z.object({
  messages: z.array(z.object({ role: z.enum(['user', 'assistant']), content: z.string() })),
  portfolioId: z.string(),
})

export async function POST(request: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  const raw = BodySchema.safeParse(await request.json())
  if (!raw.success) return new Response('Bad request', { status: 400 })

  const { messages, portfolioId } = raw.data
  const holdings = await getPortfolioHoldingsSummary(portfolioId, user.id)
  const portfolioContext = holdings
    .map((h) => `- ${h.name} (${h.tickerSymbol}, ${h.exchange}) — id: ${h.id}`)
    .join('\n')

  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      let fullText = ''
      try {
        const claudeStream = anthropic.messages.stream({
          model: 'claude-sonnet-4-6',
          max_tokens: 1024,
          system: buildChatSystemPrompt(portfolioContext),
          messages,
        })

        for await (const event of claudeStream) {
          if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
            fullText += event.delta.text
            // Strip <thesis> blocks from streamed text — save them separately
            const clean = event.delta.text.replace(/<thesis>[\s\S]*?<\/thesis>/g, '')
            if (clean) {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text: clean })}\n\n`))
            }
          }
        }

        // Extract and save thesis if present
        const thesisMatch = fullText.match(/<thesis>([\s\S]*?)<\/thesis>/)
        if (thesisMatch) {
          try {
            const extracted = JSON.parse(thesisMatch[1].trim()) as ExtractedThesis
            await upsertHoldingThesis({ ...extracted, userId: user.id })
          } catch {
            // Malformed thesis JSON — skip silently
          }
        }

        controller.enqueue(encoder.encode('data: [DONE]\n\n'))
        controller.close()
      } catch {
        controller.error(new Error('Stream failed'))
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  })
}
