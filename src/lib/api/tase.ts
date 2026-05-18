// ─────────────────────────────────────────────
// Yahoo Finance client — Israeli securities (TASE)
//
// Uses Yahoo Finance's public quote endpoint (no API key required).
// Tickers use the .TA suffix, e.g. "LUMI.TA", "TEVA.TA", "ICL.TA"
//
// All prices returned as agorot (ILS × 100).
// Yahoo Finance returns prices in ILS for .TA tickers.
// ─────────────────────────────────────────────

// ─── Types ────────────────────────────────────

export interface TaseSecurityInfo {
  securityId: string
  name: string
  nameEn?: string
  type: string
  currency: string
}

export interface TaseBar {
  date: string
  closePrice: number
  volume?: number
}

export interface TaseDividend {
  exDate: string
  payDate?: string
  amountPerShare: number
  currency: string
}

// ─── Helpers ──────────────────────────────────

/** Convert ILS amount to agorot (×100, rounded to integer). */
export function ilsToAgorot(ils: number): bigint {
  return BigInt(Math.round(ils * 100))
}

/**
 * Convert a Yahoo Finance price to agorot.
 * Yahoo returns ILA (agorot) for .TA tickers — those are already agorot.
 * Only multiply by 100 when the currency is actually ILS.
 */
function toAgorot(price: number, currency: string): bigint {
  return currency === 'ILA' ? BigInt(Math.round(price)) : ilsToAgorot(price)
}

function toISODate(d: Date): string {
  return d.toISOString().slice(0, 10)
}

// ─── Price fetching ───────────────────────────

/**
 * Latest NAV for an Israeli mutual fund via bizportal.co.il.
 * taseId is a numeric TASE security ID, e.g. "5123179".
 * Bizportal publishes NAVs in ILA (agorot) — stored as-is (already agorot).
 */
async function fetchLatestFundNAVFromBizportal(
  taseId: string
): Promise<{ price: bigint; date: Date; currency: string } | null> {
  try {
    const url = `https://www.bizportal.co.il/mutualfunds/quote/generalview/${taseId}`
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'text/html' },
      next: { revalidate: 0 },
    })
    if (!res.ok) return null

    const html = await res.text()
    // HTML structure: <div class="label">מחיר פדיון</div><div class="num">550.37</div>
    const match = html.match(/מחיר פדיון<\/div><div class="num">([\d,]+\.?\d*)/)
    if (!match) return null

    const raw = parseFloat(match[1].replace(/,/g, ''))
    if (!raw || isNaN(raw)) return null

    return {
      price: BigInt(Math.round(raw)),  // already in ILA (agorot)
      date: new Date(),
      currency: 'ILS',
    }
  } catch {
    return null
  }
}

/**
 * Latest price for any TASE security via bizportal.co.il.
 * Tries bonds → capitalmarket → mutualfunds sections in order.
 * Looks for common price labels: שער אחרון, מחיר פדיון.
 * Returns price in agorot, or null if not found in any section.
 */
async function fetchBizportalSecurityPrice(
  taseId: string
): Promise<{ price: bigint; date: Date; currency: string } | null> {
  const sections = ['bonds', 'capitalmarket', 'mutualfunds']
  const pricePatterns = [
    /<dt>שער בסיס<\/dt><dd>([\d,.]+)/,
    /<dt>שער אחרון<\/dt><dd>([\d,.]+)/,
    /מחיר פדיון<\/div><div class="num">([\d,.]+)/,
  ]

  for (const section of sections) {
    try {
      const url = `https://www.bizportal.co.il/${section}/quote/generalview/${taseId}`
      const res = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'text/html' },
        next: { revalidate: 0 },
      })
      if (!res.ok) continue

      const html = await res.text()
      for (const pattern of pricePatterns) {
        const match = html.match(pattern)
        if (!match) continue
        const raw = parseFloat(match[1].replace(/,/g, ''))
        if (!raw || isNaN(raw)) continue
        return { price: BigInt(Math.round(raw)), date: new Date(), currency: 'ILS' }
      }
    } catch {
      continue
    }
  }

  return null
}

/**
 * Latest closing price for a TASE security.
 * - For named tickers (e.g. "LUMI.TA"): uses Yahoo Finance.
 * - For numeric TASE IDs (e.g. "5123179"): uses bizportal.co.il NAV scraper,
 *   since these class-4 tracker funds (TTF/KTF/מחקה series) are not on Yahoo Finance.
 * Returns price in agorot, or null on error.
 */
