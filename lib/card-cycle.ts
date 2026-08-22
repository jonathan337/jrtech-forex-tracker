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

import { issuingBankLabel, type Bank } from '@/lib/card-bank'

/** The 1st unless the matching bank in the user's list sets a cycle day. A
 *  card's stored issuingBank (legacy code or bank name) is canonicalized via
 *  issuingBankLabel so both resolve to the same bank. */
export function bankCycleDayFor(
  issuingBank: string | null | undefined,
  banks?: Bank[] | null
): number {
  if (issuingBank && banks && banks.length) {
    const name = issuingBankLabel(issuingBank).toLowerCase()
    const match = banks.find((b) => b.name.toLowerCase() === name)
    if (match && typeof match.cycleDay === 'number' && match.cycleDay >= 1 && match.cycleDay <= 31) {
      return match.cycleDay
    }
  }
  return 1
}

/** Effective cycle day: explicit per-card override, else bank config, else 1. */
export function effectiveCycleDay(
  card: { cycleDay?: number | null; issuingBank?: string | null },
  banks?: Bank[] | null
): number {
  const day = card.cycleDay
  if (typeof day === 'number' && day >= 1 && day <= 31) return day
  return bankCycleDayFor(card.issuingBank, banks)
}

const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
]

/** Clamp a day to a month's length (e.g. 31 in Feb -> 28/29), at UTC midnight. */
function anchorUTC(year: number, monthIdx0: number, day: number): Date {
  const lastDay = new Date(Date.UTC(year, monthIdx0 + 1, 0)).getUTCDate()
  return new Date(Date.UTC(year, monthIdx0, Math.min(day, lastDay)))
}

export interface CurrentCycle {
  start: Date
  /** Exclusive end (next reset). */
  end: Date
  /** Whole days from `now` until the next reset. */
  resetsInDays: number
  label: string
}

/**
 * The statement cycle that contains `now`, for a card resetting on `cycleDay`.
 * This is a "right now" view of spending power (used this cycle / resets in N
 * days) and is independent of the calendar-month toggle used for the ledger.
 */
export function currentCycleWindow(cycleDay: number, now: Date): CurrentCycle {
  const y = now.getUTCFullYear()
  const mIdx = now.getUTCMonth()
  const thisAnchor = anchorUTC(y, mIdx, cycleDay)
  let start: Date
  if (now.getTime() >= thisAnchor.getTime()) {
    start = thisAnchor
  } else {
    start = anchorUTC(y, mIdx - 1, cycleDay) // Date.UTC normalizes underflow
  }
  const end = anchorUTC(
    start.getUTCFullYear(),
    start.getUTCMonth() + 1,
    cycleDay
  )
  const resetsInDays = Math.max(
    0,
    Math.ceil((end.getTime() - now.getTime()) / 86_400_000)
  )
  const lastDay = new Date(end.getTime() - 86_400_000)
  const label = `${MONTHS[start.getUTCMonth()]} ${start.getUTCDate()} – ${MONTHS[lastDay.getUTCMonth()]} ${lastDay.getUTCDate()}`
  return { start, end, resetsInDays, label }
}
