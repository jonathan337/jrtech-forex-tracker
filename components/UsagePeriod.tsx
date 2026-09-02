'use client'

import { format } from 'date-fns'
import { Label } from '@/components/ui/label'

export type UsagePeriod = { year: number; month: number }

const MONTHS_SHORT = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
]

/** Calendar period of a `yyyy-MM-dd` form date; null while incomplete/invalid. */
export function usageDatePeriod(usageDate: string): UsagePeriod | null {
  const m = /^(\d{4})-(\d{2})-\d{2}$/.exec(usageDate)
  if (!m) return null
  const year = parseInt(m[1], 10)
  const month = parseInt(m[2], 10)
  if (month < 1 || month > 12 || year < 2000 || year > 2100) return null
  return { year, month }
}

export function periodLabel(p: UsagePeriod): string {
  return format(new Date(p.year, p.month - 1, 1), 'MMM yyyy')
}

/**
 * Which period a new entry should count against: the month being viewed, unless
 * the picked date falls in a different month AND the user opted to follow it
 * (via the notice below). `movedFromViewed` tells the caller to skip client-side
 * rate math — the server resolves the target month's rate itself.
 */
export function resolveLogPeriod(
  usageDate: string,
  viewPeriod: UsagePeriod,
  useDateMonth: boolean
): { period: UsagePeriod; movedFromViewed: boolean } {
  const dp = usageDatePeriod(usageDate)
  const mismatch =
    dp != null && (dp.year !== viewPeriod.year || dp.month !== viewPeriod.month)
  if (mismatch && useDateMonth) {
    return { period: dp, movedFromViewed: true }
  }
  return { period: viewPeriod, movedFromViewed: false }
}

/**
 * Small-print warning shown in add-usage forms when the picked date falls
 * outside the month being logged into, with a one-click switch either way.
 * Renders nothing while date and month agree.
 */
export function UsagePeriodNotice({
  usageDate,
  viewYear,
  viewMonth,
  useDateMonth,
  onUseDateMonthChange,
}: {
  usageDate: string
  viewYear: number
  viewMonth: number
  useDateMonth: boolean
  onUseDateMonthChange: (v: boolean) => void
}) {
  const dp = usageDatePeriod(usageDate)
  if (!dp || (dp.year === viewYear && dp.month === viewMonth)) return null
  const dateLabel = periodLabel(dp)
  const viewLabel = periodLabel({ year: viewYear, month: viewMonth })

  if (useDateMonth) {
    return (
      <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs leading-relaxed text-emerald-900">
        This entry will count against <strong>{dateLabel}</strong> — the month
        of its date.{' '}
        <button
          type="button"
          onClick={() => onUseDateMonthChange(false)}
          className="font-semibold underline underline-offset-2 hover:text-emerald-950"
        >
          Count it in {viewLabel} instead
        </button>
      </div>
    )
  }
  return (
    <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-900">
      Heads up: this date falls in <strong>{dateLabel}</strong>, but the entry
      will count against <strong>{viewLabel}</strong> (the month you&apos;re
      logging into).{' '}
      <button
        type="button"
        onClick={() => onUseDateMonthChange(true)}
        className="font-semibold underline underline-offset-2 hover:text-amber-950"
      >
        Count it in {dateLabel} instead
      </button>
    </div>
  )
}

/**
 * Month/year picker for the edit forms — moves an entry to a different period.
 * Shows a one-click "match the date" hint when the entry's date disagrees with
 * the selected period.
 */
export function UsagePeriodSelect({
  id,
  monthValue,
  yearValue,
  onChange,
  usageDate,
  disabled,
}: {
  id: string
  /** 1-12 as a string (form state). */
  monthValue: string
  /** Full year as a string (form state). */
  yearValue: string
  onChange: (next: { month: string; year: string }) => void
  /** The entry's `yyyy-MM-dd` date, for the mismatch hint. */
  usageDate: string
  disabled?: boolean
}) {
  const selYear = parseInt(yearValue, 10)
  const now = new Date().getFullYear()
  const lo = Math.min(Number.isFinite(selYear) ? selYear : now, now - 3)
  const hi = Math.max(Number.isFinite(selYear) ? selYear : now, now + 1)
  const years: number[] = []
  for (let y = lo; y <= hi; y++) years.push(y)

  const dp = usageDatePeriod(usageDate)
  const selMonth = parseInt(monthValue, 10)
  const dateDisagrees =
    dp != null && (dp.year !== selYear || dp.month !== selMonth)

  const selectClass =
    'h-10 rounded-lg border border-gray-300 bg-white px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-50'

  return (
    <div>
      <Label htmlFor={`${id}-month`}>Counts against</Label>
      <div className="flex gap-2">
        <select
          id={`${id}-month`}
          value={monthValue}
          onChange={(e) => onChange({ month: e.target.value, year: yearValue })}
          disabled={disabled}
          className={`${selectClass} flex-1 min-w-0`}
          aria-label="Month the entry counts against"
        >
          {MONTHS_SHORT.map((m, i) => (
            <option key={m} value={String(i + 1)}>
              {m}
            </option>
          ))}
        </select>
        <select
          id={`${id}-year`}
          value={yearValue}
          onChange={(e) => onChange({ month: monthValue, year: e.target.value })}
          disabled={disabled}
          className={selectClass}
          aria-label="Year the entry counts against"
        >
          {years.map((y) => (
            <option key={y} value={String(y)}>
              {y}
            </option>
          ))}
        </select>
      </div>
      {dateDisagrees ? (
        <p className="mt-1 text-xs text-amber-700">
          Date is in {periodLabel(dp)} —{' '}
          <button
            type="button"
            onClick={() =>
              onChange({ month: String(dp.month), year: String(dp.year) })
            }
            className="font-medium underline underline-offset-2 hover:text-amber-900"
            disabled={disabled}
          >
            use {periodLabel(dp)}
          </button>
        </p>
      ) : (
        <p className="mt-1 text-xs text-gray-500">
          Month this usage is charged to.
        </p>
      )}
    </div>
  )
}
