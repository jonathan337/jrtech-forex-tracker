import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { z } from 'zod'
import {
  isUsdPurchaseMethod,
  USD_PURCHASE_METHODS,
} from '@/lib/usd-purchase-methods'

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

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params

    const existing = await prisma.usdPurchase.findFirst({
      where: { id, userId: session.user.id },
    })

    if (!existing) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    await prisma.usdPurchase.delete({ where: { id } })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting USD purchase:', error)
    return NextResponse.json(
      { error: 'Failed to delete USD purchase' },
      { status: 500 }
    )
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params
    const validated = purchaseSchema.parse(await request.json())

    if (!isUsdPurchaseMethod(validated.method)) {
      return NextResponse.json({ error: 'Invalid method' }, { status: 400 })
    }

    const existing = await prisma.usdPurchase.findFirst({
      where: { id, userId: session.user.id },
    })

    if (!existing) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    const purchase = await prisma.usdPurchase.update({
      where: { id },
      data: {
        year: validated.year,
        month: validated.month,
        amountUSD: validated.amountUSD,
        amountTTD: validated.amountTTD,
        method: validated.method,
        purchasedAt: new Date(validated.purchasedAt),
        notes: validated.notes || null,
      },
    })

    return NextResponse.json(purchase)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation error', details: error.issues },
        { status: 400 }
      )
    }
    console.error('Error updating USD purchase:', error)
    return NextResponse.json(
      { error: 'Failed to update USD purchase' },
      { status: 500 }
    )
  }
}
