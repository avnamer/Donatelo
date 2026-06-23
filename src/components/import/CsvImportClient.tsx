'use client'

import { useState, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import {
  Upload,
  CheckCircle2,
  AlertCircle,
  Loader2,
  HelpCircle,
  ChevronRight,
  ChevronDown,
  X,
  Eye,
} from 'lucide-react'
import {
  classifyAll,
  applyRuleToUnknowns,
  buildPatternFromRow,
  type CsvRule,
  type CsvTransactionType,
  type ClassifiedRow,
  type UnknownRow,
} from '@/lib/csv/classifier'

// ─── CSV parsing ──────────────────────────────────

function parseCsv(text: string): Record<string, string>[] {
  const lines = text.trim().split(/\r?\n/)
  if (lines.length < 2) return []
  const first = lines[0]
  const delimiter = first.includes('\t') ? '\t' : ','
  const parseRow = (line: string): string[] => {
    const result: string[] = []
    let inQuote = false
    let current = ''
    for (const c of line) {
      if (c === '"') { inQuote = !inQuote }
      else if (c === delimiter && !inQuote) { result.push(current.trim()); current = '' }
      else { current += c }
    }
    result.push(current.trim())
    return result
  }
  const headers = parseRow(lines[0])
  return lines.slice(1).filter(l => l.trim()).map(line => {
    const cols = parseRow(line)
    const obj: Record<string, string> = {}
    headers.forEach((h, i) => { obj[h] = cols[i] ?? '' })
    return obj
  })
}

// ─── Encoding-aware file reader ───────────────────
// Israeli brokers export Windows-1255; f.text() assumes UTF-8 → gibberish.
// Strategy: try UTF-8 with fatal:true — if the file contains non-UTF-8 bytes
// (e.g. Hebrew in Windows-1255) it throws, and we fall through to Windows-1255.

async function readCsvWithEncoding(f: File): Promise<string> {
  const buf = await f.arrayBuffer()
  const bytes = new Uint8Array(buf)

  // Strip UTF-8 BOM if present (EF BB BF)
  const hasBom = bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF
  const decodeTarget = hasBom ? buf.slice(3) : buf

  // Try strict UTF-8 — throws on any invalid byte sequence
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(decodeTarget)
  } catch {
    // File contains non-UTF-8 bytes → try Hebrew encodings
  }

  // Windows-1255: most common for Israeli brokers (Excel, IBI, Excellence, etc.)
  try {
    return new TextDecoder('windows-1255').decode(decodeTarget)
  } catch {
    // Browser doesn't support windows-1255
  }

  // ISO-8859-8: older Hebrew encoding
  try {
    return new TextDecoder('iso-8859-8').decode(decodeTarget)
  } catch {
    // Not supported either
  }

  // Last resort: lenient UTF-8 (replaces bad chars with U+FFFD)
  return new TextDecoder('utf-8').decode(decodeTarget)
}

// ─── Field extraction (shared between interpretation & payload) ──

function extractFields(row: Record<string, string>) {
  const date = row['תאריך'] || row['תאריך ביצוע'] || row['Date'] || row['date'] || ''
  const sharesRaw = row['כמות'] || row['מניות'] || row['Quantity'] || row['shares'] || ''
  const priceRaw = row['מחיר'] || row['שער'] || row['Price'] || row['price'] || ''
  const amountRaw = row['שווי'] || row['סכום'] || row['Amount'] || row['amount'] || row['ערך'] || ''
  const usdAmountRaw = row['סכום מטבע'] || row['סכום דולרים'] || ''
  const currency = (row['מטבע'] || row['Currency'] || 'ILS').trim().toUpperCase() as 'ILS' | 'USD'
  const shares = parseFloat(sharesRaw.replace(/,/g, '')) || 0
  const price = parseFloat(priceRaw.replace(/,/g, '')) || 0
  const amount = parseFloat(amountRaw.replace(/,/g, '')) || 0
  const usdAmount = parseFloat(usdAmountRaw.replace(/,/g, '')) || 0
  return { date, shares, price, amount, usdAmount, currency }
}

// ─── Interpretation ──────────────────────────────

interface Interpretation {
  understood: string   // what the system understood from the row
  willDo: string       // what it will update in the system
  warnings: string[]   // missing/suspicious values
}

