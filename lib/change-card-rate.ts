/**
 * "Change a recurring card's rate, effective from {year, month}."
 *
 * A recurring (always-available) card has a single recurringExchangeRate that
 * acts as the fallback rate for every month without an explicit
 * MonthlyAvailability row. Changing it naively would re-value the displayed
 * availability of past months. To change it safely we first FREEZE the prior
 * months at the old rate — write explicit MonthlyAvailability rows for them —
 * then update the card's recurring rate. Every consumer (loader, owed/pending
 * SQL, dashboard) already prioritizes MonthlyAvailability over the recurring
 * rate, so the freeze needs no other code changes. Past usage is already
 * rate-locked; this keeps the historical availability figures consistent too.
 */

/** Months to freeze at the old rate: [start, effective) — inclusive start,
 *  exclusive of the effective month. Capped to a sane span. */
export function monthsToFreeze(
  startYear: number,
  startMonth: number,
  effectiveYear: number,
  effectiveMonth: number
): Array<{ year: number; month: number }> {
  const out: Array<{ year: number; month: number }> = []
  let y = startYear
  let m = startMonth
  let guard = 0
  while ((y < effectiveYear || (y === effectiveYear && m < effectiveMonth)) && guard < 600) {
    out.push({ year: y, month: m })
    m += 1
    if (m > 12) {
      m = 1
      y += 1
    }
    guard += 1
  }
  return out
}

/** Compare (y,m) pairs: negative if a < b, 0 if equal, positive if a > b. */
export function compareYearMonth(
  aYear: number,
  aMonth: number,
  bYear: number,
  bMonth: number
): number {
  if (aYear !== bYear) return aYear - bYear
  return aMonth - bMonth
}
