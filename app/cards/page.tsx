'use client'

import { useState, useEffect, useRef, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Plus,
  Edit,
  Trash2,
  X,
  CreditCard as CreditCardIcon,
  User,
  Loader2,
  ChevronRight,
} from 'lucide-react'
import { useGroupByOwner } from '@/hooks/use-group-by-owner'
import {
  ISSUING_BANK_CODES,
  ISSUING_BANK_LABELS,
  issuingBankLabel,
  type IssuingBankCode,
} from '@/lib/card-bank'

interface Person {
  id: string
  name: string
}

interface CardType {
  id: string
  cardNickname: string
  issuingBank: string | null
  lastFourDigits: string | null
  notes: string | null
  alwaysAvailable: boolean
  recurringAmountUSD: number | null
  recurringExchangeRate: number | null
  recurringPaymentDay: number | null
  recurringNotes: string | null
  person: Person
  monthlyAvailability: Array<{
    id: string
    year: number
    month: number
  }>
}

const emptyForm = () => ({
  personId: '',
  cardNickname: '',
  issuingBank: '' as '' | IssuingBankCode,
  lastFourDigits: '',
  notes: '',
  alwaysAvailable: false,
  recurringAmountUSD: '',
  recurringExchangeRate: '',
  recurringPaymentDay: '',
  recurringNotes: '',
})

