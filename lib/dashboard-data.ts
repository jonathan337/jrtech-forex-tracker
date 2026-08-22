import { prisma } from '@/lib/prisma'
import { loadMonthAvailabilityWithUsage } from '@/lib/month-availability-with-usage'
import { loadOwedByPerson } from '@/lib/owed-by-person'
import { buildMonthSummary, monthUsageTotals } from '@/lib/month-summary'
import { computeMonthUsdCostSummary } from '@/lib/month-usd-cost-summary'

/**
 * Everything the dashboard shows, for one calendar month.
 *
 * Shared by GET /api/dashboard (month navigation, data-change refetch) and the
 * dashboard server page (initial render). Computing this on the server for the
 * first paint removes the second round-trip the client used to make after
 * hydration — the biggest chunk of the page's perceived load time.
 *
 * Queries run in one parallel wave: the month bundle (which itself fans out),
 * this month's direct USD purchases, and the per-person owed totals.
 */
export async function loadDashboardData(userId: string, y: number, m: number) {
  const [bundle, purchases, owed] = await Promise.all([
    loadMonthAvailabilityWithUsage(userId, y, m),
    prisma.usdPurchase.findMany({
      where: { userId, year: y, month: m },
      orderBy: { purchasedAt: 'desc' },
    }),
    loadOwedByPerson(userId),
  ])

  const summary = buildMonthSummary({
    year: y,
    month: m,
    rows: bundle.availabilityWithUsage,
    ...monthUsageTotals(bundle.usageRows),
  })

  const usdCostSummary = computeMonthUsdCostSummary({
    purchases,
    availabilityWithUsage: bundle.availabilityWithUsage,
    cardProcessingFeePct: bundle.cardProcessingFeePct,
  })

  // Match what the People page shows: each person's owed rounded to cents,
  // then summed.
  const round2 = (n: number) => Math.round(n * 100) / 100
  const totalOwedToPeopleTTD = round2(
    [...owed.owedTTDByPerson.values()].reduce(
      (sum, owedTTD) => sum + round2(owedTTD),
      0
    )
  )

  return {
    summary,
    defaultExchangeRate: bundle.baseline,
    totalOwedToPeopleTTD,
    usdCostSummary,
  }
}

export type DashboardData = Awaited<ReturnType<typeof loadDashboardData>>
