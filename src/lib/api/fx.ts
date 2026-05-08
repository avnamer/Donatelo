// ─────────────────────────────────────────────
// FX Rate client — FreeCurrencyAPI
// Docs: https://freecurrencyapi.com/docs
//
// Free tier: 1,500 requests/month → fetch once daily.
// We cache the rate in the fx_rates DB table.
// ─────────────────────────────────────────────

const BASE_URL = 'https://api.freecurrencyapi.com/v1'
const API_KEY = process.env.FREECURRENCY_API_KEY!

// ─── Types ────────────────────────────────────

interface FreeCurrencyResponse {
  data: Record<string, number>  // { USD: 1, ILS: 3.65, ... }
}

// ─── Fetcher ──────────────────────────────────

/**
 * Fetch latest exchange rates relative to a base currency.
 * Returns a map of currency → rate.
 */
export async function fetchFxRates(
  base: string = 'USD',
  currencies: string[] = ['ILS', 'USD']
): Promise<Record<string, number>> {
  const url = new URL(`${BASE_URL}/latest`)
  url.searchParams.set('apikey', API_KEY)
  url.searchParams.set('base_currency', base)
  url.searchParams.set('currencies', currencies.join(','))

  const res = await fetch(url.toString(), {
    next: { revalidate: 0 },
  })

  if (!res.ok) {
    throw new Error(`FreeCurrencyAPI error ${res.status}`)
  }

  const json = (await res.json()) as FreeCurrencyResponse
  return json.data
}

/**
 * Fetch USD → ILS rate specifically.
 * Most used pair in this app.
 */
export async function fetchUSDtoILS(): Promise<number> {
  const rates = await fetchFxRates('USD', ['ILS'])
  const rate = rates['ILS']
  if (!rate) throw new Error('ILS rate not found in FreeCurrencyAPI response')
  return rate
}
