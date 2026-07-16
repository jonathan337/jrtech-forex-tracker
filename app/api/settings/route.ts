import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { z } from 'zod'

export const runtime = 'nodejs'

const settingsSchema = z.object({
  defaultExchangeRate: z.number().positive('Exchange rate must be positive'),
  cardProcessingFeePct: z
    .number()
    .min(0, 'Fee cannot be negative')
    .max(25, 'Fee looks too high — enter a percentage like 4.5')
    .optional(),
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
      },
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    return NextResponse.json(user)
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
      },
      select: {
        defaultExchangeRate: true,
        cardProcessingFeePct: true,
        businessName: true,
      },
    })

    return NextResponse.json(user)
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

