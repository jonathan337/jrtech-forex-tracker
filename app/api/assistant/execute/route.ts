import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { z } from 'zod'
import {
  executeApplyOwnerPayment,
  executeLogPayment,
  executeLogUsage,
} from '@/lib/assistant/actions'

export const runtime = 'nodejs'

const actionSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('log_usage'),
    params: z.object({
      cardId: z.string().min(1),
      cardLabel: z.string().optional(),
      amountUSD: z.number().positive().optional(),
      amountTTD: z.number().positive().optional(),
      paidToOwnerTTD: z.number().min(0).optional(),
      year: z.number().int().min(2000).max(2100),
      month: z.number().int().min(1).max(12),
      notes: z.string().optional(),
    }),
  }),
  z.object({
    type: z.literal('apply_owner_payment'),
    params: z.object({
      personId: z.string().min(1),
      personName: z.string().optional(),
      amountTTD: z.number().positive(),
    }),
  }),
  z.object({
    type: z.literal('log_payment'),
    params: z.object({
      amountTTD: z.number().positive(),
      personId: z.string().nullish(),
      personName: z.string().nullish(),
      paidAt: z.string().optional(),
      notes: z.string().nullish(),
    }),
  }),
])

const bodySchema = z.object({ action: actionSchema })

export async function POST(request: Request) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const userId = session.user.id

    const { action } = bodySchema.parse(await request.json())

    let result:
      | { ok: true; message: string }
      | { ok: false; error: string }

    switch (action.type) {
      case 'log_usage':
        result = await executeLogUsage({ userId, ...action.params })
        break
      case 'apply_owner_payment':
        result = await executeApplyOwnerPayment({ userId, ...action.params })
        break
      case 'log_payment':
        result = await executeLogPayment({ userId, ...action.params })
        break
      default:
        result = { ok: false, error: 'Unknown action.' }
    }

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 })
    }
    return NextResponse.json({ message: result.message })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid action', details: error.issues },
        { status: 400 }
      )
    }
    console.error('[assistant execute] error:', error)
    return NextResponse.json(
      { error: 'Failed to perform the action.' },
      { status: 500 }
    )
  }
}
