import { prisma } from '@/lib/prisma'
import { buildRecurringAvailabilityEntry } from '@/lib/recurring-availability'
import { ratePremiumTtd, ratePremiumUsd } from '@/lib/rate-premium'
import { DEFAULT_CARD_PROCESSING_FEE_PCT } from '@/lib/card-processing-fee'

export type MonthUsageRow = {
  cardId: string
  amountTTD: number
  amountUSD: number | null
  paidToOwnerTTD: number
}

/**
 * Same availability + usage math as the Dashboard summary for one calendar month.
 *
 * All queries run in a single parallel wave — with a remote database (Supabase
 * pooler) each round trip is expensive, so query count and sequencing dominate
 * this function's latency. Availability/usage rows are scoped to the user by
 * filtering through the card→person relation instead of pre-fetching card IDs.
 */
export async function loadMonthAvailabilityWithUsage(
  userId: string,
  y: number,
  m: number
) {
  const [user, explicit, recurringCards, usageRows] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { defaultExchangeRate: true, cardProcessingFeePct: true },
    }),
    prisma.monthlyAvailability.findMany({
      where: {
        year: y,
        month: m,
        card: { person: { userId } },
      },
      include: {
        card: {
          include: {
            person: true,
          },
        },
      },
    }),
    prisma.card.findMany({
      where: {
        person: { userId },
        alwaysAvailable: true,
      },
      include: { person: true },
    }),
    prisma.cardUsage
      .findMany({
        where: {
          year: y,
          month: m,
          card: { person: { userId } },
        },
        select: {
          cardId: true,
          amountTTD: true,
          amountUSD: true,
          paidToOwnerTTD: true,
        },
      })
      .catch((usageErr): MonthUsageRow[] => {
        console.error('[month-availability] CardUsage query failed:', usageErr)
        return []
      }),
  ])

  const baseline = user?.defaultExchangeRate ?? 0
  const cardProcessingFeePct =
    typeof user?.cardProcessingFeePct === 'number' &&
    Number.isFinite(user.cardProcessingFeePct) &&
    user.cardProcessingFeePct >= 0
      ? user.cardProcessingFeePct
      : DEFAULT_CARD_PROCESSING_FEE_PCT

  // Rows flagged "unavailable" are not real availability — exclude them from the
  // numbers, but still let them suppress recurring availability (see `covered` below).
  const explicitWithFlag = explicit
    .filter((item) => !item.unavailable)
    .map((item) => ({
      ...item,
      isRecurringTemplate: false as const,
    }))

  const covered = new Set(explicit.map((a) => a.cardId))

  const recurringRows = recurringCards
    .filter((c) => !covered.has(c.id))
    .map((c) => buildRecurringAvailabilityEntry(c, y, m))
    .filter((row) => row != null)

  const availability = [...explicitWithFlag, ...recurringRows].sort(
    (a, b) =>
      new Date(a.paymentDate).getTime() - new Date(b.paymentDate).getTime()
  )

  const usageByCard = new Map<string, MonthUsageRow[]>()
  for (const u of usageRows) {
    const list = usageByCard.get(u.cardId)
    if (list) list.push(u)
    else usageByCard.set(u.cardId, [u])
  }

  const availabilityWithUsage = availability.map((item) => {
    const cardRows = usageByCard.get(item.cardId) ?? []
    let usageTTD = 0
    let usageUSDForCard = 0
    let owedTTDForCard = 0
    for (const u of cardRows) {
      usageTTD += u.amountTTD
      const usageUSD =
        typeof u.amountUSD === 'number' && Number.isFinite(u.amountUSD)
          ? u.amountUSD
          : u.amountTTD / item.exchangeRate
      usageUSDForCard += usageUSD
      const owed = usageUSD * item.exchangeRate - u.paidToOwnerTTD
      owedTTDForCard += Math.max(0, owed)
    }
    const availableTTD = item.amountUSD * item.exchangeRate
    const balanceTTD = availableTTD - usageTTD
    const ttdValue = item.amountUSD * item.exchangeRate
    const balanceUSD = item.amountUSD - usageUSDForCard
    const impliedFeeTTD = ratePremiumTtd(
      item.amountUSD,
      item.exchangeRate,
      baseline
    )
    const impliedFeeUSD = ratePremiumUsd(
      item.amountUSD,
      item.exchangeRate,
      baseline
    )
    return {
      ...item,
      usageTTD,
      owedTTD: owedTTDForCard,
      balanceTTD,
      usageUSD: usageUSDForCard,
      ttdValue,
      balanceUSD,
      impliedFeeTTD,
      impliedFeeUSD,
    }
  })

  return { baseline, cardProcessingFeePct, usageRows, availabilityWithUsage }
}
