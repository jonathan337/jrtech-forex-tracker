import { prisma } from '@/lib/prisma'
import { resolveUserBanks, type Bank } from '@/lib/card-bank'

/**
 * Everything the Cards page needs on first paint: the card list, the person
 * list (for the form dropdown), the default exchange rate, and the editable
 * bank list. Used by the cards server page. The /api/cards, /api/people and
 * /api/settings routes still serve the client's later refetches unchanged.
 */
export async function loadCardsPageData(userId: string): Promise<{
  cards: unknown[]
  people: Array<{ id: string; name: string }>
  defaultExchangeRate: number | null
  banks: Bank[]
}> {
  const [cards, people, user] = await Promise.all([
    prisma.card.findMany({
      where: { person: { userId } },
      include: {
        person: true,
        monthlyAvailability: { orderBy: [{ year: 'desc' }, { month: 'desc' }] },
      },
      orderBy: { cardNickname: 'asc' },
    }),
    prisma.person.findMany({
      where: { userId },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    }),
    prisma.user.findUnique({
      where: { id: userId },
      select: { defaultExchangeRate: true, banks: true, bankCycleDays: true },
    }),
  ])

  return {
    cards,
    people,
    defaultExchangeRate:
      typeof user?.defaultExchangeRate === 'number'
        ? user.defaultExchangeRate
        : null,
    banks: user ? resolveUserBanks(user) : [],
  }
}
