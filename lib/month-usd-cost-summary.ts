import { prisma } from '@/lib/prisma'
import { loadMonthAvailabilityWithUsage } from '@/lib/month-availability-with-usage'
import { weightedAverageRate } from '@/lib/usd-purchase-methods'

export type MonthUsdCostSummary = {
  directPurchases: {
    totalUSD: number
    totalTTD: number
    weightedAvgRate: number | null
    count: number
  }
  /** Projected card access for the month: every card scheduled/available this month
   *  (explicit availability + recurring, minus months marked "not available"). */
  projectedCards: {
    totalUSD: number
    totalTTD: number
    weightedAvgRate: number | null
    count: number
  }
  blended: {
    totalUSD: number
    totalTTD: number
    weightedAvgRate: number | null
  }
}

/**
 * Direct USD buys + projected card access for the month, with weighted average rates.
 *
 * The card component is based on what you have ACCESS to this month (availability
 * rows incl. recurring cards), not usage-so-far. Marking a card "not available" for
 * the month removes it from the projection, so the average updates immediately.
 */
export async function loadMonthUsdCostSummary(
  userId: string,
  year: number,
  month: number
): Promise<MonthUsdCostSummary> {
  const [purchases, { availabilityWithUsage }] = await Promise.all([
    prisma.usdPurchase.findMany({
      where: { userId, year, month },
      orderBy: { purchasedAt: 'desc' },
    }),
    loadMonthAvailabilityWithUsage(userId, year, month),
  ])

  const directRows = purchases.map((p) => ({
    amountUSD: p.amountUSD,
    amountTTD: p.amountTTD,
  }))

  // Each availability row costs amountUSD × exchangeRate TTD if fully used.
  const cardRows = availabilityWithUsage.map((row) => ({
    amountUSD: row.amountUSD,
    amountTTD: row.amountUSD * row.exchangeRate,
  }))

  const directTotalUSD = directRows.reduce((s, r) => s + r.amountUSD, 0)
  const directTotalTTD = directRows.reduce((s, r) => s + r.amountTTD, 0)
  const cardTotalUSD = cardRows.reduce((s, r) => s + r.amountUSD, 0)
  const cardTotalTTD = cardRows.reduce((s, r) => s + r.amountTTD, 0)

  return {
    directPurchases: {
      totalUSD: directTotalUSD,
      totalTTD: directTotalTTD,
      weightedAvgRate: weightedAverageRate(directRows),
      count: purchases.length,
    },
    projectedCards: {
      totalUSD: cardTotalUSD,
      totalTTD: cardTotalTTD,
      weightedAvgRate: weightedAverageRate(cardRows),
      count: cardRows.length,
    },
    blended: {
      totalUSD: directTotalUSD + cardTotalUSD,
      totalTTD: directTotalTTD + cardTotalTTD,
      weightedAvgRate: weightedAverageRate([...directRows, ...cardRows]),
    },
  }
}
