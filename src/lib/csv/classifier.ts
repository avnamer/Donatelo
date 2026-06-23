// CSV row classifier — rules-first, returns null for unknowns

export type CsvTransactionType =
  | 'SECURITY_BUY'
  | 'SECURITY_SELL'
  | 'DIVIDEND'
  | 'CASH_DEPOSIT'
  | 'CASH_WITHDRAWAL'
  | 'FX_CONVERSION'  // ILS → USD (or reverse)
  | 'COMMISSION'
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
  tickerColumn?: string | null
  sharesColumn?: string | null
  priceColumn?: string | null
  amountColumn?: string | null
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
  sharesColumn?: string
  priceColumn?: string
  amountColumn?: string
  exchangeForUsd?: string
  ruleId?: string
}

export interface UnknownRow {
  index: number
  row: Record<string, string>
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

// Determine exchange from currency column value
function resolveExchange(row: Record<string, string>, exchangeForUsd?: string | null): string {
  const currencyRaw = row['מטבע'] || row['Currency'] || row['currency'] || ''
  const currency = currencyRaw.trim().toUpperCase()
  if (currency === 'USD') return exchangeForUsd || 'NYSE'
  return 'TASE'
}

function classifiedFromRule(row: Record<string, string>, rule: CsvRule): Omit<ClassifiedRow, 'index'> {
  // Resolve ticker: prefer column mapping over static value
  const ticker = rule.tickerColumn
    ? (row[rule.tickerColumn] ?? '').trim()
    : (rule.ticker ?? undefined)

  // Resolve exchange from currency if column mappings are used, else use static
  const exchange = rule.tickerColumn
    ? resolveExchange(row, rule.exchangeForUsd)
    : (rule.exchange ?? undefined)

  return {
    row,
    type: rule.transactionType,
    ticker,
    exchange,
    cashAccountName: rule.cashAccountName ?? undefined,
    toCashAccountName: rule.toCashAccountName ?? undefined,
    tickerColumn: rule.tickerColumn ?? undefined,
    sharesColumn: rule.sharesColumn ?? undefined,
    priceColumn: rule.priceColumn ?? undefined,
    amountColumn: rule.amountColumn ?? undefined,
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
