import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { serverErrorResponse } from '@/lib/api-error'

export const runtime = 'nodejs'

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params

    const row = await prisma.sentPayment.findFirst({
      where: { id, userId: session.user.id },
      select: { id: true },
    })
    if (!row) {
      return NextResponse.json({ error: 'Payment not found' }, { status: 404 })
    }

    await prisma.sentPayment.delete({ where: { id } })
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Error deleting payment:', error)
    return serverErrorResponse('Failed to delete payment', error)
  }
}
