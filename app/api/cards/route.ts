import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { z } from 'zod'

export const runtime = 'nodejs'

const cardSchema = z.object({
  personId: z.string().min(1, 'Person is required'),
  cardNickname: z.string().min(1, 'Card nickname is required'),
  lastFourDigits: z.string().optional(),
  notes: z.string().optional(),
})

export async function GET() {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const cards = await prisma.card.findMany({
      where: {
        person: {
          userId: session.user.id,
        },
      },
      include: {
        person: true,
        monthlyAvailability: {
          orderBy: [{ year: 'desc' }, { month: 'desc' }],
        },
      },
      orderBy: {
        cardNickname: 'asc',
      },
    })
    return NextResponse.json(cards)
  } catch (error) {
    console.error('Error fetching cards:', error)
    return NextResponse.json(
      { error: 'Failed to fetch cards' },
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
    const validatedData = cardSchema.parse(body)

    // Verify person belongs to user
    const person = await prisma.person.findFirst({
      where: {
        id: validatedData.personId,
        userId: session.user.id,
      },
    })

    if (!person) {
      return NextResponse.json(
        { error: 'Person not found' },
        { status: 404 }
      )
    }

    const card = await prisma.card.create({
      data: {
        personId: validatedData.personId,
        cardNickname: validatedData.cardNickname,
        lastFourDigits: validatedData.lastFourDigits || null,
        notes: validatedData.notes || null,
      },
      include: {
        person: true,
      },
    })

    return NextResponse.json(card, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation error', details: error.issues },
        { status: 400 }
      )
    }
    console.error('Error creating card:', error)
    return NextResponse.json(
      { error: 'Failed to create card' },
      { status: 500 }
    )
  }
}

