import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { z } from 'zod'
import {
  isUsdPurchaseMethod,
  USD_PURCHASE_METHODS,
} from '@/lib/usd-purchase-methods'
import { loadMonthUsdCostSummary } from '@/lib/month-usd-cost-summary'

export const runtime = 'nodejs'

const purchaseSchema = z.object({
  year: z.number().int().min(2000).max(2100),
  month: z.number().int().min(1).max(12),
  amountUSD: z.number().positive('USD amount must be positive'),
  amountTTD: z.number().positive('TTD amount must be positive'),
  method: z.enum(USD_PURCHASE_METHODS),
  purchasedAt: z.string().datetime(),
  notes: z.string().optional(),
})

export async function GET(request: Request) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const year = searchParams.get('year')
    const month = searchParams.get('month')

    if (!year || !month) {
      return NextResponse.json(
        { error: 'Year and month are required' },
        { status: 400 }
      )
    }

    const y = parseInt(year, 10)
    const m = parseInt(month, 10)

    const [purchases, summary] = await Promise.all([
      prisma.usdPurchase.findMany({
        where: { userId: session.user.id, year: y, month: m },
        orderBy: { purchasedAt: 'desc' },
      }),
      loadMonthUsdCostSummary(session.user.id, y, m),
    ])

    return NextResponse.json({ purchases, summary })
  } catch (error) {
    console.error('Error fetching USD purchases:', error)
    return NextResponse.json(
      { error: 'Failed to fetch USD purchases' },
      { status: 500 }
    )
  }
}

export async function POST(request: Request) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const validated = purchaseSchema.parse(await request.json())

    if (!isUsdPurchaseMethod(validated.method)) {
      return NextResponse.json({ error: 'Invalid method' }, { status: 400 })
    }

    const purchase = await prisma.usdPurchase.create({
      data: {
        userId: session.user.id,
        year: validated.year,
        month: validated.month,
        amountUSD: validated.amountUSD,
        amountTTD: validated.amountTTD,
        method: validated.method,
        purchasedAt: new Date(validated.purchasedAt),
        notes: validated.notes || null,
      },
    })

    return NextResponse.json(purchase, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation error', details: error.issues },
        { status: 400 }
      )
    }
    console.error('Error creating USD purchase:', error)
    return NextResponse.json(
      { error: 'Failed to create USD purchase' },
      { status: 500 }
    )
  }
}
