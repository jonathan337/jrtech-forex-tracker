import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { loadDashboardData } from '@/lib/dashboard-data'

export const runtime = 'nodejs'

/**
 * Everything the dashboard needs in one request. Used for month navigation and
 * the after-a-change refetch; the initial render is served straight from the
 * dashboard server page, which calls loadDashboardData() directly.
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

    const data = await loadDashboardData(
      session.user.id,
      parseInt(year, 10),
      parseInt(month, 10)
    )

    return NextResponse.json(data)
  } catch (error) {
    console.error('Error fetching dashboard data:', error)
    return NextResponse.json(
      { error: 'Failed to fetch dashboard data' },
      { status: 500 }
    )
  }
}
