import { prisma } from '@/lib/prisma'

/**
 * Monthly availability rows for a user, newest month first.
 *
 * Shared by GET /api/availability and the availability server page. Optional
 * year/month narrow the result (mirrors the query params GET accepts); the
 * server page and the client's list fetch both omit them to load everything.
 */
export async function loadAvailability(
  userId: string,
  year?: number,
  month?: number
) {
  const where = {
    card: {
      person: {
        userId,
      },
    },
    ...(year != null && { year }),
    ...(month != null && { month }),
  }

  return prisma.monthlyAvailability.findMany({
    where,
    include: {
      card: {
        include: {
          person: true,
        },
      },
    },
    orderBy: [{ year: 'desc' }, { month: 'desc' }, { paymentDate: 'asc' }],
  })
}
