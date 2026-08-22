import { loadMonthAvailabilityWithUsage } from '@/lib/month-availability-with-usage'

export type AllocationCard = {
  cardId: string
  cardNickname: string
  lastFourDigits: string | null
  issuingBank: string | null
  personId: string
  personName: string
  allocationUSD: number
  usedUSD: number
  leftUSD: number
  leftTTD: number
  cycleLabel: string
}

export type AllocationPerson = {
  personId: string
  personName: string
  leftUSD: number
  leftTTD: number
  cardCount: number
}

export type PendingAllocations = {
  cards: AllocationCard[]
  people: AllocationPerson[]
  totalLeftUSD: number
  totalLeftTTD: number
  year: number
  month: number
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

/**
 * Forex allocation still available to use this month/cycle — i.e. each card's
 * USD availability minus what's been used, for cards that still have headroom.
 * Reuses the month bundle (same numbers as the dashboard's "USD left"). Person
 * totals sum from their cards.
 */
export async function loadPendingAllocations(
  userId: string,
  year: number,
  month: number
): Promise<PendingAllocations> {
  const { availabilityWithUsage } = await loadMonthAvailabilityWithUsage(
    userId,
    year,
    month
  )

  const cards: AllocationCard[] = availabilityWithUsage
    .filter((r) => r.balanceUSD > 0.005)
    .map((r) => ({
      cardId: r.cardId,
      cardNickname: r.card.cardNickname,
      lastFourDigits: r.card.lastFourDigits ?? null,
      issuingBank: r.card.issuingBank ?? null,
      personId: r.card.person.id,
      personName: r.card.person.name,
      allocationUSD: round2(r.amountUSD),
      usedUSD: round2(r.usageUSD),
      leftUSD: round2(r.balanceUSD),
      leftTTD: round2(r.balanceTTD),
      cycleLabel: r.cycleLabel || '',
    }))
    .sort((a, b) => b.leftUSD - a.leftUSD)

  const byPerson = new Map<string, AllocationPerson>()
  for (const c of cards) {
    const existing = byPerson.get(c.personId)
    if (existing) {
      existing.leftUSD = round2(existing.leftUSD + c.leftUSD)
      existing.leftTTD = round2(existing.leftTTD + c.leftTTD)
      existing.cardCount += 1
    } else {
      byPerson.set(c.personId, {
        personId: c.personId,
        personName: c.personName,
        leftUSD: c.leftUSD,
        leftTTD: c.leftTTD,
        cardCount: 1,
      })
    }
  }
  const people = [...byPerson.values()].sort((a, b) => b.leftUSD - a.leftUSD)

  return {
    cards,
    people,
    totalLeftUSD: round2(cards.reduce((s, c) => s + c.leftUSD, 0)),
    totalLeftTTD: round2(cards.reduce((s, c) => s + c.leftTTD, 0)),
    year,
    month,
  }
}
