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

export async function GET() {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const people = await prisma.person.findMany({
      where: {
        userId: session.user.id,
      },
      include: {
        // Only fields the People UI needs — avoids querying new Card columns until
        // migrations are applied, and keeps the query light.
        cards: {
          select: {
            id: true,
            cardNickname: true,
          },
        },
      },
      orderBy: {
        name: 'asc',
      },
    })
    return NextResponse.json(people.map((p) => mapPersonPhoneForResponse(p)))
  } catch (error) {
    console.error('Error fetching people:', error)
    return NextResponse.json(
      { error: 'Failed to fetch people' },
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

    const validatedData = parsePersonRequestBody(await request.json())

    const person = await prisma.person.create({
      data: {
        userId: session.user.id,
        name: validatedData.name,
        email: validatedData.email,
        phone: validatedData.phone,
        notes: validatedData.notes,
      },
    })

    return NextResponse.json(mapPersonPhoneForResponse(person), { status: 201 })
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
    console.error('Error creating person:', error)
    return NextResponse.json(
      { error: 'Failed to create person' },
      { status: 500 }
    )
  }
}

