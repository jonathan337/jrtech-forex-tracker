import { prisma } from '@/lib/prisma'
import { buildRecurringAvailabilityEntry } from '@/lib/recurring-availability'
import { ratePremiumTtd, ratePremiumUsd } from '@/lib/rate-premium'
import { DEFAULT_CARD_PROCESSING_FEE_PCT } from '@/lib/card-processing-fee'
import { effectiveCycleDay, type BankCycleDays } from '@/lib/card-cycle'
import { usageTtd, usageUsd } from '@/lib/usage-ttd'

export type MonthUsageRow = {
  cardId: string
  amountTTD: number
  amountUSD: number | null
  paidToOwnerTTD: number
}

/**
 * Availability + usage math for one calendar month.
 *
 * Usage is bucketed by the calendar month it was logged in (year, month), so a
 * charge always shows in the month you made it — regardless of the card's
 * statement cycle. (Earlier we tried matching usage to statement-cycle windows,
 * but no window convention can put a charge on both sides of a mid-month reset
 * into the month the user expects; they think in calendar months.)
 *
 * TTD figures are rate-locked via usageTtd(): each usage keeps the rate it was
 * logged at, so changing a card's rate later never rewrites past usage.
 */
export async function loadMonthAvailabilityWithUsage(
  userId: string,
  y: number,
  m: number
) {
  const [user, explicit, recurringCards, usageRowsRaw] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        defaultExchangeRate: true,
        cardProcessingFeePct: true,
        bankCycleDays: true,
      },
    }),
    prisma.monthlyAvailability.findMany({
      where: { year: y, month: m, card: { person: { userId } } },
      include: { card: { include: { person: true } } },
    }),
    prisma.card.findMany({
      where: { person: { userId }, alwaysAvailable: true },
      include: { person: true },
    }),
    prisma.cardUsage
      .findMany({
        where: { year: y, month: m, card: { person: { userId } } },
        select: {
          cardId: true,
          amountTTD: true,
          amountUSD: true,
          paidToOwnerTTD: true,
        },
      })
      .catch((err): MonthUsageRow[] => {
        console.error('[month-availability] CardUsage query failed:', err)
        return []
      }),
  ])

  const usageRows: MonthUsageRow[] = usageRowsRaw

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

  // Effective cycle day per card (explicit override, else per-bank config, else
  // 1 = calendar month). Used to label the reset day and the current-cycle
  // figure — not to bucket usage.
  const bankCycleDays = (user?.bankCycleDays ?? null) as BankCycleDays | null
  const cycleDayByCard = new Map<string, number>()
  for (const item of explicitWithFlag) {
    cycleDayByCard.set(item.cardId, effectiveCycleDay(item.card, bankCycleDays))
  }
  for (const c of recurringCards) {
    if (!cycleDayByCard.has(c.id)) {
      cycleDayByCard.set(c.id, effectiveCycleDay(c, bankCycleDays))
    }
  }

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
      // Rate-locked: read the TTD stored at log time, not USD × the current rate.
      const ttd = usageTtd(u, item.exchangeRate)
      usageTTD += ttd
      usageUSDForCard += usageUsd(u, item.exchangeRate) ?? 0
      owedTTDForCard += Math.max(0, ttd - u.paidToOwnerTTD)
    }
    const availableTTD = item.amountUSD * item.exchangeRate
    const balanceTTD = availableTTD - usageTTD
    const ttdValue = item.amountUSD * item.exchangeRate
    const balanceUSD = item.amountUSD - usageUSDForCard
    const impliedFeeTTD = ratePremiumTtd(item.amountUSD, item.exchangeRate, baseline)
    const impliedFeeUSD = ratePremiumUsd(item.amountUSD, item.exchangeRate, baseline)
    const cycleDay = cycleDayByCard.get(item.cardId) ?? 1
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
      // Reset-day note for off-calendar cards; usage still counts by calendar month.
      cycleLabel: cycleDay > 1 ? `Resets on the ${ordinal(cycleDay)}` : '',
    }
  })

  return { baseline, cardProcessingFeePct, usageRows, availabilityWithUsage }
}

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`
}
