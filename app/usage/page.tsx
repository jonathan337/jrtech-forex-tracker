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
import {
  usageCardSelectLabel,
  type UsageCardOption,
} from '@/lib/usage-card-label'
import { issuingBankLabel } from '@/lib/card-bank'

type CardOption = UsageCardOption

interface UsageEntry {
  id: string
  cardId: string
  year: number
  month: number
  amountUSD: number | null
  amountTTD: number
  paidToOwnerTTD: number
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
  const [cardsLoading, setCardsLoading] = useState(false)
  const [cardsError, setCardsError] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({
    cardId: '',
    amountUSD: '',
    paidToOwnerTTD: '',
    usageDate: format(new Date(), 'yyyy-MM-dd'),
    notes: '',
  })
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState({
    amountUSD: '',
    paidToOwnerTTD: '',
    usageDate: '',
    notes: '',
  })
  const [editEntryError, setEditEntryError] = useState('')
  const [savingEntryId, setSavingEntryId] = useState<string | null>(null)
  const [listActionError, setListActionError] = useState('')

  const year = currentDate.getFullYear()
  const month = currentDate.getMonth() + 1
  const rateForCardId = (cardId: string): number | null => {
    const card = cards.find((c) => c.id === cardId)
    if (!card || typeof card.effectiveExchangeRate !== 'number') return null
    return card.effectiveExchangeRate
  }

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
    setCardsLoading(true)
    setCardsError('')
    try {
      const res = await fetch(
        `/api/cards?year=${year}&month=${month}`,
        {
          credentials: 'include',
          cache: 'no-store',
        }
      )
      const data: unknown = await res.json().catch(() => null)
      if (res.ok && Array.isArray(data)) {
        setCards(data as CardOption[])
      } else {
        setCards([])
        const body = data as { error?: string } | null
        setCardsError(
          typeof body?.error === 'string'
            ? body.error
            : `Could not load cards for this month (${res.status}).`
        )
      }
    } catch (e) {
      console.error(e)
      setCards([])
      setCardsError('Network error while loading cards.')
    } finally {
      setCardsLoading(false)
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
    const usageUSD = parseFloat(form.amountUSD)
    if (Number.isNaN(usageUSD) || usageUSD <= 0) return
    const cardRate = rateForCardId(form.cardId)
    if (cardRate == null || cardRate <= 0) {
      setFormError(
        'This card has no exchange rate for this month. Add availability for this month first.'
      )
      return
    }
    const amountTTD = usageUSD * cardRate

    const paidRaw = form.paidToOwnerTTD.trim()
    const paidToOwner = paidRaw === '' ? 0 : parseFloat(paidRaw)
    if (Number.isNaN(paidToOwner) || paidToOwner < 0) {
      setFormError('Paid to owner must be a valid non-negative amount.')
      return
    }
    if (paidToOwner - amountTTD > 1e-6) {
      setFormError('Paid to owner (TTD) cannot be more than usage in TTD for this month.')
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
          amountUSD: usageUSD,
          amountTTD,
          paidToOwnerTTD: paidToOwner,
          usageDate,
          notes: form.notes.trim() || undefined,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok) {
        setForm({
          cardId: '',
          amountUSD: '',
          paidToOwnerTTD: '',
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
      amountUSD:
        typeof row.amountUSD === 'number'
          ? String(row.amountUSD)
          : '',
      paidToOwnerTTD: String(row.paidToOwnerTTD),
      usageDate: format(new Date(row.usageDate), 'yyyy-MM-dd'),
      notes: row.notes ?? '',
    })
  }

  const cancelEntryEdit = () => {
    setEditingEntryId(null)
    setEditEntryError('')
  }

  const markEntrySettled = async (row: UsageEntry) => {
    const cardRate = rateForCardId(row.cardId)
    if (typeof row.amountUSD !== 'number' || !cardRate || cardRate <= 0) return
    const settledTarget = row.amountUSD * cardRate
    if (settledTarget - row.paidToOwnerTTD <= 1e-6) return
    setSavingEntryId(row.id)
    setEditEntryError('')
    setListActionError('')
    try {
      const res = await fetch(`/api/usage/${row.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ paidToOwnerTTD: settledTarget }),
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
    const row = entries.find((e) => e.id === editingEntryId)
    const usageUSD = parseFloat(editDraft.amountUSD)
    if (Number.isNaN(usageUSD) || usageUSD <= 0) {
      setEditEntryError('Usage amount (USD) must be a positive number.')
      return
    }
    const cardRate = row ? rateForCardId(row.cardId) : null
    if (cardRate == null || cardRate <= 0) {
      setEditEntryError(
        'This card has no exchange rate for this month. Add availability for this month first.'
      )
      return
    }
    const amountTTD = usageUSD * cardRate
    const paidRaw = editDraft.paidToOwnerTTD.trim()
    const paidToOwner = paidRaw === '' ? 0 : parseFloat(paidRaw)
    if (Number.isNaN(paidToOwner) || paidToOwner < 0) {
      setEditEntryError('Paid to owner must be a valid non-negative amount.')
      return
    }
    if (paidToOwner - amountTTD > 1e-6) {
      setEditEntryError('Paid to owner (TTD) cannot be more than usage in TTD for this month.')
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
          amountUSD: usageUSD,
          amountTTD,
          paidToOwnerTTD: paidToOwner,
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
            Log TTD spent per card for months where that card already has availability (see Availability).
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
            <form onSubmit={handleSubmit} className="space-y-4">
              {formError && (
                <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-md text-sm">
                  {formError}
                </div>
              )}
              {cardsError && (
                <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-md text-sm">
                  {cardsError}
                </div>
              )}
              {cards.length === 0 && !cardsLoading && !cardsError && (
                <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-4 py-3">
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
              <div className="space-y-2 max-w-xl lg:max-w-none">
                <Label htmlFor="usage-card">Card</Label>
                <select
                  id="usage-card"
                  className="w-full h-10 rounded-md border border-gray-300 bg-white px-3 text-sm disabled:opacity-60"
                  value={form.cardId}
                  onChange={(e) => setForm((f) => ({ ...f, cardId: e.target.value }))}
                  required
                  disabled={cardsLoading || !!cardsError}
                >
                  <option value="">
                    {cardsLoading ? 'Loading cards…' : 'Select a card'}
                  </option>
                  {cards.map((c) => (
                    <option key={c.id} value={c.id}>
                      {usageCardSelectLabel(c)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 lg:items-start">
                <div className="space-y-2">
                  <Label htmlFor="usage-amount-usd">Usage amount (USD)</Label>
                  <Input
                    id="usage-amount-usd"
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
                  <Label htmlFor="usage-paid-owner">Paid to card owner (TTD)</Label>
                  <Input
                    id="usage-paid-owner"
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    value={form.paidToOwnerTTD}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        paidToOwnerTTD: e.target.value,
                      }))
                    }
                    title="Amount you have already paid back to this card’s owner for this usage. Leave empty or 0 until you pay them."
                  />
                  <p className="text-xs text-gray-500 leading-snug">
                    Optional until you reimburse the owner (same as usage or less).
                  </p>
                </div>
                <div className="space-y-2 sm:col-span-2 lg:col-span-1">
                  <Label htmlFor="usage-date">Date</Label>
                  <Input
                    id="usage-date"
                    type="date"
                    value={form.usageDate}
                    onChange={(e) => setForm((f) => ({ ...f, usageDate: e.target.value }))}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="usage-notes">Notes (optional)</Label>
                <Input
                  id="usage-notes"
                  value={form.notes}
                  onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                  placeholder="e.g. groceries, transfer"
                />
              </div>
              <div className="flex gap-2">
                <Button
                  type="submit"
                  disabled={saving || cards.length === 0 || cardsLoading || !!cardsError}
                >
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
                    <th className="text-right py-3 px-4 text-xs font-semibold text-gray-700 uppercase whitespace-nowrap">
                      Usage amount
                    </th>
                    <th className="text-right py-3 px-4 text-xs font-semibold text-gray-700 uppercase whitespace-nowrap">
                      Owed (TTD)
                    </th>
                    <th className="text-right py-3 px-4 text-xs font-semibold text-gray-700 uppercase whitespace-nowrap">
                      Paid owner (TTD)
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
                        <td className="py-3 px-4 font-medium align-top">
                          <button
                            type="button"
                            className="text-left font-medium text-blue-700 hover:text-blue-900 hover:underline w-full min-w-0"
                            onClick={() => openEntryEdit(row)}
                          >
                            <span className="block">
                              {row.card.cardNickname}
                              {row.card.lastFourDigits ? ` • ${row.card.lastFourDigits}` : ''}
                            </span>
                            {row.card.issuingBank ? (
                              <span className="mt-0.5 block text-xs font-normal text-gray-500 no-underline">
                                {issuingBankLabel(row.card.issuingBank)}
                              </span>
                            ) : null}
                          </button>
                        </td>
                        <td className="py-3 px-4 text-gray-600">{row.card.person.name}</td>
                        <td className="py-3 px-4 text-right whitespace-nowrap">
                          {(() => {
                            const usd =
                              typeof row.amountUSD === 'number'
                                ? `USD $${row.amountUSD.toFixed(2)}`
                                : 'USD —'
                            return (
                              <>
                                <span className="block text-lg font-semibold text-blue-700 leading-tight">
                                  {usd}
                                </span>
                              </>
                            )
                          })()}
                        </td>
                        <td className="py-3 px-4 text-right whitespace-nowrap">
                          {(() => {
                            const cardRate = rateForCardId(row.cardId)
                            const usageUSD =
                              typeof row.amountUSD === 'number'
                                ? row.amountUSD
                                  : null
                            if (usageUSD == null || !cardRate || cardRate <= 0) {
                              return (
                                <span className="text-gray-400 font-medium">
                                  —
                                </span>
                              )
                            }
                            const owedTTD = usageUSD * cardRate - row.paidToOwnerTTD
                            const hasOwed = owedTTD > 0.005
                            return (
                              <span
                                className={
                                  hasOwed
                                    ? 'font-semibold text-red-700'
                                    : 'font-medium text-gray-500'
                                }
                              >
                                TTD ${Math.max(0, owedTTD).toFixed(2)}
                              </span>
                            )
                          })()}
                        </td>
                        <td className="py-3 px-4 text-right text-gray-700 whitespace-nowrap">
                          TTD ${row.paidToOwnerTTD.toFixed(2)}
                        </td>
                        <td className="py-3 px-4 text-gray-600">
                          {format(new Date(row.usageDate), 'MMM d, yyyy')}
                        </td>
                        <td className="py-3 px-4 text-gray-600 max-w-xs whitespace-normal break-words">
                          {row.notes || '—'}
                        </td>
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
                            {(() => {
                              const cardRate = rateForCardId(row.cardId)
                              const usageUSD = row.amountUSD
                              if (typeof usageUSD !== 'number' || !cardRate || cardRate <= 0) {
                                return false
                              }
                              return usageUSD * cardRate - row.paidToOwnerTTD > 1e-6
                            })() && (
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
                          <td colSpan={8} className="p-4">
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
                                <Label htmlFor={`edit-amt-usd-${row.id}`}>Usage amount (USD) *</Label>
                                <Input
                                  id={`edit-amt-usd-${row.id}`}
                                  type="number"
                                  step="0.01"
                                  min="0"
                                  value={editDraft.amountUSD}
                                  onChange={(e) =>
                                    setEditDraft((d) => ({ ...d, amountUSD: e.target.value }))
                                  }
                                />
                              </div>
                              <div>
                                <Label htmlFor={`edit-paid-${row.id}`}>Paid to owner (TTD)</Label>
                                <Input
                                  id={`edit-paid-${row.id}`}
                                  type="number"
                                  step="0.01"
                                  min="0"
                                  value={editDraft.paidToOwnerTTD}
                                  onChange={(e) =>
                                    setEditDraft((d) => ({
                                      ...d,
                                      paidToOwnerTTD: e.target.value,
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
                              {(() => {
                                const usd = parseFloat(editDraft.amountUSD)
                                const cardRate = rateForCardId(row.cardId)
                                const ttd =
                                  !Number.isNaN(usd) && cardRate && cardRate > 0
                                    ? usd * cardRate
                                    : null
                                const paid = parseFloat(editDraft.paidToOwnerTTD || '0')
                                return ttd != null && ttd - paid > 1e-6
                              })() && (
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  disabled={savingEntryId === row.id}
                                  onClick={() => {
                                    const usd = parseFloat(editDraft.amountUSD)
                                    const cardRate = rateForCardId(row.cardId)
                                    const a =
                                      !Number.isNaN(usd) && cardRate && cardRate > 0
                                        ? usd * cardRate
                                        : null
                                    if (a != null)
                                      setEditDraft((d) => ({
                                        ...d,
                                        paidToOwnerTTD: String(a),
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
