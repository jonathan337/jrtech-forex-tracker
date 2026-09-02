import { prisma } from '@/lib/prisma'
import { format } from 'date-fns'

const AMOUNT_EPS = 0.005

/**
 * Same-day window. Form entries pin the date at local noon, assistant entries
 * use the current time, so two logs of the same day always land within ±20h of
 * each other — while noon-dated entries on adjacent days sit exactly 24h apart
 * and stay out of the window.
 */
const WINDOW_MS = 20 * 60 * 60 * 1000

export type LikelyDuplicateUsage = {
  id: string
  year: number
  month: number
  amountUSD: number | null
  amountTTD: number
  usageDate: Date
  notes: string | null
}

/**
 * A likely duplicate: another entry on the same card with the same amount,
 * dated the same day — regardless of which month it was logged into. That is
 * exactly how the classic double-log looks (one entry from the July view, one
 * from August, both "Jul 31 $2000"), and how a double-clicked save or a
 * re-confirmed assistant action lands.
 */
export async function findLikelyDuplicateUsage(params: {
  cardId: string
  usageDate: Date
  amountUSD?: number
  amountTTD?: number
}): Promise<LikelyDuplicateUsage | null> {
  const { cardId, usageDate } = params
  const rows = await prisma.cardUsage.findMany({
    where: {
      cardId,
      usageDate: {
        gte: new Date(usageDate.getTime() - WINDOW_MS),
        lte: new Date(usageDate.getTime() + WINDOW_MS),
      },
    },
    select: {
      id: true,
      year: true,
      month: true,
      amountUSD: true,
      amountTTD: true,
      usageDate: true,
      notes: true,
    },
    orderBy: { createdAt: 'desc' },
  })

  for (const row of rows) {
    if (
      typeof params.amountUSD === 'number' &&
      typeof row.amountUSD === 'number' &&
      Number.isFinite(row.amountUSD)
    ) {
      if (Math.abs(row.amountUSD - params.amountUSD) < AMOUNT_EPS) return row
      continue
    }
    if (
      typeof params.amountTTD === 'number' &&
      Math.abs(row.amountTTD - params.amountTTD) < AMOUNT_EPS
    ) {
      return row
    }
  }
  return null
}

/** Human description of the matching entry, for error messages and confirms. */
export function duplicateUsageDescription(dup: LikelyDuplicateUsage): string {
  const amount =
    typeof dup.amountUSD === 'number' && Number.isFinite(dup.amountUSD)
      ? `$${dup.amountUSD.toFixed(2)} USD`
      : `${dup.amountTTD.toFixed(2)} TTD`
  const period = format(new Date(dup.year, dup.month - 1, 1), 'MMM yyyy')
  const day = format(dup.usageDate, 'MMM d, yyyy')
  const note = dup.notes ? `, note "${dup.notes}"` : ''
  return `${amount} dated ${day} is already logged on this card (counts against ${period}${note})`
}
