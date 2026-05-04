import { prisma } from '@/lib/prisma'
import { buildRecurringAvailabilityEntry } from '@/lib/recurring-availability'
import { ratePremiumTtd, ratePremiumUsd } from '@/lib/rate-premium'

export type MonthUsageRow = {
  cardId: string
  amountTTD: number
  amountUSD: number | null
  paidToOwnerTTD: number
}

/**
 * Same availability + usage math as the Dashboard summary for one calendar month.
 */
export async function loadMonthAvailabilityWithUsage(
  userId: string,
  y: number,
  m: number
) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { defaultExchangeRate: true },
  })
  const baseline = user?.defaultExchangeRate ?? 0

  const userCards = await prisma.card.findMany({
    where: {
      person: {
        userId,
      },
    },
    select: { id: true },
  })

  const cardIds = userCards.map((c) => c.id)

  const explicit = await prisma.monthlyAvailability.findMany({
    where: {
      year: y,
      month: m,
      cardId: {
        in: cardIds,
      },
    },
    include: {
      card: {
        include: {
          person: true,
        },
      },
    },
  })

  const explicitWithFlag = explicit.map((item) => ({
    ...item,
    isRecurringTemplate: false as const,
  }))

  const recurringCards = await prisma.card.findMany({
    where: {
      person: { userId },
      alwaysAvailable: true,
    },
    include: { person: true },
  })

  const covered = new Set(explicit.map((a) => a.cardId))

  const recurringRows = recurringCards
    .filter((c) => !covered.has(c.id))
    .map((c) => buildRecurringAvailabilityEntry(c, y, m))
    .filter((row) => row != null)

  const availability = [...explicitWithFlag, ...recurringRows].sort(
    (a, b) =>
      new Date(a.paymentDate).getTime() - new Date(b.paymentDate).getTime()
  )

  let usageRows: MonthUsageRow[] = []
  try {
    usageRows = await prisma.cardUsage.findMany({
      where: {
        year: y,
        month: m,
        cardId: { in: cardIds },
      },
      select: {
        cardId: true,
        amountTTD: true,
        amountUSD: true,
        paidToOwnerTTD: true,
      },
    })
  } catch (usageErr) {
    console.error('[month-availability] CardUsage query failed:', usageErr)
  }

  const usageTTDByCard = new Map<string, number>()
  for (const u of usageRows) {
    usageTTDByCard.set(
      u.cardId,
      (usageTTDByCard.get(u.cardId) ?? 0) + u.amountTTD
    )
  }

  const availabilityWithUsage = availability.map((item) => {
    const cid = item.cardId
    const usageTTD = usageTTDByCard.get(cid) ?? 0
    const availableTTD = item.amountUSD * item.exchangeRate
    const balanceTTD = availableTTD - usageTTD
    const usageUSDForCard = usageRows
      .filter((u) => u.cardId === cid)
      .reduce(
        (sum, u) =>
          sum +
          (typeof u.amountUSD === 'number' && Number.isFinite(u.amountUSD)
            ? u.amountUSD
            : u.amountTTD / item.exchangeRate),
        0
      )
    const owedTTDForCard = usageRows
      .filter((u) => u.cardId === cid)
      .reduce((sum, u) => {
        const usageUSD =
          typeof u.amountUSD === 'number' && Number.isFinite(u.amountUSD)
            ? u.amountUSD
            : u.amountTTD / item.exchangeRate
        const owed = usageUSD * item.exchangeRate - u.paidToOwnerTTD
        return sum + Math.max(0, owed)
      }, 0)
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

  return { baseline, usageRows, availabilityWithUsage }
}
