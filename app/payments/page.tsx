import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { loadPayments } from '@/lib/payments-data'
import { PaymentsClient } from './PaymentsClient'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Current year/month in the user's timezone (JRTech is Trinidad), so the SSR
 *  month matches the client's — server functions run in UTC otherwise. */
function currentYearMonth(): { year: number; month: number } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Port_of_Spain',
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(new Date())
  const year = Number(parts.find((p) => p.type === 'year')?.value)
  const month = Number(parts.find((p) => p.type === 'month')?.value)
  return { year, month }
}

export default async function PaymentsPage() {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')

  const { year, month } = currentYearMonth()

  // Fetch the first month server-side so content ships with the HTML. If it
  // fails, fall back to null and let the client fetch (old behavior).
  let initialData = null
  try {
    const data = await loadPayments(session.user.id, year, month)
    // Serialize to the exact JSON shape the client already consumes from
    // /api/payments (dates as strings, plain objects).
    initialData = JSON.parse(JSON.stringify(data))
  } catch (error) {
    console.error('Payments SSR load failed:', error)
  }

  return (
    <PaymentsClient
      initialData={initialData}
      initialYear={year}
      initialMonth={month}
    />
  )
}
