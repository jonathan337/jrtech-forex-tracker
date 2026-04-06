import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { z } from 'zod'
import {
  mapPersonPhoneForResponse,
  parsePersonRequestBody,
  PhoneValidationError,
} from '@/lib/person-payload'

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
    const person = await prisma.person.findFirst({
      where: { 
        id,
        userId: session.user.id,
      },
      include: {
        cards: {
          include: {
            monthlyAvailability: {
              orderBy: [{ year: 'desc' }, { month: 'desc' }],
            },
          },
        },
      },
    })

    if (!person) {
      return NextResponse.json({ error: 'Person not found' }, { status: 404 })
    }

    return NextResponse.json(mapPersonPhoneForResponse(person))
  } catch (error) {
    console.error('Error fetching person:', error)
    return NextResponse.json(
      { error: 'Failed to fetch person' },
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
    const validatedData = parsePersonRequestBody(await request.json())

    // Verify ownership
    const existing = await prisma.person.findFirst({
      where: { id, userId: session.user.id },
    })

    if (!existing) {
      return NextResponse.json({ error: 'Person not found' }, { status: 404 })
    }

    const person = await prisma.person.update({
      where: { id },
      data: {
        name: validatedData.name,
        email: validatedData.email,
        phone: validatedData.phone,
        notes: validatedData.notes,
      },
    })

    return NextResponse.json(mapPersonPhoneForResponse(person))
  } catch (error) {
    if (error instanceof PhoneValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation error', details: error.issues },
        { status: 400 }
      )
    }
    console.error('Error updating person:', error)
    return NextResponse.json(
      { error: 'Failed to update person' },
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
    const existing = await prisma.person.findFirst({
      where: { id, userId: session.user.id },
    })

    if (!existing) {
      return NextResponse.json({ error: 'Person not found' }, { status: 404 })
    }

    await prisma.person.delete({
      where: { id },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting person:', error)
    return NextResponse.json(
      { error: 'Failed to delete person' },
      { status: 500 }
    )
  }
}

