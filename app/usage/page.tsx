'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ChevronLeft, ChevronRight, Loader2, Plus, Trash2 } from 'lucide-react'
import { format } from 'date-fns'

interface CardOption {
  id: string
  cardNickname: string
  person: { name: string }
}

interface UsageEntry {
  id: string
  cardId: string
  year: number
  month: number
  amountUSD: number
  usageDate: string
  notes: string | null
  card: CardOption
}

export default function UsagePage() {
  const router = useRouter()
  const { status } = useSession()
  const [currentDate, setCurrentDate] = useState(new Date())
  const [entries, setEntries] = useState<UsageEntry[]>([])
  const [cards, setCards] = useState<CardOption[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({
    cardId: '',
    amountUSD: '',
    usageDate: format(new Date(), 'yyyy-MM-dd'),
    notes: '',
  })

  const year = currentDate.getFullYear()
  const month = currentDate.getMonth() + 1

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.replace('/login')
    }
  }, [status, router])

  useEffect(() => {
    if (status === 'authenticated') {
      fetchEntries()
      fetchCards()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, month, status])

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

  const fetchEntries = async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/usage?year=${year}&month=${month}`, {
        credentials: 'include',
        cache: 'no-store',
      })
      if (res.ok) {
        setEntries(await res.json())
      }
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  const fetchCards = async () => {
    try {
      const res = await fetch(
        `/api/cards?year=${year}&month=${month}`,
        { credentials: 'include', cache: 'no-store' }
      )
      if (res.ok) {
        const data = await res.json()
        setCards(data)
      }
    } catch (e) {
      console.error(e)
    }
  }

  useEffect(() => {
    setForm((f) => {
      if (!f.cardId) return f
      if (!cards.some((c) => c.id === f.cardId)) {
        return { ...f, cardId: '' }
      }
      return f
    })
  }, [cards])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.cardId || !form.amountUSD) return
    const amt = parseFloat(form.amountUSD)
    if (Number.isNaN(amt) || amt <= 0) return

    setSaving(true)
    setFormError('')
    try {
      const usageDate = new Date(`${form.usageDate}T12:00:00`).toISOString()
      const res = await fetch('/api/usage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          cardId: form.cardId,
          year,
          month,
          amountUSD: amt,
          usageDate,
          notes: form.notes.trim() || undefined,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok) {
        setForm({
          cardId: '',
          amountUSD: '',
          usageDate: format(new Date(), 'yyyy-MM-dd'),
          notes: '',
        })
        setShowForm(false)
        fetchEntries()
      } else {
        setFormError(
          typeof data.error === 'string' ? data.error : 'Could not save usage.'
        )
      }
    } catch (err) {
      console.error(err)
      setFormError('Network error. Try again.')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this usage entry?')) return
    try {
      const res = await fetch(`/api/usage/${id}`, { method: 'DELETE' })
      if (res.ok) fetchEntries()
    } catch (e) {
      console.error(e)
    }
  }

  const monthName = format(currentDate, 'MMMM yyyy')

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
            Card usage
          </h1>
          <p className="text-gray-600 mt-1">
            Log USD spent per card for months where that card already has availability (see Availability).
            Totals roll into the dashboard.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={() => setCurrentDate(new Date(year, month - 2, 1))} variant="outline" size="sm">
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <span className="text-lg font-medium min-w-[150px] text-center">{monthName}</span>
          <Button onClick={() => setCurrentDate(new Date(year, month, 1))} variant="outline" size="sm">
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      </div>

      <Card className="shadow-md border-t-4 border-t-emerald-500">
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle className="text-xl">Log usage</CardTitle>
            <CardDescription>
              Only cards with availability for {monthName} are listed. Add availability first if a card is
              missing.
            </CardDescription>
          </div>
          <Button size="sm" onClick={() => setShowForm(!showForm)}>
            <Plus className="w-4 h-4 mr-1" />
            {showForm ? 'Close' : 'Add entry'}
          </Button>
        </CardHeader>
        {showForm && (
          <CardContent>
            <form onSubmit={handleSubmit} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 items-end">
              {formError && (
                <div className="sm:col-span-2 lg:col-span-4 bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-md text-sm">
                  {formError}
                </div>
              )}
              {cards.length === 0 && (
                <p className="sm:col-span-2 lg:col-span-4 text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-4 py-3">
                  No cards have availability for {monthName}. Add a monthly entry for a card on the{' '}
                  <Link href="/availability" className="font-medium text-blue-700 underline">
                    Availability
                  </Link>{' '}
                  page, or mark a card as always available with recurring details on{' '}
                  <Link href="/cards" className="font-medium text-blue-700 underline">
                    Cards
                  </Link>
                  .
                </p>
              )}
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="usage-card">Card</Label>
                <select
                  id="usage-card"
                  className="w-full h-10 rounded-md border border-gray-300 bg-white px-3 text-sm"
                  value={form.cardId}
                  onChange={(e) => setForm((f) => ({ ...f, cardId: e.target.value }))}
                  required
                >
                  <option value="">Select a card</option>
                  {cards.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.cardNickname} — {c.person.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="usage-amount">Amount (USD)</Label>
                <Input
                  id="usage-amount"
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0.00"
                  value={form.amountUSD}
                  onChange={(e) => setForm((f) => ({ ...f, amountUSD: e.target.value }))}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="usage-date">Date</Label>
                <Input
                  id="usage-date"
                  type="date"
                  value={form.usageDate}
                  onChange={(e) => setForm((f) => ({ ...f, usageDate: e.target.value }))}
                />
              </div>
              <div className="space-y-2 sm:col-span-2 lg:col-span-4">
                <Label htmlFor="usage-notes">Notes (optional)</Label>
                <Input
                  id="usage-notes"
                  value={form.notes}
                  onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                  placeholder="e.g. groceries, transfer"
                />
              </div>
              <div className="sm:col-span-2 lg:col-span-4 flex gap-2">
                <Button type="submit" disabled={saving || cards.length === 0}>
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save usage'}
                </Button>
              </div>
            </form>
          </CardContent>
        )}
      </Card>

      <Card className="shadow-md">
        <CardHeader>
          <CardTitle>Entries for {monthName}</CardTitle>
          <CardDescription>Each line is one usage record. Delete to correct mistakes.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="py-12 text-center text-gray-500">Loading…</div>
          ) : entries.length === 0 ? (
            <div className="py-12 text-center text-gray-500 px-6">
              No usage logged for this month yet.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-50 border-b">
                    <th className="text-left py-3 px-4 text-xs font-semibold text-gray-700 uppercase">Card</th>
                    <th className="text-left py-3 px-4 text-xs font-semibold text-gray-700 uppercase">Owner</th>
                    <th className="text-right py-3 px-4 text-xs font-semibold text-gray-700 uppercase">Amount</th>
                    <th className="text-left py-3 px-4 text-xs font-semibold text-gray-700 uppercase">Date</th>
                    <th className="text-left py-3 px-4 text-xs font-semibold text-gray-700 uppercase">Notes</th>
                    <th className="w-12 py-3 px-4" />
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {entries.map((row) => (
                    <tr key={row.id} className="hover:bg-gray-50">
                      <td className="py-3 px-4 font-medium">{row.card.cardNickname}</td>
                      <td className="py-3 px-4 text-gray-600">{row.card.person.name}</td>
                      <td className="py-3 px-4 text-right font-semibold text-amber-700">
                        ${row.amountUSD.toFixed(2)}
                      </td>
                      <td className="py-3 px-4 text-gray-600">
                        {format(new Date(row.usageDate), 'MMM d, yyyy')}
                      </td>
                      <td className="py-3 px-4 text-gray-600 max-w-xs truncate">{row.notes || '—'}</td>
                      <td className="py-3 px-4">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="text-red-600 hover:text-red-700"
                          onClick={() => handleDelete(row.id)}
                          title="Delete"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
