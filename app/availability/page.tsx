'use client'

import { useState, useEffect, useRef, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Plus, Edit, Trash2, X, Calendar, Loader2, User } from 'lucide-react'
import { format } from 'date-fns'
import { ratePremiumTtd } from '@/lib/rate-premium'
import { useGroupByOwner } from '@/hooks/use-group-by-owner'

interface CardType {
  id: string
  cardNickname: string
  person: {
    id: string
    name: string
  }
}

interface Availability {
  id: string
  year: number
  month: number
  amountUSD: number
  exchangeRate: number
  paymentDate: string
  notes: string | null
  card: CardType
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
]

export default function AvailabilityPage() {
  const router = useRouter()
  const { status } = useSession()
  const [availability, setAvailability] = useState<Availability[]>([])
  const [cards, setCards] = useState<CardType[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingAvailability, setEditingAvailability] = useState<Availability | null>(null)
  const [isRangeMode, setIsRangeMode] = useState(false)
  const [saving, setSaving] = useState(false)
  const savingLockRef = useRef(false)
  const [baselineTtd, setBaselineTtd] = useState<number | null>(null)
  const [groupByOwner, setGroupByOwner] = useGroupByOwner()

  const currentDate = new Date()
  const [formData, setFormData] = useState({
    cardId: '',
    year: currentDate.getFullYear(),
    month: currentDate.getMonth() + 1,
    startYear: currentDate.getFullYear(),
    startMonth: currentDate.getMonth() + 1,
    endYear: currentDate.getFullYear(),
    endMonth: currentDate.getMonth() + 1,
    amountUSD: '',
    exchangeRate: '',
    paymentDate: '',
    notes: '',
  })

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
      try {
        const [availRes, cardsRes, settingsRes] = await Promise.all([
          fetch('/api/availability', { credentials: 'include', cache: 'no-store' }),
          fetch('/api/cards', { credentials: 'include', cache: 'no-store' }),
          fetch('/api/settings', { credentials: 'include', cache: 'no-store' }),
        ])
        if (cancelled) return
        if (availRes.ok) {
          setAvailability(await availRes.json())
        }
        if (cardsRes.ok) {
          setCards(await cardsRes.json())
        }
        if (settingsRes.ok) {
          const s = await settingsRes.json()
          if (typeof s.defaultExchangeRate === 'number') {
            setBaselineTtd(s.defaultExchangeRate)
          }
        }
      } catch (error) {
        console.error('Error fetching availability:', error)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [status])

  /** Prefill exchange field when settings finish loading after the add form is already open. */
  useEffect(() => {
    if (baselineTtd == null || !showForm || editingAvailability) return
    setFormData((prev) => {
      if (prev.exchangeRate !== '') return prev
      return { ...prev, exchangeRate: String(baselineTtd) }
    })
  }, [baselineTtd, showForm, editingAvailability])

  const fetchAvailability = async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/availability', {
        credentials: 'include',
        cache: 'no-store',
      })
      if (response.ok) {
        const data = await response.json()
        setAvailability(data)
      }
    } catch (error) {
      console.error('Error fetching availability:', error)
    } finally {
      setLoading(false)
    }
  }

  const fetchCards = async () => {
    try {
      const response = await fetch('/api/cards', {
        credentials: 'include',
        cache: 'no-store',
      })
      if (response.ok) {
        const data = await response.json()
        setCards(data)
      }
    } catch (error) {
      console.error('Error fetching cards:', error)
    }
  }

  const generateMonthsInRange = (startYear: number, startMonth: number, endYear: number, endMonth: number) => {
    const months = []
    let currentYear = startYear
    let currentMonth = startMonth

    while (currentYear < endYear || (currentYear === endYear && currentMonth <= endMonth)) {
      months.push({ year: currentYear, month: currentMonth })
      currentMonth++
      if (currentMonth > 12) {
        currentMonth = 1
        currentYear++
      }
    }
    return months
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (savingLockRef.current) return
    savingLockRef.current = true
    setSaving(true)

    try {
      if (isRangeMode) {
        // Create multiple entries for date range
        const months = generateMonthsInRange(
          formData.startYear,
          formData.startMonth,
          formData.endYear,
          formData.endMonth
        )

        // If editing, update the current one and create new ones for other months
        for (const { year, month } of months) {
          const payload = {
            cardId: formData.cardId,
            year,
            month,
            amountUSD: parseFloat(formData.amountUSD),
            exchangeRate: parseFloat(formData.exchangeRate),
            paymentDate: new Date(formData.paymentDate).toISOString(),
            notes: formData.notes || undefined,
          }

          // If this is the month being edited, update it
          if (editingAvailability && year === editingAvailability.year && month === editingAvailability.month) {
            await fetch(`/api/availability/${editingAvailability.id}`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(payload),
            })
          } else {
            // Otherwise create a new entry (skip if exists)
            await fetch('/api/availability', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(payload),
            })
          }
        }
        
        await fetchAvailability()
        resetForm()
      } else {
        // Single entry update or creation
        const url = editingAvailability
          ? `/api/availability/${editingAvailability.id}`
          : '/api/availability'
        const method = editingAvailability ? 'PUT' : 'POST'

        const payload = {
          cardId: formData.cardId,
          year: formData.year,
          month: formData.month,
          amountUSD: parseFloat(formData.amountUSD),
          exchangeRate: parseFloat(formData.exchangeRate),
          paymentDate: new Date(formData.paymentDate).toISOString(),
          notes: formData.notes || undefined,
        }

        const response = await fetch(url, {
          method,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })

        if (response.ok) {
          await fetchAvailability()
          resetForm()
        }
      }
    } catch (error) {
      console.error('Error saving availability:', error)
    } finally {
      savingLockRef.current = false
      setSaving(false)
    }
  }

  const handleEdit = (item: Availability) => {
    setEditingAvailability(item)
    setIsRangeMode(false)
    // Set the range to start and end at the same month initially
    setFormData({
      cardId: item.card.id,
      year: item.year,
      month: item.month,
      startYear: item.year,
      startMonth: item.month,
      endYear: item.year, // User can change this to extend
      endMonth: item.month, // User can change this to extend
      amountUSD: item.amountUSD.toString(),
      exchangeRate: item.exchangeRate.toString(),
      paymentDate: format(new Date(item.paymentDate), 'yyyy-MM-dd'),
      notes: item.notes || '',
    })
    setShowForm(true)
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this availability entry?')) return

    try {
      const response = await fetch(`/api/availability/${id}`, {
        method: 'DELETE',
      })

      if (response.ok) {
        await fetchAvailability()
      }
    } catch (error) {
      console.error('Error deleting availability:', error)
    }
  }

  const resetForm = () => {
    const currentDate = new Date()
    setFormData({
      cardId: '',
      year: currentDate.getFullYear(),
      month: currentDate.getMonth() + 1,
      startYear: currentDate.getFullYear(),
      startMonth: currentDate.getMonth() + 1,
      endYear: currentDate.getFullYear(),
      endMonth: currentDate.getMonth() + 1,
      amountUSD: '',
      exchangeRate: '',
      paymentDate: '',
      notes: '',
    })
    setEditingAvailability(null)
    setShowForm(false)
    setIsRangeMode(false)
  }

  const newAvailabilityBaselineRate = () =>
    baselineTtd != null ? String(baselineTtd) : ''

  const openAddForm = () => {
    setEditingAvailability(null)
    setIsRangeMode(false)
    const d = new Date()
    setFormData({
      cardId: '',
      year: d.getFullYear(),
      month: d.getMonth() + 1,
      startYear: d.getFullYear(),
      startMonth: d.getMonth() + 1,
      endYear: d.getFullYear(),
      endMonth: d.getMonth() + 1,
      amountUSD: '',
      exchangeRate: newAvailabilityBaselineRate(),
      paymentDate: '',
      notes: '',
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

  const groupedByCard = useMemo(() => {
    return availability.reduce(
      (acc, item) => {
        const cardKey = item.card.id
        if (!acc[cardKey]) {
          acc[cardKey] = {
            card: item.card,
            entries: [],
          }
        }
        acc[cardKey].entries.push(item)
        return acc
      },
      {} as Record<string, { card: CardType; entries: Availability[] }>
    )
  }, [availability])

  const groupedByOwner = useMemo(() => {
    type CardGroup = { card: CardType; entries: Availability[] }
    const map = new Map<
      string,
      { person: { id: string; name: string }; cardGroups: CardGroup[] }
    >()
    for (const { card, entries } of Object.values(groupedByCard)) {
      const pid = card.person.id
      if (!map.has(pid)) {
        map.set(pid, {
          person: { id: pid, name: card.person.name },
          cardGroups: [],
        })
      }
      map.get(pid)!.cardGroups.push({ card, entries })
    }
    for (const g of map.values()) {
      g.cardGroups.sort((a, b) =>
        a.card.cardNickname.localeCompare(b.card.cardNickname)
      )
    }
    return [...map.values()].sort((a, b) =>
      a.person.name.localeCompare(b.person.name)
    )
  }, [groupedByCard])

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
            Monthly Availability
          </h1>
          <p className="text-gray-600 mt-1">Track card availability by month and manage payment schedules</p>
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
            Add Availability
          </Button>
        </div>
      </div>

      {showForm && (
        <Card className="border-2 border-blue-200 shadow-xl">
          <CardHeader className="bg-gradient-to-r from-blue-50 to-indigo-50">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-xl">
                  {editingAvailability ? 'Edit Availability' : 'Add New Availability'}
                </CardTitle>
                <CardDescription className="mt-1">
                  {editingAvailability ? 'Update availability details' : 'Add availability for a single month or date range'}
                </CardDescription>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={resetForm}
                disabled={saving}
                aria-label="Close form"
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="pt-6">
            <form onSubmit={handleSubmit} className="space-y-6">
              <fieldset
                disabled={saving}
                className="space-y-6 border-0 p-0 m-0 min-w-0"
              >
              <div className="flex items-center gap-4 p-4 bg-blue-50 rounded-lg">
                <Calendar className="w-5 h-5 text-blue-600" />
                <div className="flex-1">
                  <div className="flex items-center gap-4">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        checked={!isRangeMode}
                        onChange={() => setIsRangeMode(false)}
                        className="w-4 h-4 text-blue-600"
                      />
                      <span className="font-medium">Single Month</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        checked={isRangeMode}
                        onChange={() => setIsRangeMode(true)}
                        className="w-4 h-4 text-blue-600"
                      />
                      <span className="font-medium">{editingAvailability ? 'Extend to Range' : 'Date Range'}</span>
                    </label>
                  </div>
                  {editingAvailability && isRangeMode && (
                    <p className="text-xs text-blue-700 mt-2">
                      This will create new entries for the selected range using the same details
                    </p>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <Label htmlFor="cardId">Card *</Label>
                  <select
                    id="cardId"
                    value={formData.cardId}
                    onChange={(e) =>
                      setFormData({ ...formData, cardId: e.target.value })
                    }
                    required
                    className="flex h-10 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm ring-offset-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
                  >
                    <option value="">Select a card</option>
                    {cards.map((card) => (
                      <option key={card.id} value={card.id}>
                        {card.cardNickname} ({card.person.name})
                      </option>
                    ))}
                  </select>
                </div>

                {isRangeMode ? (
                  <>
                    <div>
                      <Label>Start Month *</Label>
                      <div className="grid grid-cols-2 gap-2">
                        <select
                          value={formData.startMonth}
                          onChange={(e) =>
                            setFormData({ ...formData, startMonth: parseInt(e.target.value) })
                          }
                          required
                          className="flex h-10 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm ring-offset-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
                        >
                          {MONTHS.map((monthName, index) => (
                            <option key={index + 1} value={index + 1}>
                              {monthName}
                            </option>
                          ))}
                        </select>
                        <Input
                          type="number"
                          value={formData.startYear}
                          onChange={(e) =>
                            setFormData({ ...formData, startYear: parseInt(e.target.value) })
                          }
                          min={2000}
                          max={2100}
                          required
                        />
                      </div>
                    </div>

                    <div>
                      <Label>End Month *</Label>
                      <div className="grid grid-cols-2 gap-2">
                        <select
                          value={formData.endMonth}
                          onChange={(e) =>
                            setFormData({ ...formData, endMonth: parseInt(e.target.value) })
                          }
                          required
                          className="flex h-10 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm ring-offset-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
                        >
                          {MONTHS.map((monthName, index) => (
                            <option key={index + 1} value={index + 1}>
                              {monthName}
                            </option>
                          ))}
                        </select>
                        <Input
                          type="number"
                          value={formData.endYear}
                          onChange={(e) =>
                            setFormData({ ...formData, endYear: parseInt(e.target.value) })
                          }
                          min={2000}
                          max={2100}
                          required
                        />
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="col-span-2">
                    <Label>Month & Year *</Label>
                    <div className="grid grid-cols-2 gap-4">
                      <select
                        value={formData.month}
                        onChange={(e) =>
                          setFormData({ ...formData, month: parseInt(e.target.value) })
                        }
                        required
                        className="flex h-10 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm ring-offset-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
                      >
                        {MONTHS.map((monthName, index) => (
                          <option key={index + 1} value={index + 1}>
                            {monthName}
                          </option>
                        ))}
                      </select>
                      <Input
                        type="number"
                        value={formData.year}
                        onChange={(e) =>
                          setFormData({ ...formData, year: parseInt(e.target.value) })
                        }
                        min={2000}
                        max={2100}
                        required
                      />
                    </div>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="amountUSD">Amount (USD) *</Label>
                  <Input
                    id="amountUSD"
                    type="number"
                    step="0.01"
                    value={formData.amountUSD}
                    onChange={(e) =>
                      setFormData({ ...formData, amountUSD: e.target.value })
                    }
                    placeholder="1000.00"
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="exchangeRate">Exchange Rate (TTD/USD) *</Label>
                  <Input
                    id="exchangeRate"
                    type="number"
                    step="0.0001"
                    value={formData.exchangeRate}
                    onChange={(e) =>
                      setFormData({ ...formData, exchangeRate: e.target.value })
                    }
                    placeholder={
                      baselineTtd != null ? String(baselineTtd) : 'e.g. 6.7993'
                    }
                    required
                  />
                </div>
                {!editingAvailability && baselineTtd != null && (
                  <p className="text-xs text-gray-500 col-span-2">
                    Defaults to your baseline rate from Settings; change if this month
                    uses a different rate.
                  </p>
                )}
              </div>

              <div>
                <Label htmlFor="paymentDate">Payment Date *</Label>
                <Input
                  id="paymentDate"
                  type="date"
                  value={formData.paymentDate}
                  onChange={(e) =>
                    setFormData({ ...formData, paymentDate: e.target.value })
                  }
                  required
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
                  className="flex min-h-[80px] w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm ring-offset-white placeholder:text-gray-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
                  placeholder="Any special notes about fees, payment arrangements, etc."
                />
              </div>
              </fieldset>

              <div className="flex gap-2 pt-4 border-t">
                <Button type="submit" className="px-8" disabled={saving}>
                  {saving ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Saving…
                    </>
                  ) : editingAvailability ? (
                    'Update'
                  ) : isRangeMode ? (
                    'Create Range'
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
          <p className="text-gray-500 mt-4">Loading availability...</p>
        </div>
      ) : Object.keys(groupedByCard).length === 0 ? (
        <Card className="shadow-md">
          <CardContent className="py-12 text-center">
            <Calendar className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-700 mb-2">No Availability Entries</h3>
            <p className="text-gray-500 mb-4">Start by adding availability for your cards</p>
            <Button onClick={openAddForm}>
              <Plus className="w-4 h-4 mr-2" />
              Add First Entry
            </Button>
          </CardContent>
        </Card>
      ) : groupByOwner ? (
        <div className="space-y-10">
          {groupedByOwner.map((ownerBlock) => (
            <section key={ownerBlock.person.id} className="space-y-4">
              <div className="flex flex-wrap items-baseline gap-2 border-b border-gray-200 pb-2">
                <User className="w-5 h-5 text-gray-500 shrink-0 translate-y-0.5" />
                <h2 className="text-lg font-semibold text-gray-900">
                  {ownerBlock.person.name}
                </h2>
                <span className="text-sm text-gray-500">
                  {ownerBlock.cardGroups.length} card
                  {ownerBlock.cardGroups.length !== 1 ? 's' : ''}
                </span>
              </div>
              <div className="grid gap-6">
                {ownerBlock.cardGroups.map(({ card, entries }) => (
                  <Card
                    key={card.id}
                    className="shadow-md hover:shadow-lg transition-shadow"
                  >
                    <CardHeader className="bg-gradient-to-r from-purple-50 to-blue-50 border-b">
                      <CardTitle className="flex items-center gap-2">
                        <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center">
                          <span className="text-white font-bold">
                            {card.cardNickname[0]}
                          </span>
                        </div>
                        <div>
                          <div className="text-lg">{card.cardNickname}</div>
                        </div>
                      </CardTitle>
                      <CardDescription>
                        {entries.length}{' '}
                        {entries.length === 1 ? 'month' : 'months'} of availability
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="pt-4">
                      <div className="overflow-x-auto">
                        <table className="w-full">
                          <thead>
                            <tr className="border-b bg-gray-50">
                              <th className="text-left py-3 px-4 font-medium text-gray-700">
                                Month
                              </th>
                              <th className="text-right py-3 px-4 font-medium text-gray-700">
                                Amount (USD)
                              </th>
                              <th className="text-right py-3 px-4 font-medium text-gray-700">
                                Rate
                              </th>
                              <th className="text-right py-3 px-4 font-medium text-gray-700">
                                TTD Value
                              </th>
                              <th className="text-right py-3 px-4 font-medium text-gray-700">
                                Fee (TTD)
                              </th>
                              <th className="text-left py-3 px-4 font-medium text-gray-700">
                                Payment Date
                              </th>
                              <th className="text-center py-3 px-4 font-medium text-gray-700">
                                Actions
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {entries.map((item) => (
                              <tr
                                key={item.id}
                                className="border-b hover:bg-blue-50 transition-colors"
                              >
                                <td className="py-3 px-4 font-medium">
                                  {MONTHS[item.month - 1]} {item.year}
                                </td>
                                <td className="py-3 px-4 text-right text-green-600 font-semibold">
                                  ${item.amountUSD.toFixed(2)}
                                </td>
                                <td className="py-3 px-4 text-right">
                                  {item.exchangeRate.toFixed(2)}
                                </td>
                                <td className="py-3 px-4 text-right text-blue-600 font-semibold">
                                  ${(item.amountUSD * item.exchangeRate).toFixed(2)}
                                </td>
                                <td className="py-3 px-4 text-right">
                                  {baselineTtd != null && baselineTtd > 0 ? (
                                    <span className="text-red-600 font-medium">
                                      {ratePremiumTtd(
                                        item.amountUSD,
                                        item.exchangeRate,
                                        baselineTtd
                                      ).toFixed(2)}{' '}
                                      TTD
                                    </span>
                                  ) : (
                                    <span className="text-gray-400">—</span>
                                  )}
                                </td>
                                <td className="py-3 px-4">
                                  {format(new Date(item.paymentDate), 'MMM dd, yyyy')}
                                </td>
                                <td className="py-3 px-4">
                                  <div className="flex justify-center gap-1">
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => handleEdit(item)}
                                      className="hover:bg-blue-100"
                                    >
                                      <Edit className="w-4 h-4" />
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => handleDelete(item.id)}
                                      className="hover:bg-red-100"
                                    >
                                      <Trash2 className="w-4 h-4 text-red-600" />
                                    </Button>
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <div className="grid gap-6">
          {Object.values(groupedByCard).map(({ card, entries }) => (
            <Card key={card.id} className="shadow-md hover:shadow-lg transition-shadow">
              <CardHeader className="bg-gradient-to-r from-purple-50 to-blue-50 border-b">
                <CardTitle className="flex items-center gap-2">
                  <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center">
                    <span className="text-white font-bold">{card.cardNickname[0]}</span>
                  </div>
                  <div>
                    <div className="text-lg">{card.cardNickname}</div>
                    <div className="text-sm font-normal text-gray-600">{card.person.name}</div>
                  </div>
                </CardTitle>
                <CardDescription>
                  {entries.length} {entries.length === 1 ? 'month' : 'months'} of availability
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-4">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b bg-gray-50">
                        <th className="text-left py-3 px-4 font-medium text-gray-700">Month</th>
                        <th className="text-right py-3 px-4 font-medium text-gray-700">Amount (USD)</th>
                        <th className="text-right py-3 px-4 font-medium text-gray-700">Rate</th>
                        <th className="text-right py-3 px-4 font-medium text-gray-700">TTD Value</th>
                        <th className="text-right py-3 px-4 font-medium text-gray-700">
                          Fee (TTD)
                        </th>
                        <th className="text-left py-3 px-4 font-medium text-gray-700">Payment Date</th>
                        <th className="text-center py-3 px-4 font-medium text-gray-700">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {entries.map((item) => (
                        <tr key={item.id} className="border-b hover:bg-blue-50 transition-colors">
                          <td className="py-3 px-4 font-medium">
                            {MONTHS[item.month - 1]} {item.year}
                          </td>
                          <td className="py-3 px-4 text-right text-green-600 font-semibold">
                            ${item.amountUSD.toFixed(2)}
                          </td>
                          <td className="py-3 px-4 text-right">
                            {item.exchangeRate.toFixed(2)}
                          </td>
                          <td className="py-3 px-4 text-right text-blue-600 font-semibold">
                            ${(item.amountUSD * item.exchangeRate).toFixed(2)}
                          </td>
                          <td className="py-3 px-4 text-right">
                            {baselineTtd != null && baselineTtd > 0 ? (
                              <span className="text-red-600 font-medium">
                                {ratePremiumTtd(
                                  item.amountUSD,
                                  item.exchangeRate,
                                  baselineTtd
                                ).toFixed(2)}{' '}
                                TTD
                              </span>
                            ) : (
                              <span className="text-gray-400">—</span>
                            )}
                          </td>
                          <td className="py-3 px-4">
                            {format(new Date(item.paymentDate), 'MMM dd, yyyy')}
                          </td>
                          <td className="py-3 px-4">
                            <div className="flex justify-center gap-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleEdit(item)}
                                className="hover:bg-blue-100"
                              >
                                <Edit className="w-4 h-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleDelete(item.id)}
                                className="hover:bg-red-100"
                              >
                                <Trash2 className="w-4 h-4 text-red-600" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
