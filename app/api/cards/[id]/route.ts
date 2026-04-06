import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { z } from 'zod'
import { cardBodySchema, prismaDataFromCardBody } from '@/lib/card-payload'

export const runtime = 'nodejs'

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
    const card = await prisma.card.findFirst({
      where: {
        id,
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
    })

    if (!card) {
      return NextResponse.json({ error: 'Card not found' }, { status: 404 })
    }

    return NextResponse.json(card)
  } catch (error) {
    console.error('Error fetching card:', error)
    return NextResponse.json(
      { error: 'Failed to fetch card' },
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
    const validatedData = cardBodySchema.parse(await request.json())

    const existing = await prisma.card.findFirst({
      where: {
        id,
        person: {
          userId: session.user.id,
        },
      },
    })

    if (!existing) {
      return NextResponse.json({ error: 'Card not found' }, { status: 404 })
    }

    const person = await prisma.person.findFirst({
      where: {
        id: validatedData.personId,
        userId: session.user.id,
      },
    })

    if (!person) {
      return NextResponse.json({ error: 'Person not found' }, { status: 404 })
    }

    const card = await prisma.card.update({
      where: { id },
      data: prismaDataFromCardBody(validatedData),
      include: {
        person: true,
      },
    })

    return NextResponse.json(card)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation error', details: error.issues },
        { status: 400 }
      )
    }
    console.error('Error updating card:', error)
    return NextResponse.json(
      { error: 'Failed to update card' },
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

    const existing = await prisma.card.findFirst({
      where: {
        id,
        person: {
          userId: session.user.id,
        },
      },
    })

    if (!existing) {
      return NextResponse.json({ error: 'Card not found' }, { status: 404 })
    }

    await prisma.card.delete({
      where: { id },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting card:', error)
    return NextResponse.json(
      { error: 'Failed to delete card' },
      { status: 500 }
    )
  }
}
