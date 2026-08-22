import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { loadOwedUsage } from '@/lib/owed-usage'
import { OwedClient } from './OwedClient'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export default async function OwedPage() {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')

  const data = await loadOwedUsage(session.user.id)
  // Serialize to plain JSON for the client boundary.
  const initial = JSON.parse(JSON.stringify(data))

  return <OwedClient data={initial} />
}
