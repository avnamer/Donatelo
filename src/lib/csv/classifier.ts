// CSV row classifier — rules-first, returns null for unknowns

export type CsvTransactionType =
  | 'SECURITY_BUY'
  | 'SECURITY_SELL'
  | 'DIVIDEND'
  | 'CASH_DEPOSIT'
  | 'CASH_WITHDRAWAL'
  | 'FX_CONVERSION'  // ILS → USD (or reverse)
  | 'COMMISSION'
  | 'TAX_ILS'
  | 'TAX_USD'
  | 'IGNORE'

export interface CsvRule {
  id: string
  pattern: Record<string, { contains?: string; equals?: string; startsWith?: string }>
  transactionType: CsvTransactionType
  // Static values (cash / FX / commission types)
  ticker?: string | null
  exchange?: string | null
  cashAccountName?: string | null
  toCashAccountName?: string | null
  notes?: string | null
  // Column mappings — for security types, read dynamically from each row
  tickerColumn?: string | null   // security NUMBER / symbol column
  nameColumn?: string | null     // security NAME column — ticker fallback for foreign (code 99028)
  sharesColumn?: string | null
  priceColumn?: string | null
  amountColumn?: string | null
  currencyColumn?: string | null  // column that holds the row's currency (ILS/USD)
  exchangeForUsd?: string | null  // 'NYSE' | 'NASDAQ' when currency is USD
}

export interface ClassifiedRow {
  index: number
  row: Record<string, string>
  type: CsvTransactionType
  // Resolved at classification time from column mappings or static values
  ticker?: string
  exchange?: string
  cashAccountName?: string
  toCashAccountName?: string
  // Column references carried forward so buildTransactions can re-resolve
  tickerColumn?: string
  nameColumn?: string
  sharesColumn?: string
  priceColumn?: string
  amountColumn?: string
  currencyColumn?: string
  exchangeForUsd?: string
  ruleId?: string
}

export interface UnknownRow {
  index: number
  row: Record<string, string>
}

// ─── Special sentinel values in the security-number ("מספר נייר / סימבול") column ──
export const FOREIGN_SECURITY_CODE = '99028' // not traded in TASE — use name column for ticker
export const CASH_FEE_CODE = '900'           // not a security — cash deposit or management/usage fee

const ILS_CURRENCY_VARIANTS = ['ILS', '₪', 'שח', 'ש"ח', "ש'ח"]

// Normalize a raw currency cell to 'ILS' | 'USD' | '' (unknown)
export function normalizeCurrency(raw: string | undefined | null): 'ILS' | 'USD' | '' {
  const c = (raw ?? '').trim().toUpperCase()
  if (c === 'USD' || c === '$') return 'USD'
  if (ILS_CURRENCY_VARIANTS.includes(c)) return 'ILS'
  return ''
}

// Is this row a foreign (non-TASE) security? Currency column wins; label hints + 99028 are fallbacks.
export function isForeignRow(
  row: Record<string, string>,
  opts: { currencyColumn?: string | null; securityNumber?: string } = {},
): boolean {
  const cur = opts.currencyColumn
    ? normalizeCurrency(row[opts.currencyColumn])
    : normalizeCurrency(row['מטבע'] || row['Currency'] || row['currency'])
  if (cur === 'USD') return true
  if (cur === 'ILS') return false
  if (opts.securityNumber === FOREIGN_SECURITY_CODE) return true
  // Label hints: חול / מטח → foreign; רצף / שח → local
  const hay = Object.values(row).join(' ')
  if (hay.includes('חול') || hay.includes('מטח')) return true
  return false
}

