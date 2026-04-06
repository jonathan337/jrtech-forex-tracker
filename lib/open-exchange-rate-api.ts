/** Public, no-API-key USD latest rates from ExchangeRate-API. */
const OPEN_USD_LATEST = 'https://open.er-api.com/v6/latest/USD'

export type OpenErApiUsdTtdResult = {
  /** TTD per 1 USD (mid-market). */
  rate: number
  timeLastUpdateUtc?: string
  timeNextUpdateUtc?: string
}

/**
 * Free daily USD→TTD (TTD per 1 USD) from ExchangeRate-API open endpoint.
 * @see https://www.exchangerate-api.com/docs/free
 */
export async function fetchOpenErApiUsdTtd(): Promise<OpenErApiUsdTtdResult | null> {
  const res = await fetch(OPEN_USD_LATEST, {
    headers: { Accept: 'application/json' },
    cache: 'no-store',
  })

  if (!res.ok) return null

  let body: unknown
  try {
    body = await res.json()
  } catch {
    return null
  }

  if (!body || typeof body !== 'object') return null
  const root = body as Record<string, unknown>
  if (root.result !== 'success') return null

  const rates = root.rates
  if (!rates || typeof rates !== 'object') return null
  const ttd = (rates as Record<string, unknown>).TTD
  if (typeof ttd !== 'number' || !Number.isFinite(ttd) || ttd <= 0) return null

  return {
    rate: ttd,
    timeLastUpdateUtc:
      typeof root.time_last_update_utc === 'string'
        ? root.time_last_update_utc
        : undefined,
    timeNextUpdateUtc:
      typeof root.time_next_update_utc === 'string'
        ? root.time_next_update_utc
        : undefined,
  }
}
