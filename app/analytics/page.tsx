'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { TrendingUp, DollarSign, Percent, AlertCircle } from 'lucide-react'

interface AnalyticsData {
  summary: {
    totalUSD: number
    totalFees: number
    totalPremiumCost: number
    totalExtraCost: number
    avgPremiumPercentage: number
    defaultRate: number
  }
  monthlyData: Array<{
    period: string
    year: number
    month: number
    totalUSD: number
    totalFees: number
    totalPremiumCost: number
    totalExtraCost: number
    avgRate: number
    avgPremiumPercentage: number
  }>
}

const COLORS = ['#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export default function AnalyticsPage() {
  const [data, setData] = useState<AnalyticsData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchAnalytics()
  }, [])

  const fetchAnalytics = async () => {
    try {
      const response = await fetch('/api/analytics')
      if (response.ok) {
        const analyticsData = await response.json()
        setData(analyticsData)
      }
    } catch (error) {
      console.error('Error fetching analytics:', error)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="text-center py-12">
        <div className="inline-block w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
        <p className="text-gray-500 mt-4">Loading analytics...</p>
      </div>
    )
  }

  if (!data) {
    return (
      <div className="text-center py-12">
        <AlertCircle className="w-16 h-16 text-gray-300 mx-auto mb-4" />
        <p className="text-gray-500">No data available</p>
      </div>
    )
  }

  const chartData = data.monthlyData.map(item => ({
    name: `${MONTHS[item.month - 1]} ${item.year}`,
    USD: item.totalUSD,
    Fees: item.totalFees,
    Premium: item.totalPremiumCost,
    'Extra Cost': item.totalExtraCost,
    Rate: item.avgRate,
  }))

  const costBreakdown = [
    { name: 'Base USD Cost', value: data.summary.totalUSD * data.summary.defaultRate, color: COLORS[0] },
    { name: 'Rate Premium', value: data.summary.totalPremiumCost, color: COLORS[1] },
    { name: 'Fees', value: data.summary.totalFees * data.summary.defaultRate, color: COLORS[2] },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
          Analytics & Insights
        </h1>
        <p className="text-gray-600 mt-1">Track your foreign currency costs and premiums</p>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="shadow-md hover:shadow-lg transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total USD Acquired</CardTitle>
            <div className="w-8 h-8 rounded-lg bg-green-100 flex items-center justify-center">
              <DollarSign className="h-4 w-4 text-green-600" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">${data.summary.totalUSD.toFixed(2)}</div>
            <p className="text-xs text-gray-500 mt-1">Total foreign currency obtained</p>
          </CardContent>
        </Card>

        <Card className="shadow-md hover:shadow-lg transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Extra Cost</CardTitle>
            <div className="w-8 h-8 rounded-lg bg-red-100 flex items-center justify-center">
              <TrendingUp className="h-4 w-4 text-red-600" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">${data.summary.totalExtraCost.toFixed(2)}</div>
            <p className="text-xs text-gray-500 mt-1">TTD - Beyond default rate</p>
          </CardContent>
        </Card>

        <Card className="shadow-md hover:shadow-lg transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg Premium</CardTitle>
            <div className="w-8 h-8 rounded-lg bg-orange-100 flex items-center justify-center">
              <Percent className="h-4 w-4 text-orange-600" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-600">{data.summary.avgPremiumPercentage.toFixed(2)}%</div>
            <p className="text-xs text-gray-500 mt-1">Above default rate of {data.summary.defaultRate.toFixed(4)}</p>
          </CardContent>
        </Card>

        <Card className="shadow-md hover:shadow-lg transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Fees</CardTitle>
            <div className="w-8 h-8 rounded-lg bg-purple-100 flex items-center justify-center">
              <DollarSign className="h-4 w-4 text-purple-600" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-purple-600">${data.summary.totalFees.toFixed(2)}</div>
            <p className="text-xs text-gray-500 mt-1">USD - Processing & other fees</p>
          </CardContent>
        </Card>
      </div>

      {/* Charts Row 1 */}
      <div className="grid gap-6 md:grid-cols-2">
        <Card className="shadow-md">
          <CardHeader>
            <CardTitle>Monthly USD Availability</CardTitle>
            <CardDescription>Total USD acquired per month</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Bar dataKey="USD" fill={COLORS[0]} name="USD Amount" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="shadow-md">
          <CardHeader>
            <CardTitle>Cost Breakdown</CardTitle>
            <CardDescription>Total cost composition in TTD</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={costBreakdown}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {costBreakdown.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value?: number | string) => {
                    const n = typeof value === "number" ? value : Number(value);
                    if (Number.isNaN(n)) return "";
                    return `$${n.toFixed(2)}`;
                  }}
                />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Charts Row 2 */}
      <div className="grid gap-6 md:grid-cols-2">
        <Card className="shadow-md">
          <CardHeader>
            <CardTitle>Premium & Extra Costs</CardTitle>
            <CardDescription>Costs beyond the default exchange rate</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Bar dataKey="Premium" fill={COLORS[1]} name="Rate Premium (TTD)" />
                <Bar dataKey="Fees" fill={COLORS[2]} name="Fees (USD)" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="shadow-md">
          <CardHeader>
            <CardTitle>Exchange Rate Trend</CardTitle>
            <CardDescription>Average rates paid over time</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis domain={['dataMin - 0.1', 'dataMax + 0.1']} />
                <Tooltip />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="Rate"
                  stroke={COLORS[0]}
                  name="Avg Rate (TTD/USD)"
                  strokeWidth={2}
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Info Card */}
      <Card className="bg-gradient-to-br from-blue-50 to-indigo-50 border-2 border-blue-200">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-blue-600" />
            Understanding Your Costs
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p>
            <strong>Default Rate ({data.summary.defaultRate.toFixed(4)} TTD/USD):</strong> Your baseline exchange rate set in Settings.
          </p>
          <p>
            <strong>Rate Premium:</strong> Extra TTD paid per USD beyond the default rate. If you pay 7.00 TTD/USD vs default of {data.summary.defaultRate.toFixed(4)}, the premium is {((7.00 - data.summary.defaultRate) * 100 / data.summary.defaultRate).toFixed(2)}%.
          </p>
          <p>
            <strong>Extra Cost:</strong> Total additional TTD spent beyond what you would pay at the default rate, including premiums and fees.
          </p>
          <p className="pt-2 border-t border-blue-200">
            💡 <strong>Tip:</strong> Look for cards with lower exchange rates and minimal fees to reduce your extra costs!
          </p>
        </CardContent>
      </Card>
    </div>
  )
}

