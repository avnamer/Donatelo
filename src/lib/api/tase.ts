// ─────────────────────────────────────────────
// TASE DataWise API client — Israeli securities
// Docs: internal / TASE DataWise portal
//
// All prices returned as agorot (ILS × 100).
// TASE uses "agorot" natively for prices < 100 ILS, and
// full ILS decimals for larger values — we normalize to
// the same BigInt agorot convention as the rest of the app.
// ─────────────────────────────────────────────

const BASE_URL = process.env.TASE_API_URL ?? 'https://api.tase.co.il/api'
const API_KEY = process.env.TASE_API_KEY!

// ─── Types ────────────────────────────────────

export interface TaseSecurityInfo {
  securityId: string
  name: string
  nameEn?: string
  type: string      // 'STOCK' | 'ETF' | 'BOND' | 'MUTUAL_FUND'
  currency: string  // usually 'ILS'
}

export interface TaseBar {
  date: string   // YYYY-MM-DD
  closePrice: number  // in ILS (not agorot)
  volume?: number
}

export interface TaseDividend {
  exDate: string
  payDate?: string
  amountPerShare: number  // in ILS
  currency: string
}

// ─── Helpers ──────────────────────────────────

async function taseFetch<T>(
  path: string,
  params: Record<string, string> = {}
): Promise<T> {
  const url = new URL(`${BASE_URL}${path}`)
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v)
  }

  const res = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      Accept: 'application/json',
    },
    next: { revalidate: 0 },
  })

  if (!res.ok) {
    throw new Error(`TASE API error ${res.status}: ${path}`)
  }

  return res.json() as Promise<T>
}

/** Convert ILS amount to agorot (×100, rounded to integer). */
export function ilsToAgorot(ils: number): bigint {
  return BigInt(Math.round(ils * 100))
}

function toISODate(d: Date): string {
  return d.toISOString().slice(0, 10)
}

// ─── Price fetching ───────────────────────────

/**
 * Latest closing price for a TASE security.
 * securityId is the TASE 6-digit code (e.g. "1082209" for TA-125 ETF).
 * Returns price in agorot, or null on error.
 */
export async function fetchLatestTasePrice(
  securityId: string
): Promise<{ price: bigint; date: Date; currency: string } | null> {
  try {
    // TASE API: /quote/security/{id}  (endpoint may vary by DataWise plan)
    const data = await taseFetch<{
      closePrice?: number
      tradeDate?: string
      currency?: string
    }>(`/quote/security/${securityId}`)

    if (!data.closePrice) return null

    return {
      price: ilsToAgorot(data.closePrice),
      date: data.tradeDate ? new Date(data.tradeDate) : new Date(),
      currency: data.currency ?? 'ILS',
    }
  } catch {
    return null
  }
}

/**
 * Historical daily closes for a TASE security.
 */
export async function fetchTasePriceHistory(
  securityId: string,
  from: Date,
  to: Date
): Promise<Array<{ date: Date; price: bigint; currency: string }>> {
  try {
    const data = await taseFetch<{ data?: TaseBar[] }>(
      `/history/security/${securityId}`,
      {
        fromDate: toISODate(from),
        toDate: toISODate(to),
      }
    )

    return (data.data ?? []).map((bar) => ({
      date: new Date(bar.date),
      price: ilsToAgorot(bar.closePrice),
      currency: 'ILS',
    }))
  } catch {
    return []
  }
}

// ─── Security info ────────────────────────────

/**
 * Name and type for a TASE security id.
 */
export async function fetchTaseSecurityInfo(
  securityId: string
): Promise<{ name: string; type: string } | null> {
  try {
    const data = await taseFetch<TaseSecurityInfo>(
      `/reference/security/${securityId}`
    )
    return { name: data.nameEn ?? data.name, type: data.type }
  } catch {
    return null
  }
}

// ─── Dividends ────────────────────────────────

/**
 * Dividend history for a TASE security in the trailing 12 months.
 */
export async function fetchTaseDividends(
  securityId: string
): Promise<
  Array<{
    exDate: Date
    payDate?: Date
    amountPerShare: bigint
    currency: string
  }>
> {
  try {
    const oneYearAgo = new Date()
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1)

    const data = await taseFetch<{ data?: TaseDividend[] }>(
      `/dividends/security/${securityId}`,
      { fromDate: toISODate(oneYearAgo) }
    )

    return (data.data ?? []).map((d) => ({
      exDate: new Date(d.exDate),
      payDate: d.payDate ? new Date(d.payDate) : undefined,
      amountPerShare: ilsToAgorot(d.amountPerShare),
      currency: d.currency ?? 'ILS',
    }))
  } catch {
    return []
  }
}

// ─── Search ───────────────────────────────────

/**
 * Search TASE securities by name or symbol.
 * Used in the "add holding" search flow.
 */
export async function searchTaseSecurities(
  query: string
): Promise<TaseSecurityInfo[]> {
  try {
    const data = await taseFetch<{ results?: TaseSecurityInfo[] }>(
      '/reference/securities/search',
      { q: query, limit: '20' }
    )
    return data.results ?? []
  } catch {
    return []
  }
}
