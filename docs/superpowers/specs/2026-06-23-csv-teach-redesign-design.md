# CSV Teach Dialog Redesign — "Confirmation Card"

**Date:** 2026-06-23
**File touched:** `src/components/import/CsvImportClient.tsx` (and `src/lib/csv/classifier.ts` for shared helpers)
**Data model:** one small additive column — `CsvImportRule.nameColumn` (`name_column`, nullable). Holds the security-NAME column used as the ticker fallback for foreign securities. Everything else unchanged. All other detection happens client-side before save.

## Problem

The current teach dialog shows the **same row data four times**:
1. `RowTable` — raw data at top
2. Column-mapping grid — 5 dropdowns the user fills manually
3. "זהה שורות דומות לפי שדה" — a radio list of *every* column + equals/contains
4. "תצוגה מקדימה" — the interpretation again at the bottom

The system already displays that it received the data clearly (top), then asks the user to re-map everything manually. This is tedious, ugly, and redundant. Detection is also weak — it does not guess the transaction type, and currency detection misses real broker labels.

## Goal

Invert the model from **"fill a form"** to **"confirm a detection"**. The system auto-detects transaction type, columns, currency/exchange, and the signature field for matching similar rows. It presents **one** clear interpretation sentence. The user confirms; corrections are collapsed and only opened when something is wrong. Teaching one row applies the rule to all similar rows automatically (existing `applyRuleToUnknowns`).

## Design — Approach A: Confirmation Card

### Layout

```
┌──────────────────────────────────────────┐
│ לַמֵּד את המערכת                      ✕   │
├──────────────────────────────────────────┤
│  סוג פעולה:  [ דיבידנד ▾ ]   ← נוחש מראש │
│                                            │
│  ✓ זוהה:                                   │
│    דיבידנד מ-GOOGL בסך $1,500 בבורסת NASDAQ│
│  ← יעודכן: רשומת DIVIDEND + חשבון "$"      │
│  ⚠ [אזהרות אם יש]                          │
│                                            │
│  ▸ תקן זיהוי                    (מקופל)   │
│                                            │
│  ↻ יחול על עוד 4 שורות דומות               │
│     (עמודת "סוג פעולה" = דיבדנד) ▸ שנה    │
│                                            │
│  ▸ הצג נתונים גולמיים           (מקופל)   │
│                                            │
│  [ביטול]              [שמור ולמד  →]       │
└──────────────────────────────────────────┘
```

### Component structure

```
TeachDialog (compact)
├── Transaction type dropdown (pre-filled by guessType)
├── InterpretationCard (reuses interpretRow: understood + willDo + warnings)
├── <details> "תקן זיהוי"  — collapsed by default, opens existing column dropdowns + exchange + cash-account fields
├── "יחול על N שורות דומות (עמודה = ערך)" + ▸ שנה  → collapsed signature picker (the old radio list, hidden)
├── <details> "הצג נתונים גולמיים" — collapsed RowTable
└── [ביטול] [שמור ולמד]
```

Removed from the always-visible flow: the top `RowTable`, the always-expanded column grid, the always-visible signature radio list, and the separate live-preview block (the InterpretationCard *is* the live preview).

## Detection logic (new helpers in classifier.ts)

### `guessType(row): CsvTransactionType | ''`

Scans every cell's text. Checks keywords in **strict priority order** (first match wins). Keyword matching is substring-based (`includes`), except "מס" which matches as a space-delimited token to avoid false hits inside words like "מסחר".

Priority order (critical — dividend/tax/commission MUST precede deposit/withdrawal because labels like "הפקדה דיבידנד" and "משיכת מס" contain both words):

1. `דיבידנד` OR `דיבדנד` OR `dividend` → **DIVIDEND**
2. token `מס` OR `tax` → **TAX_USD** if label/currency is foreign, else **TAX_ILS**
3. `דמי ניהול` OR `דמי` OR `עמלה` OR `commission` OR `fee` → **COMMISSION**
4. `המרה` OR `FX` OR `conversion` → **FX_CONVERSION**
5. `מכירה` OR `sell` → **SECURITY_SELL**
6. `קניה` OR `קנייה` OR `buy` → **SECURITY_BUY**
7. `העברה` + `מזומן` → **CASH_DEPOSIT** / **CASH_WITHDRAWAL** by amount sign
8. `הפקדה` OR `deposit` → **CASH_DEPOSIT**
9. `משיכה` OR `משיכת` OR `withdrawal` → **CASH_WITHDRAWAL**
10. else → `''` (low confidence — leave dropdown on "בחר…", do not guess wildly)

