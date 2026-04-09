'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Loader2, Banknote } from 'lucide-react'
import { format } from 'date-fns'

type Props = {
  personId: string
  personName: string
  /** Approximate unpaid USD (derived) — for edge-case messaging. */
  owedUSD: number
  /** Unpaid usage in TTD (matches card header). */
  owedTTD: number
  onApplied?: () => void
}

export function PersonAddPaymentPanel({
  personId,
  personName,
  owedUSD,
  owedTTD,
  onApplied,
}: Props) {
  const [amount, setAmount] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState<{
    appliedTTD: number
    surplusTTD: number
    allocations: Array<{
      usageId: string
      amountAppliedTTD: number
      cardNickname: string
      usageDate: string
    }>
  } | null>(null)

  const hasOutstandingTTD = owedTTD > 0.005
  const hasUnpaidUSDButNoTTDDisplay =
    owedUSD > 0.005 && !hasOutstandingTTD

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSuccess(null)
    const n = parseFloat(amount.trim())
    if (Number.isNaN(n) || n <= 0) {
      setError('Enter a positive amount in TTD.')
      return
    }

    setSaving(true)
    try {
      const res = await fetch(`/api/people/${personId}/payment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ amountTTD: n }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(
          typeof data.error === 'string'
            ? data.error
            : 'Could not apply payment.'
        )
        return
      }
      if (typeof data.appliedTTD === 'number' && Array.isArray(data.allocations)) {
        setSuccess({
          appliedTTD: data.appliedTTD,
          surplusTTD:
            typeof data.surplusTTD === 'number' ? data.surplusTTD : 0,
          allocations: data.allocations,
        })
        setAmount('')
        onApplied?.()
      } else {
        setError('Unexpected response from server.')
      }
    } catch {
      setError('Network error. Try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mb-4 rounded-lg border border-violet-200 bg-violet-50/50 p-4 space-y-3">
      <div className="flex items-start gap-2">
        <Banknote className="w-5 h-5 text-violet-700 shrink-0 mt-0.5" aria-hidden />
        <div className="min-w-0 space-y-1">
          <p className="text-sm font-medium text-gray-900">Add payment</p>
          <p className="text-xs text-gray-600 leading-snug">
            Record <strong>TTD</strong> you paid back to <strong>{personName}</strong>. It is applied to{' '}
            <strong>oldest unpaid usage first</strong> (by usage date), then newer entries, across all
            of their cards — same TTD amounts as on the Usage page.
          </p>
        </div>
      </div>

      {hasUnpaidUSDButNoTTDDisplay && (
        <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
          Some usage may be missing a monthly rate — add availability exchange rates or a default in{' '}
          <strong>Settings</strong> so the TTD balance above matches your records.
        </p>
      )}

      {!hasOutstandingTTD && !hasUnpaidUSDButNoTTDDisplay && (
        <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
          There is no unpaid usage for this person right now. Log usage on the{' '}
          <strong>Usage</strong> page (or via Log usage here) before recording a payment.
        </p>
      )}

      <form onSubmit={handleSubmit} className="space-y-3">
        {error && (
          <div className="text-sm text-red-800 bg-red-50 border border-red-200 rounded-md px-3 py-2">
            {error}
          </div>
        )}
        {success && (
          <div className="text-sm text-green-900 bg-green-50 border border-green-200 rounded-md px-3 py-2 space-y-2">
            <p>
              Applied <strong>${success.appliedTTD.toFixed(2)} TTD</strong> to outstanding usage (oldest
              first).
            </p>
            {success.surplusTTD > 0.005 && (
              <p className="text-green-800">
                <strong>${success.surplusTTD.toFixed(2)} TTD</strong> of this payment was more than
                remaining unpaid balance, so it was not assigned to any usage.
              </p>
            )}
            {success.allocations.length > 0 && (
              <ul className="text-xs text-green-900/90 list-disc pl-4 space-y-0.5">
                {success.allocations.map((a) => (
                  <li key={a.usageId}>
                    ${a.amountAppliedTTD.toFixed(2)} TTD → {a.cardNickname} (
                    {format(new Date(a.usageDate), 'MMM d, yyyy')})
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        <div className="flex flex-col sm:flex-row sm:items-end gap-3">
          <div className="space-y-2 flex-1 max-w-xs">
            <Label htmlFor={`payment-amt-${personId}`}>Payment (TTD)</Label>
            <Input
              id={`payment-amt-${personId}`}
              type="number"
              step="0.01"
              min="0"
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              disabled={saving}
            />
          </div>
          <Button type="submit" disabled={saving || !hasOutstandingTTD}>
            {saving ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Applying…
              </>
            ) : (
              'Apply payment'
            )}
          </Button>
        </div>
      </form>
    </div>
  )
}
