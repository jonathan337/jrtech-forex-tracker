'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { useDataChanged, emitDataChanged } from '@/lib/use-data-changed'
import { format } from 'date-fns'
import {
  Banknote,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Plus,
  Trash2,
  TrendingUp,
} from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ResponsiveTable } from '@/components/ui/responsive-table'
import { MobileAddButton } from '@/components/ui/mobile-add-button'
import {
  USD_PURCHASE_METHODS,
  USD_PURCHASE_METHOD_LABELS,
  type UsdPurchaseMethod,
} from '@/lib/usd-purchase-methods'
import type { MonthUsdCostSummary } from '@/lib/month-usd-cost-summary'

type PurchaseRow = {
  id: string
  amountUSD: number
  amountTTD: number
  method: UsdPurchaseMethod
  purchasedAt: string
  notes: string | null
}

export default function UsdPurchasesPage() {
  const router = useRouter()
  const { status } = useSession()
  const [currentDate, setCurrentDate] = useState(new Date())
  const [loading, setLoading] = useState(true)
  const didInitialLoadRef = useRef(false)
  const [purchases, setPurchases] = useState<PurchaseRow[]>([])
  const [summary, setSummary] = useState<MonthUsdCostSummary | null>(null)
  const [formError, setFormError] = useState('')
  const [saving, setSaving] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [form, setForm] = useState({
    amountUSD: '',
    rate: '',
    amountTTD: '',
    method: 'CASH' as UsdPurchaseMethod,
    purchasedAt: format(new Date(), 'yyyy-MM-dd'),
    notes: '',
  })

  /** Keep USD × rate = TTD in sync no matter which two fields the user types. */
  const setUsd = (amountUSD: string) => {
    setForm((f) => {
      const usd = parseFloat(amountUSD)
      const rate = parseFloat(f.rate)
      if (Number.isFinite(usd) && usd > 0 && Number.isFinite(rate) && rate > 0) {
        return { ...f, amountUSD, amountTTD: (usd * rate).toFixed(2) }
      }
      return { ...f, amountUSD }
    })
  }

  const setRate = (rate: string) => {
    setForm((f) => {
      const usd = parseFloat(f.amountUSD)
      const r = parseFloat(rate)
      if (Number.isFinite(usd) && usd > 0 && Number.isFinite(r) && r > 0) {
        return { ...f, rate, amountTTD: (usd * r).toFixed(2) }
      }
      return { ...f, rate }
    })
  }

  const setTtd = (amountTTD: string) => {
    setForm((f) => {
      const usd = parseFloat(f.amountUSD)
      const ttd = parseFloat(amountTTD)
      if (Number.isFinite(usd) && usd > 0 && Number.isFinite(ttd) && ttd > 0) {
        return { ...f, amountTTD, rate: (ttd / usd).toFixed(4) }
      }
      return { ...f, amountTTD }
    })
  }

  const year = currentDate.getFullYear()
  const month = currentDate.getMonth() + 1
  const monthName = format(currentDate, 'MMMM yyyy')

  useEffect(() => {
    if (status === 'unauthenticated') router.replace('/login')
  }, [status, router])

  const fetchData = useCallback(async () => {
    if (!didInitialLoadRef.current) setLoading(true)
    try {
      const res = await fetch(`/api/usd-purchases?year=${year}&month=${month}`, {
        credentials: 'include',
        cache: 'no-store',
      })
      const data = await res.json().catch(() => null)
      if (res.ok && data) {
        setPurchases(Array.isArray(data.purchases) ? data.purchases : [])
        setSummary(data.summary ?? null)
      } else {
        setPurchases([])
        setSummary(null)
      }
    } catch {
      setPurchases([])
      setSummary(null)
    } finally {
      setLoading(false)
      didInitialLoadRef.current = true
    }
  }, [year, month])

  useEffect(() => {
    if (status !== 'authenticated') return
    void fetchData()
  }, [status, fetchData])

  useDataChanged(() => {
    if (status === 'authenticated') void fetchData()
  })

  if (status === 'loading') {
    return (
      <div className="min-h-[40vh] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    )
  }

  if (status === 'unauthenticated') return null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const usd = parseFloat(form.amountUSD.trim())
    const ttd = parseFloat(form.amountTTD.trim())
    if (Number.isNaN(usd) || usd <= 0 || Number.isNaN(ttd) || ttd <= 0) {
      setFormError('Enter positive USD and TTD amounts.')
      return
    }
    setSaving(true)
    setFormError('')
    try {
      const res = await fetch('/api/usd-purchases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          year,
          month,
          amountUSD: usd,
          amountTTD: ttd,
          method: form.method,
          purchasedAt: new Date(form.purchasedAt).toISOString(),
          notes: form.notes.trim() || undefined,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setFormError(typeof data.error === 'string' ? data.error : 'Could not save.')
        return
      }
      setForm({
        amountUSD: '',
        rate: '',
        amountTTD: '',
        method: form.method,
        purchasedAt: format(new Date(), 'yyyy-MM-dd'),
        notes: '',
      })
      setShowForm(false)
      emitDataChanged({})
      await fetchData()
    } catch {
      setFormError('Network error.')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this USD purchase entry?')) return
    setDeletingId(id)
    try {
      const res = await fetch(`/api/usd-purchases/${id}`, {
        method: 'DELETE',
        credentials: 'include',
      })
      if (res.ok) {
        emitDataChanged({})
        await fetchData()
      }
    } finally {
      setDeletingId(null)
    }
  }

  const fmtRate = (r: number | null) =>
    r != null && Number.isFinite(r) ? r.toFixed(4) : '—'

  return (
    <div className="space-y-6 min-w-0">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl sm:text-3xl font-bold bg-gradient-to-r from-emerald-600 to-teal-600 bg-clip-text text-transparent">
            USD Buys
          </h1>
          <p className="text-gray-600 mt-1 text-sm sm:text-base">
            Log cash, Zelle, or wire USD purchases and track your average cost
          </p>
        </div>
        <Button onClick={() => setShowForm(true)} className="w-full sm:w-auto shrink-0">
          <Plus className="w-4 h-4 mr-2" />
          Log purchase
        </Button>
      </div>

      <div className="flex items-center justify-between gap-2 rounded-xl border bg-white px-3 py-2 shadow-sm">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() =>
            setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1))
          }
        >
          <ChevronLeft className="w-5 h-5" />
        </Button>
        <span className="font-semibold text-gray-900 tabular-nums">{monthName}</span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() =>
            setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1))
          }
        >
          <ChevronRight className="w-5 h-5" />
        </Button>
      </div>

      {summary && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Card className="border-l-4 border-l-emerald-500 shadow-md">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-emerald-600" />
                Blended avg this month
              </CardTitle>
              <CardDescription>Direct buys + projected card access</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold text-emerald-700 tabular-nums">
                {fmtRate(summary.blended.weightedAvgRate)}
              </p>
              <p className="text-xs text-gray-500 mt-1">TTD per USD</p>
              <p className="text-xs text-gray-500 mt-2">
                ${summary.blended.totalUSD.toFixed(2)} USD · $
                {summary.blended.totalTTD.toFixed(2)} TTD
              </p>
            </CardContent>
          </Card>

          <Card className="shadow-md">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Direct purchases</CardTitle>
              <CardDescription>Cash, Zelle, wire</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-gray-900 tabular-nums">
                {fmtRate(summary.directPurchases.weightedAvgRate)}
              </p>
              <p className="text-xs text-gray-500 mt-1">
                ${summary.directPurchases.totalUSD.toFixed(2)} USD ·{' '}
                {summary.directPurchases.count} entries
              </p>
            </CardContent>
          </Card>

          <Card className="shadow-md sm:col-span-2 lg:col-span-1">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Projected cards avg</CardTitle>
              <CardDescription>
                Cards scheduled/available this month ({summary.projectedCards.count})
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-gray-900 tabular-nums">
                {fmtRate(summary.projectedCards.weightedAvgRate)}
              </p>
              <p className="text-xs text-gray-500 mt-1">
                ${summary.projectedCards.totalUSD.toFixed(2)} USD projected access
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {showForm && (
        <Card className="border-2 border-emerald-200 shadow-lg">
          <CardHeader>
            <CardTitle>Log USD purchase</CardTitle>
            <CardDescription>
              Record what you paid in TTD for USD bought outside card availability
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-3">
                <div>
                  <Label htmlFor="amountUSD">Amount (USD) *</Label>
                  <Input
                    id="amountUSD"
                    type="number"
                    step="0.01"
                    value={form.amountUSD}
                    onChange={(e) => setUsd(e.target.value)}
                    placeholder="500.00"
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="rate">Rate (TTD/USD) *</Label>
                  <Input
                    id="rate"
                    type="number"
                    step="0.0001"
                    value={form.rate}
                    onChange={(e) => setRate(e.target.value)}
                    placeholder="6.80"
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="amountTTD">Paid (TTD)</Label>
                  <Input
                    id="amountTTD"
                    type="number"
                    step="0.01"
                    value={form.amountTTD}
                    onChange={(e) => setTtd(e.target.value)}
                    placeholder="Auto-calculated"
                  />
                  <p className="mt-1 text-xs text-gray-500">
                    USD × rate — fills in automatically
                  </p>
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label htmlFor="method">Method *</Label>
                  <select
                    id="method"
                    value={form.method}
                    onChange={(e) =>
                      setForm({ ...form, method: e.target.value as UsdPurchaseMethod })
                    }
                    className="flex h-10 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
                  >
                    {USD_PURCHASE_METHODS.map((m) => (
                      <option key={m} value={m}>
                        {USD_PURCHASE_METHOD_LABELS[m]}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <Label htmlFor="purchasedAt">Date *</Label>
                  <Input
                    id="purchasedAt"
                    type="date"
                    value={form.purchasedAt}
                    onChange={(e) => setForm({ ...form, purchasedAt: e.target.value })}
                    required
                  />
                </div>
              </div>
              <div>
                <Label htmlFor="notes">Notes</Label>
                <Input
                  id="notes"
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  placeholder="Optional"
                />
              </div>
              {formError && (
                <p className="text-sm text-red-600" role="alert">
                  {formError}
                </p>
              )}
              <div className="flex gap-2">
                <Button type="submit" disabled={saving}>
                  {saving ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Saving…
                    </>
                  ) : (
                    'Save'
                  )}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={saving}
                  onClick={() => setShowForm(false)}
                >
                  Cancel
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      <Card className="shadow-md min-w-0 overflow-hidden">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Banknote className="w-5 h-5 text-emerald-600" />
            {monthName}
          </CardTitle>
          <CardDescription>
            {purchases.length} direct purchase{purchases.length !== 1 ? 's' : ''} logged
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="py-8 text-center text-gray-500">
              <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
              Loading…
            </div>
          ) : (
            <ResponsiveTable<PurchaseRow>
              rows={purchases}
              rowKey={(p) => p.id}
              empty="No direct USD purchases for this month yet."
              columns={[
                {
                  id: 'date',
                  header: 'Date',
                  mobile: 'title',
                  className: 'whitespace-nowrap tabular-nums',
                  cell: (p) => format(new Date(p.purchasedAt), 'MMM d, yyyy'),
                },
                {
                  id: 'usd',
                  header: 'USD',
                  align: 'right',
                  mobile: 'primary',
                  className: 'font-medium tabular-nums text-emerald-800',
                  cell: (p) => `$${p.amountUSD.toFixed(2)}`,
                },
                {
                  id: 'method',
                  header: 'Method',
                  cell: (p) => USD_PURCHASE_METHOD_LABELS[p.method] ?? p.method,
                },
                {
                  id: 'ttd',
                  header: 'TTD',
                  align: 'right',
                  mobile: 'primary',
                  className: 'tabular-nums',
                  cell: (p) => `$${p.amountTTD.toFixed(2)}`,
                },
                {
                  id: 'rate',
                  header: 'Rate',
                  align: 'right',
                  className: 'tabular-nums font-mono text-sm',
                  cell: (p) => (p.amountTTD / p.amountUSD).toFixed(4),
                },
                {
                  id: 'notes',
                  header: 'Notes',
                  className: 'text-gray-600 max-w-[200px] truncate',
                  cell: (p) => p.notes ?? '—',
                },
              ]}
              actions={{
                render: (p) => (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={deletingId === p.id}
                    onClick={() => handleDelete(p.id)}
                    aria-label="Delete"
                  >
                    {deletingId === p.id ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Trash2 className="w-4 h-4 text-red-600" />
                    )}
                  </Button>
                ),
              }}
            />
          )}
        </CardContent>
      </Card>

      <MobileAddButton onClick={() => setShowForm(true)} label="Log USD purchase" />
    </div>
  )
}
