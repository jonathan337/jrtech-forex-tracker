import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { loadPendingAllocations } from '@/lib/pending-allocations'
import { PendingClient } from './PendingClient'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Current year/month in the user's timezone (JRTech is Trinidad). */
function currentYearMonth(): { year: number; month: number } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Port_of_Spain',
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(new Date())
  return {
    year: Number(parts.find((p) => p.type === 'year')?.value),
    month: Number(parts.find((p) => p.type === 'month')?.value),
  }
}

export default async function PendingPage() {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')

  const { year, month } = currentYearMonth()
  const data = await loadPendingAllocations(session.user.id, year, month)
  const initial = JSON.parse(JSON.stringify(data))

  return <PendingClient data={initial} />
}
