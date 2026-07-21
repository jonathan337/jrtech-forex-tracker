'use client'

import { useState, useEffect, useMemo, useCallback, useRef, Fragment } from 'react'
import {
  useParams,
  useRouter,
  useSearchParams,
  usePathname,
} from 'next/navigation'
import { useDataChanged } from '@/lib/use-data-changed'
import { useSession } from 'next-auth/react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { DatePicker } from '@/components/ui/date-picker'
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
  Plus,
  History,
  ArrowLeft,
} from 'lucide-react'
import { CardUsagePanel } from '@/components/CardUsagePanel'
import { usageAmountPaidSyncFromUsdInputs } from '@/lib/usage-paid-sync'
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
  totalUsedTTD: number
  balanceUSD: number
  balanceTTD: number
  person?: { id: string; name: string }
  availability: Array<{
    id: string
    cardId: string
    amountUSD: number
    exchangeRate: number
    paymentDate: string
    notes: string | null
    isRecurringTemplate?: boolean
    usageUSD: number
    usageTTD: number
    owedTTD: number
    ttdValue: number
    balanceUSD: number
    balanceTTD: number
    impliedFeeTTD: number
    impliedFeeUSD: number
    card: {
      cardNickname: string
      issuingBank?: string | null
      lastFourDigits?: string | null
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
}

function personCardOptionLabel(
  card: Summary['availability'][number]['card']
): string {
  const last4 = card.lastFourDigits?.trim()
  const suffix = last4 ? ` •••• ${last4}` : ''
  if (card.issuingBank) {
    return `${card.cardNickname} (${issuingBankLabel(card.issuingBank)})${suffix}`
  }
  return `${card.cardNickname}${suffix}`
}

export default function PersonDashboardPage() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const params = useParams()
  const personId = typeof params.id === 'string' ? params.id : ''
  const { status } = useSession()

  const initialDate = useMemo(() => {
    const y = searchParams.get('year')
    const m = searchParams.get('month')
    const yi = y ? parseInt(y, 10) : NaN
    const mi = m ? parseInt(m, 10) : NaN
    if (
      Number.isFinite(yi) &&
      Number.isFinite(mi) &&
      yi >= 2000 &&
      yi <= 2100 &&
      mi >= 1 &&
      mi <= 12
    ) {
      return new Date(yi, mi - 1, 1)
    }
    return new Date()
  }, [searchParams])

  const [currentDate, setCurrentDate] = useState(initialDate)

  useEffect(() => {
    setCurrentDate(initialDate)
  }, [initialDate])

  const [summary, setSummary] = useState<Summary | null>(null)
  const [exchangeRate, setExchangeRate] = useState<ExchangeRate | null>(null)
  const [loading, setLoading] = useState(true)
  // Only the very first load shows the full-page spinner; later refreshes update in place.
  const didInitialLoadRef = useRef(false)
  const [loadError, setLoadError] = useState('')
  const [onlyWithBalance, setOnlyWithBalance] = useState(false)
  const [expandedCardId, setExpandedCardId] = useState<string | null>(null)
  const [showQuickUsage, setShowQuickUsage] = useState(false)
  const [quickForm, setQuickForm] = useState({
    cardId: '',
    amountUSD: '',
    paidToOwnerTTD: '',
    usageDate: format(new Date(), 'yyyy-MM-dd'),
    notes: '',
  })
  const [quickError, setQuickError] = useState('')
  const [quickSaving, setQuickSaving] = useState(false)
  const [usageRevision, setUsageRevision] = useState(0)
  const [owedToPersonTTD, setOwedToPersonTTD] = useState(0)

  const year = currentDate.getFullYear()
  const month = currentDate.getMonth() + 1

  const filteredRows = useMemo(() => {
    if (!summary?.availability.length) return []
    if (!onlyWithBalance) return summary.availability
    return summary.availability.filter((r) => r.balanceTTD > 0)
  }, [summary?.availability, onlyWithBalance])

  const exchangeRateForQuickCardId = (cardId: string): number | null => {
    const row = summary?.availability.find((r) => r.cardId === cardId)
    const er = row?.exchangeRate
    return typeof er === 'number' && Number.isFinite(er) && er > 0 ? er : null
  }

  const defaultUsageAmountForQuickCardId = (cardId: string): string => {
    const row = summary?.availability.find((r) => r.cardId === cardId)
    const balance = row?.balanceUSD
    if (typeof balance !== 'number' || !Number.isFinite(balance) || balance <= 0) {
      return ''
    }
    return balance.toFixed(2)
  }

  const quickCardOptions = useMemo(() => {
    if (!summary?.availability.length) return []
    const m = new Map<string, string>()
    for (const r of summary.availability) {
      if (!m.has(r.cardId)) {
        m.set(r.cardId, personCardOptionLabel(r.card))
      }
    }
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1]))
  }, [summary?.availability])

  const fetchSummaryData = useCallback(
    async (signal?: AbortSignal) => {
      try {
        const url = new URL(
          `/api/summary?year=${year}&month=${month}&personId=${encodeURIComponent(personId)}`,
          window.location.origin
        ).toString()
        const response = await fetch(url, {
          credentials: 'include',
          cache: 'no-store',
          signal,
        })
        if (response.status === 404) {
          setSummary(null)
          setLoadError('Person not found.')
          return
        }
        if (response.ok) {
          const data = await response.json()
          setSummary(data)
        } else {
          setLoadError('Could not load availability for this person.')
        }
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return
        console.error('Error fetching summary:', error)
        setLoadError('Could not load availability for this person.')
      }
    },
    [year, month, personId]
  )

  const fetchDefaultRateData = useCallback(async (signal?: AbortSignal) => {
    try {
      const url = new URL('/api/settings', window.location.origin).toString()
      const response = await fetch(url, {
        credentials: 'include',
        cache: 'no-store',
        signal,
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
      if (error instanceof DOMException && error.name === 'AbortError') return
      console.error('Error fetching default rate:', error)
    }
  }, [])

  const fetchPersonOwedData = useCallback(
    async (signal?: AbortSignal) => {
      try {
        const url = new URL(
          `/api/people?year=${year}&month=${month}`,
          window.location.origin
        ).toString()
        const response = await fetch(url, {
          credentials: 'include',
          cache: 'no-store',
          signal,
        })
        if (!response.ok) {
          setOwedToPersonTTD(0)
          return
        }
        const data: unknown = await response.json().catch(() => null)
        if (!Array.isArray(data)) {
          setOwedToPersonTTD(0)
          return
        }
        const row = data.find(
          (p) => typeof p === 'object' && p !== null && (p as { id?: string }).id === personId
        ) as { owedTTD?: unknown } | undefined
        const owed = row?.owedTTD
        setOwedToPersonTTD(
          typeof owed === 'number' && Number.isFinite(owed) ? owed : 0
        )
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return
        console.error('Error fetching person owed:', error)
        setOwedToPersonTTD(0)
      }
    },
    [year, month, personId]
  )

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
    const qs = new URLSearchParams()
    qs.set('year', String(year))
    qs.set('month', String(month))
    router.replace(`${pathname}?${qs.toString()}`, { scroll: false })
  }, [year, month, pathname, router])

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.replace('/login')
    }
  }, [status, router])

  useEffect(() => {
    if (status !== 'authenticated' || !personId) return
    let cancelled = false
    const ac = new AbortController()
    if (!didInitialLoadRef.current) setLoading(true)
    setLoadError('')
    void Promise.all([
      fetchSummaryData(ac.signal),
      fetchDefaultRateData(ac.signal),
      fetchPersonOwedData(ac.signal),
    ]).finally(() => {
      if (!cancelled) {
        setLoading(false)
        didInitialLoadRef.current = true
      }
    })
    return () => {
      cancelled = true
      ac.abort()
    }
  }, [
    year,
    month,
    status,
    personId,
    fetchSummaryData,
    fetchDefaultRateData,
    fetchPersonOwedData,
  ])

  const fetchSummary = async () => {
    setLoadError('')
    await fetchSummaryData()
  }

  const fetchPersonOwed = async () => {
    await fetchPersonOwedData()
  }

  const afterUsageChange = async () => {
    await fetchSummary()
    await fetchPersonOwed()
    setUsageRevision((n) => n + 1)
  }

  useDataChanged(() => {
    void afterUsageChange()
  })

  const handleQuickUsageSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!quickForm.cardId || !quickForm.amountUSD) return
    const usageUSD = parseFloat(quickForm.amountUSD)
    if (Number.isNaN(usageUSD) || usageUSD <= 0) return
    const rate = exchangeRateForQuickCardId(quickForm.cardId)
    if (rate == null) {
      setQuickError(
        'This card has no rate for this month. Refresh or add availability.'
      )
      return
    }
    const amt = usageUSD * rate

    const paidRaw = quickForm.paidToOwnerTTD.trim()
    const paidToOwner = paidRaw === '' ? 0 : parseFloat(paidRaw)
    if (Number.isNaN(paidToOwner) || paidToOwner < 0) {
      setQuickError('Paid to owner must be a valid non-negative amount.')
      return
    }
    if (paidToOwner - amt > 1e-6) {
      setQuickError(
        'Paid to owner (TTD) cannot be more than usage in TTD for this month.'
      )
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
          amountUSD: usageUSD,
          amountTTD: amt,
          paidToOwnerTTD: paidToOwner,
          usageDate,
          notes: quickForm.notes.trim() || undefined,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok) {
        setQuickForm({
          cardId: '',
          amountUSD: '',
          paidToOwnerTTD: '',
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
    const defaultAmountUSD = defaultUsageAmountForQuickCardId(cardId)
    setQuickForm((f) => ({
      ...f,
      cardId,
      amountUSD: defaultAmountUSD,
      paidToOwnerTTD: '',
      usageDate: format(new Date(), 'yyyy-MM-dd'),
    }))
    setQuickError('')
    setShowQuickUsage(true)
    setExpandedCardId(null)
  }

  const previousMonth = () => {
    setCurrentDate(new Date(currentDate.setMonth(currentDate.getMonth() - 1)))
  }

  const nextMonth = () => {
    setCurrentDate(new Date(currentDate.setMonth(currentDate.getMonth() + 1)))
  }

  const monthName = format(currentDate, 'MMMM yyyy')
  const displayName = summary?.person?.name ?? '…'

  type AvailRow = Summary['availability'][number]

  const availTd = 'py-2 px-1 sm:px-1.5 lg:px-2 align-top'
  const pill =
    'inline-flex max-w-full justify-end px-1.5 py-0.5 rounded-full font-semibold tabular-nums text-[10px] leading-tight sm:text-xs sm:px-2 sm:py-1'

  const renderRow = (item: AvailRow, zebraClass: string) => (
    <Fragment key={item.id}>
      <tr className={`hover:bg-blue-50 transition-colors ${zebraClass}`}>
        <td className={`${availTd} min-w-0 font-medium text-gray-900`}>
          <button
            type="button"
            onClick={() =>
              setExpandedCardId((id) => (id === item.cardId ? null : item.cardId))
            }
            className="text-left inline-flex items-start gap-1 w-full min-w-0 rounded hover:text-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            <span className="inline-flex flex-col items-start gap-0.5 min-w-0 flex-1">
              <span className="inline-flex flex-wrap items-center gap-1 min-w-0">
                <span className="break-words hyphens-auto">{item.card.cardNickname}</span>
                {item.isRecurringTemplate && (
                  <span className="shrink-0 text-[10px] font-normal px-1.5 py-0.5 rounded-full bg-indigo-100 text-indigo-800 sm:text-xs sm:px-2">
                    Monthly
                  </span>
                )}
              </span>
              {item.card.lastFourDigits?.trim() ? (
                <span className="text-[10px] font-mono font-normal text-gray-500 sm:text-xs">
                  •••• {item.card.lastFourDigits.trim()}
                </span>
              ) : null}
              <span className="text-[10px] font-normal text-gray-500 break-words sm:text-xs leading-snug">
                {issuingBankLabel(item.card.issuingBank)}
              </span>
            </span>
            {expandedCardId === item.cardId ? (
              <ChevronUp className="w-3.5 h-3.5 shrink-0 text-gray-500 sm:w-4 sm:h-4" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5 shrink-0 text-gray-500 sm:w-4 sm:h-4" />
            )}
          </button>
        </td>
        <td className={`${availTd} text-right`}>
          <span className={`${pill} bg-green-100 text-green-700`}>
            ${item.amountUSD.toFixed(2)}
          </span>
        </td>
        <td className={`${availTd} text-right`}>
          <span
            className={`${pill} ${
              item.balanceUSD > 0.005
                ? 'bg-emerald-100 text-emerald-800'
                : item.balanceUSD < -0.005
                  ? 'bg-red-100 text-red-800'
                  : 'bg-gray-100 text-gray-600'
            }`}
          >
            ${item.balanceUSD.toFixed(2)}
          </span>
        </td>
        <td className={`${availTd} text-right`}>
          <span className={`${pill} bg-amber-100 text-amber-800`}>
            ${item.usageUSD.toFixed(2)}
          </span>
        </td>
        <td className={`${availTd} text-right`}>
          <span
            className={`${pill} ${
              item.owedTTD > 0
                ? 'bg-red-100 text-red-800'
                : 'bg-teal-100 text-teal-800'
            }`}
          >
            ${item.owedTTD.toFixed(2)}
          </span>
        </td>
        <td className={`${availTd} text-right`}>
          <span className="font-mono text-[10px] text-gray-700 tabular-nums sm:text-xs">
            {item.exchangeRate.toFixed(2)}
          </span>
        </td>
        <td className={`${availTd} text-right`}>
          <span className={`${pill} bg-blue-100 text-blue-700`}>
            ${item.ttdValue.toFixed(2)}
          </span>
        </td>
        <td className={`${availTd} text-right`}>
          <span
            className={`text-[10px] font-medium tabular-nums sm:text-xs ${
              item.impliedFeeTTD > 0
                ? 'text-red-600'
                : item.impliedFeeTTD < 0
                  ? 'text-green-700'
                  : 'text-gray-400'
            }`}
          >
            {item.impliedFeeTTD.toFixed(2)}
            <span className="hidden sm:inline"> TTD</span>
          </span>
        </td>
        <td className={`${availTd} text-gray-600 tabular-nums`}>
          <span className="sm:hidden">{format(new Date(item.paymentDate), 'M/d/yy')}</span>
          <span className="hidden sm:inline whitespace-nowrap">
            {format(new Date(item.paymentDate), 'MMM d, yyyy')}
          </span>
        </td>
        <td className={`${availTd} relative z-20 text-right`}>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="touch-manipulation h-7 px-1.5 text-[10px] sm:h-8 sm:px-2 sm:text-xs relative z-10"
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              openQuickLogForCard(item.cardId)
            }}
          >
            <Plus className="w-3 h-3 sm:w-3.5 sm:h-3.5 min-[360px]:mr-1" />
            <span className="hidden min-[360px]:inline">Log</span>
          </Button>
        </td>
      </tr>
      {expandedCardId === item.cardId ? (
        <tr className="bg-transparent">
          <td colSpan={10} className="p-0 border-0">
            <CardUsagePanel
              cardId={item.cardId}
              cardLabel={personCardOptionLabel(item.card)}
              year={year}
              month={month}
              onUsageChanged={afterUsageChange}
              usageRevision={usageRevision}
              monthExchangeRate={item.exchangeRate}
            />
          </td>
        </tr>
      ) : null}
    </Fragment>
  )

  const mobileInfoRow = (label: string, value: React.ReactNode, valueClass = '') => (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-gray-500 shrink-0">{label}</dt>
      <dd className={`text-gray-800 text-right tabular-nums ${valueClass}`}>
        {value}
      </dd>
    </div>
  )

  const renderMobileCard = (item: AvailRow) => {
    const expanded = expandedCardId === item.cardId
    const last4 = item.card.lastFourDigits?.trim()
    return (
      <li key={item.id}>
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
          <div className="p-4">
            <div className="flex items-start justify-between gap-3">
              <button
                type="button"
                onClick={() =>
                  setExpandedCardId((id) =>
                    id === item.cardId ? null : item.cardId
                  )
                }
                className="text-left min-w-0 flex-1 inline-flex items-start gap-1.5 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              >
                <span className="min-w-0 flex flex-col gap-0.5">
                  <span className="inline-flex items-center gap-2 flex-wrap font-semibold text-gray-900">
                    {item.card.cardNickname}
                    {item.isRecurringTemplate && (
                      <span className="text-[10px] font-normal px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-800">
                        Monthly
                      </span>
                    )}
                  </span>
                  {last4 ? (
                    <span className="text-[10px] font-mono text-gray-500">
                      •••• {last4}
                    </span>
                  ) : null}
                  <span className="text-xs text-gray-500 break-words">
                    {issuingBankLabel(item.card.issuingBank)}
                  </span>
                </span>
                {expanded ? (
                  <ChevronUp className="w-4 h-4 shrink-0 text-gray-500 mt-0.5" />
                ) : (
                  <ChevronDown className="w-4 h-4 shrink-0 text-gray-500 mt-0.5" />
                )}
              </button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="touch-manipulation shrink-0 h-8 text-xs"
                onClick={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  openQuickLogForCard(item.cardId)
                }}
              >
                <Plus className="w-3.5 h-3.5 mr-1" />
                Log
              </Button>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-3">
              <div className="rounded-lg bg-gray-50 px-3 py-2">
                <div className="text-[11px] font-medium uppercase tracking-wide text-gray-500">
                  Balance (USD)
                </div>
                <div
                  className={`mt-0.5 text-base font-semibold tabular-nums ${
                    item.balanceUSD > 0.005
                      ? 'text-emerald-700'
                      : item.balanceUSD < -0.005
                        ? 'text-red-700'
                        : 'text-gray-700'
                  }`}
                >
                  ${item.balanceUSD.toFixed(2)}
                </div>
              </div>
              <div className="rounded-lg bg-gray-50 px-3 py-2">
                <div className="text-[11px] font-medium uppercase tracking-wide text-gray-500">
                  Owed (TTD)
                </div>
                <div
                  className={`mt-0.5 text-base font-semibold tabular-nums ${
                    item.owedTTD > 0 ? 'text-red-700' : 'text-teal-700'
                  }`}
                >
                  ${item.owedTTD.toFixed(2)}
                </div>
              </div>
            </div>

            <dl className="mt-3 space-y-1.5 text-sm">
              {mobileInfoRow('Available (USD)', `$${item.amountUSD.toFixed(2)}`)}
              {mobileInfoRow('Used (USD)', `$${item.usageUSD.toFixed(2)}`)}
              {mobileInfoRow('Rate', item.exchangeRate.toFixed(2), 'font-mono')}
              {mobileInfoRow('TTD value', `$${item.ttdValue.toFixed(2)}`)}
              {mobileInfoRow(
                'Fee (TTD)',
                `${item.impliedFeeTTD.toFixed(2)} TTD`,
                item.impliedFeeTTD > 0
                  ? 'text-red-600'
                  : item.impliedFeeTTD < 0
                    ? 'text-green-700'
                    : 'text-gray-400'
              )}
              {mobileInfoRow(
                'Pay date',
                format(new Date(item.paymentDate), 'MMM d, yyyy')
              )}
            </dl>
          </div>
          {expanded ? (
            <div className="border-t border-gray-100">
              <CardUsagePanel
                cardId={item.cardId}
                cardLabel={personCardOptionLabel(item.card)}
                year={year}
                month={month}
                onUsageChanged={afterUsageChange}
                usageRevision={usageRevision}
                monthExchangeRate={item.exchangeRate}
              />
            </div>
          ) : null}
        </div>
      </li>
    )
  }

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

  return (
    <div className="space-y-6 min-w-0">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between min-w-0">
        <div className="min-w-0 space-y-2">
          <Link
            href="/people"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-blue-700 hover:text-blue-900 hover:underline"
          >
            <ArrowLeft className="w-4 h-4 shrink-0" aria-hidden />
            People
          </Link>
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-[-0.02em] text-slate-900">
            {loadError ? 'Person' : displayName}
          </h1>
          <p className="text-gray-600 text-sm sm:text-base">
            Card availability and usage for this provider ({monthName})
          </p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end w-full lg:w-auto min-w-0">
          <Link href="/dashboard" className="sm:shrink-0">
            <Button variant="outline" size="sm" className="w-full sm:w-auto">
              Full dashboard
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

      {exchangeRate && (
        <Card className="border-l-4 border-l-blue-500 shadow-md bg-transparent min-w-0 overflow-hidden">
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
                onClick={() => router.push('/settings')}
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
          </CardContent>
        </Card>
      )}

      {loadError && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          <p className="font-medium">{loadError}</p>
          <Link href="/people" className="mt-2 inline-block text-blue-700 font-medium underline">
            Back to People
          </Link>
        </div>
      )}

      {loading ? (
        <div className="text-center py-12">
          <p className="text-gray-500">Loading...</p>
        </div>
      ) : summary && !loadError ? (
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
                  Sum of USD availability for this person&apos;s cards this month
                </p>
              </CardContent>
            </Card>

            <Card className="shadow-md hover:shadow-lg transition-shadow border-l-4 border-l-amber-500">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  Total USD balance
                </CardTitle>
                <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center">
                  <Wallet className="h-4 w-4 text-amber-700" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-amber-700">
                  ${(summary.totalUSD - summary.totalUsedUSD).toFixed(2)}
                </div>
                <p className="text-xs text-gray-500">
                  USD available minus USD usage logged this month (their cards only)
                </p>
              </CardContent>
            </Card>

            <Card className="shadow-md hover:shadow-lg transition-shadow border-l-4 border-l-teal-500">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  Outstanding to this person
                </CardTitle>
                <div className="w-8 h-8 rounded-lg bg-teal-100 flex items-center justify-center">
                  <Scale className="h-4 w-4 text-teal-700" />
                </div>
              </CardHeader>
              <CardContent>
                <div
                  className={`text-2xl font-bold ${
                    owedToPersonTTD > 0 ? 'text-red-600' : 'text-teal-700'
                  }`}
                >
                  ${owedToPersonTTD.toFixed(2)}
                </div>
                <p className="text-xs text-gray-500">
                  Unpaid usage owed to them (TTD), same basis as the People page
                </p>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            <Card className="shadow-md hover:shadow-lg transition-shadow">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  Cards available
                </CardTitle>
                <div className="w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center">
                  <CreditCard className="h-4 w-4 text-indigo-600" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-indigo-600">{summary.totalCards}</div>
                <p className="text-xs text-gray-500">Cards with availability this month</p>
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
                <p className="text-xs text-gray-500">TTD per USD (their cards this month)</p>
              </CardContent>
            </Card>

            <Card className="shadow-md hover:shadow-lg transition-shadow">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  Total TTD required
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
                  TTD to cover logged USD at each card&apos;s rate (their cards only)
                </p>
              </CardContent>
            </Card>
          </div>

          <Card className="shadow-md border-t-4 border-t-blue-500 min-w-0">
            <CardHeader className="border-b border-[#eef0f3]">
              <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <CardTitle className="text-xl">Card availability details</CardTitle>
                    <CardDescription>
                      {displayName}&apos;s cards for {monthName}
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
                  <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={onlyWithBalance}
                      onChange={(e) => setOnlyWithBalance(e.target.checked)}
                      className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                    />
                    Only cards with balance left (USD)
                  </label>
                </div>
                <p className="text-xs text-gray-500">
                  Click a card name to expand full usage history. Use Log to add usage for{' '}
                  {monthName}.
                </p>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {summary.availability.length === 0 ? (
                <div className="text-center py-12 px-6">
                  <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-4">
                    <CreditCard className="w-8 h-8 text-gray-400" />
                  </div>
                  <p className="text-gray-500 text-lg">
                    No cards with availability for this person this month
                  </p>
                  <p className="text-gray-500 text-sm mt-2">
                    Add availability under Availability or open their card on the Cards page.
                  </p>
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
                        <div className="flex flex-col gap-3">
                          <div className="w-full min-w-0">
                            <Label htmlFor="person-quick-card">Card *</Label>
                            <select
                              id="person-quick-card"
                              value={quickForm.cardId}
                              onChange={(e) => {
                                const nextCardId = e.target.value
                                setQuickForm((f) => ({
                                  ...f,
                                  cardId: nextCardId,
                                  amountUSD: defaultUsageAmountForQuickCardId(nextCardId),
                                }))
                              }}
                              required
                              disabled={quickSaving}
                              className="flex h-10 w-full min-w-0 max-w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                            >
                              <option value="">Select card</option>
                              {quickCardOptions.map(([id, label]) => (
                                <option key={id} value={id}>
                                  {label}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                            <div className="min-w-0">
                              <Label htmlFor="person-quick-amt">Amount (USD) *</Label>
                              <Input
                                id="person-quick-amt"
                                type="number"
                                step="0.01"
                                min="0.01"
                                value={quickForm.amountUSD}
                                onChange={(e) => {
                                  const rate = exchangeRateForQuickCardId(quickForm.cardId)
                                  setQuickForm((f) => ({
                                    ...f,
                                    amountUSD: e.target.value,
                                    paidToOwnerTTD:
                                      rate != null && rate > 0
                                        ? usageAmountPaidSyncFromUsdInputs(
                                            f.amountUSD,
                                            f.paidToOwnerTTD,
                                            e.target.value,
                                            rate
                                          )
                                        : f.paidToOwnerTTD,
                                  }))
                                }}
                                required
                                disabled={quickSaving}
                              />
                            </div>
                            <div className="min-w-0">
                              <Label htmlFor="person-quick-paid">Paid to owner (TTD)</Label>
                              <Input
                                id="person-quick-paid"
                                type="number"
                                step="0.01"
                                min="0"
                                placeholder="0 if not paid yet"
                                title="Leave 0 until you have paid the card owner back."
                                value={quickForm.paidToOwnerTTD}
                                onChange={(e) =>
                                  setQuickForm((f) => ({
                                    ...f,
                                    paidToOwnerTTD: e.target.value,
                                  }))
                                }
                                disabled={quickSaving}
                              />
                            </div>
                            <div className="min-w-0 sm:col-span-2 lg:col-span-1">
                              <Label htmlFor="person-quick-date">Date</Label>
                              <DatePicker
                                id="person-quick-date"
                                value={quickForm.usageDate}
                                onChange={(v) =>
                                  setQuickForm((f) => ({
                                    ...f,
                                    usageDate: v,
                                  }))
                                }
                                disabled={quickSaving}
                              />
                            </div>
                          </div>
                          <div className="w-full min-w-0">
                            <Label htmlFor="person-quick-notes">Notes</Label>
                            <Input
                              id="person-quick-notes"
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
                  <div className="hidden md:block w-full min-w-0 overflow-x-auto touch-pan-x pb-3 sm:pb-4">
                    <table className="w-full min-w-0 table-fixed border-collapse text-[11px] sm:text-xs md:text-sm">
                      <colgroup>
                        <col className="w-[19%]" />
                        <col className="w-[8.5%]" />
                        <col className="w-[8.5%]" />
                        <col className="w-[8.5%]" />
                        <col className="w-[9%]" />
                        <col className="w-[6.5%]" />
                        <col className="w-[9%]" />
                        <col className="w-[7.5%]" />
                        <col className="w-[11%]" />
                        <col className="w-[12.5%]" />
                      </colgroup>
                      <thead>
                        <tr className="bg-slate-50/70 border-b-2 border-blue-200">
                          <th className="text-left py-2 px-1 sm:px-1.5 lg:px-2 font-semibold text-gray-700 uppercase leading-tight tracking-wide text-[10px] sm:text-xs">
                            Card
                          </th>
                          <th className="text-right py-2 px-1 sm:px-1.5 lg:px-2 font-semibold text-gray-700 uppercase leading-tight tracking-wide text-[10px] sm:text-xs">
                            <span className="hidden sm:inline">Avail. (USD)</span>
                            <span className="sm:hidden">
                              Avail.
                              <br />
                              <span className="font-normal normal-case text-gray-500">USD</span>
                            </span>
                          </th>
                          <th className="text-right py-2 px-1 sm:px-1.5 lg:px-2 font-semibold text-gray-700 uppercase leading-tight tracking-wide text-[10px] sm:text-xs">
                            <span className="hidden sm:inline">Balance (USD)</span>
                            <span className="sm:hidden">
                              Bal.
                              <br />
                              <span className="font-normal normal-case text-gray-500">USD</span>
                            </span>
                          </th>
                          <th className="text-right py-2 px-1 sm:px-1.5 lg:px-2 font-semibold text-gray-700 uppercase leading-tight tracking-wide text-[10px] sm:text-xs">
                            <span className="hidden sm:inline">Used (USD)</span>
                            <span className="sm:hidden">
                              Used
                              <br />
                              <span className="font-normal normal-case text-gray-500">USD</span>
                            </span>
                          </th>
                          <th className="text-right py-2 px-1 sm:px-1.5 lg:px-2 font-semibold text-gray-700 uppercase leading-tight tracking-wide text-[10px] sm:text-xs">
                            <span className="hidden sm:inline">Owed (TTD)</span>
                            <span className="sm:hidden">
                              Owed
                              <br />
                              <span className="font-normal normal-case text-gray-500">TTD</span>
                            </span>
                          </th>
                          <th className="text-right py-2 px-1 sm:px-1.5 lg:px-2 font-semibold text-gray-700 uppercase leading-tight tracking-wide text-[10px] sm:text-xs">
                            Rate
                          </th>
                          <th className="text-right py-2 px-1 sm:px-1.5 lg:px-2 font-semibold text-gray-700 uppercase leading-tight tracking-wide text-[10px] sm:text-xs">
                            <span className="hidden sm:inline">TTD value</span>
                            <span className="sm:hidden">
                              TTD
                              <br />
                              <span className="font-normal normal-case text-gray-500">val.</span>
                            </span>
                          </th>
                          <th className="text-right py-2 px-1 sm:px-1.5 lg:px-2 font-semibold text-gray-700 uppercase leading-tight tracking-wide text-[10px] sm:text-xs">
                            <span className="hidden sm:inline">Fee (TTD)</span>
                            <span className="sm:hidden">
                              Fee
                              <br />
                              <span className="font-normal normal-case text-gray-500">TTD</span>
                            </span>
                          </th>
                          <th className="text-left py-2 px-1 sm:px-1.5 lg:px-2 font-semibold text-gray-700 uppercase leading-tight tracking-wide text-[10px] sm:text-xs">
                            Pay
                          </th>
                          <th className="text-right py-2 px-1 sm:px-1.5 lg:px-2 font-semibold text-gray-700 uppercase leading-tight tracking-wide text-[10px] sm:text-xs">
                            <span className="hidden min-[420px]:inline">Actions</span>
                            <span className="min-[420px]:hidden">Act.</span>
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {filteredRows.map((item, index) =>
                          renderRow(
                            item,
                            index % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'
                          )
                        )}
                      </tbody>
                    </table>
                  </div>

                  <ul className="md:hidden space-y-3 p-4">
                    {filteredRows.map((item) => renderMobileCard(item))}
                  </ul>
                </>
              )}
            </CardContent>
          </Card>
        </>
      ) : !loadError ? (
        <div className="text-center py-12">
          <p className="text-gray-500">No data available</p>
        </div>
      ) : null}
    </div>
  )
}
