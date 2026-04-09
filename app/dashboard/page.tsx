'use client'

import { useState, useEffect, useMemo, Fragment } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { format } from 'date-fns'
import Link from 'next/link'
import {
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  DollarSign,
  CreditCard,
  TrendingUp,
  RefreshCw,
  Loader2,
  Wallet,
  Scale,
  User,
  Plus,
  History,
} from 'lucide-react'
import { useGroupByOwner } from '@/hooks/use-group-by-owner'
import { CardUsagePanel } from '@/components/CardUsagePanel'
import { usageAmountPaidSync } from '@/lib/usage-paid-sync'
import { issuingBankLabel } from '@/lib/card-bank'

interface Summary {
  year: number
  month: number
  totalCards: number
  totalUSD: number
  totalFeesTTD: number
  totalFeesUSD: number
  averageRate: number
  totalTTD: number
  netUSD: number
  totalUsedUSD: number
  balanceUSD: number
  availability: Array<{
    id: string
    cardId: string
    amountUSD: number
    exchangeRate: number
    paymentDate: string
    notes: string | null
    isRecurringTemplate?: boolean
    usageUSD: number
    balanceUSD: number
    impliedFeeTTD: number
    impliedFeeUSD: number
    card: {
      cardNickname: string
      issuingBank?: string | null
      person: {
        id: string
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

function dashboardCardOptionLabel(
  card: Summary['availability'][number]['card']
): string {
  if (card.issuingBank) {
    return `${card.cardNickname} (${issuingBankLabel(card.issuingBank)}) — ${card.person.name}`
  }
  return `${card.cardNickname} (${card.person.name})`
}

export default function Dashboard() {
  const router = useRouter()
  const { status } = useSession()
  const [currentDate, setCurrentDate] = useState(new Date())
  const [summary, setSummary] = useState<Summary | null>(null)
  const [exchangeRate, setExchangeRate] = useState<ExchangeRate | null>(null)
  const [loading, setLoading] = useState(true)
  const [groupByOwner, setGroupByOwner] = useGroupByOwner()
  const [onlyWithBalance, setOnlyWithBalance] = useState(false)
  const [expandedCardId, setExpandedCardId] = useState<string | null>(null)
  const [showQuickUsage, setShowQuickUsage] = useState(false)
  const [quickForm, setQuickForm] = useState({
    cardId: '',
    amountUSD: '',
    paidToOwnerUSD: '',
    usageDate: format(new Date(), 'yyyy-MM-dd'),
    notes: '',
  })
  const [quickError, setQuickError] = useState('')
  const [quickSaving, setQuickSaving] = useState(false)
  const [usageRevision, setUsageRevision] = useState(0)

  const year = currentDate.getFullYear()
  const month = currentDate.getMonth() + 1

  const filteredRows = useMemo(() => {
    if (!summary?.availability.length) return []
    if (!onlyWithBalance) return summary.availability
    return summary.availability.filter((r) => r.balanceUSD > 0)
  }, [summary?.availability, onlyWithBalance])

  const availabilityByOwner = useMemo(() => {
    if (!filteredRows.length) return []
    type Row = Summary['availability'][number]
    const map = new Map<string, { personName: string; items: Row[] }>()
    for (const item of filteredRows) {
      const pid = item.card.person.id
      if (!map.has(pid)) {
        map.set(pid, { personName: item.card.person.name, items: [] })
      }
      map.get(pid)!.items.push(item)
    }
    for (const g of map.values()) {
      g.items.sort((a, b) =>
        a.card.cardNickname.localeCompare(b.card.cardNickname)
      )
    }
    return [...map.entries()]
      .map(([ownerId, g]) => ({ ownerId, personName: g.personName, items: g.items }))
      .sort((a, b) => a.personName.localeCompare(b.personName))
  }, [filteredRows])

  const quickCardOptions = useMemo(() => {
    if (!summary?.availability.length) return []
    const m = new Map<string, string>()
    for (const r of summary.availability) {
      if (!m.has(r.cardId)) {
        m.set(r.cardId, dashboardCardOptionLabel(r.card))
      }
    }
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1]))
  }, [summary?.availability])

  useEffect(() => {
    setQuickForm((f) => {
      if (!f.cardId) return f
      if (!quickCardOptions.some(([id]) => id === f.cardId)) {
        return { ...f, cardId: '' }
      }
      return f
    })
  }, [quickCardOptions])

  useEffect(() => {
    setQuickError('')
    setExpandedCardId(null)
  }, [year, month])

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
      const url = new URL(
        `/api/summary?year=${year}&month=${month}`,
        window.location.origin
      ).toString()
      const response = await fetch(url, {
        credentials: 'include',
        cache: 'no-store',
      })
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

  const afterUsageChange = async () => {
    await fetchSummary()
    setUsageRevision((n) => n + 1)
  }

  const handleQuickUsageSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!quickForm.cardId || !quickForm.amountUSD) return
    const amt = parseFloat(quickForm.amountUSD)
    if (Number.isNaN(amt) || amt <= 0) return

