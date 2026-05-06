import { prisma } from '@/lib/prisma'

/**
 * Resolves persisted USD ↔ TTD for a usage row using the same rate priority as dashboard:
 * monthly availability rate for card+year+month, then recurring rate, then user default baseline.
 */
export async function resolveUsageUsdAndTtdForMonth(params: {
  cardId: string
  year: number
  month: number
  userBaseline: number
  amountUSD?: number
  amountTTD?: number
}): Promise<
  | {
      ok: true
      amountUSD: number
      amountTTD: number
      exchangeRateUsed: number
    }
  | {
      ok: false
      error: string
    }
> {
  const { cardId, year, month, userBaseline } = params

  const [monthRow, card] = await Promise.all([
    prisma.monthlyAvailability.findFirst({
      where: { cardId, year, month },
      select: { exchangeRate: true },
    }),
    prisma.card.findUnique({
      where: { id: cardId },
      select: { alwaysAvailable: true, recurringExchangeRate: true },
    }),
  ])

  const rate =
    monthRow?.exchangeRate ??
    (card?.alwaysAvailable ? card.recurringExchangeRate ?? null : null) ??
    (userBaseline > 0 ? userBaseline : null)

  if (rate == null || !Number.isFinite(rate) || rate <= 0) {
    return {
      ok: false,
      error:
        'No exchange rate found for this card and month (add Availability or recurring card rate, or set a default rate in Settings).',
    }
  }

  const hasUsd = typeof params.amountUSD === 'number' && Number.isFinite(params.amountUSD)
  const hasTtd =
    typeof params.amountTTD === 'number' && Number.isFinite(params.amountTTD)

  if (!hasUsd && !hasTtd) {
    return {
      ok: false,
      error: 'Either amountUSD or amountTTD is required.',
    }
  }

  /** USD wins when provided (canonical for new logs); ignore client TTD in that case. */
  if (hasUsd && params.amountUSD != null && params.amountUSD > 0) {
    const amountUSD = params.amountUSD
    return {
      ok: true,
      amountUSD,
      amountTTD: amountUSD * rate,
      exchangeRateUsed: rate,
    }
  }

  if (hasTtd && params.amountTTD != null && params.amountTTD > 0) {
    const amountTTD = params.amountTTD
    return {
      ok: true,
      amountUSD: amountTTD / rate,
      amountTTD,
      exchangeRateUsed: rate,
    }
  }

  return {
    ok: false,
    error: 'Usage amount must be a positive number.',
  }
}
