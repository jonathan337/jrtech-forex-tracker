'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { format } from 'date-fns'
import { ChevronLeft, ChevronRight, DollarSign, CreditCard, TrendingUp, RefreshCw, Loader2 } from 'lucide-react'

interface Summary {
  year: number
  month: number
  totalCards: number
  totalUSD: number
  totalFees: number
  averageRate: number
  totalTTD: number
  netUSD: number
  availability: Array<{
    id: string
    amountUSD: number
    exchangeRate: number
    paymentDate: string
    feeAmount: number | null
    notes: string | null
    isRecurringTemplate?: boolean
    card: {
      cardNickname: string
      person: {
        name: string
      }
    }
  }>
}

interface ExchangeRate {
  selling: number
  buying: number
  source: string
  timestamp: string
  url?: string
  note?: string
}

export default function Dashboard() {
  const router = useRouter()
  const { status } = useSession()
  const [currentDate, setCurrentDate] = useState(new Date())
  const [summary, setSummary] = useState<Summary | null>(null)
  const [exchangeRate, setExchangeRate] = useState<ExchangeRate | null>(null)
  const [loading, setLoading] = useState(true)

  const year = currentDate.getFullYear()
  const month = currentDate.getMonth() + 1

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.replace('/login')
    }
  }, [status, router])

  useEffect(() => {
    // Only fetch data if authenticated
    if (status === 'authenticated') {
      fetchSummary()
      fetchDefaultRate()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, month, status])

  // Show loading while checking authentication
  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4 text-blue-600" />
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    )
  }

  // Don't render dashboard content if not authenticated (middleware should redirect)
  if (status === 'unauthenticated') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4 text-blue-600" />
          <p className="text-gray-600">Redirecting...</p>
        </div>
      </div>
    )
  }

  const fetchSummary = async () => {
    setLoading(true)
    try {
      const response = await fetch(`/api/summary?year=${year}&month=${month}`)
      if (response.ok) {
        const data = await response.json()
        setSummary(data)
      }
    } catch (error) {
      console.error('Error fetching summary:', error)
    } finally {
      setLoading(false)
    }
  }

  const fetchDefaultRate = async () => {
    try {
      const response = await fetch('/api/settings')
      if (response.ok) {
        const data = await response.json()
        setExchangeRate({
          selling: data.defaultExchangeRate,
          buying: data.defaultExchangeRate,
          source: 'Your Default Rate',
          timestamp: new Date().toISOString(),
        })
      }
    } catch (error) {
      console.error('Error fetching default rate:', error)
    }
  }

  const previousMonth = () => {
    setCurrentDate(new Date(currentDate.setMonth(currentDate.getMonth() - 1)))
  }

  const nextMonth = () => {
    setCurrentDate(new Date(currentDate.setMonth(currentDate.getMonth() + 1)))
  }

  const monthName = format(currentDate, 'MMMM yyyy')

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
            Dashboard
          </h1>
          <p className="text-gray-600 mt-1">Track your foreign currency availability</p>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={previousMonth} variant="outline" size="sm">
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <span className="text-lg font-medium min-w-[150px] text-center">
            {monthName}
          </span>
          <Button onClick={nextMonth} variant="outline" size="sm">
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Default Exchange Rate Card */}
      {exchangeRate && (
        <Card className="border-l-4 border-l-blue-500 shadow-md bg-gradient-to-r from-blue-50/50 to-indigo-50/50">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-lg">Default Exchange Rate</CardTitle>
                <CardDescription className="flex items-center gap-2 mt-1">
                  <span>{exchangeRate.source} - Used for cost calculations</span>
                </CardDescription>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => window.location.href = '/settings'}
                title="Configure in Settings"
              >
                <RefreshCw className="w-4 h-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="bg-white rounded-lg p-6 shadow-sm text-center">
              <p className="text-sm text-gray-600 mb-2">Official/Baseline Rate</p>
              <p className="text-4xl font-bold text-blue-600 mb-2">
                {exchangeRate.selling.toFixed(4)}
              </p>
              <p className="text-sm text-gray-500">TTD per USD</p>
            </div>
            <div className="mt-4 bg-blue-50 border border-blue-200 rounded-lg p-3">
              <p className="text-xs text-blue-800">
                💡 This is your baseline rate. Any rate above this represents a premium/extra cost for obtaining USD.
                You can update this in Settings.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {loading ? (
        <div className="text-center py-12">
          <p className="text-gray-500">Loading...</p>
        </div>
      ) : summary ? (
        <>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card className="shadow-md hover:shadow-lg transition-shadow">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  Total Cards Available
                </CardTitle>
                <div className="w-8 h-8 rounded-lg bg-purple-100 flex items-center justify-center">
                  <CreditCard className="h-4 w-4 text-purple-600" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-purple-600">{summary.totalCards}</div>
                <p className="text-xs text-gray-500">
                  Cards with availability this month
                </p>
              </CardContent>
            </Card>

            <Card className="shadow-md hover:shadow-lg transition-shadow">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  Total USD Available
                </CardTitle>
                <div className="w-8 h-8 rounded-lg bg-green-100 flex items-center justify-center">
                  <DollarSign className="h-4 w-4 text-green-600" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-600">
                  ${summary.totalUSD.toFixed(2)}
                </div>
                <p className="text-xs text-gray-500">
                  Net: ${summary.netUSD.toFixed(2)} (after fees)
                </p>
              </CardContent>
            </Card>

            <Card className="shadow-md hover:shadow-lg transition-shadow">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  Average Exchange Rate
                </CardTitle>
                <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center">
                  <TrendingUp className="h-4 w-4 text-blue-600" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-blue-600">
                  {summary.averageRate.toFixed(2)}
                </div>
                <p className="text-xs text-gray-500">TTD per USD</p>
              </CardContent>
            </Card>

            <Card className="shadow-md hover:shadow-lg transition-shadow">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  Total TTD Value
                </CardTitle>
                <div className="w-8 h-8 rounded-lg bg-indigo-100 flex items-center justify-center">
                  <DollarSign className="h-4 w-4 text-indigo-600" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-indigo-600">
                  ${summary.totalTTD.toFixed(2)}
                </div>
                <p className="text-xs text-gray-500">
                  Total fees: ${summary.totalFees.toFixed(2)}
                </p>
              </CardContent>
            </Card>
          </div>

          <Card className="shadow-md border-t-4 border-t-blue-500">
            <CardHeader className="bg-gradient-to-r from-blue-50 to-indigo-50">
              <CardTitle className="text-xl">Card Availability Details</CardTitle>
              <CardDescription>
                All cards available for {monthName}
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {summary.availability.length === 0 ? (
                <div className="text-center py-12 px-6">
                  <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-4">
                    <CreditCard className="w-8 h-8 text-gray-400" />
                  </div>
                  <p className="text-gray-500 text-lg">No cards available for this month</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="bg-gradient-to-r from-gray-50 to-gray-100 border-b-2 border-blue-200">
                        <th className="text-left py-4 px-6 font-semibold text-gray-700 uppercase text-xs tracking-wider">
                          Card
                        </th>
                        <th className="text-left py-4 px-6 font-semibold text-gray-700 uppercase text-xs tracking-wider">
                          Owner
                        </th>
                        <th className="text-right py-4 px-6 font-semibold text-gray-700 uppercase text-xs tracking-wider">
                          Amount
                        </th>
                        <th className="text-right py-4 px-6 font-semibold text-gray-700 uppercase text-xs tracking-wider">
                          Rate
                        </th>
                        <th className="text-right py-4 px-6 font-semibold text-gray-700 uppercase text-xs tracking-wider">
                          TTD Value
                        </th>
                        <th className="text-right py-4 px-6 font-semibold text-gray-700 uppercase text-xs tracking-wider">
                          Fees
                        </th>
                        <th className="text-left py-4 px-6 font-semibold text-gray-700 uppercase text-xs tracking-wider">
                          Payment Date
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {summary.availability.map((item, index) => (
                        <tr key={item.id} className={`hover:bg-blue-50 transition-colors ${index % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}`}>
                          <td className="py-4 px-6 font-medium text-gray-900">
                            <span className="inline-flex items-center gap-2 flex-wrap">
                              {item.card.cardNickname}
                              {item.isRecurringTemplate && (
                                <span className="text-xs font-normal px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-800">
                                  Every month
                                </span>
                              )}
                            </span>
                          </td>
                          <td className="py-4 px-6 text-gray-600">
                            {item.card.person.name}
                          </td>
                          <td className="py-4 px-6 text-right">
                            <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-semibold bg-green-100 text-green-700">
                              ${item.amountUSD.toFixed(2)}
                            </span>
                          </td>
                          <td className="py-4 px-6 text-right">
                            <span className="font-mono text-gray-700">
                              {item.exchangeRate.toFixed(2)}
                            </span>
                          </td>
                          <td className="py-4 px-6 text-right">
                            <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-semibold bg-blue-100 text-blue-700">
                              ${(item.amountUSD * item.exchangeRate).toFixed(2)}
                            </span>
                          </td>
                          <td className="py-4 px-6 text-right">
                            {item.feeAmount ? (
                              <span className="text-red-600 font-medium">
                                ${item.feeAmount.toFixed(2)}
                              </span>
                            ) : (
                              <span className="text-gray-400">-</span>
                            )}
                          </td>
                          <td className="py-4 px-6 text-gray-600">
                            {format(new Date(item.paymentDate), 'MMM dd, yyyy')}
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
      ) : (
        <div className="text-center py-12">
          <p className="text-gray-500">No data available</p>
        </div>
      )}
    </div>
  )
}
