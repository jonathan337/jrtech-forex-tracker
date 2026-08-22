import { prisma } from '@/lib/prisma'
import { cardHasAvailabilityForMonthFromLoadedCard } from '@/lib/card-available-for-month'

/**
 * The Usage page's first-paint data for a month: the month's usage entries and
 * the cards that have availability that month (with each card's effective rate).
 * Mirrors GET /api/usage?year&month and GET /api/cards?year&month exactly, so
 * the client's later refetches to those routes stay identical.
 */
export async function loadUsageData(userId: string, year: number, month: number) {
  const [entries, cardsRaw, user] = await Promise.all([
    prisma.cardUsage.findMany({
      where: { card: { person: { userId } }, year, month },
      include: { card: { include: { person: true } } },
      orderBy: [{ usageDate: 'desc' }, { createdAt: 'desc' }],
    }),
    prisma.card.findMany({
      where: { person: { userId } },
      include: {
        person: true,
        monthlyAvailability: { orderBy: [{ year: 'desc' }, { month: 'desc' }] },
      },
      orderBy: { cardNickname: 'asc' },
    }),
    prisma.user.findUnique({
      where: { id: userId },
      select: { defaultExchangeRate: true },
    }),
  ])

  const fallbackRate =
    typeof user?.defaultExchangeRate === 'number'
      ? user.defaultExchangeRate
      : null

  const cards = cardsRaw
    .filter((c) => cardHasAvailabilityForMonthFromLoadedCard(c, year, month))
    .sort((a, b) => {
      const byPerson = a.person.name.localeCompare(b.person.name, undefined, {
        sensitivity: 'base',
      })
      if (byPerson !== 0) return byPerson
      return a.cardNickname.localeCompare(b.cardNickname, undefined, {
        sensitivity: 'base',
      })
    })
    .map((c) => {
      const monthRate =
        c.monthlyAvailability.find((ma) => ma.year === year && ma.month === month)
          ?.exchangeRate ?? null
      const effectiveExchangeRate =
        monthRate ??
        (c.alwaysAvailable ? c.recurringExchangeRate ?? null : null) ??
        fallbackRate
      const { monthlyAvailability, ...rest } = c
      void monthlyAvailability
      return { ...rest, effectiveExchangeRate }
    })

  return { entries, cards }
}
