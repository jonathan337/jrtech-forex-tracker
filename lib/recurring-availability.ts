import type { Card, Person } from '@prisma/client'

export type CardWithPerson = Card & { person: Person }

/** Safe calendar day in month (e.g. day 31 → last day in February). */
export function paymentDateInMonthUTC(
  year: number,
  month: number,
  dayOfMonth: number
): Date {
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate()
  const day = Math.min(dayOfMonth, lastDay)
  return new Date(Date.UTC(year, month - 1, day, 12, 0, 0))
}

export function buildRecurringAvailabilityEntry(
  card: CardWithPerson,
  year: number,
  month: number
) {
  if (
    !card.alwaysAvailable ||
    card.recurringAmountUSD == null ||
    card.recurringExchangeRate == null ||
    card.recurringPaymentDay == null
  ) {
    return null
  }

  const paymentDate = paymentDateInMonthUTC(
    year,
    month,
    card.recurringPaymentDay
  )

  return {
    id: `recurring-${card.id}`,
    year,
    month,
    cardId: card.id,
    amountUSD: card.recurringAmountUSD,
    exchangeRate: card.recurringExchangeRate,
    paymentDate,
    notes: card.recurringNotes,
    createdAt: card.createdAt,
    updatedAt: card.updatedAt,
    isRecurringTemplate: true as const,
    card: {
      cardNickname: card.cardNickname,
      issuingBank: card.issuingBank,
      lastFourDigits: card.lastFourDigits,
      person: {
        id: card.person.id,
        name: card.person.name,
      },
    },
  }
}
