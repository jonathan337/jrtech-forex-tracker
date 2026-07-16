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
  cardUsage: {
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

/** Direct USD buys + card usage for the month, with weighted average rates. */
export async function loadMonthUsdCostSummary(
  userId: string,
  year: number,
  month: number
): Promise<MonthUsdCostSummary> {
  const [purchases, { usageRows, availabilityWithUsage }] = await Promise.all([
    prisma.usdPurchase.findMany({
      where: { userId, year, month },
      orderBy: { purchasedAt: 'desc' },
    }),
    loadMonthAvailabilityWithUsage(userId, year, month),
  ])

  const rateByCard = new Map<string, number>()
  for (const row of availabilityWithUsage) {
    rateByCard.set(row.cardId, row.exchangeRate)
  }

  const directRows = purchases.map((p) => ({
    amountUSD: p.amountUSD,
    amountTTD: p.amountTTD,
  }))

  const usageEntries = await prisma.cardUsage.findMany({
    where: {
      year,
      month,
      card: { person: { userId } },
    },
    select: {
      amountUSD: true,
      amountTTD: true,
      cardId: true,
    },
  })

  const cardRows = usageEntries.map((u) => {
    const rate = rateByCard.get(u.cardId) ?? null
    const usd =
      typeof u.amountUSD === 'number' && Number.isFinite(u.amountUSD)
        ? u.amountUSD
        : rate && rate > 0
          ? u.amountTTD / rate
          : 0
    return {
      amountUSD: usd,
      amountTTD: u.amountTTD,
    }
  })

  const directTotalUSD = directRows.reduce((s, r) => s + r.amountUSD, 0)
  const directTotalTTD = directRows.reduce((s, r) => s + r.amountTTD, 0)
  const cardTotalUSD = cardRows.reduce((s, r) => s + r.amountUSD, 0)
  const cardTotalTTD = cardRows.reduce((s, r) => s + r.amountTTD, 0)

  const blendedRows = [...directRows, ...cardRows]

  return {
    directPurchases: {
      totalUSD: directTotalUSD,
      totalTTD: directTotalTTD,
      weightedAvgRate: weightedAverageRate(directRows),
      count: purchases.length,
    },
    cardUsage: {
      totalUSD: cardTotalUSD,
      totalTTD: cardTotalTTD,
      weightedAvgRate: weightedAverageRate(cardRows),
      count: usageRows.length,
    },
    blended: {
      totalUSD: directTotalUSD + cardTotalUSD,
      totalTTD: directTotalTTD + cardTotalTTD,
      weightedAvgRate: weightedAverageRate(blendedRows),
    },
  }
}
