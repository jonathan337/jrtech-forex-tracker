'use client'

import { useCallback, useEffect, useState, Fragment } from 'react'
import { format } from 'date-fns'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Loader2, Trash2, Pencil, CheckCircle2 } from 'lucide-react'
import { usageAmountPaidSync } from '@/lib/usage-paid-sync'

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
  /** TTD spend; may be wrong for older rows logged from USD-only forms (stored USD as TTD). */
  amountTTD: number
  /** When set, canonical TTD is amountUSD × month rate when a rate is available. */
  amountUSD?: number | null
  paidToOwnerTTD: number
  usageDate: string
  notes: string | null
}

/** Prefer USD × monthly rate when both exist (fixes legacy rows where amountTTD duplicated USD). */
function usageAmountTtd(
  row: UsageEntryRow,
  monthExchangeRate: number | null | undefined
): number {
  const rate = monthExchangeRate
  if (
    typeof row.amountUSD === 'number' &&
    Number.isFinite(row.amountUSD) &&
    rate != null &&
    rate > 0
  ) {
    return row.amountUSD * rate
  }
  return row.amountTTD
}

export function CardUsagePanel({
  cardId,
  cardLabel,
  year,
  month,
  onUsageChanged,
  usageRevision = 0,
  /** Card/month TTD per USD from availability; used to derive TTD from stored USD for legacy rows. */
  monthExchangeRate,
}: {
  cardId: string
  cardLabel: string
  year: number
  month: number
  onUsageChanged: () => void
  /** Increment when usage may have changed from outside this panel (e.g. dashboard quick log). */
  usageRevision?: number
  monthExchangeRate?: number | null
}) {
  const [entries, setEntries] = useState<UsageEntryRow[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState({
    amountTTD: '',
    paidToOwnerTTD: '',
    usageDate: format(new Date(), 'yyyy-MM-dd'),
    notes: '',
  })
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState({
    amountTTD: '',
    paidToOwnerTTD: '',
    usageDate: '',
    notes: '',
  })
  const [editRowError, setEditRowError] = useState('')
  const [savingEntryId, setSavingEntryId] = useState<string | null>(null)
  const [listActionError, setListActionError] = useState('')

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
    const amt = parseFloat(form.amountTTD)
    if (Number.isNaN(amt) || amt <= 0) return

    const paidRaw = form.paidToOwnerTTD.trim()
    const paidToOwner = paidRaw === '' ? 0 : parseFloat(paidRaw)
    if (Number.isNaN(paidToOwner) || paidToOwner < 0) {
      setError('Paid to owner must be a valid non-negative amount.')
      return
    }
    if (paidToOwner - amt > 1e-6) {
      setError('Paid to owner cannot be more than the usage amount.')
      return
    }

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
          amountTTD: amt,
          paidToOwnerTTD: paidToOwner,
          usageDate,
          notes: form.notes.trim() || undefined,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok) {
        setForm({
          amountTTD: '',
          paidToOwnerTTD: '',
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
        setEditingEntryId((eid) => (eid === id ? null : eid))
        await load()
        onUsageChanged()
      }
    } catch {
      console.error('Delete usage failed')
    }
  }

  const openEntryEdit = (row: UsageEntryRow) => {
    setEditRowError('')
    setListActionError('')
    setEditingEntryId(row.id)
    setEditDraft({
      amountTTD: String(usageAmountTtd(row, monthExchangeRate)),
      paidToOwnerTTD: String(row.paidToOwnerTTD),
      usageDate: format(new Date(row.usageDate), 'yyyy-MM-dd'),
      notes: row.notes ?? '',
    })
  }

  const cancelEntryEdit = () => {
    setEditingEntryId(null)
    setEditRowError('')
  }

  const markEntrySettled = async (row: UsageEntryRow) => {
    const usageTtd = usageAmountTtd(row, monthExchangeRate)
    if (usageTtd - row.paidToOwnerTTD <= 1e-6) return
    setSavingEntryId(row.id)
    setEditRowError('')
    setListActionError('')
    try {
      const res = await fetch(`/api/usage/${row.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          paidToOwnerTTD: usageTtd,
          ...(usageTtd !== row.amountTTD
            ? { amountTTD: usageTtd }
            : {}),
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok) {
        if (editingEntryId === row.id) cancelEntryEdit()
        await load()
        onUsageChanged()
      } else {
        setListActionError(
          typeof data.error === 'string' ? data.error : 'Could not update entry.'
        )
      }
    } catch {
      setListActionError('Network error. Try again.')
    } finally {
      setSavingEntryId(null)
    }
  }

  const saveEntryEdit = async () => {
    if (!editingEntryId) return
    const amt = parseFloat(editDraft.amountTTD)
    if (Number.isNaN(amt) || amt <= 0) {
      setEditRowError('Amount must be a positive number.')
      return
    }
    const paidRaw = editDraft.paidToOwnerTTD.trim()
    const paidToOwner = paidRaw === '' ? 0 : parseFloat(paidRaw)
    if (Number.isNaN(paidToOwner) || paidToOwner < 0) {
      setEditRowError('Paid to owner must be a valid non-negative amount.')
      return
    }
    if (paidToOwner - amt > 1e-6) {
      setEditRowError('Paid to owner cannot be more than the usage amount.')
      return
    }

    setSavingEntryId(editingEntryId)
    setEditRowError('')
    try {
      const usageDate = new Date(`${editDraft.usageDate}T12:00:00`).toISOString()
      const res = await fetch(`/api/usage/${editingEntryId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          amountTTD: amt,
          paidToOwnerTTD: paidToOwner,
          usageDate,
          notes: editDraft.notes.trim() || null,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok) {
        cancelEntryEdit()
        await load()
        onUsageChanged()
      } else {
        setEditRowError(
          typeof data.error === 'string' ? data.error : 'Could not save changes.'
        )
      }
    } catch {
      setEditRowError('Network error. Try again.')
    } finally {
      setSavingEntryId(null)
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
          Click a row or Edit to update paid-to-owner; Settled marks full payment in one step.
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
          {listActionError && (
            <div className="px-3 py-2 text-sm text-red-800 bg-red-50 border-b border-red-100">
              {listActionError}
            </div>
          )}
          <table className="w-full text-sm min-w-[34rem]">
            <thead>
              <tr className="border-b bg-slate-50 text-left">
                <th className="py-2 px-3 font-medium text-gray-700">Date</th>
                <th className="py-2 px-3 font-medium text-gray-700">Period</th>
                <th className="py-2 px-3 font-medium text-gray-700 text-right">
                  Amount (TTD)
                </th>
                <th className="py-2 px-3 font-medium text-gray-700 text-right whitespace-nowrap">
                  Paid owner (TTD)
                </th>
                <th className="py-2 px-3 font-medium text-gray-700">Notes</th>
                <th className="py-2 px-3 font-medium text-gray-700 text-right whitespace-nowrap">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {entries.map((u) => (
                <Fragment key={u.id}>
                  <tr
                    className={`border-b border-slate-100 hover:bg-slate-50/80 ${
                      editingEntryId === u.id ? 'bg-blue-50/50' : ''
                    }`}
                  >
                    <td className="py-2 px-3 text-gray-800 whitespace-nowrap">
                      <button
                        type="button"
                        className="hover:text-blue-800 hover:underline text-left"
                        onClick={() => openEntryEdit(u)}
                      >
                        {format(new Date(u.usageDate), 'MMM d, yyyy')}
                      </button>
                    </td>
                    <td className="py-2 px-3 text-gray-600">
                      {MONTHS[u.month - 1]} {u.year}
                    </td>
                    <td className="py-2 px-3 text-right font-medium text-amber-800">
                      TTD ${usageAmountTtd(u, monthExchangeRate).toFixed(2)}
                    </td>
                    <td className="py-2 px-3 text-right text-gray-700 whitespace-nowrap">
                      TTD ${u.paidToOwnerTTD.toFixed(2)}
                      {usageAmountTtd(u, monthExchangeRate) - u.paidToOwnerTTD >
                        1e-6 && (
                        <span className="block text-xs text-red-600 font-medium">
                          Owed: TTD $
                          {(
                            usageAmountTtd(u, monthExchangeRate) -
                            u.paidToOwnerTTD
                          ).toFixed(2)}
                        </span>
                      )}
                    </td>
                    <td className="py-2 px-3 text-gray-600 max-w-[200px] truncate" title={u.notes ?? ''}>
                      {u.notes || '—'}
                    </td>
                    <td className="py-2 px-2 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-0.5">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0 text-blue-600 hover:bg-blue-50"
                          onClick={() => openEntryEdit(u)}
                          title="Edit"
                          aria-label="Edit usage entry"
                        >
                          <Pencil className="w-4 h-4" />
                        </Button>
                        {usageAmountTtd(u, monthExchangeRate) - u.paidToOwnerTTD >
                          1e-6 && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-8 px-2 inline-flex items-center gap-0.5 text-green-700 hover:bg-green-50 text-xs font-medium"
                            disabled={savingEntryId === u.id}
                            onClick={() => markEntrySettled(u)}
                            title="Set paid to owner equal to usage"
                          >
                            {savingEntryId === u.id ? (
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
                          className="h-8 w-8 p-0 text-red-600 hover:bg-red-50"
                          onClick={() => handleDelete(u.id)}
                          aria-label="Delete usage entry"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                  {editingEntryId === u.id && (
                    <tr className="border-b border-blue-100 bg-blue-50/30">
                      <td colSpan={6} className="p-3 sm:p-4">
                        {editRowError && (
                          <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded px-3 py-2 mb-3">
                            {editRowError}
                          </p>
                        )}
                        <p className="text-sm font-medium text-gray-800 mb-3">Edit usage entry</p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-3">
                          <div>
                            <Label htmlFor={`panel-edit-amt-${u.id}`}>Amount (TTD) *</Label>
                            <Input
                              id={`panel-edit-amt-${u.id}`}
                              type="number"
                              step="0.01"
                              min="0.01"
                              value={editDraft.amountTTD}
                              onChange={(e) =>
                                setEditDraft((d) => ({
                                  ...d,
                                  amountTTD: e.target.value,
                                  paidToOwnerTTD: usageAmountPaidSync(
                                    d.amountTTD,
                                    d.paidToOwnerTTD,
                                    e.target.value
                                  ),
                                }))
                              }
                            />
                          </div>
                          <div>
                            <Label htmlFor={`panel-edit-paid-${u.id}`}>Paid to owner (TTD)</Label>
                            <Input
                              id={`panel-edit-paid-${u.id}`}
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
                            <Label htmlFor={`panel-edit-date-${u.id}`}>Date</Label>
                            <Input
                              id={`panel-edit-date-${u.id}`}
                              type="date"
                              value={editDraft.usageDate}
                              onChange={(e) =>
                                setEditDraft((d) => ({ ...d, usageDate: e.target.value }))
                              }
                            />
                          </div>
                          <div className="sm:col-span-2 lg:col-span-1">
                            <Label htmlFor={`panel-edit-notes-${u.id}`}>Notes</Label>
                            <Input
                              id={`panel-edit-notes-${u.id}`}
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
                            disabled={savingEntryId === u.id}
                          >
                            {savingEntryId === u.id ? (
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
                            disabled={savingEntryId === u.id}
                          >
                            Cancel
                          </Button>
                          {parseFloat(editDraft.amountTTD) -
                            parseFloat(editDraft.paidToOwnerTTD || '0') >
                            1e-6 && (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              disabled={savingEntryId === u.id}
                              onClick={() => {
                                const a = parseFloat(editDraft.amountTTD)
                                if (!Number.isNaN(a))
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
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div>
            <Label htmlFor={`usage-amt-${cardId}`}>Amount (TTD) *</Label>
            <Input
              id={`usage-amt-${cardId}`}
              type="number"
              step="0.01"
              min="0.01"
              value={form.amountTTD}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  amountTTD: e.target.value,
                  paidToOwnerTTD: usageAmountPaidSync(
                    f.amountTTD,
                    f.paidToOwnerTTD,
                    e.target.value
                  ),
                }))
              }
              required
              disabled={saving}
            />
          </div>
          <div>
            <Label htmlFor={`usage-paid-${cardId}`}>Paid to owner (TTD)</Label>
            <Input
              id={`usage-paid-${cardId}`}
              type="number"
              step="0.01"
              min="0"
              placeholder="0 if not paid yet"
              title="Leave 0 until you have paid the owner back for this usage."
              value={form.paidToOwnerTTD}
              onChange={(e) =>
                setForm((f) => ({ ...f, paidToOwnerTTD: e.target.value }))
              }
              disabled={saving}
            />
            <p className="text-xs text-gray-500 mt-1">
              0 = still owed; increase when you reimburse.
            </p>
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
          <div className="sm:col-span-2 lg:col-span-1">
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
