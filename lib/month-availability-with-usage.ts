import { prisma } from '@/lib/prisma'
import { buildRecurringAvailabilityEntry } from '@/lib/recurring-availability'
import { ratePremiumTtd, ratePremiumUsd } from '@/lib/rate-premium'
import { DEFAULT_CARD_PROCESSING_FEE_PCT } from '@/lib/card-processing-fee'
import {
  cycleWindowForMonth,
  dateInWindow,
  effectiveCycleDay,
  isCalendarCycle,
  type CycleWindow,
} from '@/lib/card-cycle'

export type MonthUsageRow = {
  cardId: string
  amountTTD: number
  amountUSD: number | null
  paidToOwnerTTD: number
  usageDate?: Date
}

/**
 * Same availability + usage math as the Dashboard summary for one calendar month.
 *
 * Availability is keyed by (year, month): for an off-calendar card, the (year,
 * month) row represents the cycle *anchored* in that month. Usage, however, is
 * matched to the card's real statement cycle:
 *   - calendar-month cards (effective cycle day 1) keep exact (year, month)
 *     matching, so nothing about their numbers changes;
 *   - off-cycle cards (e.g. Republic Bank on the 21st) match usage by
 *     `usageDate` falling within the cycle window, so a charge early in the
 *     month counts against the previous cycle rather than this one.
 */
export async function loadMonthAvailabilityWithUsage(
  userId: string,
  y: number,
  m: number
) {
  const [user, explicit, recurringCards] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { defaultExchangeRate: true, cardProcessingFeePct: true },
    }),
    prisma.monthlyAvailability.findMany({
      where: { year: y, month: m, card: { person: { userId } } },
      include: { card: { include: { person: true } } },
    }),
    prisma.card.findMany({
      where: { person: { userId }, alwaysAvailable: true },
      include: { person: true },
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
  // numbers, but still let them suppress recurring availability (see `covered`).
  const explicitWithFlag = explicit
    .filter((item) => !item.unavailable)
    .map((item) => ({ ...item, isRecurringTemplate: false as const }))

  const covered = new Set(explicit.map((a) => a.cardId))

  const recurringRows = recurringCards
    .filter((c) => !covered.has(c.id))
    .map((c) => buildRecurringAvailabilityEntry(c, y, m))
    .filter((row) => row != null)

  const availability = [...explicitWithFlag, ...recurringRows].sort(
    (a, b) =>
      new Date(a.paymentDate).getTime() - new Date(b.paymentDate).getTime()
  )

  // Effective cycle day per card in play this month (explicit rows carry the
  // full card; recurring rows come from the fetched card objects).
  const cycleDayByCard = new Map<string, number>()
  for (const item of explicitWithFlag) {
    cycleDayByCard.set(item.cardId, effectiveCycleDay(item.card))
  }
  for (const c of recurringCards) {
    if (!cycleDayByCard.has(c.id)) cycleDayByCard.set(c.id, effectiveCycleDay(c))
  }

  const calendarCardIds: string[] = []
  const cycleCardIds: string[] = []
  for (const [cardId, day] of cycleDayByCard) {
    ;(isCalendarCycle(day) ? calendarCardIds : cycleCardIds).push(cardId)
  }

  // Off-cycle windows anchored in month m all fall within [month m, month m+2),
  // so fetch that span and filter each card to its exact window below.
  const spanStart = new Date(Date.UTC(y, m - 1, 1))
  const spanEnd = new Date(Date.UTC(y, m + 1, 1))

  const safeUsage = (p: Promise<MonthUsageRow[]>) =>
    p.catch((err): MonthUsageRow[] => {
      console.error('[month-availability] CardUsage query failed:', err)
      return []
    })

  const [calendarUsage, cycleUsage] = await Promise.all([
    calendarCardIds.length
      ? safeUsage(
          prisma.cardUsage.findMany({
            where: { year: y, month: m, cardId: { in: calendarCardIds } },
            select: {
              cardId: true,
              amountTTD: true,
              amountUSD: true,
              paidToOwnerTTD: true,
            },
          })
        )
      : Promise.resolve<MonthUsageRow[]>([]),
    cycleCardIds.length
      ? safeUsage(
          prisma.cardUsage.findMany({
            where: {
              cardId: { in: cycleCardIds },
              usageDate: { gte: spanStart, lt: spanEnd },
            },
            select: {
              cardId: true,
              amountTTD: true,
              amountUSD: true,
              paidToOwnerTTD: true,
              usageDate: true,
            },
          })
        )
      : Promise.resolve<MonthUsageRow[]>([]),
  ])

  // Window per off-cycle card, used both to filter usage and to label the row.
  const windowByCard = new Map<string, CycleWindow>()
  for (const cardId of cycleCardIds) {
    windowByCard.set(
      cardId,
      cycleWindowForMonth(cycleDayByCard.get(cardId) ?? 1, y, m)
    )
  }

  const usageByCard = new Map<string, MonthUsageRow[]>()
  const usageRows: MonthUsageRow[] = []
  const pushUsage = (u: MonthUsageRow) => {
    const list = usageByCard.get(u.cardId)
    if (list) list.push(u)
    else usageByCard.set(u.cardId, [u])
    usageRows.push(u)
  }
  for (const u of calendarUsage) pushUsage(u)
  for (const u of cycleUsage) {
    const win = windowByCard.get(u.cardId)
    if (win && u.usageDate && dateInWindow(new Date(u.usageDate), win)) {
      pushUsage(u)
    }
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
    const impliedFeeTTD = ratePremiumTtd(item.amountUSD, item.exchangeRate, baseline)
    const impliedFeeUSD = ratePremiumUsd(item.amountUSD, item.exchangeRate, baseline)
    const cycleDay = cycleDayByCard.get(item.cardId) ?? 1
    const cycleLabel = isCalendarCycle(cycleDay)
      ? ''
      : windowByCard.get(item.cardId)?.label ?? ''
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
      cycleDay,
      cycleLabel,
    }
  })

  return { baseline, cardProcessingFeePct, usageRows, availabilityWithUsage }
}