// Guess the transaction type from a row's cell text + the security-number sentinel.
export function guessType(
  row: Record<string, string>,
  opts: { securityNumber?: string; foreign?: boolean; amountSign?: number } = {},
): CsvTransactionType | '' {
  const cells = Object.values(row)
  const has = (kw: string) => cells.some(v => v.includes(kw))
  const hasToken = (kw: string) => cells.some(v => v.split(/\s+/).includes(kw))
  const foreign = opts.foreign ?? false

  // Specific labels first — דיבידנד / מס / עמלה must beat הפקדה / משיכה,
  // since "הפקדה דיבידנד" and "משיכת מס" contain both words.
  if (has('דיבידנד') || has('דיבדנד') || has('dividend')) return 'DIVIDEND'
  if (hasToken('מס') || has('tax')) return foreign ? 'TAX_USD' : 'TAX_ILS'
  if (has('דמי ניהול') || has('דמי שימוש') || has('דמי') || has('עמלה') || has('commission') || has('fee'))
    return 'COMMISSION'
  if (has('המרה') || has('conversion') || has('FX')) return 'FX_CONVERSION'

  // 900 in the security-number column => never a security trade.
  const isCashFee = opts.securityNumber === CASH_FEE_CODE
  if (!isCashFee) {
    if (has('מכירה') || has('sell')) return 'SECURITY_SELL'
    if (has('קניה') || has('קנייה') || has('buy')) return 'SECURITY_BUY'
  }

  if (has('העברה') && has('מזומן')) return (opts.amountSign ?? 0) < 0 ? 'CASH_WITHDRAWAL' : 'CASH_DEPOSIT'
  if (has('הפקדה') || has('deposit')) return 'CASH_DEPOSIT'
  if (has('משיכה') || has('משיכת') || has('withdrawal')) return 'CASH_WITHDRAWAL'

  if (isCashFee) return 'CASH_DEPOSIT' // 900 with no clearer label → treat as cash deposit
  return ''
}

// Pick the column that best discriminates row types (the transaction-type-label column),
// and report how many of the given unknown rows it will match with equals.
export function guessSignature(
  row: Record<string, string>,
  allRows: Record<string, string>[],
  preferColumn?: string,
): { field: string; matchType: 'equals' | 'contains'; matchCount: number } | null {
  const entries = Object.entries(row).filter(([, v]) => v.trim())
  if (entries.length === 0) return null

  const isNumericish = (v: string) => /^[\d.,\s/:-]+$/.test(v.trim())
  const countMatches = (field: string, value: string) =>
    allRows.filter(r => (r[field] ?? '').trim() === value.trim()).length

  // 1. Prefer the column where guessType found its keyword (caller hint).
  if (preferColumn && row[preferColumn]?.trim()) {
    return { field: preferColumn, matchType: 'equals', matchCount: countMatches(preferColumn, row[preferColumn]) }
  }

  // 2. Otherwise: best non-numeric column whose value repeats most across rows.
  const candidates = entries
    .filter(([, v]) => !isNumericish(v))
    .map(([k, v]) => ({ field: k, value: v, count: countMatches(k, v) }))
    .sort((a, b) => b.count - a.count)

  const best = candidates[0] ?? { field: entries[0][0], value: entries[0][1], count: countMatches(entries[0][0], entries[0][1]) }
  return { field: best.field, matchType: 'equals', matchCount: best.count }
}

function matchesPattern(
  row: Record<string, string>,
  pattern: CsvRule['pattern'],
): boolean {
  for (const [field, matcher] of Object.entries(pattern)) {
    const cellRaw = row[field]
    if (cellRaw === undefined) return false
    const cell = cellRaw.trim()
    if (matcher.equals !== undefined && cell !== matcher.equals) return false
    if (matcher.contains !== undefined && !cell.includes(matcher.contains)) return false
    if (matcher.startsWith !== undefined && !cell.startsWith(matcher.startsWith)) return false
  }
  return true
}

// Resolve the ticker from a row, applying the foreign-security (99028) fallback to the name column.
export function resolveSecurityTicker(
  row: Record<string, string>,
  opts: { tickerColumn?: string | null; nameColumn?: string | null; staticTicker?: string | null },
): string | undefined {
  if (!opts.tickerColumn) return opts.staticTicker ?? undefined
  const num = (row[opts.tickerColumn] ?? '').trim()
  if (num === FOREIGN_SECURITY_CODE && opts.nameColumn) {
    return (row[opts.nameColumn] ?? '').trim()
  }
  return num
}

