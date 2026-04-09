import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { z } from 'zod'
import {
  cardHasAvailabilityForMonth,
  USAGE_REQUIRES_AVAILABILITY_MESSAGE,
} from '@/lib/card-available-for-month'

export const runtime = 'nodejs'

const usageUpdateSchema = z
  .object({
    cardId: z.string().min(1).optional(),
    year: z.number().int().min(2000).max(2100).optional(),
    month: z.number().int().min(1).max(12).optional(),
    amountUSD: z.number().positive('Amount must be positive').optional(),
    amountTTD: z.number().positive('Amount must be positive').optional(),
    paidToOwnerTTD: z.number().min(0).optional(),
    usageDate: z.string().datetime().optional(),
    notes: z.string().optional().nullable(),
  })

async function ownershipWhere(sessionUserId: string, id: string) {
  return prisma.cardUsage.findFirst({
    where: {
      id,
      card: {
        person: {
          userId: sessionUserId,
        },
      },
    },
  })
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params
    const existing = await ownershipWhere(session.user.id, id)

    if (!existing) {
      return NextResponse.json({ error: 'Usage entry not found' }, { status: 404 })
    }

    const body = await request.json()
    const validatedData = usageUpdateSchema.parse(body)

    if (Object.keys(validatedData).length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
    }

    const nextCardId = validatedData.cardId ?? existing.cardId
    const nextYear = validatedData.year ?? existing.year
    const nextMonth = validatedData.month ?? existing.month

    if (validatedData.cardId) {
      const card = await prisma.card.findFirst({
        where: {
          id: nextCardId,
          person: { userId: session.user.id },
        },
      })
      if (!card) {
        return NextResponse.json({ error: 'Card not found' }, { status: 404 })
      }
    }

    const targetChanged =
      nextCardId !== existing.cardId ||
      nextYear !== existing.year ||
      nextMonth !== existing.month

    if (targetChanged) {
      const allowed = await cardHasAvailabilityForMonth(
        nextCardId,
        nextYear,
        nextMonth
      )
      if (!allowed) {
        return NextResponse.json(
          { error: USAGE_REQUIRES_AVAILABILITY_MESSAGE },
          { status: 400 }
        )
      }
    }

    const nextAmountUSDBase =
      validatedData.amountUSD ??
      existing.amountUSD ??
      validatedData.amountTTD ??
      existing.amountTTD
    const nextAmount = validatedData.amountTTD ?? nextAmountUSDBase
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { defaultExchangeRate: true },
    })
    const fallbackRate =
      typeof user?.defaultExchangeRate === 'number' &&
      Number.isFinite(user.defaultExchangeRate) &&
      user.defaultExchangeRate > 0
        ? user.defaultExchangeRate
        : null
    const nextAmountUSD =
      validatedData.amountUSD ??
      existing.amountUSD ??
      (fallbackRate ? nextAmount / fallbackRate : null)
    const paidToOwnerPatch =
      validatedData.paidToOwnerTTD !== undefined
        ? validatedData.paidToOwnerTTD
        : undefined

    const updateData = {
      ...(validatedData.cardId !== undefined && { cardId: validatedData.cardId }),
      ...(validatedData.year !== undefined && { year: validatedData.year }),
      ...(validatedData.month !== undefined && { month: validatedData.month }),
      ...(validatedData.amountTTD !== undefined && {
        amountTTD: validatedData.amountTTD,
      }),
      ...(validatedData.amountTTD !== undefined || validatedData.amountUSD !== undefined
        ? { amountUSD: nextAmountUSD }
        : {}),
      ...(paidToOwnerPatch !== undefined && {
        paidToOwnerTTD: paidToOwnerPatch,
      }),
      ...(validatedData.usageDate !== undefined && {
        usageDate: new Date(validatedData.usageDate),
      }),
      ...(validatedData.notes !== undefined && {
        notes: validatedData.notes,
      }),
    }

    const updated = await prisma.cardUsage.update({
      where: { id },
      data: updateData,
      include: {
        card: {
          include: {
            person: true,
          },
        },
      },
    })

    return NextResponse.json(updated)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation error', details: error.issues },
        { status: 400 }
      )
    }
    const msg = error instanceof Error ? error.message : String(error)
    if (msg.includes('amountUSD')) {
      return NextResponse.json(
        {
          error:
            'Database missing CardUsage.amountUSD. Run: ALTER TABLE "CardUsage" ADD COLUMN IF NOT EXISTS "amountUSD" DOUBLE PRECISION;',
        },
        { status: 500 }
      )
    }
    console.error('Error updating usage:', error)
    return NextResponse.json(
      { error: 'Failed to update usage entry' },
      { status: 500 }
    )
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params
    const existing = await ownershipWhere(session.user.id, id)

    if (!existing) {
      return NextResponse.json({ error: 'Usage entry not found' }, { status: 404 })
    }

    await prisma.cardUsage.delete({ where: { id } })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting usage:', error)
    return NextResponse.json(
      { error: 'Failed to delete usage entry' },
      { status: 500 }
    )
  }
}
