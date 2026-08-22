import { prisma } from '@/lib/prisma'
import { loadMonthUsdCostSummary } from '@/lib/month-usd-cost-summary'

/**
 * Direct USD purchases for one calendar month plus the blended-cost summary.
 *
 * Shared by GET /api/usd-purchases (month navigation, data-change refetch) and
 * the USD Buys server page (initial render). Computing this on the server for
 * the first paint removes the second round-trip the client used to make after
 * hydration.
 */
export async function loadUsdPurchases(userId: string, year: number, month: number) {
  const [purchases, summary] = await Promise.all([
    prisma.usdPurchase.findMany({
      where: { userId, year, month },
      orderBy: { purchasedAt: 'desc' },
    }),
    loadMonthUsdCostSummary(userId, year, month),
  ])

  return { purchases, summary }
}

export type UsdPurchasesData = Awaited<ReturnType<typeof loadUsdPurchases>>
