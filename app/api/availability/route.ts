import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { z } from 'zod'

export const runtime = 'nodejs'

const availabilitySchema = z
  .object({
    cardId: z.string().min(1, 'Card is required'),
    year: z.number().int().min(2000).max(2100),
    month: z.number().int().min(1).max(12),
    amountUSD: z.number().positive('Amount must be positive').optional(),
    exchangeRate: z.number().positive('Exchange rate must be positive').optional(),
    paymentDate: z.string().datetime().optional(),
    notes: z.string().optional(),
    unavailable: z.boolean().optional(),
  })
  .refine(
    (d) =>
      d.unavailable === true ||
      (d.amountUSD != null && d.exchangeRate != null && d.paymentDate != null),
    {
      message: 'Amount, exchange rate, and payment date are required',
      path: ['amountUSD'],
    }
  )

/** First of the given month at noon UTC — used as the payment date for "not available" rows. */
function firstOfMonthUTC(year: number, month: number): Date {
  return new Date(Date.UTC(year, month - 1, 1, 12, 0, 0))
}

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

    const unavailable = validatedData.unavailable === true

    const availability = await prisma.monthlyAvailability.create({
      data: {
        cardId: validatedData.cardId,
        year: validatedData.year,
        month: validatedData.month,
        unavailable,
        amountUSD: unavailable ? 0 : validatedData.amountUSD!,
        exchangeRate: unavailable ? validatedData.exchangeRate ?? 1 : validatedData.exchangeRate!,
        paymentDate: validatedData.paymentDate
          ? new Date(validatedData.paymentDate)
          : firstOfMonthUTC(validatedData.year, validatedData.month),
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