function fmt(n: number, currency: string) {
  if (!n) return '—'
  const sym = currency === 'USD' ? '$' : '₪'
  return `${sym}${n.toLocaleString('he-IL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function interpretRow(c: ClassifiedRow): Interpretation {
  if (c.type === 'IGNORE') {
    return { understood: 'שורה שתדולג', willDo: 'לא יבוצע שום עדכון', warnings: [] }
  }

  const { date, shares, price, amount, usdAmount, currency } = extractFields(c.row)
  const warnings: string[] = []
  const effectivePrice = price || (shares > 0 ? amount / shares : 0)
  const effectiveTotal = amount || (shares > 0 && price > 0 ? shares * price : 0)

  if (!date) warnings.push('תאריך לא נמצא בשורה')

  if (c.type === 'SECURITY_BUY') {
    if (!c.ticker) warnings.push('טיקר לא הוגדר בכלל — הקנייה לא תיוחס להחזקה')
    if (!shares) warnings.push('כמות מניות לא נמצאה')
    if (!effectivePrice) warnings.push('מחיר למניה לא נמצא')
    return {
      understood: `קנייה: ${shares || '?'} יחידות של ${c.ticker || '?'} (${c.exchange || 'TASE'}) ב-${fmt(effectivePrice, currency)} ליחידה`,
      willDo: `יוצר lot חדש + רשומת SECURITY_BUY. סה"כ: ${fmt(effectiveTotal, currency)}. חשבון: ${c.cashAccountName || '—'}`,
      warnings,
    }
  }

  if (c.type === 'SECURITY_SELL') {
    if (!c.ticker) warnings.push('טיקר לא הוגדר בכלל')
    if (!shares) warnings.push('כמות לא נמצאה')
    if (!effectivePrice) warnings.push('מחיר לא נמצא')
    return {
      understood: `מכירה: ${shares || '?'} יחידות של ${c.ticker || '?'} (${c.exchange || 'TASE'}) ב-${fmt(effectivePrice, currency)} ליחידה`,
      willDo: `יוצר רשומת SECURITY_SELL. תמורה: ${fmt(effectiveTotal, currency)}`,
      warnings,
    }
  }

  if (c.type === 'DIVIDEND') {
    if (!c.ticker) warnings.push('טיקר לא הוגדר')
    if (!amount) warnings.push('סכום דיבידנד לא נמצא')
    return {
      understood: `דיבידנד מ-${c.ticker || '?'} בסך ${fmt(amount, currency)}`,
      willDo: `יוצר רשומת DIVIDEND${c.cashAccountName ? ` ומעדכן חשבון "${c.cashAccountName}"` : ''}`,
      warnings,
    }
  }

  if (c.type === 'CASH_DEPOSIT') {
    if (!amount) warnings.push('סכום לא נמצא')
    return {
      understood: `הפקדה: ${fmt(amount, currency)}`,
      willDo: `יוצר רשומת CASH_DEPOSIT ומגדיל יתרה בחשבון "${c.cashAccountName || 'מזומן ₪'}" ב-${fmt(amount, currency)}`,
      warnings,
    }
  }

  if (c.type === 'CASH_WITHDRAWAL') {
    if (!amount) warnings.push('סכום לא נמצא')
    return {
      understood: `משיכה: ${fmt(amount, currency)}`,
      willDo: `יוצר רשומת CASH_WITHDRAWAL ומקטין יתרה בחשבון "${c.cashAccountName || 'מזומן ₪'}" ב-${fmt(amount, currency)}`,
      warnings,
    }
  }

  if (c.type === 'COMMISSION') {
    if (!amount) warnings.push('סכום עמלה לא נמצא')
    return {
      understood: `עמלה: ${fmt(amount, currency)}`,
      willDo: `יוצר רשומת COMMISSION — סכום זה יופיע בסיכום העמלות בדף הפעילות`,
      warnings,
    }
  }

  if (c.type === 'FX_CONVERSION') {
    if (!amount) warnings.push('סכום ILS לא נמצא')
    if (!usdAmount) warnings.push('סכום USD לא נמצא — ייתכן שנדרש עמודה "סכום מטבע"')
    return {
      understood: `המרת מט"ח: ${fmt(amount, 'ILS')} → ${fmt(usdAmount, 'USD')}`,
      willDo: `מקטין "${c.cashAccountName || 'מזומן ₪'}" ב-${fmt(amount, 'ILS')} ומגדיל "${c.toCashAccountName || 'מזומן $'}" ב-${fmt(usdAmount, 'USD')}`,
      warnings,
    }
  }

  return { understood: 'לא ידוע', willDo: '—', warnings: [] }
}

