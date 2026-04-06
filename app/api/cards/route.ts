import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { z } from 'zod'
import { cardBodySchema, prismaDataFromCardBody } from '@/lib/card-payload'

export const runtime = 'nodejs'

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

    const validatedData = cardBodySchema.parse(await request.json())

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
      data: prismaDataFromCardBody(validatedData),
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
