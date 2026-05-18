// ─────────────────────────────────────────────
// Polygon.io API client — US stocks
// Docs: https://polygon.io/docs
//
// All prices returned as cents (USD × 100).
// We fetch & store in cache; callers read from cache.
// ─────────────────────────────────────────────

const BASE_URL = 'https://api.polygon.io'
const API_KEY = process.env.POLYGON_API_KEY!

// ─── Types ────────────────────────────────────

export interface PolygonBar {
  t: number   // Unix ms timestamp
  o: number   // open
  h: number   // high
  l: number   // low
  c: number   // close
  v: number   // volume
  vw: number  // volume-weighted average
}

export interface PolygonTickerDetail {
  ticker: string
  name: string
  market: string
  primary_exchange: string
  currency_name: string
}

export interface PolygonDividend {
  ex_dividend_date: string  // YYYY-MM-DD
  declaration_date?: string
  pay_date?: string
  cash_amount: number       // in USD (not cents)
  currency: string
  frequency?: number        // 1=annual, 2=semi, 4=quarterly, 12=monthly
}

// ─── Helpers ──────────────────────────────────

/**
 * Fetch from Polygon with automatic retry on 429 (rate limit).
 * Backs off with exponential delay: 1 s → 2 s → 4 s (max 3 attempts).
 */
async function polygonFetch<T>(path: string, params: Record<string, string> = {}): Promise<T> {
  const url = new URL(`${BASE_URL}${path}`)
  url.searchParams.set('apiKey', API_KEY)
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v)
  }

  const MAX_ATTEMPTS = 3
  let lastError: Error | null = null

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const res = await fetch(url.toString(), {
      next: { revalidate: 0 },  // never use Next.js cache — we manage our own
    })

    if (res.status === 429) {
      // Respect Retry-After header if present, else exponential backoff
      const retryAfter = res.headers.get('Retry-After')
      const delayMs = retryAfter
        ? parseFloat(retryAfter) * 1000
        : Math.pow(2, attempt) * 1000   // 1 s, 2 s, 4 s

      lastError = new Error(`Polygon rate limited (429): ${path}`)
      if (attempt < MAX_ATTEMPTS - 1) {
        await new Promise((r) => setTimeout(r, delayMs))
        continue
      }
      throw lastError
    }

    if (!res.ok) {
      throw new Error(`Polygon API error ${res.status}: ${path}`)
    }

    return res.json() as Promise<T>
  }

  throw lastError ?? new Error(`Polygon fetch failed: ${path}`)
}

/** Convert a USD dollar amount to cents (integer). */
export function dollarsToCents(dollars: number): bigint {
  return BigInt(Math.round(dollars * 100))
}

/** YYYYMMDD string for Polygon date params */
function toPolygonDate(d: Date): string {
  return d.toISOString().slice(0, 10)
}

// ─── Price fetching ───────────────────────────

/**
 * Latest closing price for a US ticker.
 * Returns price in cents, or null if not available.
 */
export async function fetchLatestUSPrice(
  ticker: string
): Promise<{ price: bigint; date: Date; currency: string } | null> {
  try {
    const data = await polygonFetch<{
      results?: { c: number; t: number }
      ticker?: string
    }>(`/v2/aggs/ticker/${ticker}/prev`)

    const bar = (data as any)?.results?.[0]
    if (!bar) return null

    return {
      price: dollarsToCents(bar.c),
      date: new Date(bar.t),
      currency: 'USD',
    }
  } catch {
    return null
  }
}

/**
 * Historical daily closes for a ticker between two dates.
 * Returns array sorted ascending by date.
 */
export async function fetchUSPriceHistory(
  ticker: string,
  from: Date,
  to: Date
): Promise<Array<{ date: Date; price: bigint; currency: string }>> {
  try {
    const data = await polygonFetch<{ results?: PolygonBar[] }>(
      `/v2/aggs/ticker/${ticker}/range/1/day/${toPolygonDate(from)}/${toPolygonDate(to)}`,
      { adjusted: 'true', sort: 'asc', limit: '5000' }
    )

    return (data.results ?? []).map((bar) => ({
      date: new Date(bar.t),
      price: dollarsToCents(bar.c),
      currency: 'USD',
    }))
  } catch {
    return []
  }
}

// ─── Ticker details ───────────────────────────

/**
 * Company/ETF name and exchange for a ticker.
 */
export async function fetchUSTickerDetail(
  ticker: string
): Promise<{ name: string; exchange: string } | null> {
  try {
    const data = await polygonFetch<{ results?: PolygonTickerDetail }>(
      `/v3/reference/tickers/${ticker}`
    )
    if (!data.results) return null
    return {
      name: data.results.name,
      exchange: data.results.primary_exchange,
    }
  } catch {
    return null
  }
}

// ─── Dividends ────────────────────────────────

/** Map numeric frequency to string label */
function mapFrequency(n?: number): string | undefined {
  if (!n) return undefined
  const map: Record<number, string> = {
    1: 'annual',
    2: 'semi-annual',
    4: 'quarterly',
    12: 'monthly',
  }
  return map[n] ?? 'irregular'
}

/**
 * Dividend events for a US ticker in the trailing 12 months.
 */
export async function fetchUSDividends(
  ticker: string
): Promise<
  Array<{
    exDate: Date
    declareDate?: Date
    payDate?: Date
    amountPerShare: bigint
    currency: string
    frequency?: string
  }>
> {
  try {
    const threeYearsAgo = new Date()
    threeYearsAgo.setFullYear(threeYearsAgo.getFullYear() - 3)

    const data = await polygonFetch<{ results?: PolygonDividend[] }>(
      `/v3/reference/dividends`,
      {
        ticker,
        'ex_dividend_date.gte': toPolygonDate(threeYearsAgo),
        limit: '100',
        sort: 'ex_dividend_date',
        order: 'desc',
      }
    )

    return (data.results ?? []).map((d) => ({
      exDate: new Date(d.ex_dividend_date),
      declareDate: d.declaration_date ? new Date(d.declaration_date) : undefined,
      payDate: d.pay_date ? new Date(d.pay_date) : undefined,
      amountPerShare: dollarsToCents(d.cash_amount),
      currency: d.currency ?? 'USD',
      frequency: mapFrequency(d.frequency),
    }))
  } catch {
    return []
  }
}

// ─── Split adjustment ─────────────────────────

export interface PolygonSplit {
  execution_date: string
  split_from: number
  split_to: number
}

/**
 * Stock splits for a ticker since a given date.
 * Used to adjust lot share counts after splits.
 */
export async function fetchUSSplits(
  ticker: string,
  since: Date
): Promise<PolygonSplit[]> {
  try {
    const data = await polygonFetch<{ results?: PolygonSplit[] }>(
      `/v3/reference/splits`,
      {
        ticker,
        'execution_date.gte': toPolygonDate(since),
        limit: '50',
      }
    )
    return data.results ?? []
  } catch {
    return []
  }
}