// Determine exchange. Currency column wins; the 99028 sentinel forces foreign as a fallback.
export function resolveExchange(
  row: Record<string, string>,
  exchangeForUsd?: string | null,
  currencyColumn?: string | null,
  tickerColumn?: string | null,
): string {
  const cur = currencyColumn
    ? normalizeCurrency(row[currencyColumn])
    : normalizeCurrency(row['מטבע'] || row['Currency'] || row['currency'])
  if (cur === 'USD') return exchangeForUsd || 'NYSE'
  if (cur === 'ILS') return 'TASE'
  // No currency signal — fall back to the 99028 sentinel and label hints.
  const secNum = tickerColumn ? (row[tickerColumn] ?? '').trim() : ''
  if (isForeignRow(row, { currencyColumn, securityNumber: secNum })) return exchangeForUsd || 'NYSE'
  return 'TASE'
}

function classifiedFromRule(row: Record<string, string>, rule: CsvRule): Omit<ClassifiedRow, 'index'> {
  // Resolve ticker: prefer column mapping (with 99028→name fallback) over static value
  const ticker = rule.tickerColumn
    ? resolveSecurityTicker(row, { tickerColumn: rule.tickerColumn, nameColumn: rule.nameColumn, staticTicker: rule.ticker })
    : (rule.ticker ?? undefined)

  // Resolve exchange from currency if column mappings are used, else use static
  const exchange = rule.tickerColumn
    ? resolveExchange(row, rule.exchangeForUsd, rule.currencyColumn, rule.tickerColumn)
    : (rule.exchange ?? undefined)

  return {
    row,
    type: rule.transactionType,
    ticker,
    exchange,
    cashAccountName: rule.cashAccountName ?? undefined,
    toCashAccountName: rule.toCashAccountName ?? undefined,
    tickerColumn: rule.tickerColumn ?? undefined,
    nameColumn: rule.nameColumn ?? undefined,
    sharesColumn: rule.sharesColumn ?? undefined,
    priceColumn: rule.priceColumn ?? undefined,
    amountColumn: rule.amountColumn ?? undefined,
    currencyColumn: rule.currencyColumn ?? undefined,
    exchangeForUsd: rule.exchangeForUsd ?? undefined,
    ruleId: rule.id,
  }
}

export function classifyRow(
  row: Record<string, string>,
  rules: CsvRule[],
): ClassifiedRow | null {
  for (const rule of rules) {
    if (matchesPattern(row, rule.pattern)) {
      return { index: -1, ...classifiedFromRule(row, rule) }
    }
  }
  return null
}

export function classifyAll(
  rows: Record<string, string>[],
  rules: CsvRule[],
): { classified: ClassifiedRow[]; unknown: UnknownRow[] } {
  const classified: ClassifiedRow[] = []
  const unknown: UnknownRow[] = []

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    const result = classifyRow(row, rules)
    if (result) {
      classified.push({ ...result, index: i })
    } else {
      unknown.push({ index: i, row })
    }
  }

  return { classified, unknown }
}

export function buildPatternFromRow(
  row: Record<string, string>,
  chosenField: string,
  matchType: 'equals' | 'contains',
): CsvRule['pattern'] {
  const value = row[chosenField]?.trim() ?? ''
  return {
    [chosenField]: matchType === 'equals' ? { equals: value } : { contains: value },
  }
}

export function applyRuleToUnknowns(
  unknowns: UnknownRow[],
  rule: CsvRule,
): { nowClassified: ClassifiedRow[]; stillUnknown: UnknownRow[] } {
  const nowClassified: ClassifiedRow[] = []
  const stillUnknown: UnknownRow[] = []

  for (const u of unknowns) {
    if (matchesPattern(u.row, rule.pattern)) {
      nowClassified.push({ index: u.index, ...classifiedFromRule(u.row, rule) })
    } else {
      stillUnknown.push(u)
    }
  }

  return { nowClassified, stillUnknown }
}
