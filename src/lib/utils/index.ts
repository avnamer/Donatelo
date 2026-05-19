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

/**
 * Returns a compact holding duration. Examples: "3m", "1y", "2y 4m"
 */
export function formatHoldingDuration(oldestPurchaseDate: Date, today: Date = new Date()): string {
  let years  = today.getFullYear() - oldestPurchaseDate.getFullYear()
  let months = today.getMonth()    - oldestPurchaseDate.getMonth()

  if (months < 0) { years--; months += 12 }

  if (years === 0 && months === 0) return '< 1m'
  if (years === 0) return `${months}m`
  if (months === 0) return `${years}y`
  return `${years}y ${months}m`
}

/**
 * Returns a full-word holding duration. Examples: "3 months", "1 year", "2 years 4 months"
 */
export function formatHoldingDurationLong(date: Date, today: Date = new Date()): string {
  let years  = today.getFullYear() - date.getFullYear()
  let months = today.getMonth()    - date.getMonth()

  if (months < 0) { years--; months += 12 }

  const y = years  === 1 ? '1 year'   : years  > 1 ? `${years} years`   : ''
  const m = months === 1 ? '1 month'  : months > 1 ? `${months} months` : ''

  if (!y && !m) return '< 1 month'
  return [y, m].filter(Boolean).join(' ')
}

/**
 * Annualized return (CAGR) from a total return % and the oldest purchase date.
 * Returns null when the holding is too short (<1 month) or data is invalid.
 *
 * Formula: CAGR = (1 + totalReturn)^(1/years) − 1
 */
export function calcAnnualizedReturn(
  totalReturnPct: number,
  oldestPurchaseDate: Date,
  today: Date = new Date()
): number | null {
  const ms    = today.getTime() - oldestPurchaseDate.getTime()
  const years = ms / (365.25 * 24 * 60 * 60 * 1000)

  if (years < 1 / 12) return null          // < 1 month — meaningless to annualize
  if (1 + totalReturnPct / 100 <= 0) return null  // can't root a negative growth

  return (Math.pow(1 + totalReturnPct / 100, 1 / years) - 1) * 100
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
