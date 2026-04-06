'use client'

import { useCallback, useEffect, useState } from 'react'
import { format } from 'date-fns'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Loader2, Trash2 } from 'lucide-react'

const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
]

export interface UsageEntryRow {
  id: string
  cardId: string
  year: number
  month: number
  amountUSD: number
  usageDate: string
  notes: string | null
}

export function CardUsagePanel({
  cardId,
  cardLabel,
  year,
  month,
  onUsageChanged,
  usageRevision = 0,
}: {
  cardId: string
  cardLabel: string
  year: number
  month: number
  onUsageChanged: () => void
  /** Increment when usage may have changed from outside this panel (e.g. dashboard quick log). */
  usageRevision?: number
}) {
  const [entries, setEntries] = useState<UsageEntryRow[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState({
    amountUSD: '',
    usageDate: format(new Date(), 'yyyy-MM-dd'),
    notes: '',
  })

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(
        `/api/usage?cardId=${encodeURIComponent(cardId)}`,
        { credentials: 'include', cache: 'no-store' }
      )
      if (res.ok) {
        setEntries(await res.json())
      } else {
        setEntries([])
      }
    } catch {
      setEntries([])
    } finally {
      setLoading(false)
    }
  }, [cardId])

  useEffect(() => {
    load()
  }, [load, usageRevision])

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault()
    const amt = parseFloat(form.amountUSD)
    if (Number.isNaN(amt) || amt <= 0) return

    setSaving(true)
    setError('')
    try {
      const usageDate = new Date(`${form.usageDate}T12:00:00`).toISOString()
      const res = await fetch('/api/usage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          cardId,
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
          amountUSD: '',
          usageDate: format(new Date(), 'yyyy-MM-dd'),
          notes: '',
        })
        await load()
        onUsageChanged()
      } else {
        setError(
          typeof data.error === 'string' ? data.error : 'Could not save usage.'
        )
      }
    } catch {
      setError('Network error. Try again.')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this usage entry?')) return
    try {
      const res = await fetch(`/api/usage/${id}`, { method: 'DELETE' })
      if (res.ok) {
        await load()
        onUsageChanged()
      }
    } catch {
      console.error('Delete usage failed')
    }
  }

  const monthName = format(new Date(year, month - 1, 1), 'MMMM yyyy')

  return (
    <div className="px-4 sm:px-6 py-4 bg-gradient-to-b from-slate-50 to-slate-100/80 border-t border-slate-200 space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <h4 className="font-semibold text-gray-900 text-sm sm:text-base">
          Usage history — {cardLabel}
        </h4>
        <p className="text-xs text-gray-500">
          All logged amounts for this card (any month)
        </p>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-gray-600 py-4">
          <Loader2 className="w-5 h-5 animate-spin" />
          Loading history…
        </div>
      ) : entries.length === 0 ? (
        <p className="text-sm text-gray-500 py-2">No usage logged yet.</p>
      ) : (
        <div className="overflow-x-auto rounded-md border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-slate-50 text-left">
                <th className="py-2 px-3 font-medium text-gray-700">Date</th>
                <th className="py-2 px-3 font-medium text-gray-700">Period</th>
                <th className="py-2 px-3 font-medium text-gray-700 text-right">
                  Amount (USD)
                </th>
                <th className="py-2 px-3 font-medium text-gray-700">Notes</th>
                <th className="py-2 px-3 w-12" />
              </tr>
            </thead>
            <tbody>
              {entries.map((u) => (
                <tr key={u.id} className="border-b border-slate-100 hover:bg-slate-50/80">
                  <td className="py-2 px-3 text-gray-800 whitespace-nowrap">
                    {format(new Date(u.usageDate), 'MMM d, yyyy')}
                  </td>
                  <td className="py-2 px-3 text-gray-600">
                    {MONTHS[u.month - 1]} {u.year}
                  </td>
                  <td className="py-2 px-3 text-right font-medium text-amber-800">
                    ${u.amountUSD.toFixed(2)}
                  </td>
                  <td className="py-2 px-3 text-gray-600 max-w-[200px] truncate" title={u.notes ?? ''}>
                    {u.notes || '—'}
                  </td>
                  <td className="py-2 px-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0 text-red-600 hover:bg-red-50"
                      onClick={() => handleDelete(u.id)}
                      aria-label="Delete usage entry"
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

      <form
        onSubmit={handleAdd}
        className="rounded-lg border border-indigo-200 bg-white p-4 space-y-3"
      >
        <p className="text-sm font-medium text-gray-800">
          Add usage for {monthName}
        </p>
        {error && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded px-3 py-2">
            {error}
          </p>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <Label htmlFor={`usage-amt-${cardId}`}>Amount (USD) *</Label>
            <Input
              id={`usage-amt-${cardId}`}
              type="number"
              step="0.01"
              min="0.01"
              value={form.amountUSD}
              onChange={(e) =>
                setForm((f) => ({ ...f, amountUSD: e.target.value }))
              }
              required
              disabled={saving}
            />
          </div>
          <div>
            <Label htmlFor={`usage-date-${cardId}`}>Date</Label>
            <Input
              id={`usage-date-${cardId}`}
              type="date"
              value={form.usageDate}
              onChange={(e) =>
                setForm((f) => ({ ...f, usageDate: e.target.value }))
              }
              disabled={saving}
            />
          </div>
          <div className="sm:col-span-1">
            <Label htmlFor={`usage-notes-${cardId}`}>Notes</Label>
            <Input
              id={`usage-notes-${cardId}`}
              value={form.notes}
              onChange={(e) =>
                setForm((f) => ({ ...f, notes: e.target.value }))
              }
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
            'Add usage'
          )}
        </Button>
      </form>
    </div>
  )
}
