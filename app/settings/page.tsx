'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Settings as SettingsIcon, Save } from 'lucide-react'

export default function SettingsPage() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [success, setSuccess] = useState(false)
  const [defaultRate, setDefaultRate] = useState('6.7993')

  useEffect(() => {
    fetchSettings()
  }, [])

  const fetchSettings = async () => {
    try {
      const response = await fetch('/api/settings')
      if (response.ok) {
        const data = await response.json()
        setDefaultRate(data.defaultExchangeRate.toString())
      }
    } catch (error) {
      console.error('Error fetching settings:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setSuccess(false)

    try {
      const response = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          defaultExchangeRate: parseFloat(defaultRate),
        }),
      })

      if (response.ok) {
        setSuccess(true)
        setTimeout(() => setSuccess(false), 3000)
      }
    } catch (error) {
      console.error('Error saving settings:', error)
    } finally {
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
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
          Settings
        </h1>
        <p className="text-gray-600 mt-1">Configure your default exchange rates and preferences</p>
      </div>

      <Card className="shadow-md max-w-2xl">
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

