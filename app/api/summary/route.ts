import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { loadMonthAvailabilityWithUsage } from '@/lib/month-availability-with-usage'
import { buildMonthSummary, monthUsageTotals } from '@/lib/month-summary'
import { loadCarriedOwedForPerson, type CarriedOwed } from '@/lib/owed-by-person'

export const runtime = 'nodejs'

export async function GET(request: Request) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const year = searchParams.get('year')
    const month = searchParams.get('month')

    if (!year || !month) {
      return NextResponse.json(
        { error: 'Year and month are required' },
        { status: 400 }
      )
    }

    const y = parseInt(year, 10)
    const m = parseInt(month, 10)

    const { usageRows, availabilityWithUsage } =
      await loadMonthAvailabilityWithUsage(session.user.id, y, m)

    let rows = availabilityWithUsage
    let personMeta: { id: string; name: string } | null = null
    let carriedOver: CarriedOwed | null = null

    const personIdParam = searchParams.get('personId')?.trim()
    if (personIdParam) {
      const [person, carried] = await Promise.all([
        prisma.person.findFirst({
          where: { id: personIdParam, userId: session.user.id },
          select: { id: true, name: true },
        }),
        loadCarriedOwedForPerson(session.user.id, personIdParam, y, m),
      ])
      if (!person) {
        return NextResponse.json({ error: 'Person not found' }, { status: 404 })
      }
      personMeta = person
      carriedOver = carried
      rows = availabilityWithUsage.filter(
        (row) => row.card.person.id === person.id
      )
    }

    // Person view scopes usage to that person's cards; the full view counts the
    // whole month, including usage on cards with no availability row.
    const { totalUsedUSD, totalUsedTTD } = personIdParam
      ? {
          totalUsedUSD: rows.reduce((sum, item) => sum + item.usageUSD, 0),
          totalUsedTTD: rows.reduce((sum, item) => sum + item.usageTTD, 0),
        }
      : monthUsageTotals(usageRows)

    const summary = buildMonthSummary({
      year: y,
      month: m,
      rows,
      totalUsedUSD,
      totalUsedTTD,
    })

    return NextResponse.json(
      personMeta
        ? { ...summary, person: personMeta, carriedOver }
        : summary
    )
  } catch (error) {
    console.error('Error fetching summary:', error)
    return NextResponse.json(
      { error: 'Failed to fetch summary' },
      { status: 500 }
    )
  }
}
