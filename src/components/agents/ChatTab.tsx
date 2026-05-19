'use client'

import { useState, useRef, useEffect } from 'react'
import { Send } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ChatMessage } from '@/types/agents'

interface Props {
  portfolioId: string
}

export function ChatTab({ portfolioId }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: 'assistant',
      content: 'שלום! אני דונטלו, היועץ הפיננסי שלך. ספר לי על ההשקעות שלך — מה הסיפור מאחורי כל מניה?',
    },
  ])
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const abortRef = useRef<AbortController | null>(null)

  // Abort any in-flight stream on unmount
  useEffect(() => {
    return () => { abortRef.current?.abort() }
  }, [])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function send() {
    const text = input.trim()
    if (!text || streaming) return

    const userMsg: ChatMessage = { role: 'user', content: text }
    const withUser = [...messages, userMsg]
    setMessages(withUser)
    setInput('')
    setStreaming(true)

    // Add empty assistant placeholder
    setMessages((prev) => [...prev, { role: 'assistant', content: '' }])

    const controller = new AbortController()
    abortRef.current = controller

    try {
      const res = await fetch('/api/agents/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: withUser, portfolioId }),
        signal: controller.signal,
      })

      if (!res.ok || !res.body) {
        setMessages((prev) => {
          const updated = [...prev]
          updated[updated.length - 1] = {
            role: 'assistant',
            content: 'Something went wrong. Please try again.',
          }
          return updated
        })
        return
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let lineBuffer = ''
      let finished = false

      try {
        while (!finished) {
          const { done, value } = await reader.read()
          if (done) break

          // Accumulate into buffer to handle TCP-split SSE lines
          lineBuffer += decoder.decode(value, { stream: true })
          const lines = lineBuffer.split('\n')
          lineBuffer = lines.pop() ?? '' // keep incomplete trailing line

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue
            const data = line.slice(6)
            if (data === '[DONE]') { finished = true; break }
            try {
              const { text: chunkText } = JSON.parse(data) as { text: string }
              setMessages((prev) => {
                const updated = [...prev]
                updated[updated.length - 1] = {
                  role: 'assistant',
                  content: updated[updated.length - 1].content + chunkText,
                }
                return updated
              })
            } catch {
              // Malformed JSON line — skip
            }
          }
        }
      } finally {
        reader.cancel()
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        setMessages((prev) => {
          const updated = [...prev]
          updated[updated.length - 1] = {
            role: 'assistant',
            content: 'Connection error. Please try again.',
          }
          return updated
        })
      }
    } finally {
      setStreaming(false)
    }
  }

  return (
    <div className="flex flex-col h-full gap-2">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto flex flex-col gap-2 pr-0.5">
        {messages.map((msg, i) => (
          <div
            key={i}
            className={cn(
              'rounded-xl px-3 py-2 text-sm max-w-[88%] leading-relaxed whitespace-pre-wrap',
              msg.role === 'user'
                ? 'self-end bg-primary text-primary-foreground'
                : 'self-start bg-muted text-foreground'
            )}
          >
            {msg.content || (streaming && i === messages.length - 1 ? '…' : '')}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Input row */}
      <div className="flex gap-2 items-end">
        <textarea
          rows={1}
          className="flex-1 resize-none rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring min-h-[38px] max-h-[100px]"
          placeholder="ספר לי על השקעה שלך…"
          value={input}
          onChange={(e) => {
            setInput(e.target.value)
            e.target.style.height = 'auto'
            e.target.style.height = `${Math.min(e.target.scrollHeight, 100)}px`
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              send()
            }
          }}
        />
        <button
          onClick={send}
          disabled={streaming || !input.trim()}
          className="h-9 w-9 shrink-0 flex items-center justify-center rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40 transition-colors"
        >
          <Send className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}