    const paidRaw = quickForm.paidToOwnerUSD.trim()
    const paidToOwner = paidRaw === '' ? 0 : parseFloat(paidRaw)
    if (Number.isNaN(paidToOwner) || paidToOwner < 0) {
      setQuickError('Paid to owner must be a valid non-negative amount.')
      return
    }
    if (paidToOwner - amt > 1e-6) {
      setQuickError('Paid to owner cannot be more than the usage amount.')
      return
    }

    setQuickSaving(true)
    setQuickError('')
    try {
      const usageDate = new Date(`${quickForm.usageDate}T12:00:00`).toISOString()
      const res = await fetch('/api/usage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          cardId: quickForm.cardId,
          year,
          month,
          amountUSD: amt,
          paidToOwnerUSD: paidToOwner,
          usageDate,
          notes: quickForm.notes.trim() || undefined,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok) {
        setQuickForm({
          cardId: '',
          amountUSD: '',
          paidToOwnerUSD: '',
          usageDate: format(new Date(), 'yyyy-MM-dd'),
          notes: '',
        })
        setShowQuickUsage(false)
        await afterUsageChange()
      } else {
        setQuickError(
          typeof data.error === 'string' ? data.error : 'Could not save usage.'
        )
      }
    } catch {
      setQuickError('Network error. Try again.')
    } finally {
      setQuickSaving(false)
    }
  }

  const openQuickLogForCard = (cardId: string) => {
    setQuickForm((f) => ({
      ...f,
      cardId,
      amountUSD: '',
      paidToOwnerUSD: '',
      usageDate: format(new Date(), 'yyyy-MM-dd'),
    }))
    setQuickError('')
    setShowQuickUsage(true)
    setExpandedCardId(null)
  }

  const fetchDefaultRate = async () => {
    try {
      const url = new URL('/api/settings', window.location.origin).toString()
      const response = await fetch(url, {
        credentials: 'include',
        cache: 'no-store',
      })
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

  type AvailRow = Summary['availability'][number]

  const renderAvailabilityPair = (item: AvailRow, zebraClass: string) => (
    <Fragment key={item.id}>
      <tr className={`hover:bg-blue-50 transition-colors ${zebraClass}`}>
        <td className="py-3 px-3 sm:py-4 sm:px-6 font-medium text-gray-900 max-w-[140px] sm:max-w-none">
          <button
            type="button"
            onClick={() =>
              setExpandedCardId((id) =>
                id === item.cardId ? null : item.cardId
              )
            }
            className="text-left inline-flex items-center gap-1.5 flex-wrap rounded hover:text-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            <span className="inline-flex flex-col items-start gap-0.5">
              <span className="inline-flex items-center gap-2 flex-wrap">
                {item.card.cardNickname}
                {item.isRecurringTemplate && (
                  <span className="text-xs font-normal px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-800">
                    Every month
                  </span>
                )}
              </span>
              <span className="text-xs font-normal text-gray-500">
                {issuingBankLabel(item.card.issuingBank)}
              </span>
            </span>
            {expandedCardId === item.cardId ? (
              <ChevronUp className="w-4 h-4 shrink-0 text-gray-500" />
            ) : (
              <ChevronDown className="w-4 h-4 shrink-0 text-gray-500" />
            )}
          </button>
        </td>
        <td className="py-3 px-3 sm:py-4 sm:px-6 text-gray-600 whitespace-nowrap">
          {item.card.person.name}
        </td>
        <td className="py-3 px-3 sm:py-4 sm:px-6 text-right whitespace-nowrap">
          <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-semibold bg-green-100 text-green-700">
            ${item.amountUSD.toFixed(2)}
          </span>
        </td>
        <td className="py-3 px-3 sm:py-4 sm:px-6 text-right whitespace-nowrap">
          <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-semibold bg-amber-100 text-amber-800">
            ${item.usageUSD.toFixed(2)}
          </span>
        </td>
        <td className="py-3 px-3 sm:py-4 sm:px-6 text-right whitespace-nowrap">
          <span
            className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-semibold ${
              item.balanceUSD < 0
                ? 'bg-red-100 text-red-800'
                : 'bg-teal-100 text-teal-800'
            }`}
          >
            ${item.balanceUSD.toFixed(2)}
          </span>
        </td>
        <td className="py-3 px-3 sm:py-4 sm:px-6 text-right whitespace-nowrap">
          <span className="font-mono text-gray-700">
            {item.exchangeRate.toFixed(2)}
          </span>
        </td>
        <td className="py-3 px-3 sm:py-4 sm:px-6 text-right whitespace-nowrap">
          <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-semibold bg-blue-100 text-blue-700">
            ${(item.amountUSD * item.exchangeRate).toFixed(2)}
          </span>
        </td>
        <td className="py-3 px-3 sm:py-4 sm:px-6 text-right whitespace-nowrap">
          <span
            className={`font-medium ${
              item.impliedFeeTTD > 0
                ? 'text-red-600'
                : item.impliedFeeTTD < 0
                  ? 'text-green-700'
                  : 'text-gray-400'
            }`}
          >
            {item.impliedFeeTTD.toFixed(2)} TTD
          </span>
        </td>
        <td className="py-3 px-3 sm:py-4 sm:px-6 text-gray-600 whitespace-nowrap">
          {format(new Date(item.paymentDate), 'MMM dd, yyyy')}
        </td>
        <td className="py-3 px-3 sm:py-4 sm:px-6 text-right whitespace-nowrap">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 text-xs"
            onClick={() => openQuickLogForCard(item.cardId)}
          >
            <Plus className="w-3.5 h-3.5 mr-1" />
            Log
          </Button>
        </td>
      </tr>
      {expandedCardId === item.cardId ? (
        <tr className="bg-transparent">
          <td colSpan={10} className="p-0 border-0">
            <CardUsagePanel
              cardId={item.cardId}
              cardLabel={dashboardCardOptionLabel(item.card)}
              year={year}
              month={month}
              onUsageChanged={afterUsageChange}
              usageRevision={usageRevision}
            />
          </td>
        </tr>
      ) : null}
    </Fragment>
  )

  return (
    <div className="space-y-6 min-w-0">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between min-w-0">
        <div className="min-w-0">
          <h1 className="text-2xl sm:text-3xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
            Dashboard
          </h1>
          <p className="text-gray-600 mt-1 text-sm sm:text-base">
            Track your foreign currency availability
          </p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end w-full lg:w-auto min-w-0">
          <Link href="/usage" className="sm:shrink-0">
            <Button variant="outline" size="sm" className="w-full sm:w-auto">
              <History className="w-4 h-4 mr-1" />
              Usage page
            </Button>
          </Link>
          <div className="flex items-center justify-center gap-1 sm:justify-end w-full sm:w-auto">
            <Button onClick={previousMonth} variant="outline" size="sm" aria-label="Previous month">
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <span className="text-base sm:text-lg font-medium min-w-0 flex-1 sm:flex-initial sm:min-w-[9rem] text-center px-1 truncate">
              {monthName}
            </span>
            <Button onClick={nextMonth} variant="outline" size="sm" aria-label="Next month">
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Default Exchange Rate Card */}
      {exchangeRate && (
        <Card className="border-l-4 border-l-blue-500 shadow-md bg-gradient-to-r from-blue-50/50 to-indigo-50/50 min-w-0 overflow-hidden">
          <CardHeader className="pb-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between min-w-0">
              <div className="min-w-0">
                <CardTitle className="text-lg">Default Exchange Rate</CardTitle>
                <CardDescription className="mt-1 break-words">
                  <span className="text-gray-600">
                    {exchangeRate.source} — used for cost calculations
                  </span>
                </CardDescription>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="shrink-0 self-start sm:self-auto"
                onClick={() => (window.location.href = '/settings')}
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
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            <Card className="shadow-md hover:shadow-lg transition-shadow border-l-4 border-l-green-500">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  Total USD available
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
                  Net after fees: ${summary.netUSD.toFixed(2)}
                </p>
              </CardContent>
            </Card>

            <Card className="shadow-md hover:shadow-lg transition-shadow border-l-4 border-l-amber-500">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  Total USD used
                </CardTitle>
                <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center">
                  <Wallet className="h-4 w-4 text-amber-700" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-amber-700">
                  ${summary.totalUsedUSD.toFixed(2)}
                </div>
                <p className="text-xs text-gray-500">Logged usage this month</p>
              </CardContent>
            </Card>

            <Card className="shadow-md hover:shadow-lg transition-shadow border-l-4 border-l-teal-500">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  Balance (remaining)
                </CardTitle>
                <div className="w-8 h-8 rounded-lg bg-teal-100 flex items-center justify-center">
                  <Scale className="h-4 w-4 text-teal-700" />
                </div>
              </CardHeader>
              <CardContent>
                <div
                  className={`text-2xl font-bold ${
                    summary.balanceUSD < 0 ? 'text-red-600' : 'text-teal-700'
                  }`}
                >
                  ${summary.balanceUSD.toFixed(2)}
                </div>
                <p className="text-xs text-gray-500">Total USD available minus usage</p>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            <Card className="shadow-md hover:shadow-lg transition-shadow">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  Total cards available
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
                  Average exchange rate
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
                  Total TTD value
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
                  Total fees (TTD value minus TTD at baseline rate):{' '}
                  <span className="font-medium text-gray-700">
                    {summary.totalFeesTTD.toFixed(2)} TTD
                  </span>
                </p>
              </CardContent>
            </Card>
          </div>

          <Card className="shadow-md border-t-4 border-t-blue-500 min-w-0 overflow-hidden">
            <CardHeader className="bg-gradient-to-r from-blue-50 to-indigo-50">
              <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <CardTitle className="text-xl">Card Availability Details</CardTitle>
                    <CardDescription>
                      All cards available for {monthName}
                      {onlyWithBalance &&
                      summary.availability.length > 0 &&
                      filteredRows.length !== summary.availability.length ? (
                        <span className="text-gray-600">
                          {' '}
                          · Showing {filteredRows.length} with remaining USD balance
                        </span>
                      ) : null}
                    </CardDescription>
                  </div>
                  <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
                    <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={onlyWithBalance}
                        onChange={(e) => setOnlyWithBalance(e.target.checked)}
                        className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                      />
                      Only cards with balance left (USD)
                    </label>
                    <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={groupByOwner}
                        onChange={(e) => setGroupByOwner(e.target.checked)}
                        className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                      />
                      Group by owner
                    </label>
                  </div>
                </div>
                <p className="text-xs text-gray-500">
                  Click a card name to expand full usage history (all months). Use Log to add usage
                  for {monthName} without leaving the dashboard.
                </p>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {summary.availability.length === 0 ? (
                <div className="text-center py-12 px-6">
                  <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-4">
                    <CreditCard className="w-8 h-8 text-gray-400" />
                  </div>
                  <p className="text-gray-500 text-lg">No cards available for this month</p>
                </div>
              ) : filteredRows.length === 0 ? (
                <div className="text-center py-12 px-6 space-y-3">
                  <p className="text-gray-600">
                    No cards match the filter (no remaining USD balance).
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setOnlyWithBalance(false)}
                  >
                    Show all cards
                  </Button>
                </div>
              ) : (
                <>
                  <div className="px-4 py-3 border-b border-gray-100 bg-white space-y-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        type="button"
                        variant={showQuickUsage ? 'default' : 'outline'}
                        size="sm"
                        onClick={() =>
                          setShowQuickUsage((v) => {
                            const next = !v
                            if (!next) setQuickError('')
                            return next
                          })
                        }
                      >
                        <Plus className="w-4 h-4 mr-1" />
                        {showQuickUsage ? 'Hide quick log' : 'Quick log usage'}
                      </Button>
                      <Link href="/usage">
                        <Button type="button" variant="ghost" size="sm">
                          <History className="w-4 h-4 mr-1" />
                          Full usage page
                        </Button>
                      </Link>
                    </div>
                    {showQuickUsage && (
                      <form
                        onSubmit={handleQuickUsageSubmit}
                        className="rounded-lg border border-indigo-200 bg-indigo-50/40 p-4 space-y-3"
                      >
                        <p className="text-sm font-medium text-gray-800">
                          Add usage for {monthName}
                        </p>
                        {quickError && (
                          <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded px-3 py-2">
                            {quickError}
                          </p>
                        )}
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-3">
                          <div className="md:col-span-2">
                            <Label htmlFor="quick-usage-card">Card *</Label>
                            <select
                              id="quick-usage-card"
                              value={quickForm.cardId}
                              onChange={(e) =>
                                setQuickForm((f) => ({
                                  ...f,
                                  cardId: e.target.value,
                                }))
                              }
                              required
                              disabled={quickSaving}
                              className="flex h-10 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                            >
                              <option value="">Select card</option>
                              {quickCardOptions.map(([id, label]) => (
                                <option key={id} value={id}>
                                  {label}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <Label htmlFor="quick-usage-amt">Amount (USD) *</Label>
                            <Input
                              id="quick-usage-amt"
                              type="number"
                              step="0.01"
                              min="0.01"
                              value={quickForm.amountUSD}
                              onChange={(e) =>
                                setQuickForm((f) => ({
                                  ...f,
                                  amountUSD: e.target.value,
                                  paidToOwnerUSD: usageAmountPaidSync(
                                    f.amountUSD,
                                    f.paidToOwnerUSD,
                                    e.target.value
                                  ),
                                }))
                              }
                              required
                              disabled={quickSaving}
                            />
                          </div>
                          <div>
                            <Label htmlFor="quick-usage-paid">Paid to owner (USD)</Label>
                            <Input
                              id="quick-usage-paid"
                              type="number"
                              step="0.01"
                              min="0"
                              placeholder="0 if not paid yet"
                              title="Leave 0 until you have paid the card owner back."
                              value={quickForm.paidToOwnerUSD}
                              onChange={(e) =>
                                setQuickForm((f) => ({
                                  ...f,
                                  paidToOwnerUSD: e.target.value,
                                }))
                              }
                              disabled={quickSaving}
                            />
                          </div>
                          <div>
                            <Label htmlFor="quick-usage-date">Date</Label>
                            <Input
                              id="quick-usage-date"
                              type="date"
                              value={quickForm.usageDate}
                              onChange={(e) =>
                                setQuickForm((f) => ({
                                  ...f,
                                  usageDate: e.target.value,
                                }))
                              }
                              disabled={quickSaving}
                            />
                          </div>
                          <div className="md:col-span-2">
                            <Label htmlFor="quick-usage-notes">Notes</Label>
                            <Input
                              id="quick-usage-notes"
                              value={quickForm.notes}
                              onChange={(e) =>
                                setQuickForm((f) => ({
                                  ...f,
                                  notes: e.target.value,
                                }))
                              }
                              placeholder="Optional"
                              disabled={quickSaving}
                            />
                          </div>
                        </div>
                        <Button type="submit" size="sm" disabled={quickSaving}>
                          {quickSaving ? (
                            <>
                              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                              Saving…
                            </>
                          ) : (
                            'Save usage'
                          )}
                        </Button>
                      </form>
                    )}
                  </div>
                  <div className="-mx-1 overflow-x-auto sm:mx-0 [scrollbar-gutter:stable] touch-pan-x">
                    <table className="w-full min-w-[56rem] text-sm">
                      <thead>
                        <tr className="bg-gradient-to-r from-gray-50 to-gray-100 border-b-2 border-blue-200">
                          <th className="text-left py-3 px-3 sm:py-4 sm:px-6 font-semibold text-gray-700 uppercase text-xs tracking-wider">
                            Card
                          </th>
                          <th className="text-left py-3 px-3 sm:py-4 sm:px-6 font-semibold text-gray-700 uppercase text-xs tracking-wider">
                            Owner
                          </th>
                          <th className="text-right py-3 px-3 sm:py-4 sm:px-6 font-semibold text-gray-700 uppercase text-xs tracking-wider">
                            Available
                          </th>
                          <th className="text-right py-3 px-3 sm:py-4 sm:px-6 font-semibold text-gray-700 uppercase text-xs tracking-wider">
                            Used
                          </th>
                          <th className="text-right py-3 px-3 sm:py-4 sm:px-6 font-semibold text-gray-700 uppercase text-xs tracking-wider">
                            Balance
                          </th>
                          <th className="text-right py-3 px-3 sm:py-4 sm:px-6 font-semibold text-gray-700 uppercase text-xs tracking-wider">
                            Rate
                          </th>
                          <th className="text-right py-3 px-3 sm:py-4 sm:px-6 font-semibold text-gray-700 uppercase text-xs tracking-wider">
                            TTD Value
                          </th>
                          <th className="text-right py-3 px-3 sm:py-4 sm:px-6 font-semibold text-gray-700 uppercase text-xs tracking-wider">
                            Fee (TTD)
                          </th>
                          <th className="text-left py-3 px-3 sm:py-4 sm:px-6 font-semibold text-gray-700 uppercase text-xs tracking-wider whitespace-nowrap">
                            Pay date
                          </th>
                          <th className="text-right py-3 px-3 sm:py-4 sm:px-6 font-semibold text-gray-700 uppercase text-xs tracking-wider">
                            Actions
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {groupByOwner
                          ? availabilityByOwner.flatMap((owner) => [
                              <tr
                                key={`owner-${owner.ownerId}`}
                                className="bg-slate-100/95 border-y border-slate-200"
                              >
                                <td
                                  colSpan={10}
                                  className="py-2.5 px-3 sm:px-6 font-semibold text-gray-800"
                                >
                                  <span className="inline-flex items-center gap-2">
                                    <User className="w-4 h-4 text-slate-600" />
                                    {owner.personName}
                                    <span className="font-normal text-gray-500">
                                      ({owner.items.length} card
                                      {owner.items.length !== 1 ? 's' : ''})
                                    </span>
                                  </span>
                                </td>
                              </tr>,
                              ...owner.items.map((item, ii) =>
                                renderAvailabilityPair(
                                  item,
                                  ii % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'
                                )
                              ),
                            ])
                          : filteredRows.map((item, index) =>
                              renderAvailabilityPair(
                                item,
                                index % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'
                              )
                            )}
                      </tbody>
                    </table>
                  </div>
                </>
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
