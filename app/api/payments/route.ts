import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { z } from 'zod'
import { serverErrorResponse } from '@/lib/api-error'

export const runtime = 'nodejs'

function monthBoundsUTC(year: number, month: number): { start: Date; end: Date } {
  const start = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0))
  const end = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999))
  return { start, end }
}

const postSchema = z.object({
  amountTTD: z.number().positive('Amount must be positive'),
  paidAt: z.string().min(1, 'Date is required'),
  personId: z.string().min(1).optional().nullable(),
  notes: z.string().optional().nullable(),
})

export async function GET(request: Request) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const y = searchParams.get('year')
    const m = searchParams.get('month')
    const yi = y ? parseInt(y, 10) : NaN
    const mi = m ? parseInt(m, 10) : NaN

    const now = new Date()
    const year = Number.isFinite(yi) && yi >= 2000 && yi <= 2100 ? yi : now.getUTCFullYear()
    const month =
      Number.isFinite(mi) && mi >= 1 && mi <= 12 ? mi : now.getUTCMonth() + 1

    const { start, end } = monthBoundsUTC(year, month)

    const rows = await prisma.sentPayment.findMany({
      where: {
        userId: session.user.id,
        paidAt: { gte: start, lte: end },
      },
      include: {
        person: { select: { id: true, name: true } },
      },
      orderBy: [{ paidAt: 'desc' }, { createdAt: 'desc' }],
    })

    return NextResponse.json({
      year,
      month,
      payments: rows.map((r) => ({
        id: r.id,
        amountTTD: r.amountTTD,
        paidAt: r.paidAt.toISOString(),
        notes: r.notes,
        personId: r.personId,
        personName: r.person?.name ?? null,
      })),
    })
  } catch (error) {
    console.error('Error fetching payments:', error)
    return serverErrorResponse('Failed to fetch payments', error)
  }
}

export async function POST(request: Request) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const data = postSchema.parse(body)

    let personId: string | null =
      data.personId && data.personId.trim() ? data.personId.trim() : null
    if (personId) {
      const person = await prisma.person.findFirst({
        where: { id: personId, userId: session.user.id },
        select: { id: true },
      })
      if (!person) {
        return NextResponse.json({ error: 'Person not found' }, { status: 404 })
      }
    } else {
      personId = null
    }

    const paidAt = new Date(`${data.paidAt.trim()}T12:00:00.000Z`)
    if (Number.isNaN(paidAt.getTime())) {
      return NextResponse.json({ error: 'Invalid payment date' }, { status: 400 })
    }

    const created = await prisma.sentPayment.create({
      data: {
        userId: session.user.id,
        personId,
        amountTTD: data.amountTTD,
        paidAt,
        notes: data.notes?.trim() || null,
      },
      include: {
        person: { select: { id: true, name: true } },
      },
    })

    return NextResponse.json({
      id: created.id,
      amountTTD: created.amountTTD,
      paidAt: created.paidAt.toISOString(),
      notes: created.notes,
      personId: created.personId,
      personName: created.person?.name ?? null,
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation error', details: error.issues },
        { status: 400 }
      )
    }
    console.error('Error creating payment:', error)
    return serverErrorResponse('Failed to create payment', error)
  }
}
