import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { z } from 'zod'
import { serverErrorResponse } from '@/lib/api-error'
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

    const [people, usageRows, baselineRow] = await Promise.all([
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
      prisma.cardUsage.findMany({
        where: {
          card: {
            person: {
              userId: session.user.id,
            },
          },
        },
        select: {
          amountUSD: true,
          paidToOwnerUSD: true,
          year: true,
          month: true,
          cardId: true,
          card: {
            select: {
              personId: true,
              alwaysAvailable: true,
              recurringExchangeRate: true,
            },
          },
        },
      }),
      prisma.user.findUnique({
        where: { id: session.user.id },
        select: { defaultExchangeRate: true },
      }),
    ])

    const baseline = baselineRow?.defaultExchangeRate ?? 0

    const monthKeys = [
      ...new Map(
        usageRows.map((u) => [
          `${u.cardId}\t${u.year}\t${u.month}`,
          { cardId: u.cardId, year: u.year, month: u.month },
        ])
      ).values(),
    ]

    const monthlyRates =
      monthKeys.length === 0
        ? []
        : await prisma.monthlyAvailability.findMany({
            where: { OR: monthKeys },
            select: {
              cardId: true,
              year: true,
              month: true,
              exchangeRate: true,
            },
          })

    const rateByCardMonth = new Map(
      monthlyRates.map((m) => [
        `${m.cardId}\t${m.year}\t${m.month}`,
        m.exchangeRate,
      ])
    )

    const owedUSDByPerson = new Map<string, number>()
    const owedTTDByPerson = new Map<string, number>()

    for (const row of usageRows) {
      const pid = row.card.personId
      const unpaid = row.amountUSD - row.paidToOwnerUSD
      if (unpaid <= 0) continue

      owedUSDByPerson.set(pid, (owedUSDByPerson.get(pid) ?? 0) + unpaid)

      const k = `${row.cardId}\t${row.year}\t${row.month}`
      let rate = rateByCardMonth.get(k)
      if (rate == null && row.card.alwaysAvailable) {
        const r = row.card.recurringExchangeRate
        if (r != null) rate = r
      }
      if (rate == null && baseline > 0) {
        rate = baseline
      }
      if (rate != null) {
        owedTTDByPerson.set(pid, (owedTTDByPerson.get(pid) ?? 0) + unpaid * rate)
      }
    }

    const round2 = (n: number) => Math.round(n * 100) / 100

    return NextResponse.json(
      people.map((p) => ({
        ...mapPersonPhoneForResponse(p),
        owedUSD: round2(owedUSDByPerson.get(p.id) ?? 0),
        owedTTD: round2(owedTTDByPerson.get(p.id) ?? 0),
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

