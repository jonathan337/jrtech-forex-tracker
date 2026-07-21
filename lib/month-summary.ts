import type { MonthUsageRow } from '@/lib/month-availability-with-usage'

type SummaryRow = {
  amountUSD: number
  exchangeRate: number
  usageUSD: number
  usageTTD: number
  ttdValue: number
  impliedFeeTTD: number
  impliedFeeUSD: number
}

/** Month-wide usage totals across every card (USD falls back to TTD-only rows omitted, matching the old summary math). */
export function monthUsageTotals(usageRows: MonthUsageRow[]) {
  return {
    totalUsedUSD: usageRows.reduce(
      (sum, u) =>
        sum +
        (typeof u.amountUSD === 'number' && Number.isFinite(u.amountUSD)
          ? u.amountUSD
          : 0),
      0
    ),
    totalUsedTTD: usageRows.reduce((sum, u) => sum + u.amountTTD, 0),
  }
}

/**
 * Aggregates for one month of availability rows. Shared by /api/summary and
 * /api/dashboard so the two can never drift.
 */
export function buildMonthSummary<Row extends SummaryRow>(input: {
  year: number
  month: number
  rows: Row[]
  totalUsedUSD: number
  totalUsedTTD: number
}) {
  const { year, month, rows, totalUsedUSD, totalUsedTTD } = input

  const totalUSD = rows.reduce((sum, item) => sum + item.amountUSD, 0)
  const totalFeesTTD = rows.reduce((sum, item) => sum + item.impliedFeeTTD, 0)
  const totalFeesUSD = rows.reduce((sum, item) => sum + item.impliedFeeUSD, 0)

  // USD-weighted: a $5,000 card moves the average more than a $50 card, so this
  // reflects the real blended cost of the month's access.
  const averageRate =
    totalUSD > 0
      ? rows.reduce(
          (sum, item) => sum + item.exchangeRate * item.amountUSD,
          0
        ) / totalUSD
      : 0

  const totalTTD = rows.reduce((sum, item) => sum + item.ttdValue, 0)

  return {
    year,
    month,
    totalCards: rows.length,
    totalUSD,
    totalFeesTTD,
    totalFeesUSD,
    averageRate,
    totalTTD,
    netUSD: totalUSD - totalFeesUSD,
    totalUsedUSD,
    totalUsedTTD,
    balanceUSD: totalUSD - totalUsedUSD,
    balanceTTD: totalTTD - totalUsedTTD,
    availability: rows,
  }
}
