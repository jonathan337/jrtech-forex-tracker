import { prisma } from '@/lib/prisma'

function monthBoundsUTC(year: number, month: number): { start: Date; end: Date } {
  const start = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0))
  const end = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999))
  return { start, end }
}

/**
 * All sent-payment rows for one calendar month, in the shape the payments page
 * consumes.
 *
 * Shared by GET /api/payments (month navigation, data-change refetch) and the
 * payments server page (initial SSR render). Computing this on the server for
 * the first paint removes the second round-trip the client used to make after
 * hydration.
 */
export async function loadPayments(userId: string, year: number, month: number) {
  const { start, end } = monthBoundsUTC(year, month)

  const rows = await prisma.sentPayment.findMany({
    where: {
      userId,
      paidAt: { gte: start, lte: end },
    },
    include: {
      person: { select: { id: true, name: true } },
    },
    orderBy: [{ paidAt: 'desc' }, { createdAt: 'desc' }],
  })

  return {
    year,
    month,
    payments: rows.map((r) => ({
      id: r.id,
      amountTTD: r.amountTTD,
      paidAt: r.paidAt.toISOString(),
      notes: r.notes,
      personId: r.personId,
      personName: r.person?.name ?? null,
    })),
  }
}

export type PaymentsData = Awaited<ReturnType<typeof loadPayments>>
