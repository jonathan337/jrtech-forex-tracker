import { prisma } from '@/lib/prisma'
import { loadMonthAvailabilityWithUsage } from '@/lib/month-availability-with-usage'
import { loadOwedByPerson } from '@/lib/owed-by-person'
import { mapPersonPhoneForResponse } from '@/lib/person-payload'

/**
 * People with their owed totals and this-month spend headroom.
 *
 * Shared by GET /api/people and the people server page. Owed totals are
 * aggregated in the DB (loadOwedByPerson); headroom comes from the month bundle.
 */
export async function loadPeople(userId: string, year: number, month: number) {
  const [people, monthBundle, { owedTTDByPerson, owedUSDByPerson }] =
    await Promise.all([
      prisma.person.findMany({
        where: { userId },
        include: {
          cards: {
            select: { id: true, cardNickname: true, issuingBank: true },
          },
        },
        orderBy: { name: 'asc' },
      }),
      loadMonthAvailabilityWithUsage(userId, year, month),
      loadOwedByPerson(userId),
    ])

  const round2 = (n: number) => Math.round(n * 100) / 100

  const headroomTTDByPerson = new Map<string, number>()
  const headroomUSDByPerson = new Map<string, number>()
  const monthTotalAvailabilityUSDByPerson = new Map<string, number>()
  for (const row of monthBundle.availabilityWithUsage) {
    const pid = row.card.person.id
    headroomTTDByPerson.set(
      pid,
      (headroomTTDByPerson.get(pid) ?? 0) + row.balanceTTD
    )
    headroomUSDByPerson.set(
      pid,
      (headroomUSDByPerson.get(pid) ?? 0) + row.balanceUSD
    )
    const capUsd =
      typeof row.amountUSD === 'number' && Number.isFinite(row.amountUSD)
        ? row.amountUSD
        : 0
    monthTotalAvailabilityUSDByPerson.set(
      pid,
      (monthTotalAvailabilityUSDByPerson.get(pid) ?? 0) + capUsd
    )
  }

  return people.map((p) => ({
    ...mapPersonPhoneForResponse(p),
    owedUSD: round2(owedUSDByPerson.get(p.id) ?? 0),
    owedTTD: round2(owedTTDByPerson.get(p.id) ?? 0),
    spendHeadroomTTD: round2(headroomTTDByPerson.get(p.id) ?? 0),
    spendHeadroomUSD: round2(headroomUSDByPerson.get(p.id) ?? 0),
    monthTotalAvailabilityUSD: round2(
      monthTotalAvailabilityUSDByPerson.get(p.id) ?? 0
    ),
    budgetYear: year,
    budgetMonth: month,
  }))
}
