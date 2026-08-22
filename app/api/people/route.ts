import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { z } from 'zod'
import { serverErrorResponse } from '@/lib/api-error'
import { loadPeople } from '@/lib/people-data'
import {
  mapPersonPhoneForResponse,
  parsePersonRequestBody,
  PhoneValidationError,
} from '@/lib/person-payload'

export const runtime = 'nodejs'

export async function GET(request: Request) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    let budgetYear = parseInt(searchParams.get('year') ?? '', 10)
    let budgetMonth = parseInt(searchParams.get('month') ?? '', 10)
    const now = new Date()
    if (!Number.isFinite(budgetYear) || budgetYear < 2000 || budgetYear > 2100) {
      budgetYear = now.getFullYear()
    }
    if (!Number.isFinite(budgetMonth) || budgetMonth < 1 || budgetMonth > 12) {
      budgetMonth = now.getMonth() + 1
    }

    const people = await loadPeople(session.user.id, budgetYear, budgetMonth)
    return NextResponse.json(people)
  } catch (error) {
    console.error('Error fetching people:', error)
    return serverErrorResponse('Failed to fetch people', error)
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

