import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { loadCardsPageData } from '@/lib/cards-data'
import { CardsClient } from './CardsClient'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export default async function CardsPage() {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')

  let initialData = null
  try {
    const data = await loadCardsPageData(session.user.id)
    initialData = JSON.parse(JSON.stringify(data))
  } catch (error) {
    console.error('Cards SSR load failed:', error)
  }

  return <CardsClient initialData={initialData} />
}
