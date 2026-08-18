import { paymentDateInMonthUTC } from '@/lib/recurring-availability'

/**
 * A card's forex-access cycle is anchored to its bank statement day, which is
 * often not the 1st. Republic Bank rolls on the 21st and First Citizens on the
 * 14th, so "July" availability on those cards actually covers e.g. Jul 21 –
 * Aug 20, and a charge on Jul 5 belongs to the *previous* cycle.
 *
 * cycleDay == 1 means the cycle IS the calendar month — those cards are treated
 * exactly as before (see isCalendarCycle), so nothing regresses for them.
 */

const BANK_DEFAULT_CYCLE_DAY: Record<string, number> = {
  REPUBLIC_BANK: 21,
  FIRST_CITIZENS: 14,
}

/** Statement day a card defaults to when it has no explicit override. */
export function bankDefaultCycleDay(issuingBank: string | null | undefined): number {
  if (!issuingBank) return 1
  return BANK_DEFAULT_CYCLE_DAY[issuingBank] ?? 1
}

/** Effective cycle day: explicit per-card override, else the bank default, else 1. */
export function effectiveCycleDay(card: {
  cycleDay?: number | null
  issuingBank?: string | null
}): number {
  const day = card.cycleDay
  if (typeof day === 'number' && day >= 1 && day <= 31) return day
  return bankDefaultCycleDay(card.issuingBank)
}

/** A day-1 cycle is just the calendar month — keep the original code path for it. */
export function isCalendarCycle(cycleDay: number): boolean {
  return cycleDay <= 1
}

export interface CycleWindow {
  /** Inclusive start (UTC midnight of the anchor day). */
  start: Date
  /** Exclusive end (start of the next cycle). */
  end: Date
  /** e.g. "Jul 21 – Aug 20"; empty for calendar-month cards. */
  label: string
}

function anchorMidnightUTC(year: number, month: number, cycleDay: number): Date {
  // Reuse the recurring-availability clamping (day 31 in Feb -> last day), then
  // drop to UTC midnight so the window is a clean half-open [start, end) range.
  const d = paymentDateInMonthUTC(year, month, cycleDay)
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
}

const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
]

function fmt(d: Date): string {
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`
}

/**
 * The cycle "anchored in" the given calendar month — i.e. the cycle that opens
 * on `cycleDay` of (year, month) and runs until the next month's anchor.
 *
 * Viewing July with cycleDay 21 -> [Jul 21, Aug 21), labelled "Jul 21 – Aug 20".
 * Availability rows are keyed by (year, month), so this is the window that the
 * (year, month) bucket represents for an off-calendar card.
 */
export function cycleWindowForMonth(
  cycleDay: number,
  year: number,
  month: number
): CycleWindow {
  const start = anchorMidnightUTC(year, month, cycleDay)
  const nextMonth = month === 12 ? 1 : month + 1
  const nextYear = month === 12 ? year + 1 : year
  const end = anchorMidnightUTC(nextYear, nextMonth, cycleDay)

  if (isCalendarCycle(cycleDay)) {
    return { start, end, label: '' }
  }

  // Last included day is the day before `end`.
  const lastDay = new Date(end.getTime() - 86_400_000)
  return { start, end, label: `${fmt(start)} – ${fmt(lastDay)}` }
}

/** True when `date` falls in [window.start, window.end). */
export function dateInWindow(date: Date, window: CycleWindow): boolean {
  const t = date.getTime()
  return t >= window.start.getTime() && t < window.end.getTime()
}
