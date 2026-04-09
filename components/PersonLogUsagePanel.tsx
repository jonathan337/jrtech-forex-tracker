'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react'
import { format } from 'date-fns'
import { usageCardSelectLabel, type UsageCardOption } from '@/lib/usage-card-label'

type Props = {
  personId: string
  onLogged?: () => void
}

export function PersonLogUsagePanel({ personId, onLogged }: Props) {
  const [currentDate, setCurrentDate] = useState(() => new Date())
  const [cards, setCards] = useState<UsageCardOption[]>([])
  const [cardsLoading, setCardsLoading] = useState(false)
  const [cardsError, setCardsError] = useState('')
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [form, setForm] = useState({
    cardId: '',
    amountUSD: '',
    paidToOwnerTTD: '',
    usageDate: format(new Date(), 'yyyy-MM-dd'),
    notes: '',
  })

  const year = currentDate.getFullYear()
  const month = currentDate.getMonth() + 1
  const monthName = format(currentDate, 'MMMM yyyy')

  const fetchCards = useCallback(async () => {
    setCardsLoading(true)
    setCardsError('')
    try {
      const params = new URLSearchParams({
        year: String(year),
        month: String(month),
        personId,
      })
      const res = await fetch(`/api/cards?${params}`, {
        credentials: 'include',
        cache: 'no-store',
      })
      const data: unknown = await res.json().catch(() => null)
      if (res.ok && Array.isArray(data)) {
        setCards(data as UsageCardOption[])
      } else {
        setCards([])
        const body = data as { error?: string } | null
        setCardsError(
          typeof body?.error === 'string'
            ? body.error
            : `Could not load cards (${res.status}).`
        )
      }
    } catch {
      setCards([])
      setCardsError('Network error while loading cards.')
    } finally {
      setCardsLoading(false)
    }
  }, [year, month, personId])

  useEffect(() => {
    void fetchCards()
  }, [fetchCards])

  useEffect(() => {
    setForm((f) => {
      if (!f.cardId) return f
      if (!cards.some((c) => c.id === f.cardId)) {
        return { ...f, cardId: '' }
      }
      return f
    })
  }, [cards])

  useEffect(() => {
    setFormError('')
  }, [year, month, personId])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.cardId || !form.amountUSD) return
    const usageUSD = parseFloat(form.amountUSD)
    if (Number.isNaN(usageUSD) || usageUSD <= 0) return
    const amt = usageUSD

    const paidRaw = form.paidToOwnerTTD.trim()
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
          amountUSD: usageUSD,
          amountTTD: amt,
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
        onLogged?.()
      } else {
        setFormError(
          typeof data.error === 'string' ? data.error : 'Could not save usage.'
        )
      }
    } catch {
      setFormError('Network error. Try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50/40 p-4 space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm font-medium text-gray-800">Log card usage</p>
        <div className="flex items-center gap-1 justify-center sm:justify-end">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setCurrentDate(new Date(year, month - 2, 1))}
            aria-label="Previous month"
          >
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <span className="text-sm font-medium min-w-[8rem] text-center px-2">
            {monthName}
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setCurrentDate(new Date(year, month, 1))}
            aria-label="Next month"
          >
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      </div>
      <p className="text-xs text-gray-600">
        Same as the{' '}
        <Link href="/usage" className="font-medium text-blue-700 underline">
          Usage
        </Link>{' '}
        page: only cards with availability for this month appear.
      </p>
      <form onSubmit={handleSubmit} className="space-y-4">
        {formError && (
          <div className="bg-red-50 border border-red-200 text-red-800 px-3 py-2 rounded-md text-sm">
            {formError}
          </div>
        )}
        {cardsError && (
          <div className="bg-red-50 border border-red-200 text-red-800 px-3 py-2 rounded-md text-sm">
            {cardsError}
          </div>
        )}
        {cards.length === 0 && !cardsLoading && !cardsError && (
          <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
            No cards for this person have availability in {monthName}. Add availability first.
          </p>
        )}
        <div className="space-y-2">
          <Label htmlFor={`usage-card-${personId}`}>Card</Label>
          <select
            id={`usage-card-${personId}`}
            className="w-full h-10 rounded-md border border-gray-300 bg-white px-3 text-sm disabled:opacity-60"
            value={form.cardId}
            onChange={(e) =>
              setForm((f) => {
                const nextCardId = e.target.value
                return {
                  ...f,
                  cardId: nextCardId,
                }
              })
            }
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
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 lg:items-start">
          <div className="space-y-2">
            <Label htmlFor={`usage-amt-usd-${personId}`}>Usage amount (USD)</Label>
            <Input
              id={`usage-amt-usd-${personId}`}
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
            <Label htmlFor={`usage-paid-${personId}`}>
              Paid to card owner (TTD)
            </Label>
            <Input
              id={`usage-paid-${personId}`}
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
            />
            <p className="text-xs text-gray-500 leading-snug">
              Optional until you reimburse the owner.
            </p>
          </div>
          <div className="space-y-2 sm:col-span-2 lg:col-span-1">
            <Label htmlFor={`usage-date-${personId}`}>Date</Label>
            <Input
              id={`usage-date-${personId}`}
              type="date"
              value={form.usageDate}
              onChange={(e) =>
                setForm((f) => ({ ...f, usageDate: e.target.value }))
              }
            />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor={`usage-notes-${personId}`}>Notes (optional)</Label>
          <Input
            id={`usage-notes-${personId}`}
            value={form.notes}
            onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
            placeholder="e.g. groceries, transfer"
          />
        </div>
        <Button
          type="submit"
          size="sm"
          disabled={
            saving || cards.length === 0 || cardsLoading || !!cardsError
          }
        >
          {saving ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            'Save usage'
          )}
        </Button>
      </form>
    </div>
  )
}
