'use client'

import { useState, useRef, useEffect } from 'react'
import { cn } from '@/lib/utils'

interface InfoTooltipProps {
  text: string
  className?: string
}

export function InfoTooltip({ text, className }: InfoTooltipProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  return (
    <div ref={ref} className={cn('relative inline-flex items-center', className)}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-4 h-4 rounded-full bg-muted text-muted-foreground hover:bg-accent hover:text-foreground text-[10px] font-bold leading-none flex items-center justify-center cursor-pointer transition-colors"
        aria-label="מידע"
      >
        ?
      </button>

      {open && (
        <div className="absolute z-50 bottom-full mb-2 left-1/2 -translate-x-1/2 w-64 rounded-lg border bg-popover text-popover-foreground shadow-md p-3 text-xs leading-relaxed text-right"
          dir="rtl"
        >
          {text}
          <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-border" />
        </div>
      )}
    </div>
  )
}
