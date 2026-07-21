'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { useDataChanged } from '@/lib/use-data-changed'
import { format } from 'date-fns'
import Link from 'next/link'
import {
  ChevronLeft,
  ChevronRight,
  Loader2,
  Plus,
  Receipt,
  Trash2,
} from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { DatePicker } from '@/components/ui/date-picker'
import { ResponsiveTable } from '@/components/ui/responsive-table'
import { MobileAddButton } from '@/components/ui/mobile-add-button'

type PaymentRow = {
  id: string
  amountTTD: number
  paidAt: string
  notes: string | null
  personId: string | null
  personName: string | null
}

type PersonOption = { id: string; name: string }

export default function PaymentsPage() {
  const router = useRouter()
  const { status } = useSession()
  const [currentDate, setCurrentDate] = useState(new Date())
  const [loading, setLoading] = useState(true)
  // Only the very first load shows the full-page spinner; later refreshes update in place.
  const didInitialLoadRef = useRef(false)
  const [payments, setPayments] = useState<PaymentRow[]>([])
  const [people, setPeople] = useState<PersonOption[]>([])
  const [formError, setFormError] = useState('')
  const [saving, setSaving] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [form, setForm] = useState({
    personId: '',
    amountTTD: '',
    paidAt: format(new Date(), 'yyyy-MM-dd'),
    notes: '',
  })

  const year = currentDate.getFullYear()
  const month = currentDate.getMonth() + 1
  const monthName = format(currentDate, 'MMMM yyyy')

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.replace('/login')
    }
  }, [status, router])

  const fetchPayments = useCallback(async () => {
    if (!didInitialLoadRef.current) setLoading(true)
    try {
      const res = await fetch(`/api/payments?year=${year}&month=${month}`, {
        credentials: 'include',
        cache: 'no-store',
      })
      const data = await res.json().catch(() => null)
      if (res.ok && data && Array.isArray(data.payments)) {
        setPayments(data.payments as PaymentRow[])
      } else {
        setPayments([])
      }
    } catch {
      setPayments([])
    } finally {
      setLoading(false)
      didInitialLoadRef.current = true
    }
  }, [year, month])

  const fetchPeople = useCallback(async () => {
    try {
      const res = await fetch(`/api/people?year=${year}&month=${month}`, {
        credentials: 'include',
        cache: 'no-store',
      })
      const data: unknown = await res.json().catch(() => null)
      if (res.ok && Array.isArray(data)) {
        setPeople(
          data.map((p) => ({
            id: (p as { id: string }).id,
            name: (p as { name: string }).name,
          }))
        )
      } else {
        setPeople([])
      }
    } catch {
      setPeople([])
    }
  }, [year, month])

  useEffect(() => {
    if (status !== 'authenticated') return
    void fetchPayments()
    void fetchPeople()
  }, [status, fetchPayments, fetchPeople])

  useDataChanged(() => {
    if (status === 'authenticated') {
      void fetchPayments()
      void fetchPeople()
    }
  })

  useEffect(() => {
    setFormError('')
  }, [year, month])

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

  const totalMonthTTD = payments.reduce((s, p) => s + p.amountTTD, 0)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const amt = parseFloat(form.amountTTD.trim())
    if (Number.isNaN(amt) || amt <= 0) {
      setFormError('Enter a positive amount (TTD).')
      return
    }
    setSaving(true)
    setFormError('')
    try {
      const res = await fetch('/api/payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          amountTTD: amt,
          paidAt: form.paidAt,
          personId: form.personId || null,
          notes: form.notes.trim() || null,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok) {
        setForm({
          personId: '',
          amountTTD: '',
          paidAt: format(new Date(), 'yyyy-MM-dd'),
          notes: '',
        })
        setShowForm(false)
        await fetchPayments()
      } else {
        setFormError(typeof data.error === 'string' ? data.error : 'Could not save payment.')
      }
    } catch {
      setFormError('Network error. Try again.')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Remove this payment from the log?')) return
    setDeletingId(id)
    try {
      const res = await fetch(`/api/payments/${id}`, { method: 'DELETE', credentials: 'include' })
      if (res.ok) await fetchPayments()
    } finally {
      setDeletingId(null)
    }
  }

  const previousMonth = () => {
    setCurrentDate(new Date(currentDate.setMonth(currentDate.getMonth() - 1)))
  }

  const nextMonth = () => {
    setCurrentDate(new Date(currentDate.setMonth(currentDate.getMonth() + 1)))
  }

  return (
    <div className="space-y-6 min-w-0">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 space-y-1">
          <h1 className="text-2xl sm:text-3xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent inline-flex items-center gap-2">
            <Receipt className="w-7 h-7 sm:w-8 sm:h-8 text-emerald-600 shrink-0" aria-hidden />
            Payments
          </h1>
          <p className="text-gray-600 text-sm sm:text-base">
            Log money you sent (bank transfer, cash, etc.). Filtered by payment date in{' '}
            <span className="font-medium text-gray-800">{monthName}</span>.
          </p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end w-full lg:w-auto">
          <Link href="/usage" className="sm:shrink-0">
            <Button type="button" variant="outline" size="sm" className="w-full sm:w-auto">
              Usage &amp; paid to owner
            </Button>
          </Link>
          <div className="flex items-center justify-center gap-1 sm:justify-end w-full sm:w-auto">
            <Button type="button" onClick={previousMonth} variant="outline" size="sm" aria-label="Previous month">
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <span className="text-base sm:text-lg font-medium min-w-[9rem] text-center px-1 truncate">
              {monthName}
            </span>
            <Button type="button" onClick={nextMonth} variant="outline" size="sm" aria-label="Next month">
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>

      <Card className="border-l-4 border-l-emerald-500 shadow-md">
        <CardHeader className="pb-2">
          <CardTitle className="text-base sm:text-lg">This month (TTD)</CardTitle>
          <CardDescription>
            Standalone ledger only — it does not change card usage or “paid to owner” on the Usage
            page.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-3xl font-bold tabular-nums text-emerald-700">
            ${totalMonthTTD.toFixed(2)}
          </p>
          <p className="text-xs text-gray-500 mt-1">
            {payments.length} payment{payments.length === 1 ? '' : 's'} logged
          </p>
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant={showForm ? 'default' : 'outline'}
          size="sm"
          onClick={() => {
            setShowForm((v) => !v)
            if (showForm) setFormError('')
          }}
        >
          <Plus className="w-4 h-4 mr-1" />
          {showForm ? 'Hide form' : 'Log a payment'}
        </Button>
      </div>

      {showForm && (
        <Card className="border border-indigo-200 bg-indigo-50/40 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">New payment</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-3 max-w-xl">
              {formError ? (
                <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded px-3 py-2">
                  {formError}
                </p>
              ) : null}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="min-w-0">
                  <Label htmlFor="pay-person">Paid to (optional)</Label>
                  <select
                    id="pay-person"
                    value={form.personId}
                    onChange={(e) => setForm((f) => ({ ...f, personId: e.target.value }))}
                    disabled={saving}
                    className="flex h-10 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                  >
                    <option value="">— Not linked —</option>
                    {people.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="min-w-0">
                  <Label htmlFor="pay-amt">Amount (TTD) *</Label>
                  <Input
                    id="pay-amt"
                    type="number"
                    step="0.01"
                    min="0.01"
                    value={form.amountTTD}
                    onChange={(e) => setForm((f) => ({ ...f, amountTTD: e.target.value }))}
                    required
                    disabled={saving}
                  />
                </div>
                <div className="min-w-0 sm:col-span-2">
                  <Label htmlFor="pay-date">Payment date *</Label>
                  <DatePicker
                    id="pay-date"
                    value={form.paidAt}
                    onChange={(v) => setForm((f) => ({ ...f, paidAt: v }))}
                    required
                    disabled={saving}
                  />
                </div>
                <div className="min-w-0 sm:col-span-2">
                  <Label htmlFor="pay-notes">Notes</Label>
                  <Input
                    id="pay-notes"
                    value={form.notes}
                    onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                    placeholder="Optional"
                    disabled={saving}
                  />
                </div>
              </div>
              <Button type="submit" size="sm" disabled={saving}>
                {saving ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Saving…
                  </>
                ) : (
                  'Save payment'
                )}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      <Card className="shadow-md min-w-0">
        <CardHeader>
          <CardTitle className="text-lg">Payment log</CardTitle>
          <CardDescription>Records with payment date in {monthName}</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="py-12 text-center text-gray-500">Loading…</div>
          ) : (
            <ResponsiveTable<PaymentRow>
              rows={payments}
              rowKey={(p) => p.id}
              empty="No payments logged for this month."
              columns={[
                {
                  id: 'date',
                  header: 'Date',
                  mobile: 'title',
                  className: 'whitespace-nowrap tabular-nums',
                  cell: (p) => format(new Date(p.paidAt), 'MMM d, yyyy'),
                },
                {
                  id: 'amount',
                  header: 'Amount (TTD)',
                  align: 'right',
                  mobile: 'primary',
                  className: 'font-medium tabular-nums text-emerald-800',
                  cell: (p) => `$${p.amountTTD.toFixed(2)}`,
                },
                {
                  id: 'person',
                  header: 'Paid to',
                  cell: (p) => p.personName ?? '—',
                },
                {
                  id: 'notes',
                  header: 'Notes',
                  className:
                    'text-gray-600 max-w-[200px] sm:max-w-md truncate',
                  cell: (p) => p.notes ?? '—',
                },
              ]}
              actions={{
                render: (p) => (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="text-red-600 hover:text-red-700 hover:bg-red-50"
                    disabled={deletingId === p.id}
                    onClick={() => void handleDelete(p.id)}
                    aria-label="Delete payment"
                  >
                    {deletingId === p.id ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Trash2 className="w-4 h-4" />
                    )}
                  </Button>
                ),
              }}
            />
          )}
        </CardContent>
      </Card>

      <MobileAddButton
        label="Log a payment"
        onClick={() => {
          setShowForm(true)
          setFormError('')
        }}
      />
    </div>
  )
}
