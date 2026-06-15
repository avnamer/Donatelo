// CSV row classifier — rules-first, returns null for unknowns

export type CsvTransactionType =
  | 'SECURITY_BUY'
  | 'SECURITY_SELL'
  | 'DIVIDEND'
  | 'CASH_DEPOSIT'
  | 'CASH_WITHDRAWAL'
  | 'FX_CONVERSION'  // ILS → USD (or reverse)
  | 'IGNORE'

export interface CsvRule {
  id: string
  // pattern: map of field name → { contains | equals | startsWith } value (all must match)
  pattern: Record<string, { contains?: string; equals?: string; startsWith?: string }>
  transactionType: CsvTransactionType
  ticker?: string | null
  exchange?: string | null
  cashAccountName?: string | null
  toCashAccountName?: string | null
  notes?: string | null
}

export interface ClassifiedRow {
  index: number
  row: Record<string, string>
  type: CsvTransactionType
  ticker?: string
  exchange?: string
  cashAccountName?: string
  toCashAccountName?: string
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

export function classifyRow(
  row: Record<string, string>,
  rules: CsvRule[],
): ClassifiedRow | null {
  for (const rule of rules) {
    if (matchesPattern(row, rule.pattern)) {
      return {
        index: -1,
        row,
        type: rule.transactionType,
        ticker: rule.ticker ?? undefined,
        exchange: rule.exchange ?? undefined,
        cashAccountName: rule.cashAccountName ?? undefined,
        toCashAccountName: rule.toCashAccountName ?? undefined,
        ruleId: rule.id,
      }
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

// Build a rule pattern from a sample row by picking all non-empty fields
// that look like good discriminators (short string fields).
// The caller should trim down to the most relevant field.
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

// After a rule is learned from one row, find all other unknown rows
// that now match it.
export function applyRuleToUnknowns(
  unknowns: UnknownRow[],
  rule: CsvRule,
): { nowClassified: ClassifiedRow[]; stillUnknown: UnknownRow[] } {
  const nowClassified: ClassifiedRow[] = []
  const stillUnknown: UnknownRow[] = []

  for (const u of unknowns) {
    if (matchesPattern(u.row, rule.pattern)) {
      nowClassified.push({
        index: u.index,
        row: u.row,
        type: rule.transactionType,
        ticker: rule.ticker ?? undefined,
        exchange: rule.exchange ?? undefined,
        cashAccountName: rule.cashAccountName ?? undefined,
        toCashAccountName: rule.toCashAccountName ?? undefined,
        ruleId: rule.id,
      })
    } else {
      stillUnknown.push(u)
    }
  }

  return { nowClassified, stillUnknown }
}
