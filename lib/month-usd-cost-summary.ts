import { prisma } from '@/lib/prisma'
import { loadMonthAvailabilityWithUsage } from '@/lib/month-availability-with-usage'
import { weightedAverageRate } from '@/lib/usd-purchase-methods'
import { DEFAULT_CARD_PROCESSING_FEE_PCT } from '@/lib/card-processing-fee'

export { DEFAULT_CARD_PROCESSING_FEE_PCT }

export type MonthUsdCostSummary = {
  /** e.g. 0.045 — echoed so the UI can label the numbers. */
  cardProcessingFeeRate: number
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

type PurchaseAmounts = { amountUSD: number; amountTTD: number }

/**
 * Pure computation shared by /api/usd-purchases and /api/dashboard so callers
 * that already hold the month bundle don't re-query it.
 *
 * The card processing fee (Settings → Card processing fee, default 4.5%) is applied
 * to the projected card cost ONLY. Direct USD buys are recorded at what was actually
 * paid and are never marked up.
 */
export function computeMonthUsdCostSummary(input: {
  purchases: PurchaseAmounts[]
  availabilityWithUsage: Array<{ amountUSD: number; exchangeRate: number }>
  cardProcessingFeePct: number
}): MonthUsdCostSummary {
  const feePct =
    typeof input.cardProcessingFeePct === 'number' &&
    Number.isFinite(input.cardProcessingFeePct) &&
    input.cardProcessingFeePct >= 0
      ? input.cardProcessingFeePct
      : DEFAULT_CARD_PROCESSING_FEE_PCT
  const feeRate = feePct / 100

  const directRows = input.purchases.map((p) => ({
    amountUSD: p.amountUSD,
    amountTTD: p.amountTTD,
  }))

  // Each availability row costs amountUSD × exchangeRate TTD if fully used,
  // plus the card processing fee charged on card transactions.
  const cardRows = input.availabilityWithUsage.map((row) => ({
    amountUSD: row.amountUSD,
    amountTTD: row.amountUSD * row.exchangeRate * (1 + feeRate),
  }))

  const directTotalUSD = directRows.reduce((s, r) => s + r.amountUSD, 0)
  const directTotalTTD = directRows.reduce((s, r) => s + r.amountTTD, 0)
  const cardTotalUSD = cardRows.reduce((s, r) => s + r.amountUSD, 0)
  const cardTotalTTD = cardRows.reduce((s, r) => s + r.amountTTD, 0)

  return {
    cardProcessingFeeRate: feeRate,
    directPurchases: {
      totalUSD: directTotalUSD,
      totalTTD: directTotalTTD,
      weightedAvgRate: weightedAverageRate(directRows),
      count: directRows.length,
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
  const [purchases, { availabilityWithUsage, cardProcessingFeePct }] =
    await Promise.all([
      prisma.usdPurchase.findMany({
        where: { userId, year, month },
        orderBy: { purchasedAt: 'desc' },
      }),
      loadMonthAvailabilityWithUsage(userId, year, month),
    ])

  return computeMonthUsdCostSummary({
    purchases,
    availabilityWithUsage,
    cardProcessingFeePct,
  })
}
