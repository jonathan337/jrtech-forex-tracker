/**
 * A card's forex-access cycle can be anchored to its bank statement day rather
 * than the 1st (e.g. Republic Bank on the 21st). The cycle day is used to label
 * a card's reset day; usage itself is bucketed by calendar month (see
 * lib/month-availability-with-usage.ts), so the cycle day never moves a charge
 * out of the month it was made.
 *
 * Defaults are NOT hardcoded per bank — the user configures cycle days per
 * issuing bank in Settings, and any card with neither an explicit override nor a
 * bank config falls back to the 1st (calendar month).
 */

/** Per-bank cycle-day map, e.g. { REPUBLIC_BANK: 21, FIRST_CITIZENS: 14 }. */
export type BankCycleDays = Record<string, number>

/** The 1st unless the user configured a cycle day for this issuing bank. */
export function bankDefaultCycleDay(
  issuingBank: string | null | undefined,
  bankCycleDays?: BankCycleDays | null
): number {
  if (issuingBank && bankCycleDays) {
    const d = bankCycleDays[issuingBank]
    if (typeof d === 'number' && d >= 1 && d <= 31) return d
  }
  return 1
}

/** Effective cycle day: explicit per-card override, else bank config, else 1. */
export function effectiveCycleDay(
  card: { cycleDay?: number | null; issuingBank?: string | null },
  bankCycleDays?: BankCycleDays | null
): number {
  const day = card.cycleDay
  if (typeof day === 'number' && day >= 1 && day <= 31) return day
  return bankDefaultCycleDay(card.issuingBank, bankCycleDays)
}
