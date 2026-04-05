import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'

export const runtime = 'nodejs'

export async function GET() {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get user's default rate
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { defaultExchangeRate: true },
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // Get all cards for the user
    const userCards = await prisma.card.findMany({
      where: {
        person: {
          userId: session.user.id,
        },
      },
      select: { id: true },
    })

    const cardIds = userCards.map((c) => c.id)

    // Get all availability data
    const availability = await prisma.monthlyAvailability.findMany({
      where: {
        cardId: {
          in: cardIds,
        },
      },
      include: {
        card: {
          include: {
            person: true,
          },
        },
      },
      orderBy: [{ year: 'asc' }, { month: 'asc' }],
    })

    // Calculate analytics
    const defaultRate = user.defaultExchangeRate

    const analytics = availability.map((item) => {
      // Convert fee to USD if needed
      const feeInUSD = item.feeAmount
        ? item.feeCurrency === 'TTD'
          ? item.feeAmount / defaultRate
          : item.feeAmount
        : 0

      // Calculate premium (extra cost beyond default rate)
      const premiumPercentage = ((item.exchangeRate / defaultRate) - 1) * 100
      const premiumCost = item.amountUSD * (item.exchangeRate - defaultRate)

      // Total cost in TTD
      const totalCostTTD = item.amountUSD * item.exchangeRate + (item.feeAmount && item.feeCurrency === 'TTD' ? item.feeAmount : 0)
      
      // Cost at default rate
      const costAtDefaultRate = item.amountUSD * defaultRate

      // Extra cost
      const extraCost = totalCostTTD - costAtDefaultRate

      return {
        ...item,
        feeInUSD,
        premiumPercentage,
        premiumCost,
        totalCostTTD,
        costAtDefaultRate,
        extraCost,
        defaultRate,
      }
    })

    // Group by month for charts
    type MonthlyDataItem = {
      period: string
      year: number
      month: number
      totalUSD: number
      totalFees: number
      totalPremiumCost: number
      totalExtraCost: number
      totalCostTTD: number
      count: number
      avgRate: number
      avgPremiumPercentage?: number
    }

    const monthlyData = analytics.reduce((acc, item) => {
      const key = `${item.year}-${String(item.month).padStart(2, '0')}`
      if (!acc[key]) {
        acc[key] = {
          period: key,
          year: item.year,
          month: item.month,
          totalUSD: 0,
          totalFees: 0,
          totalPremiumCost: 0,
          totalExtraCost: 0,
          totalCostTTD: 0,
          count: 0,
          avgRate: 0,
        }
      }
      acc[key].totalUSD += item.amountUSD
      acc[key].totalFees += item.feeInUSD
      acc[key].totalPremiumCost += item.premiumCost
      acc[key].totalExtraCost += item.extraCost
      acc[key].totalCostTTD += item.totalCostTTD
      acc[key].count += 1
      acc[key].avgRate += item.exchangeRate

      return acc
    }, {} as Record<string, MonthlyDataItem>)

    // Calculate averages
    Object.values(monthlyData).forEach((data) => {
      data.avgRate = data.avgRate / data.count
      data.avgPremiumPercentage = ((data.avgRate / defaultRate) - 1) * 100
    })

    const summary = {
      totalUSD: analytics.reduce((sum, item) => sum + item.amountUSD, 0),
      totalFees: analytics.reduce((sum, item) => sum + item.feeInUSD, 0),
      totalPremiumCost: analytics.reduce((sum, item) => sum + item.premiumCost, 0),
      totalExtraCost: analytics.reduce((sum, item) => sum + item.extraCost, 0),
      avgPremiumPercentage: analytics.length > 0
        ? analytics.reduce((sum, item) => sum + item.premiumPercentage, 0) / analytics.length
        : 0,
      defaultRate,
    }

    return NextResponse.json({
      summary,
      monthlyData: Object.values(monthlyData).sort((a, b) => a.period.localeCompare(b.period)),
      details: analytics,
    })
  } catch (error) {
    console.error('Error fetching analytics:', error)
    return NextResponse.json(
      { error: 'Failed to fetch analytics' },
      { status: 500 }
    )
  }
}

