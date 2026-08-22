'use client'

import { useState, useEffect, useRef } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Settings as SettingsIcon, Save, Landmark, Plus, Trash2 } from 'lucide-react'
import { type Bank } from '@/lib/card-bank'

export default function SettingsPage() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const savingLockRef = useRef(false)
  const [success, setSuccess] = useState(false)
  const [defaultRate, setDefaultRate] = useState('6.7993')
  const [cardFeePct, setCardFeePct] = useState('4.5')
  // Editable bank list. cycleDay '' = resets on the 1st.
  const [banks, setBanks] = useState<Array<{ name: string; cycleDay: string }>>([])

  useEffect(() => {
    fetchSettings()
  }, [])

  const fetchSettings = async () => {
    try {
      const response = await fetch('/api/settings')
      if (response.ok) {
        const data = await response.json()
        setDefaultRate(data.defaultExchangeRate.toString())
        if (typeof data.cardProcessingFeePct === 'number') {
          setCardFeePct(data.cardProcessingFeePct.toString())
        }
        if (Array.isArray(data.banks)) {
          setBanks(
            (data.banks as Bank[]).map((b) => ({
              name: b.name,
              cycleDay: typeof b.cycleDay === 'number' ? String(b.cycleDay) : '',
            }))
          )
        }
      }
    } catch (error) {
      console.error('Error fetching settings:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (savingLockRef.current) return
    savingLockRef.current = true
    setSaving(true)
    setSuccess(false)

    try {
      const response = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          defaultExchangeRate: parseFloat(defaultRate),
          cardProcessingFeePct: parseFloat(cardFeePct),
          banks: banks
            .map((b) => {
              const name = b.name.trim()
              const raw = b.cycleDay.trim()
              const n = raw === '' ? null : parseInt(raw, 10)
              return {
                name,
                cycleDay: n != null && n >= 1 && n <= 31 ? n : null,
              }
            })
            .filter((b) => b.name !== ''),
        }),
      })

      if (response.ok) {
        setSuccess(true)
        setTimeout(() => setSuccess(false), 3000)
      }
    } catch (error) {
      console.error('Error saving settings:', error)
    } finally {
      savingLockRef.current = false
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="text-center py-12">
        <div className="inline-block w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
      </div>
    )
  }

  return (
    <div className="space-y-6 min-w-0">
      <div className="min-w-0">
        <h1 className="text-2xl sm:text-3xl font-bold tracking-[-0.02em] bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
          Settings
        </h1>
        <p className="text-gray-600 mt-1 text-sm sm:text-base">
          Configure your default exchange rates and preferences
        </p>
      </div>

      <Card className="shadow-md w-full max-w-2xl min-w-0 overflow-hidden">
        <CardHeader className="bg-gradient-to-r from-blue-50 to-indigo-50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-500 flex items-center justify-center">
              <SettingsIcon className="w-5 h-5 text-white" />
            </div>
            <div>
              <CardTitle>Exchange Rate Settings</CardTitle>
              <CardDescription>
                Set your default TTD to USD exchange rate for fee calculations
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-6">
          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <Label htmlFor="defaultRate">Default Exchange Rate (TTD per USD) *</Label>
              <Input
                id="defaultRate"
                type="number"
                step="0.0001"
                value={defaultRate}
                onChange={(e) => setDefaultRate(e.target.value)}
                placeholder="6.7993"
                required
                className="mt-1"
              />
              <p className="text-sm text-gray-500 mt-2">
                This is your baseline exchange rate for calculating the true cost of foreign currency.
                Any rate higher than this represents additional cost beyond the official rate.
              </p>
            </div>

            <div>
              <Label htmlFor="cardFeePct">Card processing fee (%)</Label>
              <Input
                id="cardFeePct"
                type="number"
                step="0.1"
                min="0"
                max="25"
                value={cardFeePct}
                onChange={(e) => setCardFeePct(e.target.value)}
                placeholder="4.5"
                required
                className="mt-1"
              />
              <p className="text-sm text-gray-500 mt-2">
                Fee charged when you spend on cards (typically 3–4.5%). Applied to the
                projected card cost in your monthly USD average. Direct USD buys
                (cash, Zelle, wire) are never marked up — they use exactly what you paid.
              </p>
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <h4 className="font-semibold text-blue-900 mb-2">How this is used:</h4>
              <ul className="space-y-1 text-sm text-blue-800">
                <li>• Fees in TTD will be converted to USD using this rate</li>
                <li>• Analytics will show extra costs beyond this baseline</li>
                <li>• Dashboard displays this as your standard rate</li>
              </ul>
            </div>

            {success && (
              <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-md">
                Settings saved successfully!
              </div>
            )}

            <div className="flex gap-2 pt-4 border-t">
              <Button type="submit" disabled={saving} className="px-8">
                {saving ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2"></div>
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4 mr-2" />
                    Save Settings
                  </>
                )}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card className="shadow-md w-full max-w-2xl min-w-0 overflow-hidden">
        <CardHeader className="bg-gradient-to-r from-blue-50 to-indigo-50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-500 flex items-center justify-center">
              <Landmark className="w-5 h-5 text-white" />
            </div>
            <div>
              <CardTitle>Banks</CardTitle>
              <CardDescription>
                The banks you can assign to cards, and when each one&apos;s USD
                limit resets. Leave the reset day blank for the 1st of the month.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="hidden sm:grid grid-cols-[1fr_9rem_2.5rem] gap-3 px-1 text-xs font-medium uppercase tracking-wide text-gray-500">
              <span>Bank name</span>
              <span>Reset day</span>
              <span className="sr-only">Remove</span>
            </div>
            <div className="space-y-3">
              {banks.length === 0 && (
                <p className="text-sm text-gray-500">
                  No banks yet — add your first one below.
                </p>
              )}
              {banks.map((b, i) => (
                <div
                  key={i}
                  className="grid grid-cols-1 sm:grid-cols-[1fr_9rem_2.5rem] gap-3 sm:items-center"
                >
                  <div>
                    <Label htmlFor={`bank-name-${i}`} className="sm:sr-only">
                      Bank name
                    </Label>
                    <Input
                      id={`bank-name-${i}`}
                      value={b.name}
                      onChange={(e) =>
                        setBanks((prev) =>
                          prev.map((x, j) =>
                            j === i ? { ...x, name: e.target.value } : x
                          )
                        )
                      }
                      placeholder="e.g. First Citizens Bank"
                    />
                  </div>
                  <div>
                    <Label htmlFor={`bank-day-${i}`} className="sm:sr-only">
                      Reset day
                    </Label>
                    <Input
                      id={`bank-day-${i}`}
                      type="number"
                      inputMode="numeric"
                      min={1}
                      max={31}
                      value={b.cycleDay}
                      onChange={(e) =>
                        setBanks((prev) =>
                          prev.map((x, j) =>
                            j === i ? { ...x, cycleDay: e.target.value } : x
                          )
                        )
                      }
                      placeholder="1st"
                    />
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="justify-self-start sm:justify-self-center text-red-600 hover:bg-red-50"
                    aria-label={`Remove ${b.name || 'bank'}`}
                    onClick={() =>
                      setBanks((prev) => prev.filter((_, j) => j !== i))
                    }
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              ))}
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                setBanks((prev) => [...prev, { name: '', cycleDay: '' }])
              }
            >
              <Plus className="w-4 h-4 mr-1" />
              Add bank
            </Button>
            <p className="text-sm text-gray-500">
              The reset day drives each card&apos;s reset date and its &quot;used
              this cycle&quot; figure. Usage still counts in the calendar month it
              was logged — a cycle day never moves a charge between months. A
              per-card override on the card itself takes precedence.
            </p>
            {success && (
              <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-md">
                Settings saved successfully!
              </div>
            )}
            <div className="flex gap-2 pt-4 border-t">
              <Button type="submit" disabled={saving} className="px-8">
                {saving ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2"></div>
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4 mr-2" />
                    Save banks
                  </>
                )}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card className="shadow-md max-w-2xl bg-gradient-to-br from-gray-50 to-gray-100">
        <CardHeader>
          <CardTitle className="text-lg">Understanding Exchange Rate Markup</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-gray-700">
          <p>
            <strong>Default Rate ({defaultRate} TTD/USD):</strong> This is typically the official or mid-market exchange rate.
          </p>
          <p>
            <strong>Your Rate:</strong> When you record availability, you enter the actual rate at which you&apos;re obtaining USD.
          </p>
          <p>
            <strong>Markup/Premium:</strong> The difference between your actual rate and the default rate represents the extra cost (premium) you&apos;re paying for access to foreign currency.
          </p>
          <p className="bg-white p-3 rounded border">
            <strong>Example:</strong> If default rate is {defaultRate} TTD/USD and you pay 7.00 TTD/USD, you&apos;re paying a {((7.00 / parseFloat(defaultRate) - 1) * 100).toFixed(2)}% premium.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}

