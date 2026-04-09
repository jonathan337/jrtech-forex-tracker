import type { Card, MonthlyAvailability, Person } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { buildRecurringAvailabilityEntry } from '@/lib/recurring-availability'

export type CardWithMonthlyAvailability = Card & {
  person: Person
  monthlyAvailability: MonthlyAvailability[]
}

/**
 * Same rules as {@link cardHasAvailabilityForMonth}, using data already loaded on the card
 * (no extra DB round-trips). Use from list endpoints that include `monthlyAvailability`.
 */
export function cardHasAvailabilityForMonthFromLoadedCard(
  card: CardWithMonthlyAvailability,
  year: number,
  month: number
): boolean {
  if (
    card.monthlyAvailability.some((a) => a.year === year && a.month === month)
  ) {
    return true
  }
  return buildRecurringAvailabilityEntry(card, year, month) !== null
}

/**
 * Matches dashboard/summary: a card is available for a month if there is an explicit
 * MonthlyAvailability row, or (if none) the card qualifies for recurring availability.
 */
export async function cardHasAvailabilityForMonth(
  cardId: string,
  year: number,
  month: number
): Promise<boolean> {
  const explicit = await prisma.monthlyAvailability.findFirst({
    where: { cardId, year, month },
  })
  if (explicit) return true

  const card = await prisma.card.findUnique({
    where: { id: cardId },
    include: { person: true },
  })
  if (!card) return false

  return buildRecurringAvailabilityEntry(card, year, month) !== null
}

export const USAGE_REQUIRES_AVAILABILITY_MESSAGE =
  'This card has no availability for that month. Add it under Availability first (or set the card as always available with recurring details).'
