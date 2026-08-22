import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { z } from 'zod'
import { normalizeBanks, resolveUserBanks } from '@/lib/card-bank'

export const runtime = 'nodejs'

const bankSchema = z.object({
  name: z.string().trim().min(1).max(60),
  cycleDay: z.number().int().min(1).max(31).nullable(),
})

const settingsSchema = z.object({
  defaultExchangeRate: z.number().positive('Exchange rate must be positive'),
  cardProcessingFeePct: z
    .number()
    .min(0, 'Fee cannot be negative')
    .max(25, 'Fee looks too high — enter a percentage like 4.5')
    .optional(),
  banks: z.array(bankSchema).max(50).optional(),
})

export async function GET() {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        defaultExchangeRate: true,
        cardProcessingFeePct: true,
        businessName: true,
        bankCycleDays: true,
        banks: true,
      },
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // Always hand the client a concrete banks list (derived from legacy config
    // the first time, before the user has ever saved one).
    return NextResponse.json({
      defaultExchangeRate: user.defaultExchangeRate,
      cardProcessingFeePct: user.cardProcessingFeePct,
      businessName: user.businessName,
      banks: resolveUserBanks(user),
    })
  } catch (error) {
    console.error('Error fetching settings:', error)
    return NextResponse.json(
      { error: 'Failed to fetch settings' },
      { status: 500 }
    )
  }
}

export async function PUT(request: Request) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const validatedData = settingsSchema.parse(body)

    const user = await prisma.user.update({
      where: { id: session.user.id },
      data: {
        defaultExchangeRate: validatedData.defaultExchangeRate,
        ...(validatedData.cardProcessingFeePct !== undefined && {
          cardProcessingFeePct: validatedData.cardProcessingFeePct,
        }),
        ...(validatedData.banks !== undefined && {
          // Dedupe/clean before storing (drops blanks and duplicate names).
          banks: normalizeBanks(validatedData.banks),
        }),
      },
      select: {
        defaultExchangeRate: true,
        cardProcessingFeePct: true,
        businessName: true,
        banks: true,
      },
    })

    return NextResponse.json({ ...user, banks: resolveUserBanks(user) })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation error', details: error.issues },
        { status: 400 }
      )
    }
    console.error('Error updating settings:', error)
    return NextResponse.json(
      { error: 'Failed to update settings' },
      { status: 500 }
    )
  }
}
