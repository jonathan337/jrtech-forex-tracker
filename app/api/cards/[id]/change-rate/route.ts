import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { z } from 'zod'
import { paymentDateInMonthUTC } from '@/lib/recurring-availability'
import { monthsToFreeze } from '@/lib/change-card-rate'

export const runtime = 'nodejs'

const bodySchema = z.object({
  newRate: z.number().positive('Rate must be positive'),
  effectiveYear: z.number().int().min(2000).max(2100),
  effectiveMonth: z.number().int().min(1).max(12),
})

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params
    const { newRate, effectiveYear, effectiveMonth } = bodySchema.parse(
      await request.json()
    )

    const card = await prisma.card.findFirst({
      where: { id, person: { userId: session.user.id } },
    })
    if (!card) return NextResponse.json({ error: 'Card not found' }, { status: 404 })

    if (
      !card.alwaysAvailable ||
      card.recurringExchangeRate == null ||
      card.recurringAmountUSD == null ||
      card.recurringPaymentDay == null
    ) {
      return NextResponse.json(
        {
          error:
            'This card is not set to a recurring monthly rate. Use per-month availability to change its rate.',
        },
        { status: 400 }
      )
    }

    const oldRate = card.recurringExchangeRate
    if (Math.abs(oldRate - newRate) < 1e-9) {
      return NextResponse.json({
        ok: true,
        frozenMonths: 0,
        oldRate,
        newRate,
        message: 'Rate unchanged.',
      })
    }

    // Freeze from the card's earliest logged usage up to the month before the
    // change. Months with no usage before the change carry no owed money, so
    // they don't need an explicit row.
    const earliest = await prisma.cardUsage.findFirst({
      where: { cardId: card.id },
      orderBy: [{ year: 'asc' }, { month: 'asc' }],
      select: { year: true, month: true },
    })

    let frozen = 0
    if (earliest) {
      const candidates = monthsToFreeze(
        earliest.year,
        earliest.month,
        effectiveYear,
        effectiveMonth
      )
      if (candidates.length > 0) {
        // Skip months that already have an explicit availability row.
        const existing = await prisma.monthlyAvailability.findMany({
          where: {
            cardId: card.id,
            OR: candidates.map((c) => ({ year: c.year, month: c.month })),
          },
          select: { year: true, month: true },
        })
        const have = new Set(existing.map((e) => `${e.year}-${e.month}`))
        const toCreate = candidates.filter(
          (c) => !have.has(`${c.year}-${c.month}`)
        )
        if (toCreate.length > 0) {
          await prisma.monthlyAvailability.createMany({
            data: toCreate.map((c) => ({
              cardId: card.id,
              year: c.year,
              month: c.month,
              amountUSD: card.recurringAmountUSD as number,
              exchangeRate: oldRate,
              paymentDate: paymentDateInMonthUTC(
                c.year,
                c.month,
                card.recurringPaymentDay as number
              ),
              notes: card.recurringNotes,
            })),
            skipDuplicates: true,
          })
          frozen = toCreate.length
        }
      }
    }

    await prisma.card.update({
      where: { id: card.id },
      data: { recurringExchangeRate: newRate },
    })

    return NextResponse.json({
      ok: true,
      frozenMonths: frozen,
      oldRate,
      newRate,
      effectiveYear,
      effectiveMonth,
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation error', details: error.issues },
        { status: 400 }
      )
    }
    console.error('Error changing card rate:', error)
    return NextResponse.json(
      { error: 'Failed to change rate' },
      { status: 500 }
    )
  }
}
