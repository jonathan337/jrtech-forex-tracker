import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { buildRecurringAvailabilityEntry } from '@/lib/recurring-availability'

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

    const userCards = await prisma.card.findMany({
      where: {
        person: {
          userId: session.user.id,
        },
      },
      select: { id: true },
    })

    const cardIds = userCards.map((c) => c.id)

    const explicit = await prisma.monthlyAvailability.findMany({
      where: {
        year: y,
        month: m,
        cardId: {
          in: cardIds,
        },
      },
      include: {
        card: {
          include: {
            person: true,
          },
        },
      },
    })

    const explicitWithFlag = explicit.map((item) => ({
      ...item,
      isRecurringTemplate: false as const,
    }))

    const recurringCards = await prisma.card.findMany({
      where: {
        person: { userId: session.user.id },
        alwaysAvailable: true,
      },
      include: { person: true },
    })

    const covered = new Set(explicit.map((a) => a.cardId))

    const recurringRows = recurringCards
      .filter((c) => !covered.has(c.id))
      .map((c) => buildRecurringAvailabilityEntry(c, y, m))
      .filter((row) => row != null)

    const availability = [...explicitWithFlag, ...recurringRows].sort(
      (a, b) =>
        new Date(a.paymentDate).getTime() - new Date(b.paymentDate).getTime()
    )

    const totalUSD = availability.reduce((sum, item) => sum + item.amountUSD, 0)
    const totalFees = availability.reduce(
      (sum, item) => sum + (item.feeAmount || 0),
      0
    )
    const averageRate =
      availability.length > 0
        ? availability.reduce((sum, item) => sum + item.exchangeRate, 0) /
          availability.length
        : 0

    const totalTTD = availability.reduce(
      (sum, item) => sum + item.amountUSD * item.exchangeRate,
      0
    )

    const summary = {
      year: y,
      month: m,
      totalCards: availability.length,
      totalUSD,
      totalFees,
      averageRate,
      totalTTD,
      netUSD: totalUSD - totalFees,
      availability,
    }

    return NextResponse.json(summary)
  } catch (error) {
    console.error('Error fetching summary:', error)
    return NextResponse.json(
      { error: 'Failed to fetch summary' },
      { status: 500 }
    )
  }
}