export default function CardsPage() {
  const router = useRouter()
  const { status } = useSession()
  const [cards, setCards] = useState<CardType[]>([])
  const [people, setPeople] = useState<Person[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editingCard, setEditingCard] = useState<CardType | null>(null)
  const [formData, setFormData] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const savingLockRef = useRef(false)
  const [formError, setFormError] = useState('')
  const [groupByOwner, setGroupByOwner] = useGroupByOwner()
  /** User baseline TTD/USD from Settings; used to prefill recurring exchange on new cards. */
  const [defaultExchangeRate, setDefaultExchangeRate] = useState<number | null>(
    null
  )

  const ownerGroups = useMemo(() => {
    const map = new Map<string, { person: Person; cards: CardType[] }>()
    for (const c of cards) {
      const pid = c.person.id
      if (!map.has(pid)) map.set(pid, { person: c.person, cards: [] })
      map.get(pid)!.cards.push(c)
    }
    for (const g of map.values()) {
      g.cards.sort((a, b) => a.cardNickname.localeCompare(b.cardNickname))
    }
    return [...map.values()].sort((a, b) =>
      a.person.name.localeCompare(b.person.name)
    )
  }, [cards])

  const cardsSortedFlat = useMemo(
    () =>
      [...cards].sort((a, b) => a.cardNickname.localeCompare(b.cardNickname)),
    [cards]
  )

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.replace('/login')
    }
  }, [status, router])

  useEffect(() => {
    if (status !== 'authenticated') return

    let cancelled = false

    const load = async () => {
      setLoading(true)
      setLoadError('')
      try {
        const [cardsRes, peopleRes, settingsRes] = await Promise.all([
          fetch('/api/cards', { credentials: 'include', cache: 'no-store' }),
          fetch('/api/people', { credentials: 'include', cache: 'no-store' }),
          fetch('/api/settings', { credentials: 'include', cache: 'no-store' }),
        ])

        if (cancelled) return

        const errs: string[] = []

        if (settingsRes.ok) {
          const s = await settingsRes.json()
          if (typeof s.defaultExchangeRate === 'number') {
            setDefaultExchangeRate(s.defaultExchangeRate)
          }
        }

        if (cardsRes.ok) {
          setCards(await cardsRes.json())
        } else {
          const body = await cardsRes.json().catch(() => ({}))
          setCards([])
          errs.push(
            typeof body.error === 'string'
              ? body.error
              : `Could not load cards (${cardsRes.status}).`
          )
          if (typeof body.detail === 'string') errs.push(body.detail)
        }

        if (peopleRes.ok) {
          setPeople(await peopleRes.json())
        } else {
          const body = await peopleRes.json().catch(() => ({}))
          setPeople([])
          errs.push(
            typeof body.error === 'string'
              ? body.error
              : `Could not load people (${peopleRes.status}).`
          )
          if (typeof body.detail === 'string') errs.push(body.detail)
        }

        if (errs.length) setLoadError(errs.filter(Boolean).join(' '))
      } catch (error) {
        console.error('Error fetching cards:', error)
        if (!cancelled) {
          setLoadError('Network error while loading cards.')
          setCards([])
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [status])

  /** If baseline loads after the add form is open, prefill an empty recurring rate. */
  useEffect(() => {
    if (defaultExchangeRate == null || !showForm || editingCard != null) return
    setFormData((prev) => {
      if (!prev.alwaysAvailable || prev.recurringExchangeRate !== '') return prev
      return { ...prev, recurringExchangeRate: String(defaultExchangeRate) }
    })
  }, [defaultExchangeRate, showForm, editingCard])

  const fetchCards = async () => {
    setLoading(true)
    setLoadError('')
    try {
      const response = await fetch('/api/cards', {
        credentials: 'include',
        cache: 'no-store',
      })
      if (response.ok) {
        const data = await response.json()
        setCards(data)
      } else {
        const body = await response.json().catch(() => ({}))
        const parts = [
          typeof body.error === 'string'
            ? body.error
            : `Could not load cards (${response.status}).`,
          typeof body.detail === 'string' ? body.detail : '',
        ].filter(Boolean)
        setLoadError(parts.join(' '))
      }
    } catch (error) {
      console.error('Error fetching cards:', error)
      setLoadError('Network error while loading cards.')
    } finally {
      setLoading(false)
    }
  }

  const buildPayload = () => {
    const base = {
      personId: formData.personId,
      cardNickname: formData.cardNickname,
      issuingBank: formData.issuingBank
        ? (formData.issuingBank as IssuingBankCode)
        : null,
      lastFourDigits: formData.lastFourDigits || undefined,
      notes: formData.notes || undefined,
      alwaysAvailable: formData.alwaysAvailable,
    }
    if (!formData.alwaysAvailable) {
      return base
    }
    return {
      ...base,
      recurringAmountUSD: parseFloat(formData.recurringAmountUSD),
      recurringExchangeRate: parseFloat(formData.recurringExchangeRate),
      recurringPaymentDay: parseInt(formData.recurringPaymentDay, 10),
      recurringNotes: formData.recurringNotes || undefined,
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (savingLockRef.current) return
    savingLockRef.current = true
    setSaving(true)
    setFormError('')
    if (!formData.issuingBank) {
      setFormError('Please select the issuing bank.')
      savingLockRef.current = false
      setSaving(false)
      return
    }
    try {
      const url = editingCard ? `/api/cards/${editingCard.id}` : '/api/cards'
      const method = editingCard ? 'PUT' : 'POST'

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildPayload()),
      })

      if (response.ok) {
        await fetchCards()
        resetForm()
      } else {
        const data = await response.json().catch(() => ({}))
        if (data.details && Array.isArray(data.details)) {
          const first = data.details[0]
          setFormError(
            typeof first?.message === 'string'
              ? first.message
              : 'Please fix the highlighted fields.'
          )
        } else {
          setFormError(
            typeof data.error === 'string' ? data.error : 'Could not save this card.'
          )
        }
      }
    } catch (error) {
      console.error('Error saving card:', error)
    } finally {
      savingLockRef.current = false
      setSaving(false)
    }
  }

  const handleEdit = (card: CardType) => {
    setEditingCard(card)
    setFormError('')
    setFormData({
      personId: card.person.id,
      cardNickname: card.cardNickname,
      issuingBank: (card.issuingBank as IssuingBankCode | null) ?? '',
      lastFourDigits: card.lastFourDigits || '',
      notes: card.notes || '',
      alwaysAvailable: card.alwaysAvailable ?? false,
      recurringAmountUSD:
        card.recurringAmountUSD != null ? String(card.recurringAmountUSD) : '',
      recurringExchangeRate:
        card.recurringExchangeRate != null ? String(card.recurringExchangeRate) : '',
      recurringPaymentDay:
        card.recurringPaymentDay != null ? String(card.recurringPaymentDay) : '',
      recurringNotes: card.recurringNotes || '',
    })
    setShowForm(true)
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this card?')) return

    try {
      const response = await fetch(`/api/cards/${id}`, {
        method: 'DELETE',
      })

      if (response.ok) {
        await fetchCards()
      }
    } catch (error) {
      console.error('Error deleting card:', error)
    }
  }

  const resetForm = () => {
    setFormData(emptyForm())
    setEditingCard(null)
    setFormError('')
    setShowForm(false)
  }

  const newCardFormBaselineRate = () =>
    defaultExchangeRate != null ? String(defaultExchangeRate) : ''

  const openAddForm = () => {
    setEditingCard(null)
    setFormError('')
    setFormData({
      ...emptyForm(),
      recurringExchangeRate: newCardFormBaselineRate(),
    })
    setShowForm(true)
  }

  if (status === 'loading' || status === 'unauthenticated') {
    return (
      <div className="min-h-[40vh] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    )
  }

  return (
    <div className="space-y-6 min-w-0">
      {loadError && (
        <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-md text-sm">
          {loadError}
        </div>
      )}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl sm:text-3xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
            Cards
          </h1>
          <p className="text-gray-600 mt-1 text-sm sm:text-base">
            Manage credit cards that provide foreign currency access
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={groupByOwner}
              onChange={(e) => setGroupByOwner(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
            />
            Group by owner
          </label>
          <Button onClick={openAddForm} className="shadow-lg">
            <Plus className="w-4 h-4 mr-2" />
            Add Card
          </Button>
        </div>
      </div>

      {showForm && (
        <Card className="border-2 border-blue-200 shadow-xl min-w-0 overflow-hidden">
          <CardHeader className="bg-gradient-to-r from-blue-50 to-indigo-50">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between min-w-0">
              <div className="min-w-0">
                <CardTitle className="text-xl">
                  {editingCard ? 'Edit Card' : 'Add New Card'}
                </CardTitle>
                <p className="text-sm text-gray-600 mt-1 break-words">
                  {editingCard ? 'Update card information' : 'Register a new credit card'}
                </p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="shrink-0 self-end sm:self-auto"
                onClick={resetForm}
                disabled={saving}
                aria-label="Close form"
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="pt-6">
            <form onSubmit={handleSubmit} className="space-y-4">
              {formError && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md text-sm">
                  {formError}
                </div>
              )}
              <div>
                <Label htmlFor="personId">Card Owner *</Label>
                <select
                  id="personId"
                  value={formData.personId}
                  onChange={(e) =>
                    setFormData({ ...formData, personId: e.target.value })
                  }
                  required
                  disabled={saving}
                  className="flex h-10 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm ring-offset-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <option value="">Select a person</option>
                  {people.map((person) => (
                    <option key={person.id} value={person.id}>
                      {person.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <Label htmlFor="cardNickname">Card Nickname *</Label>
                <Input
                  id="cardNickname"
                  value={formData.cardNickname}
                  onChange={(e) =>
                    setFormData({ ...formData, cardNickname: e.target.value })
                  }
                  placeholder="e.g., John's Visa"
                  required
                  disabled={saving}
                />
              </div>
              <div>
                <Label htmlFor="issuingBank">Issuing bank *</Label>
                <select
                  id="issuingBank"
                  value={formData.issuingBank}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      issuingBank: e.target.value as IssuingBankCode | '',
                    })
                  }
                  required
                  disabled={saving}
                  className="flex h-10 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm ring-offset-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <option value="">Select bank</option>
                  {ISSUING_BANK_CODES.map((code) => (
                    <option key={code} value={code}>
                      {ISSUING_BANK_LABELS[code]}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <Label htmlFor="lastFourDigits">Last 4 Digits</Label>
                <Input
                  id="lastFourDigits"
                  value={formData.lastFourDigits}
                  onChange={(e) =>
                    setFormData({ ...formData, lastFourDigits: e.target.value })
                  }
                  placeholder="1234"
                  maxLength={4}
                  disabled={saving}
                />
              </div>
              <div>
                <Label htmlFor="notes">Notes</Label>
                <textarea
                  id="notes"
                  value={formData.notes}
                  onChange={(e) =>
                    setFormData({ ...formData, notes: e.target.value })
                  }
                  className="flex min-h-[80px] w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm ring-offset-white placeholder:text-gray-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  placeholder="Payment arrangements, special conditions..."
                  disabled={saving}
                />
              </div>

              <div className="rounded-lg border border-indigo-200 bg-indigo-50/50 p-4 space-y-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.alwaysAvailable}
                    onChange={(e) => {
                      const checked = e.target.checked
                      setFormData((prev) => {
                        const next = { ...prev, alwaysAvailable: checked }
                        if (
                          checked &&
                          !editingCard &&
                          prev.recurringExchangeRate === '' &&
                          defaultExchangeRate != null
                        ) {
                          next.recurringExchangeRate =
                            String(defaultExchangeRate)
                        }
                        return next
                      })
                    }}
                    disabled={saving}
                    className="w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                  />
                  <span className="font-medium text-gray-900">
                    Always available (every month)
                  </span>
                </label>
                <p className="text-xs text-gray-600">
                  The dashboard will show this card for every month using the values below. If you add
                  a specific month under Availability for this card, that entry is used instead for
                  that month.
                </p>

                {formData.alwaysAvailable && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-indigo-100">
                    <div>
                      <Label htmlFor="recurringAmountUSD">Amount (USD) *</Label>
                      <Input
                        id="recurringAmountUSD"
                        type="number"
                        step="0.01"
                        value={formData.recurringAmountUSD}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            recurringAmountUSD: e.target.value,
                          })
                        }
                        required={formData.alwaysAvailable}
                        disabled={saving}
                      />
                    </div>
                    <div>
                      <Label htmlFor="recurringExchangeRate">
                        Exchange rate (TTD/USD) *
                      </Label>
                      <Input
                        id="recurringExchangeRate"
                        type="number"
                        step="0.0001"
                        value={formData.recurringExchangeRate}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            recurringExchangeRate: e.target.value,
                          })
                        }
                        placeholder={
                          defaultExchangeRate != null
                            ? String(defaultExchangeRate)
                            : 'e.g. 6.7993'
                        }
                        required={formData.alwaysAvailable}
                        disabled={saving}
                      />
                      {!editingCard && defaultExchangeRate != null && (
                        <p className="text-xs text-gray-500 mt-1">
                          Starts as your baseline rate from Settings; change if
                          this card uses a different rate.
                        </p>
                      )}
                    </div>
                    <div>
                      <Label htmlFor="recurringPaymentDay">Payment day of month (1–31) *</Label>
                      <Input
                        id="recurringPaymentDay"
                        type="number"
                        min={1}
                        max={31}
                        value={formData.recurringPaymentDay}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            recurringPaymentDay: e.target.value,
                          })
                        }
                        required={formData.alwaysAvailable}
                        disabled={saving}
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <Label htmlFor="recurringNotes">Recurring notes</Label>
                      <textarea
                        id="recurringNotes"
                        value={formData.recurringNotes}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            recurringNotes: e.target.value,
                          })
                        }
                        className="flex min-h-[60px] w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm ring-offset-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:opacity-50"
                        placeholder="Shown with each month on the dashboard"
                        disabled={saving}
                      />
                    </div>
                  </div>
                )}
              </div>

              <div className="flex gap-2 pt-4 border-t">
                <Button type="submit" className="px-8" disabled={saving}>
                  {saving ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      {editingCard ? 'Updating…' : 'Creating…'}
                    </>
                  ) : editingCard ? (
                    'Update'
                  ) : (
                    'Create'
                  )}
                </Button>
                <Button type="button" variant="outline" onClick={resetForm} disabled={saving}>
                  Cancel
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {loading ? (
        <div className="text-center py-12">
          <div className="inline-block w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
          <p className="text-gray-500 mt-4">Loading cards...</p>
        </div>
      ) : cards.length === 0 ? (
        <Card className="shadow-md">
          <CardContent className="py-12 text-center">
            <CreditCardIcon className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-700 mb-2">No Cards Added</h3>
            <p className="text-gray-500 mb-4">Add your first credit card to start tracking</p>
            <Button onClick={openAddForm}>
              <Plus className="w-4 h-4 mr-2" />
              Add First Card
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          {groupByOwner ? (
            <div className="space-y-10">
              {ownerGroups.map((group) => (
                <section key={group.person.id} className="space-y-4">
                  <div className="flex flex-wrap items-baseline gap-2 border-b border-gray-200 pb-2">
                    <User className="w-5 h-5 text-gray-500 shrink-0 translate-y-0.5" />
                    <h2 className="text-lg font-semibold text-gray-900">
                      {group.person.name}
                    </h2>
                    <span className="text-sm text-gray-500">
                      {group.cards.length} card{group.cards.length !== 1 ? 's' : ''}
                    </span>
                  </div>
                  <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {group.cards.map((card) => (
                      <Card
                        key={card.id}
                        role="button"
                        tabIndex={0}
                        className="shadow-md hover:shadow-lg transition-shadow cursor-pointer group border border-transparent hover:border-blue-200/80 min-w-0 overflow-hidden"
                        onClick={() => router.push(`/cards/${card.id}`)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault()
                            router.push(`/cards/${card.id}`)
                          }
                        }}
                      >
                        <CardHeader className="bg-gradient-to-r from-blue-50 to-cyan-50 border-b">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-center gap-3 min-w-0">
                              <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center shrink-0">
                                <CreditCardIcon className="w-6 h-6 text-white" />
                              </div>
                              <div className="min-w-0">
                                <CardTitle className="text-lg truncate">
                                  {card.cardNickname}
                                </CardTitle>
                                <p className="text-xs text-gray-500">
                                  {issuingBankLabel(card.issuingBank)}
                                </p>
                                {card.lastFourDigits && (
                                  <p className="text-sm text-gray-500 font-mono">
                                    •••• {card.lastFourDigits}
                                  </p>
                                )}
                                {card.alwaysAvailable && (
                                  <span className="inline-block mt-1 text-xs px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-800">
                                    Every month
                                  </span>
                                )}
                              </div>
                            </div>
                            <div
                              className="flex gap-1 shrink-0"
                              onClick={(e) => e.stopPropagation()}
                              onKeyDown={(e) => e.stopPropagation()}
                            >
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleEdit(card)}
                                className="hover:bg-blue-100"
                              >
                                <Edit className="w-4 h-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleDelete(card.id)}
                                className="hover:bg-red-100"
                              >
                                <Trash2 className="w-4 h-4 text-red-600" />
                              </Button>
                            </div>
                          </div>
                        </CardHeader>
                        <CardContent className="pt-4">
                          {card.notes && (
                            <div className="bg-gray-50 rounded-lg p-3">
                              <p className="text-sm text-gray-600 line-clamp-2">
                                {card.notes}
                              </p>
                            </div>
                          )}
                          <p className="text-xs text-gray-400 group-hover:text-blue-600 mt-3 flex items-center gap-1">
                            View availability and usage history
                            <ChevronRight className="w-3.5 h-3.5" />
                          </p>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {cardsSortedFlat.map((card) => (
                <Card
                  key={card.id}
                  role="button"
                  tabIndex={0}
                  className="shadow-md hover:shadow-lg transition-shadow cursor-pointer group border border-transparent hover:border-blue-200/80 min-w-0 overflow-hidden"
                  onClick={() => router.push(`/cards/${card.id}`)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      router.push(`/cards/${card.id}`)
                    }
                  }}
                >
                  <CardHeader className="bg-gradient-to-r from-blue-50 to-cyan-50 border-b">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center shrink-0">
                          <CreditCardIcon className="w-6 h-6 text-white" />
                        </div>
                        <div className="min-w-0">
                          <CardTitle className="text-lg truncate">{card.cardNickname}</CardTitle>
                          <p className="text-xs text-gray-500">
                            {issuingBankLabel(card.issuingBank)}
                          </p>
                          {card.lastFourDigits && (
                            <p className="text-sm text-gray-500 font-mono">
                              •••• {card.lastFourDigits}
                            </p>
                          )}
                          {card.alwaysAvailable && (
                            <span className="inline-block mt-1 text-xs px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-800">
                              Every month
                            </span>
                          )}
                        </div>
                      </div>
                      <div
                        className="flex gap-1 shrink-0"
                        onClick={(e) => e.stopPropagation()}
                        onKeyDown={(e) => e.stopPropagation()}
                      >
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleEdit(card)}
                          className="hover:bg-blue-100"
                        >
                          <Edit className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDelete(card.id)}
                          className="hover:bg-red-100"
                        >
                          <Trash2 className="w-4 h-4 text-red-600" />
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-4">
                    <div className="flex items-center gap-2 text-sm text-gray-600 mb-3">
                      <User className="w-4 h-4 text-gray-400 shrink-0" />
                      <span className="font-medium">Owner:</span>
                      <span>{card.person.name}</span>
                    </div>

                    {card.notes && (
                      <div className="bg-gray-50 rounded-lg p-3">
                        <p className="text-sm text-gray-600 line-clamp-2">{card.notes}</p>
                      </div>
                    )}

                    <p className="text-xs text-gray-400 group-hover:text-blue-600 mt-3 flex items-center gap-1">
                      View availability and usage history
                      <ChevronRight className="w-3.5 h-3.5" />
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
