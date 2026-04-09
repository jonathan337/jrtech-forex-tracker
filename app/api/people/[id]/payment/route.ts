import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { z } from 'zod'
import { serverErrorResponse } from '@/lib/api-error'

export const runtime = 'nodejs'

const bodySchema = z.object({
  /** TTD paid to this person; applied to unpaid usage oldest-first (TTD fields on each row). */
  amountTTD: z.number().positive('Amount must be positive'),
})

const EPS = 1e-6

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id: personId } = await params

    const person = await prisma.person.findFirst({
      where: { id: personId, userId: session.user.id },
      select: { id: true, name: true },
    })
    if (!person) {
      return NextResponse.json({ error: 'Person not found' }, { status: 404 })
    }

    const body = await request.json()
    const { amountTTD } = bodySchema.parse(body)

    const usages = await prisma.cardUsage.findMany({
      where: {
        card: {
          personId,
          person: { userId: session.user.id },
        },
      },
      include: {
        card: {
          select: {
            cardNickname: true,
          },
        },
      },
      orderBy: [{ usageDate: 'asc' }, { createdAt: 'asc' }],
    })

    type Row = (typeof usages)[number]

    const unpaidRows: { row: Row; unpaidTTD: number }[] = []
    for (const row of usages) {
      const unpaidTTD = round2(row.amountTTD - row.paidToOwnerTTD)
      if (unpaidTTD > EPS) {
        unpaidRows.push({ row, unpaidTTD })
      }
    }

    if (unpaidRows.length === 0) {
      return NextResponse.json(
        {
          error:
            'No unpaid usage for this person. Log usage first, or amounts are already fully paid back.',
        },
        { status: 400 }
      )
    }

    let remainingTTD = round2(amountTTD)
    const updates: { id: string; newPaid: number }[] = []
    const allocations: Array<{
      usageId: string
      amountAppliedTTD: number
      cardNickname: string
      usageDate: string
    }> = []

    for (const { row, unpaidTTD } of unpaidRows) {
      if (remainingTTD <= EPS) break

      const applyTTD = round2(Math.min(remainingTTD, unpaidTTD))
      if (applyTTD <= EPS) continue

      const newPaid = round2(row.paidToOwnerTTD + applyTTD)
      if (newPaid - row.amountTTD > EPS) {
        return NextResponse.json(
          { error: 'Internal error: payment would exceed usage amount.' },
          { status: 500 }
        )
      }

      updates.push({ id: row.id, newPaid })
      allocations.push({
        usageId: row.id,
        amountAppliedTTD: applyTTD,
        cardNickname: row.card.cardNickname,
        usageDate: row.usageDate.toISOString(),
      })

      remainingTTD = round2(remainingTTD - applyTTD)
    }

    if (updates.length === 0) {
      return NextResponse.json(
        { error: 'Could not apply payment.' },
        { status: 400 }
      )
    }

    await prisma.$transaction(
      updates.map((u) =>
        prisma.cardUsage.update({
          where: { id: u.id },
          data: { paidToOwnerTTD: u.newPaid },
        })
      )
    )

    const appliedTTD = round2(
      allocations.reduce((s, a) => s + a.amountAppliedTTD, 0)
    )
    const surplusTTD = round2(amountTTD - appliedTTD)

    return NextResponse.json({
      appliedTTD,
      surplusTTD: surplusTTD > EPS ? surplusTTD : 0,
      allocations,
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation error', details: error.issues },
        { status: 400 }
      )
    }
    console.error('Error applying person payment:', error)
    return serverErrorResponse('Failed to apply payment', error)
  }
}
