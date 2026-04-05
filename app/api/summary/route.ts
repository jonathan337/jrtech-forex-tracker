import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'

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

    // First, get all cards belonging to the user's people
    const userCards = await prisma.card.findMany({
      where: {
        person: {
          userId: session.user.id,
        },
      },
      select: { id: true },
    })

    const cardIds = userCards.map((c) => c.id)

    // Then get availability for those cards
    const availability = await prisma.monthlyAvailability.findMany({
      where: {
        year: parseInt(year),
        month: parseInt(month),
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
      orderBy: {
        paymentDate: 'asc',
      },
    })

    // Calculate summary statistics
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

    // Calculate total in TTD (Trinidad and Tobago Dollar) using weighted average
    const totalTTD = availability.reduce(
      (sum, item) => sum + item.amountUSD * item.exchangeRate,
      0
    )

    const summary = {
      year: parseInt(year),
      month: parseInt(month),
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
