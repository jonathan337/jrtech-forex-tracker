import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { loadMonthAvailabilityWithUsage } from '@/lib/month-availability-with-usage'

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

    const personIdParam = searchParams.get('personId')?.trim()
    if (personIdParam) {
      const person = await prisma.person.findFirst({
        where: { id: personIdParam, userId: session.user.id },
        select: { id: true, name: true },
      })
      if (!person) {
        return NextResponse.json({ error: 'Person not found' }, { status: 404 })
      }
      personMeta = person
      rows = availabilityWithUsage.filter(
        (row) => row.card.person.id === person.id
      )
    }

    const totalUSD = rows.reduce((sum, item) => sum + item.amountUSD, 0)
    const totalUsedUSD = personIdParam
      ? rows.reduce((sum, item) => sum + item.usageUSD, 0)
      : usageRows.reduce(
          (sum, u) =>
            sum +
            (typeof u.amountUSD === 'number' && Number.isFinite(u.amountUSD)
              ? u.amountUSD
              : 0),
          0
        )
    const totalFeesTTD = rows.reduce(
      (sum, item) => sum + item.impliedFeeTTD,
      0
    )
    const totalFeesUSD = rows.reduce(
      (sum, item) => sum + item.impliedFeeUSD,
      0
    )
    const averageRate =
      rows.length > 0
        ? rows.reduce((sum, item) => sum + item.exchangeRate, 0) /
          rows.length
        : 0

    const totalUsedTTD = personIdParam
      ? rows.reduce((sum, item) => sum + item.usageTTD, 0)
      : usageRows.reduce((sum, u) => sum + u.amountTTD, 0)

    const totalTTD = rows.reduce((sum, item) => sum + item.ttdValue, 0)

    const netUSD = totalUSD - totalFeesUSD
    const balanceUSD = totalUSD - totalUsedUSD
    const balanceTTD = totalTTD - totalUsedTTD

    const summary = {
      year: y,
      month: m,
      totalCards: rows.length,
      totalUSD,
      totalFeesTTD,
      totalFeesUSD,
      averageRate,
      totalTTD,
      netUSD,
      totalUsedUSD,
      totalUsedTTD,
      balanceUSD,
      balanceTTD,
      availability: rows,
    }

    return NextResponse.json(
      personMeta ? { ...summary, person: personMeta } : summary
    )
  } catch (error) {
    console.error('Error fetching summary:', error)
    return NextResponse.json(
      { error: 'Failed to fetch summary' },
      { status: 500 }
    )
  }
}
