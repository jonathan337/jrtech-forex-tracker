import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { loadMonthAvailabilityWithUsage } from '@/lib/month-availability-with-usage'
import { loadOwedByPerson } from '@/lib/owed-by-person'
import { buildMonthSummary, monthUsageTotals } from '@/lib/month-summary'
import { computeMonthUsdCostSummary } from '@/lib/month-usd-cost-summary'

export const runtime = 'nodejs'

/**
 * Everything the dashboard needs in one request.
 *
 * The dashboard used to call /api/summary, /api/settings, /api/people and
 * /api/usd-purchases on every load — together they ran the month bundle three
 * times (~16 queries, several sequential). This endpoint computes the bundle
 * once and issues a single parallel wave of queries.
 */
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

    const [bundle, purchases, owed] = await Promise.all([
      loadMonthAvailabilityWithUsage(session.user.id, y, m),
      prisma.usdPurchase.findMany({
        where: { userId: session.user.id, year: y, month: m },
        orderBy: { purchasedAt: 'desc' },
      }),
      loadOwedByPerson(session.user.id),
    ])

    const summary = buildMonthSummary({
      year: y,
      month: m,
      rows: bundle.availabilityWithUsage,
      ...monthUsageTotals(bundle.usageRows),
    })

    const usdCostSummary = computeMonthUsdCostSummary({
      purchases,
      availabilityWithUsage: bundle.availabilityWithUsage,
      cardProcessingFeePct: bundle.cardProcessingFeePct,
    })

    // Match what the People page shows: each person's owed rounded to cents,
    // then summed.
    const round2 = (n: number) => Math.round(n * 100) / 100
    const totalOwedToPeopleTTD = round2(
      [...owed.owedTTDByPerson.values()].reduce(
        (sum, owedTTD) => sum + round2(owedTTD),
        0
      )
    )

    return NextResponse.json({
      summary,
      defaultExchangeRate: bundle.baseline,
      totalOwedToPeopleTTD,
      usdCostSummary,
    })
  } catch (error) {
    console.error('Error fetching dashboard data:', error)
    return NextResponse.json(
      { error: 'Failed to fetch dashboard data' },
      { status: 500 }
    )
  }
}
