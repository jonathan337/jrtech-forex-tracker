import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { loadPeople } from '@/lib/people-data'
import { PeopleClient } from './PeopleClient'

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

export default async function PeoplePage() {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')

  const { year, month } = currentYearMonth()
  let initialData = null
  try {
    const data = await loadPeople(session.user.id, year, month)
    initialData = JSON.parse(JSON.stringify(data))
  } catch (error) {
    console.error('People SSR load failed:', error)
  }

  return <PeopleClient initialData={initialData} />
}
