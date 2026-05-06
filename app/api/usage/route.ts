import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { z } from 'zod'
import {
  cardHasAvailabilityForMonth,
  USAGE_REQUIRES_AVAILABILITY_MESSAGE,
} from '@/lib/card-available-for-month'
import { resolveUsageUsdAndTtdForMonth } from '@/lib/usage-entry-amounts'

export const runtime = 'nodejs'

const usageSchema = z
  .object({
    cardId: z.string().min(1, 'Card is required'),
    year: z.number().int().min(2000).max(2100),
    month: z.number().int().min(1).max(12),
    amountUSD: z.number().positive('Amount must be positive').optional(),
    amountTTD: z.number().positive('Amount must be positive').optional(),
    paidToOwnerTTD: z.number().min(0).optional(),
    usageDate: z.string().datetime().optional(),
    notes: z.string().optional(),
  })
  .refine((d) => d.amountUSD != null || d.amountTTD != null, {
    message: 'Either amountUSD or amountTTD is required',
    path: ['amountUSD'],
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
    const cardId = searchParams.get('cardId')

    let usage: Awaited<ReturnType<typeof prisma.cardUsage.findMany>>
    try {
      usage = await prisma.cardUsage.findMany({
        where: {
          card: {
            person: {
              userId: session.user.id,
            },
          },
          ...(year && { year: parseInt(year, 10) }),
          ...(month && { month: parseInt(month, 10) }),
          ...(cardId && { cardId }),
        },
        include: {
          card: {
            include: {
              person: true,
            },
          },
        },
        orderBy: [{ usageDate: 'desc' }, { createdAt: 'desc' }],
      })
    } catch (usageErr) {
      console.error('[usage GET] CardUsage query failed:', usageErr)
      usage = []
    }

    return NextResponse.json(usage)
  } catch (error) {
    console.error('Error fetching usage:', error)
    return NextResponse.json(
      { error: 'Failed to fetch usage' },
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
    const validatedData = usageSchema.parse(body)

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

    const allowed = await cardHasAvailabilityForMonth(
      validatedData.cardId,
      validatedData.year,
      validatedData.month
    )
    if (!allowed) {
      return NextResponse.json(
        { error: USAGE_REQUIRES_AVAILABILITY_MESSAGE },
        { status: 400 }
      )
    }

    const paidToOwner = validatedData.paidToOwnerTTD ?? 0

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { defaultExchangeRate: true },
    })
    const baseline =
      typeof user?.defaultExchangeRate === 'number' &&
      Number.isFinite(user.defaultExchangeRate)
        ? user.defaultExchangeRate
        : 0

    const resolved = await resolveUsageUsdAndTtdForMonth({
      cardId: validatedData.cardId,
      year: validatedData.year,
      month: validatedData.month,
      userBaseline: baseline,
      ...(validatedData.amountUSD !== undefined && {
        amountUSD: validatedData.amountUSD,
      }),
      ...(validatedData.amountTTD !== undefined && {
        amountTTD: validatedData.amountTTD,
      }),
    })
    if (!resolved.ok) {
      return NextResponse.json({ error: resolved.error }, { status: 400 })
    }
    const { amountUSD, amountTTD } = resolved

    if (paidToOwner - amountTTD > 1e-6) {
      return NextResponse.json(
        { error: 'Paid to owner (TTD) cannot be more than usage in TTD for this month.' },
        { status: 400 }
      )
    }

    const entry = await prisma.cardUsage.create({
      data: {
        cardId: validatedData.cardId,
        year: validatedData.year,
        month: validatedData.month,
        amountUSD,
        amountTTD,
        paidToOwnerTTD: paidToOwner,
        usageDate: validatedData.usageDate
          ? new Date(validatedData.usageDate)
          : new Date(),
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

    return NextResponse.json(entry, { status: 201 })
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
    console.error('Error creating usage entry:', error)
    return NextResponse.json(
      { error: 'Failed to create usage entry' },
      { status: 500 }
    )
  }
}