export async function fetchLatestTasePrice(
  ticker: string
): Promise<{ price: bigint; date: Date; currency: string } | null> {
  // Pure numeric TASE IDs → use bizportal NAV (not available on Yahoo Finance)
  if (/^\d+$/.test(ticker)) {
    return fetchLatestFundNAVFromBizportal(ticker)
  }

  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1d&range=5d`

    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0',
        Accept: 'application/json',
      },
      next: { revalidate: 0 },
    })

    if (!res.ok) {
      // Yahoo Finance failed — for numeric-base .TA tickers, try bizportal
      const numericBase = ticker.match(/^(\d+)\.TA$/)?.[1]
      if (numericBase) return fetchBizportalSecurityPrice(numericBase)
      return null
    }

    const data = await res.json() as {
      chart?: {
        result?: Array<{
          meta?: { regularMarketPrice?: number; currency?: string; regularMarketTime?: number }
          timestamp?: number[]
          indicators?: { quote?: Array<{ close?: (number | null)[] }> }
        }>
        error?: unknown
      }
    }

    const result = data.chart?.result?.[0]
    if (!result) {
      const numericBase = ticker.match(/^(\d+)\.TA$/)?.[1]
      if (numericBase) return fetchBizportalSecurityPrice(numericBase)
      return null
    }

    const meta = result.meta
    const price = meta?.regularMarketPrice
    if (!price) {
      const numericBase = ticker.match(/^(\d+)\.TA$/)?.[1]
      if (numericBase) return fetchBizportalSecurityPrice(numericBase)
      return null
    }

    const currency = meta?.currency ?? 'ILS'
    const ts = meta?.regularMarketTime
    const date = ts ? new Date(ts * 1000) : new Date()

    return {
      price: toAgorot(price, currency),
      date,
      currency: currency === 'ILA' ? 'ILS' : currency,
    }
  } catch {
    const numericBase = ticker.match(/^(\d+)\.TA$/)?.[1]
    if (numericBase) return fetchBizportalSecurityPrice(numericBase)
    return null
  }
}

/**
 * Historical daily closes for a TASE security via Yahoo Finance.
 * ticker must use .TA suffix, e.g. "LUMI.TA"
 */
export async function fetchTasePriceHistory(
  ticker: string,
  from: Date,
  to: Date
): Promise<Array<{ date: Date; price: bigint; currency: string }>> {
  try {
    const fromUnix = Math.floor(from.getTime() / 1000)
    const toUnix = Math.floor(to.getTime() / 1000)
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1d&period1=${fromUnix}&period2=${toUnix}`

    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' },
      next: { revalidate: 0 },
    })

    if (!res.ok) return []

    const data = await res.json() as {
      chart?: {
        result?: Array<{
          timestamp?: number[]
          meta?: { currency?: string }
          indicators?: { quote?: Array<{ close?: (number | null)[] }> }
        }>
      }
    }

    const result = data.chart?.result?.[0]
    if (!result) return []

    const timestamps = result.timestamp ?? []
    const closes = result.indicators?.quote?.[0]?.close ?? []
    const currency = result.meta?.currency ?? 'ILS'

    return timestamps
      .map((ts, i) => {
        const close = closes[i]
        if (!close) return null
        return {
          date: new Date(ts * 1000),
          price: toAgorot(close, currency),
          currency: currency === 'ILA' ? 'ILS' : currency,
        }
      })
      .filter((x): x is { date: Date; price: bigint; currency: string } => x !== null)
  } catch {
    return []
  }
}

// ─── Security info ────────────────────────────

export async function fetchTaseSecurityInfo(
  ticker: string
): Promise<{ name: string; type: string } | null> {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1d&range=1d`
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' },
      next: { revalidate: 0 },
    })
    if (!res.ok) return null

    const data = await res.json() as {
      chart?: { result?: Array<{ meta?: { shortName?: string; instrumentType?: string } }> }
    }
    const meta = data.chart?.result?.[0]?.meta
    if (!meta) return null

    return {
      name: meta.shortName ?? ticker,
      type: meta.instrumentType ?? 'STOCK',
    }
  } catch {
    return null
  }
}

// ─── Dividends ────────────────────────────────

export async function fetchTaseDividends(
  ticker: string
): Promise<Array<{ exDate: Date; payDate?: Date; amountPerShare: bigint; currency: string }>> {
  try {
    const oneYearAgo = Math.floor(Date.now() / 1000) - 365 * 24 * 3600
    const now = Math.floor(Date.now() / 1000)
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?events=dividends&interval=1d&period1=${oneYearAgo}&period2=${now}`

    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' },
      next: { revalidate: 0 },
    })
    if (!res.ok) return []

    const data = await res.json() as {
      chart?: {
        result?: Array<{
          meta?: { currency?: string }
          events?: { dividends?: Record<string, { amount: number; date: number }> }
        }>
      }
    }

    const result = data.chart?.result?.[0]
    const dividends = result?.events?.dividends
    const currency = result?.meta?.currency ?? 'ILS'
    if (!dividends) return []

    return Object.values(dividends).map((d) => ({
      exDate: new Date(d.date * 1000),
      amountPerShare: toAgorot(d.amount, currency),
      currency: currency === 'ILA' ? 'ILS' : currency,
    }))
  } catch {
    return []
  }
}

// ─── Search ───────────────────────────────────

export async function searchTaseSecurities(
  query: string
): Promise<TaseSecurityInfo[]> {
  try {
    const url = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(query)}&quotesCount=10&newsCount=0`
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' },
      next: { revalidate: 0 },
    })
    if (!res.ok) return []

    const data = await res.json() as {
      quotes?: Array<{ symbol?: string; shortname?: string; longname?: string; quoteType?: string; exchange?: string }>
    }

    return (data.quotes ?? [])
      .filter((q) => q.exchange === 'TLV' || q.symbol?.endsWith('.TA'))
      .map((q) => ({
        securityId: q.symbol ?? '',
        name: q.shortname ?? q.longname ?? q.symbol ?? '',
        nameEn: q.shortname ?? q.longname,
        type: q.quoteType ?? 'STOCK',
        currency: 'ILS',
      }))
  } catch {
    return []
  }
}
