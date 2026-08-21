/**
 * TTD owed for a usage row, LOCKED to the rate at the time it was logged.
 *
 * amountTTD is computed and stored when a usage is entered (amountUSD × the
 * card's rate that month), so it already captures the historical rate. Reading
 * it back — rather than recomputing amountUSD × the current card rate — means a
 * later rate change (e.g. an owner raising 7.25 → 7.35) only affects NEW usage,
 * never charges already logged.
 *
 * The one exception is a legacy bug where some old rows stored the USD figure in
 * the amountTTD column (so amountTTD ≈ amountUSD, an impossible ~1.0 rate). Those
 * are detected and recomputed from the current month rate, matching the prior
 * behaviour for that bad data only.
 */

/** Legacy rows duplicated USD into amountTTD — an implausible ~1.0 TTD/USD rate. */
export function isLegacyUsdInTtd(
  amountUSD: number | null | undefined,
  amountTTD: number
): boolean {
  return (
    typeof amountUSD === 'number' &&
    Number.isFinite(amountUSD) &&
    amountUSD > 0 &&
    Math.abs(amountTTD - amountUSD) < 0.01
  )
}

/** Historical TTD for a usage row; falls back to USD × current rate only for legacy rows. */
export function usageTtd(
  row: { amountUSD?: number | null; amountTTD: number },
  monthRate?: number | null
): number {
  if (isLegacyUsdInTtd(row.amountUSD, row.amountTTD)) {
    const r = typeof monthRate === 'number' && monthRate > 0 ? monthRate : null
    if (r != null && typeof row.amountUSD === 'number') return row.amountUSD * r
  }
  return row.amountTTD
}

/** USD magnitude of a usage row (rate-independent when stored). */
export function usageUsd(
  row: { amountUSD?: number | null; amountTTD: number },
  monthRate?: number | null
): number | null {
  if (typeof row.amountUSD === 'number' && Number.isFinite(row.amountUSD)) {
    return row.amountUSD
  }
  const r = typeof monthRate === 'number' && monthRate > 0 ? monthRate : null
  if (r == null) return null
  return row.amountTTD / r
}
