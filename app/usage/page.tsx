'use client'

import { useState, useEffect, useCallback, Fragment } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  ChevronLeft,
  ChevronRight,
  Loader2,
  Plus,
  Trash2,
  Pencil,
  CheckCircle2,
} from 'lucide-react'
import { format } from 'date-fns'
import { usageAmountPaidSync } from '@/lib/usage-paid-sync'

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
  paidToOwnerUSD: number
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
    paidToOwnerUSD: '',
    usageDate: format(new Date(), 'yyyy-MM-dd'),
    notes: '',
  })
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState({
    amountUSD: '',
    paidToOwnerUSD: '',
    usageDate: '',
    notes: '',
  })
  const [editEntryError, setEditEntryError] = useState('')
  const [savingEntryId, setSavingEntryId] = useState<string | null>(null)
  const [listActionError, setListActionError] = useState('')

  const year = currentDate.getFullYear()
  const month = currentDate.getMonth() + 1

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.replace('/login')
    }
  }, [status, router])

  const fetchEntries = useCallback(async () => {
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
  }, [year, month])

  const fetchCards = useCallback(async () => {
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
  }, [year, month])

  useEffect(() => {
    if (status === 'authenticated') {
      void fetchEntries()
      void fetchCards()
    }
  }, [year, month, status, fetchEntries, fetchCards])

  useEffect(() => {
    setFormError('')
    setEditingEntryId(null)
    setEditEntryError('')
    setListActionError('')
  }, [year, month])

  useEffect(() => {
    setForm((f) => {
      if (!f.cardId) return f
      if (!cards.some((c) => c.id === f.cardId)) {
        return { ...f, cardId: '' }
      }
      return f
    })
  }, [cards])

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.cardId || !form.amountUSD) return
    const amt = parseFloat(form.amountUSD)
    if (Number.isNaN(amt) || amt <= 0) return

    const paidRaw = form.paidToOwnerUSD.trim()
    const paidToOwner = paidRaw === '' ? 0 : parseFloat(paidRaw)
    if (Number.isNaN(paidToOwner) || paidToOwner < 0) {
      setFormError('Paid to owner must be a valid non-negative amount.')
      return
    }
    if (paidToOwner - amt > 1e-6) {
      setFormError('Paid to owner cannot be more than the usage amount.')
      return
    }

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
          paidToOwnerUSD: paidToOwner,
          usageDate,
          notes: form.notes.trim() || undefined,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok) {
        setForm({
          cardId: '',
          amountUSD: '',
          paidToOwnerUSD: '',
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
      if (res.ok) {
        setEditingEntryId((eid) => (eid === id ? null : eid))
        fetchEntries()
      }
    } catch (e) {
      console.error(e)
    }
  }

  const openEntryEdit = (row: UsageEntry) => {
    setEditEntryError('')
    setListActionError('')
    setEditingEntryId(row.id)
    setEditDraft({
      amountUSD: String(row.amountUSD),
      paidToOwnerUSD: String(row.paidToOwnerUSD),
      usageDate: format(new Date(row.usageDate), 'yyyy-MM-dd'),
      notes: row.notes ?? '',
    })
  }

  const cancelEntryEdit = () => {
    setEditingEntryId(null)
    setEditEntryError('')
  }

  const markEntrySettled = async (row: UsageEntry) => {
    if (row.amountUSD - row.paidToOwnerUSD <= 1e-6) return
    setSavingEntryId(row.id)
    setEditEntryError('')
    setListActionError('')
    try {
      const res = await fetch(`/api/usage/${row.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ paidToOwnerUSD: row.amountUSD }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok) {
        if (editingEntryId === row.id) cancelEntryEdit()
        await fetchEntries()
      } else {
        const msg =
          typeof data.error === 'string' ? data.error : 'Could not update entry.'
        setListActionError(msg)
      }
    } catch {
      setListActionError('Network error. Try again.')
    } finally {
      setSavingEntryId(null)
    }
  }

  const saveEntryEdit = async () => {
    if (!editingEntryId) return
    const amt = parseFloat(editDraft.amountUSD)
    if (Number.isNaN(amt) || amt <= 0) {
      setEditEntryError('Amount must be a positive number.')
      return
    }
    const paidRaw = editDraft.paidToOwnerUSD.trim()
    const paidToOwner = paidRaw === '' ? 0 : parseFloat(paidRaw)
    if (Number.isNaN(paidToOwner) || paidToOwner < 0) {
      setEditEntryError('Paid to owner must be a valid non-negative amount.')
      return
    }
    if (paidToOwner - amt > 1e-6) {
      setEditEntryError('Paid to owner cannot be more than the usage amount.')
      return
    }

    setSavingEntryId(editingEntryId)
    setEditEntryError('')
    try {
      const usageDate = new Date(`${editDraft.usageDate}T12:00:00`).toISOString()
      const res = await fetch(`/api/usage/${editingEntryId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          amountUSD: amt,
          paidToOwnerUSD: paidToOwner,
          usageDate,
          notes: editDraft.notes.trim() || null,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok) {
        cancelEntryEdit()
        await fetchEntries()
      } else {
        setEditEntryError(
          typeof data.error === 'string' ? data.error : 'Could not save changes.'
        )
      }
    } catch {
      setEditEntryError('Network error. Try again.')
    } finally {
      setSavingEntryId(null)
    }
  }

  const monthName = format(currentDate, 'MMMM yyyy')

  return (
    <div className="space-y-6 min-w-0">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between min-w-0">
        <div className="min-w-0">
          <h1 className="text-2xl sm:text-3xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
            Card usage
          </h1>
          <p className="text-gray-600 mt-1 text-sm sm:text-base">
            Log USD spent per card for months where that card already has availability (see Availability).
            Totals roll into the dashboard.
          </p>
        </div>
        <div className="flex items-center justify-center gap-1 sm:justify-end w-full lg:w-auto shrink-0">
          <Button
            onClick={() => setCurrentDate(new Date(year, month - 2, 1))}
            variant="outline"
            size="sm"
            aria-label="Previous month"
          >
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <span className="text-base sm:text-lg font-medium flex-1 sm:flex-initial sm:min-w-[9rem] text-center px-1 truncate">
            {monthName}
          </span>
          <Button
            onClick={() => setCurrentDate(new Date(year, month, 1))}
            variant="outline"
            size="sm"
            aria-label="Next month"
          >
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      </div>

      <Card className="shadow-md border-t-4 border-t-emerald-500 min-w-0 overflow-hidden">
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:space-y-0">
          <div className="min-w-0">
            <CardTitle className="text-xl">Log usage</CardTitle>
            <CardDescription className="break-words">
              Only cards with availability for {monthName} are listed. Add availability first if a card is
              missing.
            </CardDescription>
          </div>
          <Button
            size="sm"
            className="shrink-0 self-start sm:self-auto"
            onClick={() => setShowForm(!showForm)}
          >
            <Plus className="w-4 h-4 mr-1" />
            {showForm ? 'Close' : 'Add entry'}
          </Button>
        </CardHeader>
        {showForm && (
          <CardContent>
            <form onSubmit={handleSubmit} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-6 items-end">
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
                  onChange={(e) =>
                    setForm((f) => ({
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
                />
              </div>
              <div className="space-y-2 sm:col-span-1">
                <Label htmlFor="usage-paid-owner">Paid to card owner (USD)</Label>
                <Input
                  id="usage-paid-owner"
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0.00 if not paid yet"
                  value={form.paidToOwnerUSD}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, paidToOwnerUSD: e.target.value }))
                  }
                  title="Amount you have already paid back to this card’s owner for this usage. Leave empty or 0 until you pay them."
                />
                <p className="text-xs text-gray-500">
                  Leave empty or 0 while you still owe them; increase when you reimburse.
                </p>
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

      <Card className="shadow-md min-w-0 overflow-hidden">
        <CardHeader>
          <CardTitle>Entries for {monthName}</CardTitle>
          <CardDescription>
            Click <strong>Edit</strong> to update amounts or mark what you paid the card owner. Use{' '}
            <strong>Mark settled</strong> to set &quot;paid to owner&quot; equal to the usage in one step.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0 min-w-0">
          {loading ? (
            <div className="py-12 text-center text-gray-500">Loading…</div>
          ) : entries.length === 0 ? (
            <div className="py-12 text-center text-gray-500 px-6">
              No usage logged for this month yet.
            </div>
          ) : (
            <div className="overflow-x-auto touch-pan-x [scrollbar-gutter:stable]">
              {listActionError && (
                <div className="px-4 py-2 text-sm text-red-800 bg-red-50 border-b border-red-100">
                  {listActionError}
                </div>
              )}
              <table className="w-full min-w-[46rem] text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b">
                    <th className="text-left py-3 px-4 text-xs font-semibold text-gray-700 uppercase">Card</th>
                    <th className="text-left py-3 px-4 text-xs font-semibold text-gray-700 uppercase">Owner</th>
                    <th className="text-right py-3 px-4 text-xs font-semibold text-gray-700 uppercase">Amount</th>
                    <th className="text-right py-3 px-4 text-xs font-semibold text-gray-700 uppercase whitespace-nowrap">
                      Paid owner
                    </th>
                    <th className="text-left py-3 px-4 text-xs font-semibold text-gray-700 uppercase">Date</th>
                    <th className="text-left py-3 px-4 text-xs font-semibold text-gray-700 uppercase">Notes</th>
                    <th className="text-right py-3 px-4 text-xs font-semibold text-gray-700 uppercase whitespace-nowrap">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {entries.map((row) => (
                    <Fragment key={row.id}>
                      <tr
                        className={`hover:bg-gray-50 ${
                          editingEntryId === row.id ? 'bg-blue-50/60' : ''
                        }`}
                      >
                        <td className="py-3 px-4 font-medium">
                          <button
                            type="button"
                            className="text-left font-medium text-blue-700 hover:text-blue-900 hover:underline"
                            onClick={() => openEntryEdit(row)}
                          >
                            {row.card.cardNickname}
                          </button>
                        </td>
                        <td className="py-3 px-4 text-gray-600">{row.card.person.name}</td>
                        <td className="py-3 px-4 text-right font-semibold text-amber-700">
                          ${row.amountUSD.toFixed(2)}
                        </td>
                        <td className="py-3 px-4 text-right text-gray-700 whitespace-nowrap">
                          ${row.paidToOwnerUSD.toFixed(2)}
                          {row.amountUSD - row.paidToOwnerUSD > 1e-6 && (
                            <span className="block text-xs text-red-600 font-medium">
                              Owed: ${(row.amountUSD - row.paidToOwnerUSD).toFixed(2)}
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-gray-600">
                          {format(new Date(row.usageDate), 'MMM d, yyyy')}
                        </td>
                        <td className="py-3 px-4 text-gray-600 max-w-xs truncate">{row.notes || '—'}</td>
                        <td className="py-3 px-4 text-right whitespace-nowrap">
                          <div className="inline-flex items-center gap-0.5">
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-8 w-8 p-0 text-blue-600 hover:bg-blue-50"
                              onClick={() => openEntryEdit(row)}
                              title="Edit usage & payment to owner"
                            >
                              <Pencil className="w-4 h-4" />
                            </Button>
                            {row.amountUSD - row.paidToOwnerUSD > 1e-6 && (
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-8 px-2 inline-flex items-center gap-0.5 text-green-700 hover:bg-green-50 text-xs font-medium"
                                disabled={savingEntryId === row.id}
                                onClick={() => markEntrySettled(row)}
                                title="Set paid to owner equal to usage (fully settled)"
                              >
                                {savingEntryId === row.id ? (
                                  <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                  <>
                                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                                    Settled
                                  </>
                                )}
                              </Button>
                            )}
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-8 w-8 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
                              onClick={() => handleDelete(row.id)}
                              title="Delete"
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                      {editingEntryId === row.id && (
                        <tr className="bg-blue-50/40 border-b border-blue-100">
                          <td colSpan={7} className="p-4">
                            {editEntryError && (
                              <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded px-3 py-2 mb-3">
                                {editEntryError}
                              </p>
                            )}
                            <p className="text-sm font-medium text-gray-800 mb-3">
                              Edit usage — {row.card.cardNickname} ({row.card.person.name})
                            </p>
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-3">
                              <div>
                                <Label htmlFor={`edit-amt-${row.id}`}>Amount (USD) *</Label>
                                <Input
                                  id={`edit-amt-${row.id}`}
                                  type="number"
                                  step="0.01"
                                  min="0.01"
                                  value={editDraft.amountUSD}
                                  onChange={(e) =>
                                    setEditDraft((d) => ({
                                      ...d,
                                      amountUSD: e.target.value,
                                      paidToOwnerUSD: usageAmountPaidSync(
                                        d.amountUSD,
                                        d.paidToOwnerUSD,
                                        e.target.value
                                      ),
                                    }))
                                  }
                                />
                              </div>
                              <div>
                                <Label htmlFor={`edit-paid-${row.id}`}>Paid to owner (USD)</Label>
                                <Input
                                  id={`edit-paid-${row.id}`}
                                  type="number"
                                  step="0.01"
                                  min="0"
                                  value={editDraft.paidToOwnerUSD}
                                  onChange={(e) =>
                                    setEditDraft((d) => ({
                                      ...d,
                                      paidToOwnerUSD: e.target.value,
                                    }))
                                  }
                                />
                              </div>
                              <div>
                                <Label htmlFor={`edit-date-${row.id}`}>Date</Label>
                                <Input
                                  id={`edit-date-${row.id}`}
                                  type="date"
                                  value={editDraft.usageDate}
                                  onChange={(e) =>
                                    setEditDraft((d) => ({
                                      ...d,
                                      usageDate: e.target.value,
                                    }))
                                  }
                                />
                              </div>
                              <div className="sm:col-span-2 lg:col-span-1">
                                <Label htmlFor={`edit-notes-${row.id}`}>Notes</Label>
                                <Input
                                  id={`edit-notes-${row.id}`}
                                  value={editDraft.notes}
                                  onChange={(e) =>
                                    setEditDraft((d) => ({ ...d, notes: e.target.value }))
                                  }
                                />
                              </div>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              <Button
                                type="button"
                                size="sm"
                                onClick={saveEntryEdit}
                                disabled={savingEntryId === row.id}
                              >
                                {savingEntryId === row.id ? (
                                  <>
                                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                    Saving…
                                  </>
                                ) : (
                                  'Save changes'
                                )}
                              </Button>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={cancelEntryEdit}
                                disabled={savingEntryId === row.id}
                              >
                                Cancel
                              </Button>
                              {parseFloat(editDraft.amountUSD) -
                                parseFloat(editDraft.paidToOwnerUSD || '0') >
                                1e-6 && (
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  disabled={savingEntryId === row.id}
                                  onClick={() => {
                                    const a = parseFloat(editDraft.amountUSD)
                                    if (!Number.isNaN(a))
                                      setEditDraft((d) => ({
                                        ...d,
                                        paidToOwnerUSD: String(a),
                                      }))
                                  }}
                                >
                                  Match paid to full usage
                                </Button>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
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
