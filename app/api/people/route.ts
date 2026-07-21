import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { z } from 'zod'
import { serverErrorResponse } from '@/lib/api-error'
import { loadMonthAvailabilityWithUsage } from '@/lib/month-availability-with-usage'
import { loadOwedByPerson } from '@/lib/owed-by-person'
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

    // Owed totals are aggregated in the database (see lib/owed-by-person.ts) —
    // the previous implementation fetched every CardUsage row ever recorded.
    const [people, monthBundle, { owedTTDByPerson, owedUSDByPerson }] =
      await Promise.all([
        prisma.person.findMany({
          where: {
            userId: session.user.id,
          },
          include: {
            cards: {
              select: {
                id: true,
                cardNickname: true,
                issuingBank: true,
              },
            },
          },
          orderBy: {
            name: 'asc',
          },
        }),
        loadMonthAvailabilityWithUsage(session.user.id, budgetYear, budgetMonth),
        loadOwedByPerson(session.user.id),
      ])

    const round2 = (n: number) => Math.round(n * 100) / 100

    const headroomTTDByPerson = new Map<string, number>()
    const headroomUSDByPerson = new Map<string, number>()
    const monthTotalAvailabilityUSDByPerson = new Map<string, number>()
    for (const row of monthBundle.availabilityWithUsage) {
      const pid = row.card.person.id
      headroomTTDByPerson.set(
        pid,
        (headroomTTDByPerson.get(pid) ?? 0) + row.balanceTTD
      )
      headroomUSDByPerson.set(
        pid,
        (headroomUSDByPerson.get(pid) ?? 0) + row.balanceUSD
      )
      const capUsd =
        typeof row.amountUSD === 'number' && Number.isFinite(row.amountUSD)
          ? row.amountUSD
          : 0
      monthTotalAvailabilityUSDByPerson.set(
        pid,
        (monthTotalAvailabilityUSDByPerson.get(pid) ?? 0) + capUsd
      )
    }

    return NextResponse.json(
      people.map((p) => ({
        ...mapPersonPhoneForResponse(p),
        owedUSD: round2(owedUSDByPerson.get(p.id) ?? 0),
        owedTTD: round2(owedTTDByPerson.get(p.id) ?? 0),
        spendHeadroomTTD: round2(headroomTTDByPerson.get(p.id) ?? 0),
        spendHeadroomUSD: round2(headroomUSDByPerson.get(p.id) ?? 0),
        monthTotalAvailabilityUSD: round2(
          monthTotalAvailabilityUSDByPerson.get(p.id) ?? 0
        ),
        budgetYear,
        budgetMonth,
      }))
    )
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

