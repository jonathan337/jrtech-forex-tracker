import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { loadAvailability } from '@/lib/availability-data'
import { AvailabilityClient } from './AvailabilityClient'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export default async function AvailabilityPage() {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')

  let initialData = null
  try {
    const data = await loadAvailability(session.user.id)
    initialData = JSON.parse(JSON.stringify(data))
  } catch (error) {
    console.error('Availability SSR load failed:', error)
  }

  return <AvailabilityClient initialData={initialData} />
}
