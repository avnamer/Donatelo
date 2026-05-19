'use client'

import { useState } from 'react'
import { Bot, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { InsightsTab } from './InsightsTab'
import { ChatTab } from './ChatTab'

interface Props {
  portfolioId: string | null
}

type Tab = 'insights' | 'chat'

export function AgentPanel({ portfolioId }: Props) {
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState<Tab>('insights')

  if (!portfolioId) return null

  return (
    <>
      {/* Floating trigger */}
      <button
        onClick={() => setOpen((v) => !v)}
        title="Donatelo AI"
        className={cn(
          'fixed bottom-6 right-6 z-50',
          'h-12 w-12 rounded-full shadow-lg',
          'flex items-center justify-center',
          'bg-primary text-primary-foreground',
          'hover:bg-primary/90 transition-colors',
          open && 'ring-2 ring-ring ring-offset-2'
        )}
      >
        <Bot className="h-5 w-5" />
      </button>

      {/* Panel */}
      {open && (
        <div className="fixed bottom-20 right-6 z-50 w-80 h-[520px] flex flex-col bg-background border rounded-xl shadow-2xl overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b bg-muted/30 shrink-0">
            <div className="flex items-center gap-2">
              <Bot className="h-4 w-4 text-primary" />
              <span className="font-semibold text-sm">Donatelo AI</span>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="rounded-md p-1 hover:bg-muted transition-colors text-muted-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Tabs */}
          <div className="flex border-b shrink-0">
            {(['insights', 'chat'] as Tab[]).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={cn(
                  'flex-1 py-2 text-sm capitalize transition-colors',
                  tab === t
                    ? 'border-b-2 border-primary font-medium text-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                {t === 'insights' ? 'Insights' : 'Chat'}
              </button>
            ))}
          </div>

          {/* Content */}
          <div className="flex-1 overflow-hidden p-3 min-h-0">
            {tab === 'insights' ? (
              <InsightsTab portfolioId={portfolioId} />
            ) : (
              <ChatTab portfolioId={portfolioId} />
            )}
          </div>
        </div>
      )}
    </>
  )
}
