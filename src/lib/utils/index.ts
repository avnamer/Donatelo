import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'
import type { TimeRange } from '@/store/ui'

/** Merge Tailwind classes safely */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Format date as DD.MM.YYYY (Israeli format) */
export function formatDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return d.toLocaleDateString('he-IL', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

/** Format date as Month YYYY */
export function formatMonthYear(date: Date): string {
  return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
}

/** Generate a color for a folder/segment based on index */
const CHART_COLORS = [
  '#1d4ed8', // blue
  '#059669', // green
  '#d97706', // amber
  '#7c3aed', // violet
  '#dc2626', // red
  '#0891b2', // cyan
  '#65a30d', // lime
  '#9333ea', // purple
  '#ea580c', // orange
  '#0284c7', // sky
  '#16a34a', // emerald
  '#b45309', // yellow
]

export function getChartColor(index: number): string {
  return CHART_COLORS[index % CHART_COLORS.length]
}

/** Truncate text with ellipsis */
export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text
  return `${text.slice(0, maxLength)}...`
}

/** Check if market is currently open (rough estimate) */
export function isMarketOpen(): boolean {
  const now = new Date()
  const day = now.getUTCDay()
  if (day === 0 || day === 6) return false  // weekend
  const hour = now.getUTCHours()
  return hour >= 7 && hour < 17  // rough UTC equivalent
}

/** Parse a number safely, returning 0 on failure */
export function safeParseFloat(value: string | undefined | null): number {
  if (!value) return 0
  const n = parseFloat(value)
  return isNaN(n) ? 0 : n
}

export function getTimeRangeCutoff(timeRange: TimeRange, today: Date = new Date()): Date {
  const d = new Date(today)
  switch (timeRange) {
    case '1M':  d.setDate(d.getDate() - 30);       return d
    case '3M':  d.setDate(d.getDate() - 90);       return d
    case '6M':  d.setDate(d.getDate() - 180);      return d
    case 'YTD': return new Date(d.getFullYear(), 0, 1)
    case '1Y':  d.setFullYear(d.getFullYear() - 1); return d
    case '3Y':  d.setFullYear(d.getFullYear() - 3); return d
    case 'ALL': return new Date(0)
  }
}
