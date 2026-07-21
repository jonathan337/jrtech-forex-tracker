'use client'

import { useState, useEffect, useMemo, useCallback, useRef, Fragment } from 'react'
import { useDataChanged } from '@/lib/use-data-changed'
import { useRouter } from 'next/navigation'
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
  User,
  Plus,
  History,
  Search,
  Filter,
} from 'lucide-react'
import { useGroupByOwner } from '@/hooks/use-group-by-owner'
import type { MonthUsdCostSummary } from '@/lib/month-usd-cost-summary'
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
  url?: string
  note?: string
}

function dashboardCardOptionLabel(
  card: Summary['availability'][number]['card']
): string {
  const last4 = card.lastFourDigits?.trim()
  const suffix = last4 ? ` •••• ${last4}` : ''
  if (card.issuingBank) {
    return `${card.cardNickname} (${issuingBankLabel(card.issuingBank)}) — ${card.person.name}${suffix}`
  }
  return `${card.cardNickname} (${card.person.name})${suffix}`
}

/** Tokens (split on whitespace) must all match person name, card nickname, stored last-4, or digits embedded in the nickname. */
function rowMatchesDashboardSearch(
  row: Summary['availability'][number],
  raw: string
): boolean {
  const q = raw.trim().toLowerCase()
  if (!q) return true

  const tokens = q.split(/\s+/).filter(Boolean)
  const person = row.card.person.name.toLowerCase()
  const nick = row.card.cardNickname.toLowerCase()
  const last4Norm = (row.card.lastFourDigits ?? '').replace(/\D/g, '')
  const nickDigits = nick.replace(/\D/g, '')

  return tokens.every((tok) => {
    const t = tok.toLowerCase()
    const digitsOnly = t.replace(/\D/g, '')

    if (person.includes(t) || nick.includes(t)) return true

    if (digitsOnly.length > 0) {
      if (last4Norm.includes(digitsOnly) || nickDigits.includes(digitsOnly)) {
        return true
      }
    }

    return false
  })
}

function sumOwnerTotals(items: Summary['availability']) {
  return items.reduce(
    (acc, i) => ({
      amountUSD: acc.amountUSD + i.amountUSD,
      balanceUSD: acc.balanceUSD + i.balanceUSD,
      usageUSD: acc.usageUSD + i.usageUSD,
      owedTTD: acc.owedTTD + i.owedTTD,
      ttdValue: acc.ttdValue + i.ttdValue,
    }),
    {
      amountUSD: 0,
      balanceUSD: 0,
      usageUSD: 0,
      owedTTD: 0,
      ttdValue: 0,
    }
  )
}

