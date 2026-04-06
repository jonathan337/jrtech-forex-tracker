'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { format } from 'date-fns'
import {
  ArrowLeft,
  CreditCard,
  Loader2,
  User,
  Calendar,
  Wallet,
} from 'lucide-react'

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]

interface MonthlyEntry {
  id: string
  year: number
  month: number
  amountUSD: number
  exchangeRate: number
  paymentDate: string
  notes: string | null
}

interface CardDetail {
  id: string
  cardNickname: string
  lastFourDigits: string | null
  notes: string | null
  alwaysAvailable: boolean
  recurringAmountUSD: number | null
  recurringExchangeRate: number | null
  recurringPaymentDay: number | null
  recurringNotes: string | null
  person: { id: string; name: string }
  monthlyAvailability: MonthlyEntry[]
}

interface UsageRow {
  id: string
  year: number
  month: number
  amountUSD: number
  usageDate: string
  notes: string | null
}

export default function CardDetailPage() {
  const params = useParams()
  const router = useRouter()
  const { status } = useSession()
  const id = typeof params.id === 'string' ? params.id : ''

  const [card, setCard] = useState<CardDetail | null>(null)
  const [usage, setUsage] = useState<UsageRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.replace('/login')
    }
  }, [status, router])

  useEffect(() => {
    if (status !== 'authenticated' || !id) return

    let cancelled = false

    const load = async () => {
      setLoading(true)
      setError('')
      try {
        const [cardRes, usageRes] = await Promise.all([
          fetch(`/api/cards/${id}`, {
            credentials: 'include',
            cache: 'no-store',
          }),
          fetch(`/api/usage?cardId=${encodeURIComponent(id)}`, {
            credentials: 'include',
            cache: 'no-store',
          }),
        ])
        if (cancelled) return
        if (!cardRes.ok) {
          setError(
            cardRes.status === 404
              ? 'Card not found.'
              : 'Could not load this card.'
          )
          setCard(null)
          setUsage([])
          return
        }
        setCard(await cardRes.json())
        if (usageRes.ok) {
          setUsage(await usageRes.json())
        } else {
          setUsage([])
        }
      } catch {
        if (!cancelled) {
          setError('Network error.')
          setCard(null)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [status, id])

  if (status === 'loading') {
    return (
      <div className="min-h-[40vh] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    )
  }

  if (status === 'unauthenticated') {
    return null
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            type="button"
            onClick={() => router.push('/cards')}
          >
            <ArrowLeft className="w-4 h-4 mr-1" />
            Cards
          </Button>
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
              {loading ? 'Card' : card?.cardNickname ?? 'Card'}
            </h1>
            {card && (
              <p className="text-gray-600 mt-1 flex items-center gap-2 text-sm">
                <User className="w-4 h-4 text-gray-400" />
                {card.person.name}
              </p>
            )}
          </div>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-16 text-gray-500 flex flex-col items-center gap-2">
          <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
          Loading card…
        </div>
      ) : error || !card ? (
        <Card>
          <CardContent className="py-12 text-center text-gray-600">
            <p className="mb-4">{error || 'Card not found.'}</p>
            <Button variant="outline" type="button" onClick={() => router.push('/cards')}>
              Back to cards
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          <Card className="shadow-md border-l-4 border-l-blue-500">
            <CardHeader>
              <div className="flex items-start gap-3">
                <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center shrink-0">
                  <CreditCard className="w-6 h-6 text-white" />
                </div>
                <div className="min-w-0">
                  <CardTitle className="text-xl">{card.cardNickname}</CardTitle>
                  <div className="text-sm text-gray-500 mt-1 space-y-1">
                    {card.lastFourDigits && (
                      <span className="block font-mono text-gray-600">
                        •••• {card.lastFourDigits}
                      </span>
                    )}
                    {card.alwaysAvailable && (
                      <span className="inline-block text-xs px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-800">
                        Every month (recurring template)
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {card.notes && (
                <div>
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
                    Notes
                  </p>
                  <p className="text-sm text-gray-700 whitespace-pre-wrap">
                    {card.notes}
                  </p>
                </div>
              )}

              {card.alwaysAvailable &&
                card.recurringAmountUSD != null &&
                card.recurringExchangeRate != null && (
                  <div className="rounded-lg border border-indigo-100 bg-indigo-50/50 p-4 text-sm">
                    <p className="font-medium text-gray-900 mb-2">
                      Recurring template
                    </p>
                    <ul className="grid sm:grid-cols-2 gap-2 text-gray-700">
                      <li>
                        Amount:{' '}
                        <span className="font-semibold">
                          ${card.recurringAmountUSD.toFixed(2)} USD
                        </span>
                      </li>
                      <li>
                        Rate:{' '}
                        <span className="font-semibold">
                          {card.recurringExchangeRate.toFixed(4)} TTD/USD
                        </span>
                      </li>
                      <li>
                        Payment day:{' '}
                        <span className="font-semibold">
                          {card.recurringPaymentDay ?? '—'}
                        </span>
                      </li>
                      {card.recurringNotes && (
                        <li className="sm:col-span-2 text-gray-600">
                          {card.recurringNotes}
                        </li>
                      )}
                    </ul>
                  </div>
                )}
            </CardContent>
          </Card>

          <Card className="shadow-md">
            <CardHeader>
              <div className="flex items-center gap-2">
                <Calendar className="w-5 h-5 text-purple-600" />
                <CardTitle className="text-lg">Monthly availability entries</CardTitle>
              </div>
              <CardDescription>
                Explicit months added under Availability (not the recurring template itself).
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {card.monthlyAvailability.length === 0 ? (
                <p className="px-6 pb-6 text-sm text-gray-500">
                  No monthly rows yet. Add them under{' '}
                  <Link href="/availability" className="text-blue-600 hover:underline">
                    Monthly Availability
                  </Link>
                  .
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-gray-50 text-left">
                        <th className="py-3 px-4 font-medium text-gray-700">Month</th>
                        <th className="py-3 px-4 font-medium text-gray-700 text-right">
                          USD
                        </th>
                        <th className="py-3 px-4 font-medium text-gray-700 text-right">
                          Rate
                        </th>
                        <th className="py-3 px-4 font-medium text-gray-700 text-right">
                          TTD value
                        </th>
                        <th className="py-3 px-4 font-medium text-gray-700">
                          Payment
                        </th>
                        <th className="py-3 px-4 font-medium text-gray-700">Notes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {card.monthlyAvailability.map((row) => (
                        <tr key={row.id} className="border-b border-gray-100 hover:bg-gray-50/80">
                          <td className="py-3 px-4">
                            {MONTHS[row.month - 1]} {row.year}
                          </td>
                          <td className="py-3 px-4 text-right font-medium text-green-700">
                            ${row.amountUSD.toFixed(2)}
                          </td>
                          <td className="py-3 px-4 text-right font-mono">
                            {row.exchangeRate.toFixed(4)}
                          </td>
                          <td className="py-3 px-4 text-right text-blue-700">
                            ${(row.amountUSD * row.exchangeRate).toFixed(2)}
                          </td>
                          <td className="py-3 px-4 text-gray-600 whitespace-nowrap">
                            {format(new Date(row.paymentDate), 'MMM d, yyyy')}
                          </td>
                          <td className="py-3 px-4 text-gray-600 max-w-[200px] truncate" title={row.notes ?? ''}>
                            {row.notes || '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="shadow-md">
            <CardHeader>
              <div className="flex items-center gap-2">
                <Wallet className="w-5 h-5 text-amber-600" />
                <CardTitle className="text-lg">Usage history</CardTitle>
              </div>
              <CardDescription>
                All logged USD usage for this card.{' '}
                <Link href="/usage" className="text-blue-600 hover:underline">
                  Log more on the Usage page
                </Link>
                .
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {usage.length === 0 ? (
                <p className="px-6 pb-6 text-sm text-gray-500">
                  No usage logged yet for this card.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-gray-50 text-left">
                        <th className="py-3 px-4 font-medium text-gray-700">Date</th>
                        <th className="py-3 px-4 font-medium text-gray-700">Period</th>
                        <th className="py-3 px-4 font-medium text-gray-700 text-right">
                          Amount (USD)
                        </th>
                        <th className="py-3 px-4 font-medium text-gray-700">Notes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {usage.map((u) => (
                        <tr key={u.id} className="border-b border-gray-100 hover:bg-gray-50/80">
                          <td className="py-3 px-4 whitespace-nowrap text-gray-800">
                            {format(new Date(u.usageDate), 'MMM d, yyyy')}
                          </td>
                          <td className="py-3 px-4 text-gray-600">
                            {MONTHS[u.month - 1]} {u.year}
                          </td>
                          <td className="py-3 px-4 text-right font-medium text-amber-800">
                            ${u.amountUSD.toFixed(2)}
                          </td>
                          <td className="py-3 px-4 text-gray-600 max-w-[240px] truncate" title={u.notes ?? ''}>
                            {u.notes || '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}