// ─── Types ────────────────────────────────────────

type Step = 'upload' | 'classify' | 'preview' | 'importing' | 'done'

type TeachField = { field: string; matchType: 'equals' | 'contains' }

interface TeachState {
  row: UnknownRow
  transactionType: CsvTransactionType | ''
  ticker: string
  exchange: string
  cashAccountName: string
  toCashAccountName: string
  chosenField: TeachField | null
  notes: string
}

const TX_TYPE_LABELS: Record<CsvTransactionType, string> = {
  SECURITY_BUY: 'קניית ני"ע',
  SECURITY_SELL: 'מכירת ני"ע',
  DIVIDEND: 'דיבידנד',
  CASH_DEPOSIT: 'הפקדה',
  CASH_WITHDRAWAL: 'משיכה',
  FX_CONVERSION: 'המרת מט"ח (ILS → USD)',
  COMMISSION: 'עמלה',
  IGNORE: 'התעלם מהשורה',
}

const TX_TYPE_OPTIONS: CsvTransactionType[] = [
  'SECURITY_BUY', 'SECURITY_SELL', 'DIVIDEND',
  'CASH_DEPOSIT', 'CASH_WITHDRAWAL', 'FX_CONVERSION', 'COMMISSION', 'IGNORE',
]

// ─── Sub-components ───────────────────────────────

