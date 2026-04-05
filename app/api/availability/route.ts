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
  feeAmount: z.number().nonnegative().optional(),
  feeCurrency: z.enum(['USD', 'TTD']).optional(),
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

    const where = {
      card: {
        person: {
          userId: session.user.id,
        },
      },
      ...(year && { year: parseInt(year) }),
      ...(month && { month: parseInt(month) }),
    }

    const availability = await prisma.monthlyAvailability.findMany({
      where,
      include: {
        card: {
          include: {
            person: true,
          },
        },
      },
      orderBy: [{ year: 'desc' }, { month: 'desc' }, { paymentDate: 'asc' }],
    })

    return NextResponse.json(availability)
  } catch (error) {
    console.error('Error fetching availability:', error)
    return NextResponse.json(
      { error: 'Failed to fetch availability' },
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

    const body = await request.json()
    const validatedData = availabilitySchema.parse(body)

    // Verify card belongs to user
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

    const availability = await prisma.monthlyAvailability.create({
      data: {
        cardId: validatedData.cardId,
        year: validatedData.year,
        month: validatedData.month,
        amountUSD: validatedData.amountUSD,
        exchangeRate: validatedData.exchangeRate,
        paymentDate: new Date(validatedData.paymentDate),
        feeAmount: validatedData.feeAmount || null,
        feeCurrency: validatedData.feeCurrency || 'USD',
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

    return NextResponse.json(availability, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation error', details: error.issues },
        { status: 400 }
      )
    }
    console.error('Error creating availability:', error)
    return NextResponse.json(
      { error: 'Failed to create availability' },
      { status: 500 }
    )
  }
}
