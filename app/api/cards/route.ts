import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { z } from 'zod'
import { cardBodySchema, prismaDataFromCardBody } from '@/lib/card-payload'
import { cardHasAvailabilityForMonthFromLoadedCard } from '@/lib/card-available-for-month'
import { serverErrorResponse } from '@/lib/api-error'

export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const yearParam = request.nextUrl.searchParams.get('year')
    const monthParam = request.nextUrl.searchParams.get('month')
    const filterByMonth =
      yearParam != null &&
      yearParam !== '' &&
      monthParam != null &&
      monthParam !== ''
    const y = filterByMonth ? parseInt(yearParam, 10) : 0
    const m = filterByMonth ? parseInt(monthParam, 10) : 0
    const personIdParam = request.nextUrl.searchParams.get('personId')

    const cards = await prisma.card.findMany({
      where: {
        person: {
          userId: session.user.id,
          ...(personIdParam ? { id: personIdParam } : {}),
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

    if (
      filterByMonth &&
      !Number.isNaN(y) &&
      !Number.isNaN(m) &&
      y >= 2000 &&
      y <= 2100 &&
      m >= 1 &&
      m <= 12
    ) {
      const userSettings = await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { defaultExchangeRate: true },
      })
      const fallbackRate =
        typeof userSettings?.defaultExchangeRate === 'number'
          ? userSettings.defaultExchangeRate
          : null

      const filtered = cards.filter((c) =>
        cardHasAvailabilityForMonthFromLoadedCard(c, y, m)
      )
      filtered.sort((a, b) => {
        const byPerson = a.person.name.localeCompare(b.person.name, undefined, {
          sensitivity: 'base',
        })
        if (byPerson !== 0) return byPerson
        return a.cardNickname.localeCompare(b.cardNickname, undefined, {
          sensitivity: 'base',
        })
      })
      const slim = filtered.map((c) => {
        const monthRate =
          c.monthlyAvailability.find((ma) => ma.year === y && ma.month === m)
            ?.exchangeRate ?? null
        const effectiveExchangeRate =
          monthRate ??
          (c.alwaysAvailable ? c.recurringExchangeRate ?? null : null) ??
          fallbackRate
        const { monthlyAvailability, ...rest } = c
        void monthlyAvailability
        return {
          ...rest,
          effectiveExchangeRate,
        }
      })
      return NextResponse.json(slim)
    }

    return NextResponse.json(cards)
  } catch (error) {
    console.error('Error fetching cards:', error)
    return serverErrorResponse('Failed to fetch cards', error)
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
