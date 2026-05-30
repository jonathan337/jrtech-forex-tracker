import { prisma } from '@/lib/prisma'

const EPS = 1e-6

const MONTH_ABBR = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
]

/**
 * Mirror an increase in a card's "paid to owner" amount into the standalone
 * Payments ledger (SentPayment), so settling / repaying an owner shows up under
 * Payments. Only positive deltas are logged; decreases are ignored (the user can
 * remove a Payment manually). Failures are swallowed so they never block the
 * primary usage write.
 */
export async function recordOwnerPaymentDelta(params: {
  userId: string
  personId: string
  deltaTTD: number
  cardNickname: string
  month: number
  year: number
  paidAt?: Date
}): Promise<void> {
  const { userId, personId, deltaTTD, cardNickname, month, year } = params
  if (!Number.isFinite(deltaTTD) || deltaTTD <= EPS) return

  const amountTTD = Math.round(deltaTTD * 100) / 100
  const monthLabel = MONTH_ABBR[month - 1] ?? ''
  try {
    await prisma.sentPayment.create({
      data: {
        userId,
        personId,
        amountTTD,
        paidAt: params.paidAt ?? new Date(),
        notes: `Owner payment — ${cardNickname} (${monthLabel} ${year})`,
      },
    })
  } catch (err) {
    console.error('[sent-payment-sync] Failed to log owner payment:', err)
  }
}