export default function Dashboard() {
  const router = useRouter()
  const { status } = useSession()
  const [currentDate, setCurrentDate] = useState(new Date())
  const [summary, setSummary] = useState<Summary | null>(null)
  const [exchangeRate, setExchangeRate] = useState<ExchangeRate | null>(null)
  const [loading, setLoading] = useState(true)
  // Only the very first load shows the full-page spinner; later refreshes update in place.
  const didInitialLoadRef = useRef(false)
  const [groupByOwner, setGroupByOwner] = useGroupByOwner()
  const [onlyWithBalance, setOnlyWithBalance] = useState(false)
  const [tableSearch, setTableSearch] = useState('')
  const [showMobileFilters, setShowMobileFilters] = useState(false)
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
  const [totalOwedToPeopleTTD, setTotalOwedToPeopleTTD] = useState(0)
  const [usdCostSummary, setUsdCostSummary] = useState<MonthUsdCostSummary | null>(
    null
  )

  const year = currentDate.getFullYear()
  const month = currentDate.getMonth() + 1

  const balanceFilteredRows = useMemo(() => {
    if (!summary?.availability.length) return []
    if (!onlyWithBalance) return summary.availability
    return summary.availability.filter((r) => r.balanceTTD > 0)
  }, [summary?.availability, onlyWithBalance])

  const filteredRows = useMemo(() => {
    if (!balanceFilteredRows.length) return []
    const q = tableSearch.trim()
    if (!q) return balanceFilteredRows
    return balanceFilteredRows.filter((r) => rowMatchesDashboardSearch(r, q))
  }, [balanceFilteredRows, tableSearch])

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

  const exchangeRateForQuickCardId = (cardId: string): number | null => {
    const src = tableSearch.trim() ? filteredRows : balanceFilteredRows
    const row = src.find((r) => r.cardId === cardId)
    const r = row?.exchangeRate
    return typeof r === 'number' && Number.isFinite(r) && r > 0 ? r : null
  }

  const quickCardOptions = useMemo(() => {
    const source = tableSearch.trim() ? filteredRows : balanceFilteredRows
    if (!source.length) return []
    const m = new Map<string, string>()
    for (const r of source) {
      if (!m.has(r.cardId)) {
        m.set(r.cardId, dashboardCardOptionLabel(r.card))
      }
    }
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1]))
  }, [balanceFilteredRows, filteredRows, tableSearch])

  // One request for everything the dashboard shows — /api/dashboard computes
  // the month bundle once server-side instead of four endpoints repeating it.
  const fetchDashboardData = useCallback(
    async (signal?: AbortSignal) => {
      try {
        const url = new URL(
          `/api/dashboard?year=${year}&month=${month}`,
          window.location.origin
        ).toString()
        const response = await fetch(url, {
          credentials: 'include',
          cache: 'no-store',
          signal,
        })
        if (!response.ok) {
          setUsdCostSummary(null)
          setTotalOwedToPeopleTTD(0)
          return
        }
        const data = await response.json()
        setSummary(data.summary ?? null)
        setUsdCostSummary(data.usdCostSummary ?? null)
        setTotalOwedToPeopleTTD(
          typeof data.totalOwedToPeopleTTD === 'number' &&
            Number.isFinite(data.totalOwedToPeopleTTD)
            ? data.totalOwedToPeopleTTD
            : 0
        )
        if (
          typeof data.defaultExchangeRate === 'number' &&
          Number.isFinite(data.defaultExchangeRate)
        ) {
          setExchangeRate({
            selling: data.defaultExchangeRate,
            buying: data.defaultExchangeRate,
            source: 'Your Default Rate',
            timestamp: new Date().toISOString(),
          })
        }
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return
        console.error('Error fetching dashboard data:', error)
      }
    },
    [year, month]
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
    setTableSearch('')
  }, [year, month])

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.replace('/login')
    }
  }, [status, router])

  useEffect(() => {
    if (status !== 'authenticated') return
    let cancelled = false
    const ac = new AbortController()
    if (!didInitialLoadRef.current) setLoading(true)
    void fetchDashboardData(ac.signal).finally(() => {
      if (!cancelled) {
        setLoading(false)
        didInitialLoadRef.current = true
      }
    })
    return () => {
      cancelled = true
      ac.abort()
    }
  }, [year, month, status, fetchDashboardData])

  useDataChanged(() => {
    if (status === 'authenticated') void afterUsageChange()
  })

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

  const afterUsageChange = async () => {
    await fetchDashboardData()
    setUsageRevision((n) => n + 1)
  }

  const handleQuickUsageSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!quickForm.cardId || !quickForm.amountUSD) return
    const usageUSD = parseFloat(quickForm.amountUSD)
    if (Number.isNaN(usageUSD) || usageUSD <= 0) return
    const rate = exchangeRateForQuickCardId(quickForm.cardId)
    if (rate == null) {
      setQuickError(
        'This card has no rate for this month in the dashboard. Refresh or add availability.'
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
    setQuickForm((f) => ({
      ...f,
      cardId,
      amountUSD: '',
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
            className="text-left inline-flex items-start gap-1.5 flex-wrap rounded hover:text-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            <span className="inline-flex flex-col items-start gap-0.5 min-w-0 flex-1">
              <span className="inline-flex items-center gap-2 flex-wrap min-w-0">
                {item.card.cardNickname}
                {item.isRecurringTemplate && (
                  <span className="text-xs font-normal px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-800">
                    Every month
                  </span>
                )}
              </span>
              {item.card.lastFourDigits?.trim() ? (
                <span className="text-[10px] font-mono font-normal text-gray-500 sm:text-xs">
                  •••• {item.card.lastFourDigits.trim()}
                </span>
              ) : null}
              <span className="text-xs font-normal text-gray-500 break-words">
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
          <span className="inline-flex items-center px-3 py-1 rounded-md text-sm font-medium tabular-nums bg-slate-50 text-slate-700 ring-1 ring-[#eef0f3]">
            ${item.amountUSD.toFixed(2)}
          </span>
        </td>
        <td className="py-3 px-3 sm:py-4 sm:px-6 text-right whitespace-nowrap">
          <span
            className={`inline-flex items-center px-3 py-1 rounded-md text-sm font-medium tabular-nums ${
              item.balanceUSD > 0.005
                ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100'
                : item.balanceUSD < -0.005
                  ? 'bg-rose-50 text-rose-700 ring-1 ring-rose-100'
                  : 'bg-slate-50 text-slate-500 ring-1 ring-[#eef0f3]'
            }`}
          >
            ${item.balanceUSD.toFixed(2)}
          </span>
        </td>
        <td className="py-3 px-3 sm:py-4 sm:px-6 text-right whitespace-nowrap">
          <span className="inline-flex items-center px-3 py-1 rounded-md text-sm font-medium tabular-nums bg-slate-50 text-slate-700 ring-1 ring-[#eef0f3]">
            ${item.usageUSD.toFixed(2)}
          </span>
        </td>
        <td className="py-3 px-3 sm:py-4 sm:px-6 text-right whitespace-nowrap">
          <span
            className={`inline-flex items-center px-3 py-1 rounded-md text-sm font-medium tabular-nums ${
              item.owedTTD > 0
                ? 'bg-rose-50 text-rose-700 ring-1 ring-rose-100'
                : 'bg-teal-100 text-teal-800'
            }`}
          >
            ${item.owedTTD.toFixed(2)}
          </span>
        </td>
        <td className="py-3 px-3 sm:py-4 sm:px-6 text-right whitespace-nowrap">
          <span className="font-mono text-gray-700">
            {item.exchangeRate.toFixed(2)}
          </span>
        </td>
        <td className="py-3 px-3 sm:py-4 sm:px-6 text-right whitespace-nowrap">
          <span className="inline-flex items-center px-3 py-1 rounded-md text-sm font-medium tabular-nums bg-slate-50 text-slate-700 ring-1 ring-[#eef0f3]">
            ${item.ttdValue.toFixed(2)}
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
        <td className="py-3 px-3 sm:py-4 sm:px-6 relative z-20 text-right whitespace-nowrap">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="touch-manipulation h-8 text-xs relative z-10"
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              openQuickLogForCard(item.cardId)
            }}
          >
            <Plus className="w-3.5 h-3.5 mr-1" />
            Log
          </Button>
        </td>
      </tr>
      {expandedCardId === item.cardId ? (
        <tr className="bg-transparent">
          <td colSpan={11} className="p-0 border-0">
            <CardUsagePanel
              cardId={item.cardId}
              cardLabel={dashboardCardOptionLabel(item.card)}
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

  const renderAvailabilityMobileCard = (item: AvailRow) => {
    const expanded = expandedCardId === item.cardId
    const last4 = item.card.lastFourDigits?.trim()
    return (
      <li key={item.id}>
        <div className="rounded-xl border border-[#e6e8ec] bg-white overflow-hidden">
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
                        Every month
                      </span>
                    )}
                  </span>
                  {last4 ? (
                    <span className="text-[10px] font-mono text-gray-500">
                      •••• {last4}
                    </span>
                  ) : null}
                  <span className="text-xs text-gray-500 break-words">
                    {item.card.person.name} · {issuingBankLabel(item.card.issuingBank)}
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
              <div className="rounded-lg bg-slate-50 ring-1 ring-[#eef0f3] px-3 py-2">
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
              <div className="rounded-lg bg-slate-50 ring-1 ring-[#eef0f3] px-3 py-2">
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
                format(new Date(item.paymentDate), 'MMM dd, yyyy')
              )}
            </dl>
          </div>
          {expanded ? (
            <div className="border-t border-gray-100">
              <CardUsagePanel
                cardId={item.cardId}
                cardLabel={dashboardCardOptionLabel(item.card)}
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

  return (
    <div className="space-y-6 min-w-0">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between min-w-0">
        <div className="min-w-0">
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-[-0.02em] text-slate-900">
            Dashboard
          </h1>
          <p className="text-slate-500 mt-1 text-sm sm:text-base">
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
        <Card className="min-w-0 overflow-hidden">
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
            <div className="rounded-xl border border-indigo-100 bg-indigo-50/40 p-6 text-center">
              <p className="text-[13px] font-medium text-slate-500 mb-2">Official/Baseline Rate</p>
              <p className="text-4xl font-semibold tabular-nums tracking-[-0.02em] text-indigo-700 mb-2">
                {exchangeRate.selling.toFixed(4)}
              </p>
              <p className="text-[13px] text-slate-500">TTD per USD</p>
            </div>
            <div className="mt-4 bg-amber-50/60 border border-amber-100 rounded-xl p-3">
              <p className="text-xs text-amber-900/80 leading-relaxed">
                💡 This is your baseline rate. Any rate above this represents a premium/extra cost for obtaining USD.
                You can update this in Settings.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {usdCostSummary && (
        <Card className="min-w-0 overflow-hidden">
          <CardHeader className="pb-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between min-w-0">
              <div className="min-w-0">
                <CardTitle className="text-lg">Your USD cost this month</CardTitle>
                <CardDescription className="mt-1 break-words">
                  Weighted average from direct buys and cards scheduled this month
                </CardDescription>
              </div>
              <Link
                href="/usd-purchases"
                className="inline-flex h-8 shrink-0 items-center justify-center rounded-lg border border-gray-300 bg-white px-3 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Log USD buy
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="rounded-xl border border-indigo-100 bg-indigo-50/40 p-4 text-center">
                <p className="text-xs font-medium text-slate-500 mb-1">Blended avg</p>
                <p className="text-3xl font-semibold tabular-nums tracking-[-0.02em] text-indigo-700">
                  {usdCostSummary.blended.weightedAvgRate != null
                    ? usdCostSummary.blended.weightedAvgRate.toFixed(4)
                    : '—'}
                </p>
                <p className="text-xs text-slate-500 mt-1">TTD per USD</p>
              </div>
              <div className="rounded-xl border border-[#eef0f3] bg-slate-50/60 p-4">
                <p className="text-xs font-medium text-slate-500 mb-1">Direct buys</p>
                <p className="text-xl font-semibold tabular-nums">
                  {usdCostSummary.directPurchases.weightedAvgRate != null
                    ? usdCostSummary.directPurchases.weightedAvgRate.toFixed(4)
                    : '—'}
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  ${usdCostSummary.directPurchases.totalUSD.toFixed(2)} USD
                </p>
              </div>
              <div className="rounded-xl border border-[#eef0f3] bg-slate-50/60 p-4">
                <p className="text-xs font-medium text-slate-500 mb-1">Projected cards</p>
                <p className="text-xl font-semibold tabular-nums">
                  {usdCostSummary.projectedCards.weightedAvgRate != null
                    ? usdCostSummary.projectedCards.weightedAvgRate.toFixed(4)
                    : '—'}
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  ${usdCostSummary.projectedCards.totalUSD.toFixed(2)} USD access
                  {' · '}incl.{' '}
                  {(usdCostSummary.cardProcessingFeeRate * 100).toFixed(1)}% fee
                </p>
              </div>
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
            <Card className="transition-shadow hover:shadow-[0_2px_8px_rgba(15,23,42,0.06)]">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-[13px] font-medium text-slate-500">
                  Total USD available
                </CardTitle>
                <div className="w-8 h-8 rounded-lg bg-emerald-50 ring-1 ring-emerald-100 flex items-center justify-center">
                  <DollarSign className="h-4 w-4 text-emerald-600" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-semibold tabular-nums tracking-[-0.01em] text-emerald-700">
                  ${summary.totalUSD.toFixed(2)}
                </div>
                <p className="text-xs text-slate-400 mt-1">
                  Sum of all card availability amounts in USD
                </p>
              </CardContent>
            </Card>

            <Card className="transition-shadow hover:shadow-[0_2px_8px_rgba(15,23,42,0.06)]">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-[13px] font-medium text-slate-500">
                  Total USD balance
                </CardTitle>
                <div className="w-8 h-8 rounded-lg bg-emerald-50 ring-1 ring-emerald-100 flex items-center justify-center">
                  <Wallet className="h-4 w-4 text-emerald-600" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-semibold tabular-nums tracking-[-0.01em] text-emerald-700">
                  ${(summary.totalUSD - summary.totalUsedUSD).toFixed(2)}
                </div>
                <p className="text-xs text-slate-400 mt-1">
                  USD available minus USD usage this month
                </p>
              </CardContent>
            </Card>

            <Card className="transition-shadow hover:shadow-[0_2px_8px_rgba(15,23,42,0.06)]">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-[13px] font-medium text-slate-500">
                  Total TTD owed to people
                </CardTitle>
                <div className="w-8 h-8 rounded-lg bg-rose-50 ring-1 ring-rose-100 flex items-center justify-center">
                  <Scale className="h-4 w-4 text-rose-600" />
                </div>
              </CardHeader>
              <CardContent>
                <div
                  className={`text-2xl font-semibold tabular-nums tracking-[-0.01em] ${
                    totalOwedToPeopleTTD > 0 ? 'text-rose-600' : 'text-slate-900'
                  }`}
                >
                  ${totalOwedToPeopleTTD.toFixed(2)}
                </div>
                <p className="text-xs text-slate-400 mt-1">
                  Sum of all people balances (TTD only)
                </p>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            <Card className="transition-shadow hover:shadow-[0_2px_8px_rgba(15,23,42,0.06)]">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-[13px] font-medium text-slate-500">
                  Total cards available
                </CardTitle>
                <div className="w-8 h-8 rounded-lg bg-slate-50 ring-1 ring-slate-100 flex items-center justify-center">
                  <CreditCard className="h-4 w-4 text-slate-500" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-semibold tabular-nums tracking-[-0.01em] text-slate-900">{summary.totalCards}</div>
                <p className="text-xs text-slate-400 mt-1">
                  Cards with availability this month
                </p>
              </CardContent>
            </Card>

            <Card className="transition-shadow hover:shadow-[0_2px_8px_rgba(15,23,42,0.06)]">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-[13px] font-medium text-slate-500">
                  Average exchange rate
                </CardTitle>
                <div className="w-8 h-8 rounded-lg bg-indigo-50 ring-1 ring-indigo-100 flex items-center justify-center">
                  <TrendingUp className="h-4 w-4 text-indigo-600" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-semibold tabular-nums tracking-[-0.01em] text-indigo-700">
                  {summary.averageRate.toFixed(2)}
                </div>
                <p className="text-xs text-slate-400 mt-1">TTD per USD</p>
              </CardContent>
            </Card>

            <Card className="transition-shadow hover:shadow-[0_2px_8px_rgba(15,23,42,0.06)]">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-[13px] font-medium text-slate-500">
                  Total TTD required
                </CardTitle>
                <div className="w-8 h-8 rounded-lg bg-amber-50 ring-1 ring-amber-100 flex items-center justify-center">
                  <DollarSign className="h-4 w-4 text-amber-600" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-semibold tabular-nums tracking-[-0.01em] text-amber-700">
                  ${summary.totalTTD.toFixed(2)}
                </div>
                <p className="text-xs text-slate-400 mt-1">
                  TTD needed to cover all logged USD usage at each card&apos;s rate
                </p>
              </CardContent>
            </Card>
          </div>

          <Card className="min-w-0">
            <CardHeader className="border-b border-[#eef0f3]">
              <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <CardTitle className="text-xl">Card Availability Details</CardTitle>
                    <CardDescription>
                      All cards available for {monthName}
                      {onlyWithBalance &&
                      summary.availability.length > 0 &&
                      balanceFilteredRows.length !== summary.availability.length ? (
                        <span className="text-gray-600">
                          {' '}
                          · Showing {balanceFilteredRows.length} with remaining USD balance
                        </span>
                      ) : null}
                      {tableSearch.trim() &&
                      filteredRows.length > 0 &&
                      filteredRows.length !== balanceFilteredRows.length ? (
                        <span className="text-gray-600">
                          {' '}
                          · {filteredRows.length} match search
                        </span>
                      ) : null}
                    </CardDescription>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowMobileFilters((v) => !v)}
                    className="sm:hidden inline-flex items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700"
                    aria-expanded={showMobileFilters}
                  >
                    <Filter className="w-4 h-4" />
                    {showMobileFilters ? 'Hide filters' : 'Filters & search'}
                  </button>
                  <div
                    className={`${
                      showMobileFilters ? 'flex' : 'hidden'
                    } flex-col gap-3 sm:flex sm:flex-row sm:flex-wrap sm:items-center sm:justify-end`}
                  >
                    <div className="relative w-full sm:max-w-xs lg:w-56">
                      <Label htmlFor="dashboard-table-search" className="sr-only">
                        Search by person or card digits
                      </Label>
                      <Search
                        className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none"
                        aria-hidden
                      />
                      <Input
                        id="dashboard-table-search"
                        type="search"
                        placeholder="Person or last 4 digits…"
                        value={tableSearch}
                        onChange={(e) => setTableSearch(e.target.value)}
                        className="pl-9 h-9"
                        autoComplete="off"
                      />
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
                <p className="text-xs text-slate-400 mt-1">
                  Search narrows the table and quick-log card list by owner name or card digits
                  (stored last 4 or digits in the nickname). Click a card name to expand full usage
                  history (all months). Use Log to add usage for {monthName} without leaving the
                  dashboard.
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
                  {balanceFilteredRows.length > 0 && tableSearch.trim() ? (
                    <>
                      <p className="text-gray-600">No cards match your search.</p>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setTableSearch('')}
                      >
                        Clear search
                      </Button>
                    </>
                  ) : (
                    <>
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
                    </>
                  )}
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
                              <Label htmlFor="quick-usage-amt">Amount (USD) *</Label>
                              <Input
                                id="quick-usage-amt"
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
                              <Label htmlFor="quick-usage-paid">Paid to owner (TTD)</Label>
                              <Input
                                id="quick-usage-paid"
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
                              <Label htmlFor="quick-usage-date">Date</Label>
                              <DatePicker
                                id="quick-usage-date"
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
                  <div className="hidden md:block -mx-1 overflow-x-auto sm:mx-0 touch-pan-x pb-3 sm:pb-4">
                    <table className="w-full min-w-[62rem] text-sm">
                      <thead>
                        <tr className="bg-slate-50/70 border-b border-[#e6e8ec]">
                          <th className="text-left py-3 px-3 sm:py-4 sm:px-6 font-medium text-slate-500 uppercase text-[11px] tracking-[0.06em]">
                            Card
                          </th>
                          <th className="text-left py-3 px-3 sm:py-4 sm:px-6 font-medium text-slate-500 uppercase text-[11px] tracking-[0.06em]">
                            Owner
                          </th>
                          <th className="text-right py-3 px-3 sm:py-4 sm:px-6 font-medium text-slate-500 uppercase text-[11px] tracking-[0.06em]">
                            Available (USD)
                          </th>
                          <th className="text-right py-3 px-3 sm:py-4 sm:px-6 font-medium text-slate-500 uppercase text-[11px] tracking-[0.06em]">
                            Balance (USD)
                          </th>
                          <th className="text-right py-3 px-3 sm:py-4 sm:px-6 font-medium text-slate-500 uppercase text-[11px] tracking-[0.06em]">
                            Used (USD)
                          </th>
                          <th className="text-right py-3 px-3 sm:py-4 sm:px-6 font-medium text-slate-500 uppercase text-[11px] tracking-[0.06em]">
                            Owed (TTD)
                          </th>
                          <th className="text-right py-3 px-3 sm:py-4 sm:px-6 font-medium text-slate-500 uppercase text-[11px] tracking-[0.06em]">
                            Rate
                          </th>
                          <th className="text-right py-3 px-3 sm:py-4 sm:px-6 font-medium text-slate-500 uppercase text-[11px] tracking-[0.06em]">
                            TTD Value
                          </th>
                          <th className="text-right py-3 px-3 sm:py-4 sm:px-6 font-medium text-slate-500 uppercase text-[11px] tracking-[0.06em]">
                            Fee (TTD)
                          </th>
                          <th className="text-left py-3 px-3 sm:py-4 sm:px-6 font-medium text-slate-500 uppercase text-[11px] tracking-[0.06em] whitespace-nowrap">
                            Pay date
                          </th>
                          <th className="text-right py-3 px-3 sm:py-4 sm:px-6 font-medium text-slate-500 uppercase text-[11px] tracking-[0.06em]">
                            Actions
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {groupByOwner
                          ? availabilityByOwner.flatMap((owner) => {
                              const ot = sumOwnerTotals(owner.items)
                              return [
                              <tr
                                key={`owner-${owner.ownerId}`}
                                className="bg-slate-50 border-y border-[#e6e8ec]"
                              >
                                <td
                                  colSpan={11}
                                  className="py-2.5 px-3 sm:px-6 text-gray-800"
                                >
                                  <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-baseline sm:gap-x-4 sm:gap-y-1">
                                    <span className="inline-flex items-center gap-2 font-semibold">
                                      <User className="w-4 h-4 shrink-0 text-slate-600" aria-hidden />
                                      {owner.personName}
                                      <span className="font-normal text-gray-500">
                                        ({owner.items.length} card
                                        {owner.items.length !== 1 ? 's' : ''})
                                      </span>
                                    </span>
                                    <span className="text-xs sm:text-sm font-normal text-slate-700 tabular-nums leading-relaxed border-t border-slate-200/90 pt-2 sm:border-0 sm:pt-0 sm:pl-1">
                                      <span className="text-slate-500">Totals · </span>
                                      Bal{' '}
                                      <strong className="text-slate-900">
                                        ${ot.balanceUSD.toFixed(2)}
                                      </strong>
                                      <span className="text-slate-400"> / </span>
                                      Avail{' '}
                                      <strong className="text-slate-900">
                                        ${ot.amountUSD.toFixed(2)}
                                      </strong>
                                      USD · Used{' '}
                                      <strong className="text-slate-900">
                                        ${ot.usageUSD.toFixed(2)}
                                      </strong>
                                      USD · TTD value{' '}
                                      <strong className="text-slate-900">
                                        ${ot.ttdValue.toFixed(2)}
                                      </strong>
                                      · Owed{' '}
                                      <strong className="text-slate-900">
                                        ${ot.owedTTD.toFixed(2)}
                                      </strong>
                                      TTD
                                    </span>
                                  </div>
                                </td>
                              </tr>,
                              ...owner.items.map((item, ii) =>
                                renderAvailabilityPair(
                                  item,
                                  ii % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'
                                )
                              ),
                            ]
                            })
                          : filteredRows.map((item, index) =>
                              renderAvailabilityPair(
                                item,
                                index % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'
                              )
                            )}
                      </tbody>
                    </table>
                  </div>

                  <ul className="md:hidden space-y-3 p-4">
                    {groupByOwner
                      ? availabilityByOwner.flatMap((owner) => {
                          const ot = sumOwnerTotals(owner.items)
                          return [
                            <li key={`owner-${owner.ownerId}`} className="pt-1">
                              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-1">
                                <span className="inline-flex items-center gap-2 font-semibold text-gray-800">
                                  <User
                                    className="w-4 h-4 shrink-0 text-slate-600"
                                    aria-hidden
                                  />
                                  {owner.personName}
                                  <span className="font-normal text-gray-500">
                                    ({owner.items.length} card
                                    {owner.items.length !== 1 ? 's' : ''})
                                  </span>
                                </span>
                                <span className="text-xs text-slate-600 tabular-nums">
                                  Bal ${ot.balanceUSD.toFixed(2)} · Owed $
                                  {ot.owedTTD.toFixed(2)} TTD
                                </span>
                              </div>
                            </li>,
                            ...owner.items.map((item) =>
                              renderAvailabilityMobileCard(item)
                            ),
                          ]
                        })
                      : filteredRows.map((item) =>
                          renderAvailabilityMobileCard(item)
                        )}
                  </ul>
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