function Badge({ type }: { type: CsvTransactionType }) {
  const colors: Record<CsvTransactionType, string> = {
    SECURITY_BUY: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
    SECURITY_SELL: 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300',
    DIVIDEND: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
    CASH_DEPOSIT: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
    CASH_WITHDRAWAL: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
    FX_CONVERSION: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300',
    COMMISSION: 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300',
    IGNORE: 'bg-muted text-muted-foreground',
  }
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${colors[type]}`}>
      {TX_TYPE_LABELS[type]}
    </span>
  )
}

function RowTable({ row }: { row: Record<string, string> }) {
  return (
    <div className="rounded-lg border text-xs overflow-x-auto max-h-40 overflow-y-auto">
      <table className="w-full">
        <tbody>
          {Object.entries(row).map(([k, v]) => (
            <tr key={k} className="border-b last:border-0">
              <td className="px-2 py-1 font-medium text-muted-foreground w-2/5 whitespace-nowrap">{k}</td>
              <td className="px-2 py-1">{v || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// Shows what the system understood + what it will do for a classified row
function InterpretationCard({ c }: { c: ClassifiedRow }) {
  const [showRaw, setShowRaw] = useState(false)
  const interp = interpretRow(c)
  const hasWarnings = interp.warnings.length > 0

  return (
    <div className={`rounded-xl border p-4 space-y-2 text-sm ${hasWarnings ? 'border-amber-300 bg-amber-50/40 dark:bg-amber-900/10' : 'bg-card'}`}>
      {/* Header row */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <Badge type={c.type} />
          {c.type !== 'IGNORE' && (
            <span className="text-xs text-muted-foreground">
              {extractFields(c.row).date || 'ללא תאריך'}
            </span>
          )}
        </div>
        <button
          onClick={() => setShowRaw(v => !v)}
          className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 shrink-0"
          title="הצג שורה גולמית"
        >
          <Eye className="h-3 w-3" />
          {showRaw ? 'הסתר' : 'פרטים'}
        </button>
      </div>

      {/* Understood */}
      <div className="space-y-0.5">
        <p className="text-xs font-medium text-muted-foreground">מה הבינה המערכת</p>
        <p className="font-medium">{interp.understood}</p>
      </div>

      {/* Will do */}
      <div className="space-y-0.5">
        <p className="text-xs font-medium text-muted-foreground">מה יתעדכן</p>
        <p className="text-muted-foreground text-xs">{interp.willDo}</p>
      </div>

      {/* Warnings */}
      {hasWarnings && (
        <div className="space-y-0.5">
          {interp.warnings.map((w, i) => (
            <p key={i} className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1">
              <AlertCircle className="h-3 w-3 shrink-0" />
              {w}
            </p>
          ))}
        </div>
      )}

      {/* Raw row */}
      {showRaw && <RowTable row={c.row} />}
    </div>
  )
}

// ─── Main component ───────────────────────────────

export function CsvImportClient({ portfolioId }: { portfolioId: string }) {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)

  const [step, setStep] = useState<Step>('upload')
  const [allRows, setAllRows] = useState<Record<string, string>[]>([])
  const [classified, setClassified] = useState<ClassifiedRow[]>([])
  const [unknowns, setUnknowns] = useState<UnknownRow[]>([])
  const [rules, setRules] = useState<CsvRule[]>([])
  const [teach, setTeach] = useState<TeachState | null>(null)
  const [savingRule, setSavingRule] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const [importResult, setImportResult] = useState<{ imported: number; skipped: number; errors: string[] } | null>(null)
  const [expandedUnknowns, setExpandedUnknowns] = useState<Set<number>>(new Set())
  const [showIgnored, setShowIgnored] = useState(false)

  const loadRules = useCallback(async () => {
    const res = await fetch('/api/csv-rules')
    if (res.ok) {
      const data = await res.json()
      return data.rules as CsvRule[]
    }
    return []
  }, [])

  async function handleFile(f: File) {
    if (!f.name.endsWith('.csv')) { setErrorMsg('אנא העלה קובץ CSV'); return }
    const text = await readCsvWithEncoding(f)
    const rows = parseCsv(text)
    if (rows.length === 0) { setErrorMsg('הקובץ ריק או לא תקין'); return }
    setAllRows(rows)
    setErrorMsg('')
    const existingRules = await loadRules()
    setRules(existingRules)
    const { classified: c, unknown: u } = classifyAll(rows, existingRules)
    setClassified(c)
    setUnknowns(u)
    setStep('classify')
  }

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (f) handleFile(f)
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault()
    const f = e.dataTransfer.files?.[0]
    if (f) handleFile(f)
  }

  function startTeach(u: UnknownRow) {
    const fields = Object.entries(u.row).filter(([, v]) => v.trim()).map(([k]) => k)
    setTeach({
      row: u,
      transactionType: '',
      ticker: '',
      exchange: 'TASE',
      cashAccountName: 'מזומן ₪',
      toCashAccountName: 'מזומן $',
      chosenField: fields[0] ? { field: fields[0], matchType: 'equals' } : null,
      notes: '',
    })
  }

  async function saveRule() {
    if (!teach || !teach.transactionType || !teach.chosenField) return
    setSavingRule(true)

    const pattern = buildPatternFromRow(
      teach.row.row,
      teach.chosenField.field,
      teach.chosenField.matchType,
    )

    const res = await fetch('/api/csv-rules', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pattern,
        transactionType: teach.transactionType,
        ticker: teach.ticker || undefined,
        exchange: teach.exchange || undefined,
        cashAccountName: teach.cashAccountName || undefined,
        toCashAccountName: teach.toCashAccountName || undefined,
        notes: teach.notes || undefined,
      }),
    })

    if (!res.ok) { setErrorMsg('שגיאה בשמירת כלל'); setSavingRule(false); return }

    const { rule } = await res.json()
    const newRule = rule as CsvRule
    setRules(prev => [...prev, newRule])

    const remainingUnknowns = unknowns.filter(u => u.index !== teach.row.index)
    const { nowClassified, stillUnknown } = applyRuleToUnknowns(remainingUnknowns, newRule)

    const taughtClassified: ClassifiedRow = {
      index: teach.row.index,
      row: teach.row.row,
      type: teach.transactionType as CsvTransactionType,
      ticker: teach.ticker || undefined,
      exchange: teach.exchange || undefined,
      cashAccountName: teach.cashAccountName || undefined,
      toCashAccountName: teach.toCashAccountName || undefined,
      ruleId: newRule.id,
    }

    setClassified(prev => [...prev, taughtClassified, ...nowClassified])
    setUnknowns(stillUnknown)
    setTeach(null)
    setSavingRule(false)
  }

  function skipRow(u: UnknownRow) {
    setClassified(prev => [...prev, { index: u.index, row: u.row, type: 'IGNORE' }])
    setUnknowns(prev => prev.filter(x => x.index !== u.index))
  }

  function proceedToPreview() {
    if (unknowns.length > 0) {
      setErrorMsg('יש שורות לא מזוהות — יש ללמד את המערכת לפני שניתן להמשיך')
      return
    }
    setErrorMsg('')
    setStep('preview')
  }

  function buildTransactions() {
    return [...classified]
      .sort((a, b) => a.index - b.index)
      .map(c => {
        if (c.type === 'IGNORE') return { type: 'IGNORE', date: undefined }
        const { date, shares, price, amount, usdAmount, currency } = extractFields(c.row)
        const effectivePrice = price || (shares > 0 ? amount / shares : 0)
        switch (c.type) {
          case 'SECURITY_BUY': return { type: 'SECURITY_BUY', date, ticker: c.ticker || '', exchange: c.exchange || 'TASE', shares, pricePerShare: effectivePrice, currency }
          case 'SECURITY_SELL': return { type: 'SECURITY_SELL', date, ticker: c.ticker || '', exchange: c.exchange || 'TASE', shares, pricePerShare: effectivePrice, currency }
          case 'DIVIDEND': return { type: 'DIVIDEND', date, ticker: c.ticker || '', exchange: c.exchange || 'TASE', amount, currency, cashAccountName: c.cashAccountName }
          case 'CASH_DEPOSIT': return { type: 'CASH_DEPOSIT', date, amount, currency, cashAccountName: c.cashAccountName || 'מזומן ₪' }
          case 'CASH_WITHDRAWAL': return { type: 'CASH_WITHDRAWAL', date, amount, currency, cashAccountName: c.cashAccountName || 'מזומן ₪' }
          case 'FX_CONVERSION': return { type: 'FX_CONVERSION', date, ilsAmount: amount, ilsCashAccountName: c.cashAccountName || 'מזומן ₪', usdAmount, usdCashAccountName: c.toCashAccountName || 'מזומן $' }
          case 'COMMISSION': return { type: 'COMMISSION', date, amount, currency }
        }
      })
  }

  async function runImport() {
    setStep('importing')
    try {
      const res = await fetch('/api/import/csv', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ portfolioId, transactions: buildTransactions() }),
      })
      const data = await res.json()
      if (!res.ok) { setErrorMsg(data.error ?? 'שגיאה בייבוא'); setStep('preview'); return }
      setImportResult(data)
      setStep('done')
    } catch {
      setErrorMsg('שגיאת רשת')
      setStep('preview')
    }
  }

  // ─── Render: upload ───────────────────────────────

  if (step === 'upload') {
    return (
      <div className="max-w-xl space-y-6">
        <div>
          <h1 className="text-2xl font-bold">ייבוא תנועות מהברוקר (CSV)</h1>
          <p className="text-sm text-muted-foreground mt-1">
            העלה קובץ CSV של דף תנועות חשבון. המערכת תזהה אוטומטית את סוגי הפעולות.
          </p>
        </div>
        {errorMsg && (
          <div className="flex items-center gap-2 text-destructive text-sm">
            <AlertCircle className="h-4 w-4 shrink-0" />{errorMsg}
          </div>
        )}
        <div
          className="border-2 border-dashed rounded-xl p-10 text-center cursor-pointer hover:bg-muted/30 transition-colors"
          onDragOver={(e) => e.preventDefault()}
          onDrop={onDrop}
          onClick={() => inputRef.current?.click()}
        >
          <Upload className="h-8 w-8 mx-auto mb-3 text-muted-foreground" />
          <p className="font-medium text-sm">גרור קובץ CSV לכאן</p>
          <p className="text-xs text-muted-foreground mt-1">או לחץ לבחירה</p>
          <input ref={inputRef} type="file" accept=".csv" className="hidden" onChange={onFileChange} />
        </div>
      </div>
    )
  }

  // ─── Render: classify ─────────────────────────────

  if (step === 'classify') {
    const sortedClassified = [...classified].sort((a, b) => a.index - b.index)
    const active = sortedClassified.filter(c => c.type !== 'IGNORE')
    const ignored = sortedClassified.filter(c => c.type === 'IGNORE')
    const warnings = active.filter(c => interpretRow(c).warnings.length > 0)

    return (
      <div className="max-w-2xl space-y-6">
        <div>
          <h1 className="text-2xl font-bold">סקירת תנועות</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {allRows.length} שורות · {active.length} זוהו · {unknowns.length} לא זוהו
            {warnings.length > 0 && ` · ${warnings.length} עם אזהרות`}
          </p>
        </div>

        {errorMsg && (
          <div className="flex items-center gap-2 text-destructive text-sm">
            <AlertCircle className="h-4 w-4 shrink-0" />{errorMsg}
          </div>
        )}

        {/* Unknown rows */}
        {unknowns.length > 0 && (
          <section className="space-y-3">
            <h2 className="text-sm font-semibold flex items-center gap-2">
              <HelpCircle className="h-4 w-4 text-amber-500" />
              שורות לא מזוהות ({unknowns.length})
            </h2>
            {unknowns.map(u => (
              <div key={u.index} className="rounded-xl border border-amber-200 bg-amber-50/40 dark:bg-amber-900/10 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <button
                    className="text-xs text-muted-foreground flex items-center gap-1"
                    onClick={() => setExpandedUnknowns(prev => {
                      const s = new Set(prev)
                      s.has(u.index) ? s.delete(u.index) : s.add(u.index)
                      return s
                    })}
                  >
                    {expandedUnknowns.has(u.index) ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                    שורה {u.index + 1}
                  </button>
                  <div className="flex gap-2">
                    <button className="text-xs text-muted-foreground hover:text-foreground underline" onClick={() => skipRow(u)}>
                      התעלם
                    </button>
                    <button
                      className="rounded-md bg-primary text-primary-foreground px-3 py-1 text-xs font-medium hover:opacity-90"
                      onClick={() => startTeach(u)}
                    >
                      לַמֵּד
                    </button>
                  </div>
                </div>
                {expandedUnknowns.has(u.index)
                  ? <RowTable row={u.row} />
                  : <p className="text-xs text-muted-foreground truncate">{Object.values(u.row).filter(Boolean).slice(0, 5).join(' · ')}</p>
                }
              </div>
            ))}
          </section>
        )}

        {/* Classified rows — full interpretation cards */}
        {active.length > 0 && (
          <section className="space-y-3">
            <h2 className="text-sm font-semibold text-muted-foreground">פעולות מזוהות ({active.length})</h2>
            {active.map(c => (
              <InterpretationCard key={c.index} c={c} />
            ))}
          </section>
        )}

        {/* Ignored rows (collapsed by default) */}
        {ignored.length > 0 && (
          <section>
            <button
              className="text-xs text-muted-foreground underline"
              onClick={() => setShowIgnored(v => !v)}
            >
              {showIgnored ? 'הסתר' : 'הצג'} {ignored.length} שורות שידולגו
            </button>
            {showIgnored && (
              <div className="mt-2 space-y-1">
                {ignored.map(c => (
                  <p key={c.index} className="text-xs text-muted-foreground px-2">
                    שורה {c.index + 1}: {Object.values(c.row).filter(Boolean).slice(0, 3).join(' · ')}
                  </p>
                ))}
              </div>
            )}
          </section>
        )}

        <div className="flex gap-2 pt-2">
          <button onClick={() => setStep('upload')} className="rounded-lg border px-4 py-2 text-sm font-medium hover:bg-muted">
            ביטול
          </button>
          <button
            onClick={proceedToPreview}
            disabled={unknowns.length > 0}
            className="flex-1 rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {unknowns.length > 0 ? `ממתין לזיהוי ${unknowns.length} שורות` : `אשר ויבא ${active.length} פעולות`}
          </button>
        </div>

        {/* Teach dialog */}
        {teach && (
          <TeachDialog
            teach={teach}
            onChange={setTeach}
            onSave={saveRule}
            onClose={() => setTeach(null)}
            saving={savingRule}
          />
        )}
      </div>
    )
  }

  // ─── Render: preview ──────────────────────────────

  if (step === 'preview') {
    const active = [...classified].sort((a, b) => a.index - b.index).filter(c => c.type !== 'IGNORE')
    const withWarnings = active.filter(c => interpretRow(c).warnings.length > 0)

    return (
      <div className="max-w-2xl space-y-6">
        <div>
          <h1 className="text-2xl font-bold">אישור סופי</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {active.length} פעולות יתווספו לתיק
            {withWarnings.length > 0 && ` · ${withWarnings.length} עם אזהרות`}
          </p>
        </div>

        {errorMsg && (
          <div className="flex items-center gap-2 text-destructive text-sm">
            <AlertCircle className="h-4 w-4 shrink-0" />{errorMsg}
          </div>
        )}

        {withWarnings.length > 0 && (
          <div className="rounded-xl border border-amber-200 bg-amber-50/40 dark:bg-amber-900/10 p-4 text-sm space-y-1">
            <p className="font-medium flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-amber-500" />
              שים לב — {withWarnings.length} פעולות עם נתונים חסרים
            </p>
            <p className="text-xs text-muted-foreground">
              ניתן לייבא בכל זאת, אך כדאי לבדוק את השורות המסומנות.
            </p>
          </div>
        )}

        <div className="space-y-3 max-h-[60vh] overflow-y-auto">
          {active.map(c => (
            <InterpretationCard key={c.index} c={c} />
          ))}
        </div>

        <div className="flex gap-2 pt-2">
          <button onClick={() => setStep('classify')} className="rounded-lg border px-4 py-2 text-sm font-medium hover:bg-muted">
            חזרה לסקירה
          </button>
          <button onClick={runImport} className="flex-1 rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:opacity-90">
            ייבא {active.length} פעולות
          </button>
        </div>
      </div>
    )
  }

  // ─── Render: importing ────────────────────────────

  if (step === 'importing') {
    return (
      <div className="flex items-center justify-center gap-3 py-20 text-sm text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />מייבא תנועות…
      </div>
    )
  }

  // ─── Render: done ─────────────────────────────────

  if (step === 'done' && importResult) {
    return (
      <div className="max-w-xl rounded-xl border bg-card p-8 text-center space-y-4">
        <CheckCircle2 className="h-12 w-12 text-gain mx-auto" />
        <div>
          <p className="font-semibold text-lg">הייבוא הושלם!</p>
          <p className="text-sm text-muted-foreground mt-1">
            {importResult.imported} פעולות יובאו
            {importResult.skipped > 0 && ` · ${importResult.skipped} דולגו`}
          </p>
          {importResult.errors.length > 0 && (
            <p className="text-sm text-destructive mt-1">
              {importResult.errors.length} שגיאות: {importResult.errors.join(', ')}
            </p>
          )}
        </div>
        <button onClick={() => router.push('/my-portfolio')} className="rounded-lg bg-primary text-primary-foreground px-6 py-2 text-sm font-medium hover:opacity-90">
          לתיק שלי
        </button>
      </div>
    )
  }

  return null
}

// ─── Teach dialog ─────────────────────────────────

function TeachDialog({
  teach, onChange, onSave, onClose, saving,
}: {
  teach: TeachState
  onChange: (t: TeachState) => void
  onSave: () => void
  onClose: () => void
  saving: boolean
}) {
  const fields = Object.entries(teach.row.row).filter(([, v]) => v.trim())
  const needsTicker = ['SECURITY_BUY', 'SECURITY_SELL', 'DIVIDEND'].includes(teach.transactionType)
  const needsFx = teach.transactionType === 'FX_CONVERSION'
  const needsCash = ['CASH_DEPOSIT', 'CASH_WITHDRAWAL', 'DIVIDEND'].includes(teach.transactionType)

  // Live preview of interpretation while teaching
  const livePreview: ClassifiedRow | null = teach.transactionType
    ? {
        index: teach.row.index,
        row: teach.row.row,
        type: teach.transactionType as CsvTransactionType,
        ticker: teach.ticker || undefined,
        exchange: teach.exchange || undefined,
        cashAccountName: teach.cashAccountName || undefined,
        toCashAccountName: teach.toCashAccountName || undefined,
      }
    : null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-card rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-6 space-y-5">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-lg">לַמֵּד את המערכת</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>

        <RowTable row={teach.row.row} />

        {/* Transaction type */}
        <div className="space-y-1.5">
          <label className="text-sm font-medium">סוג פעולה</label>
          <select
            className="w-full rounded-lg border bg-background px-3 py-2 text-sm"
            value={teach.transactionType}
            onChange={e => onChange({ ...teach, transactionType: e.target.value as CsvTransactionType })}
          >
            <option value="">בחר…</option>
            {TX_TYPE_OPTIONS.map(t => (
              <option key={t} value={t}>{TX_TYPE_LABELS[t]}</option>
            ))}
          </select>
        </div>

        {needsTicker && (
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">טיקר</label>
              <input
                className="w-full rounded-lg border bg-background px-3 py-2 text-sm font-mono uppercase"
                placeholder="AAPL / 1111111"
                value={teach.ticker}
                onChange={e => onChange({ ...teach, ticker: e.target.value.toUpperCase() })}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">בורסה</label>
              <select
                className="w-full rounded-lg border bg-background px-3 py-2 text-sm"
                value={teach.exchange}
                onChange={e => onChange({ ...teach, exchange: e.target.value })}
              >
                <option value="TASE">TASE (ת"א)</option>
                <option value="NYSE">NYSE</option>
                <option value="NASDAQ">NASDAQ</option>
                <option value="OTHER">OTHER</option>
              </select>
            </div>
          </div>
        )}

        {needsCash && !needsFx && (
          <div className="space-y-1.5">
            <label className="text-sm font-medium">חשבון מזומן</label>
            <input
              className="w-full rounded-lg border bg-background px-3 py-2 text-sm"
              value={teach.cashAccountName}
              onChange={e => onChange({ ...teach, cashAccountName: e.target.value })}
            />
          </div>
        )}

        {needsFx && (
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">חשבון ILS (מקור)</label>
              <input
                className="w-full rounded-lg border bg-background px-3 py-2 text-sm"
                value={teach.cashAccountName}
                onChange={e => onChange({ ...teach, cashAccountName: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">חשבון USD (יעד)</label>
              <input
                className="w-full rounded-lg border bg-background px-3 py-2 text-sm"
                value={teach.toCashAccountName}
                onChange={e => onChange({ ...teach, toCashAccountName: e.target.value })}
              />
            </div>
          </div>
        )}

        {/* Pattern field picker */}
        <div className="space-y-2">
          <label className="text-sm font-medium">זהה שורות דומות לפי שדה</label>
          <div className="space-y-1.5 max-h-36 overflow-y-auto">
            {fields.map(([k, v]) => (
              <label key={k} className="flex items-start gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="patternField"
                  className="mt-1"
                  checked={teach.chosenField?.field === k}
                  onChange={() => onChange({ ...teach, chosenField: { field: k, matchType: 'equals' } })}
                />
                <span className="text-xs">
                  <span className="font-medium">{k}</span>{' = '}
                  <span className="text-muted-foreground">{v}</span>
                </span>
              </label>
            ))}
          </div>
          {teach.chosenField && (
            <div className="flex gap-3 mt-1 text-xs">
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input type="radio" checked={teach.chosenField.matchType === 'equals'} onChange={() => onChange({ ...teach, chosenField: { ...teach.chosenField!, matchType: 'equals' } })} />
                זהה בדיוק
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input type="radio" checked={teach.chosenField.matchType === 'contains'} onChange={() => onChange({ ...teach, chosenField: { ...teach.chosenField!, matchType: 'contains' } })} />
                מכיל
              </label>
            </div>
          )}
        </div>

        {/* Live preview */}
        {livePreview && (
          <div className="rounded-lg bg-muted/50 p-3 space-y-1 text-xs">
            <p className="font-medium text-muted-foreground">תצוגה מקדימה</p>
            <p className="font-medium">{interpretRow(livePreview).understood}</p>
            <p className="text-muted-foreground">{interpretRow(livePreview).willDo}</p>
          </div>
        )}

        <div className="flex gap-2 pt-1">
          <button onClick={onClose} className="rounded-lg border px-4 py-2 text-sm font-medium hover:bg-muted">
            ביטול
          </button>
          <button
            onClick={onSave}
            disabled={saving || !teach.transactionType || !teach.chosenField}
            className="flex-1 rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin mx-auto" /> : 'שמור כלל ויישם'}
          </button>
        </div>
      </div>
    </div>
  )
}