Real broker labels this must handle (from user): `קניה שח`, `מכירה שח`, `מכירה רצף`, `משיכת מס חול מטח`, `הפקדה דיבידנד מטח`, `קניה רצף`, `העברה מזומן בשח`, `דיבדנד`, `קניה חול מטח`, `דמי ניהול מזומן בשח`.

### Security identifier resolution (the "מספר נייר / סימבול" column)

The broker's security-number/symbol column carries special sentinel values. Two columns matter:
- **`tickerColumn`** = the number/symbol column (`מספר נייר`, `סימבול`, `symbol`)
- **`nameColumn`** = the security-name column (`שם נייר`, `name`) — NEW

Resolution per row, by the value in `tickerColumn`:

| Value in security-number column | Meaning | Action |
|---|---|---|
| **99028** (exact) | Security NOT traded in Tel Aviv (foreign) | Ticker = value from `nameColumn`; exchange = NYSE/NASDAQ (foreign) |
| **900** (exact) | Not a security at all — cash deposit OR management/usage fee | Force a cash/fee classification; never SECURITY_*. Type label (`הפקדה`/`מזומן` → deposit; `דמי ניהול`/`דמי שימוש` → commission) disambiguates |
| any other number | Israeli security | Ticker = the number itself; exchange = TASE |
| letters / symbol (no number) | Foreign security (symbol given directly) | Ticker = that symbol; exchange = foreign |

Rule of thumb encoded: foreign securities show a letter ticker (or 99028 + name); Israeli securities show the numeric security number.

**Interaction with `guessType`:** a value of `900` in the security-number column is a strong negative signal — suppress SECURITY_BUY/SELL/DIVIDEND and fall through to the cash/fee keywords. A value of `99028` confirms "foreign" for exchange resolution.

### Currency / exchange resolution (priority)

1. **Currency column** (existing `currencyColumn` detection, incl. `$`/`₪`/`ILS`/`שח`/`ש"ח`) — **highest priority**. If the type label conflicts with the currency column, the currency column wins.
2. **Label hints** as fallback when no currency column is found:
   - `רצף` / `שח` / `בשח` → ILS → **TASE**
   - `חול` / `מטח` → USD → **NYSE/NASDAQ** (default NYSE, user-changeable)
3. Manual override (existing `exchangeOverride`).

### `guessSignature(row, allUnknowns): { field, matchType }`

Picks the column that best discriminates row types — which, given the data, is the transaction-type-label column itself:

- Prefer the column where `guessType` found its keyword match (single scan yields both type and signature).
- Otherwise prefer a **non-numeric** column (not date, not amount) whose value **repeats** across other unknown rows (so one rule catches several).
- Default `matchType: 'equals'`.
- Compute and display how many unknown rows the chosen signature will match.

## Behavior notes

- When `guessType` returns `''`, the InterpretationCard shows a neutral "בחר סוג פעולה" prompt and the save button stays disabled until a type is chosen.
- "תקן זיהוי" and the signature "שנה" link reuse the **existing** dropdowns/radio components — they are relocated into collapsed `<details>`, not rebuilt. The correction panel gains one new dropdown for `nameColumn` (security-name column).
- Save path (`saveRule`) and `buildTransactions` extend to carry `nameColumn` and apply the 99028/900 resolution; otherwise unchanged. `guessType`/`guessSignature` provide the new pre-fill.
- Schema: add nullable `nameColumn`/`name_column` to `CsvImportRule`, the Zod schema in `api/csv-rules`, and `CsvRule`/`ClassifiedRow` types. Applied via `prisma db push` (Vercel runs it on deploy).

## Out of scope (YAGNI)

- Inline-clickable interpretation sentence with popovers (Approach B).
- Any change to the import API contract beyond passing the resolved ticker/exchange (server already accepts those).
- Multi-row batch teaching UI — the existing one-row-teaches-many via `applyRuleToUnknowns` already covers it.
