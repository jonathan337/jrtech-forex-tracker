import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
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

    const totalUSD = availabilityWithUsage.reduce(
      (sum, item) => sum + item.amountUSD,
      0
    )
    const totalUsedUSD = usageRows.reduce(
      (sum, u) =>
        sum +
        (typeof u.amountUSD === 'number' && Number.isFinite(u.amountUSD)
          ? u.amountUSD
          : 0),
      0
    )
    const totalFeesTTD = availabilityWithUsage.reduce(
      (sum, item) => sum + item.impliedFeeTTD,
      0
    )
    const totalFeesUSD = availabilityWithUsage.reduce(
      (sum, item) => sum + item.impliedFeeUSD,
      0
    )
    const averageRate =
      availabilityWithUsage.length > 0
        ? availabilityWithUsage.reduce(
            (sum, item) => sum + item.exchangeRate,
            0
          ) / availabilityWithUsage.length
        : 0

    const totalUsedTTD = usageRows.reduce((sum, u) => sum + u.amountTTD, 0)

    const totalTTD = availabilityWithUsage.reduce(
      (sum, item) => sum + item.ttdValue,
      0
    )

    const netUSD = totalUSD - totalFeesUSD
    const balanceUSD = totalUSD - totalUsedUSD
    const balanceTTD = totalTTD - totalUsedTTD

    const summary = {
      year: y,
      month: m,
      totalCards: availabilityWithUsage.length,
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
