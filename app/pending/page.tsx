import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { loadPendingUsage } from '@/lib/pending-usage'
import { PendingClient } from './PendingClient'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export default async function PendingPage() {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')

  const data = await loadPendingUsage(session.user.id)
  // Serialize to plain JSON for the client boundary.
  const initial = JSON.parse(JSON.stringify(data))

  return <PendingClient data={initial} />
}
