import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { z } from 'zod'

export const runtime = 'nodejs'

const availabilitySchema = z.object({
  cardId: z.string().min(1, 'Card is required'),
  year: z.number().int().min(2000).max(2100),
  month: z.number().int().min(1).max(12),
  amountUSD: z.number().positive('Amount must be positive'),
  exchangeRate: z.number().positive('Exchange rate must be positive'),
  paymentDate: z.string().datetime(),
  notes: z.string().optional(),
})

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params
    const availability = await prisma.monthlyAvailability.findFirst({
      where: {
        id,
        card: {
          person: {
            userId: session.user.id,
          },
        },
      },
      include: {
        card: {
          include: {
            person: true,
          },
        },
      },
    })

    if (!availability) {
      return NextResponse.json(
        { error: 'Availability not found' },
        { status: 404 }
      )
    }

    return NextResponse.json(availability)
  } catch (error) {
    console.error('Error fetching availability:', error)
    return NextResponse.json(
      { error: 'Failed to fetch availability' },
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
    const body = await request.json()
    const validatedData = availabilitySchema.parse(body)

    // Verify ownership
    const existing = await prisma.monthlyAvailability.findFirst({
      where: {
        id,
        card: {
          person: {
            userId: session.user.id,
          },
        },
      },
    })

    if (!existing) {
      return NextResponse.json(
        { error: 'Availability not found' },
        { status: 404 }
      )
    }

    // Verify new card belongs to user
    const card = await prisma.card.findFirst({
      where: {
        id: validatedData.cardId,
        person: {
          userId: session.user.id,
        },
      },
    })

    if (!card) {
      return NextResponse.json({ error: 'Card not found' }, { status: 404 })
    }

    const availability = await prisma.monthlyAvailability.update({
      where: { id },
      data: {
        cardId: validatedData.cardId,
        year: validatedData.year,
        month: validatedData.month,
        amountUSD: validatedData.amountUSD,
        exchangeRate: validatedData.exchangeRate,
        paymentDate: new Date(validatedData.paymentDate),
        notes: validatedData.notes || null,
      },
      include: {
        card: {
          include: {
            person: true,
          },
        },
      },
    })

    return NextResponse.json(availability)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation error', details: error.issues },
        { status: 400 }
      )
    }
    console.error('Error updating availability:', error)
    return NextResponse.json(
      { error: 'Failed to update availability' },
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

    // Verify ownership
    const existing = await prisma.monthlyAvailability.findFirst({
      where: {
        id,
        card: {
          person: {
            userId: session.user.id,
          },
        },
      },
    })

    if (!existing) {
      return NextResponse.json(
        { error: 'Availability not found' },
        { status: 404 }
      )
    }

    await prisma.monthlyAvailability.delete({
      where: { id },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting availability:', error)
    return NextResponse.json(
      { error: 'Failed to delete availability' },
      { status: 500 }
    )
  }
}
