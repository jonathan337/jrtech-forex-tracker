import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { buildRecurringAvailabilityEntry } from '@/lib/recurring-availability'
import { ratePremiumTtd, ratePremiumUsd } from '@/lib/rate-premium'

export const runtime = 'nodejs'

export async function GET(request: Request) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { defaultExchangeRate: true },
    })
    const baseline = user?.defaultExchangeRate ?? 0

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

    let usageRows: { cardId: string; amountUSD: number }[] = []
    try {
      usageRows = await prisma.cardUsage.findMany({
        where: {
          year: y,
          month: m,
          cardId: { in: cardIds },
        },
        select: { cardId: true, amountUSD: true },
      })
    } catch (usageErr) {
      // e.g. migration not applied yet — treat as no usage so availability still loads
      console.error('[summary] CardUsage query failed:', usageErr)
    }

    const usageByCard = new Map<string, number>()
    for (const u of usageRows) {
      usageByCard.set(
        u.cardId,
        (usageByCard.get(u.cardId) ?? 0) + u.amountUSD
      )
    }

    const totalUsedUSD = usageRows.reduce((sum, u) => sum + u.amountUSD, 0)

    const availabilityWithUsage = availability.map((item) => {
      const cid = item.cardId
      const usageUSD = usageByCard.get(cid) ?? 0
      const impliedFeeTTD = ratePremiumTtd(
        item.amountUSD,
        item.exchangeRate,
        baseline
      )
      const impliedFeeUSD = ratePremiumUsd(
        item.amountUSD,
        item.exchangeRate,
        baseline
      )
      return {
        ...item,
        usageUSD,
        balanceUSD: item.amountUSD - usageUSD,
        impliedFeeTTD,
        impliedFeeUSD,
      }
    })

    const totalUSD = availability.reduce((sum, item) => sum + item.amountUSD, 0)
    const totalFeesTTD = availabilityWithUsage.reduce(
      (sum, item) => sum + item.impliedFeeTTD,
      0
    )
    const totalFeesUSD = availabilityWithUsage.reduce(
      (sum, item) => sum + item.impliedFeeUSD,
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

    const netUSD = totalUSD - totalFeesUSD
    const balanceUSD = totalUSD - totalUsedUSD

    const summary = {
      year: y,
      month: m,
      totalCards: availability.length,
      totalUSD,
      totalFeesTTD,
      totalFeesUSD,
      averageRate,
      totalTTD,
      netUSD,
      totalUsedUSD,
      balanceUSD,
      availability: availabilityWithUsage,
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
