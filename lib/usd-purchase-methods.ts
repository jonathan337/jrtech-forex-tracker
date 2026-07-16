export const USD_PURCHASE_METHODS = ['CASH', 'ZELLE', 'WIRE'] as const
export type UsdPurchaseMethod = (typeof USD_PURCHASE_METHODS)[number]

export const USD_PURCHASE_METHOD_LABELS: Record<UsdPurchaseMethod, string> = {
  CASH: 'Cash',
  ZELLE: 'Zelle',
  WIRE: 'Wire',
}

export function isUsdPurchaseMethod(v: string): v is UsdPurchaseMethod {
  return (USD_PURCHASE_METHODS as readonly string[]).includes(v)
}

/** Weighted average TTD/USD from USD amounts and TTD paid. */
export function weightedAverageRate(
  rows: { amountUSD: number; amountTTD: number }[]
): number | null {
  const totalUSD = rows.reduce((s, r) => s + r.amountUSD, 0)
  const totalTTD = rows.reduce((s, r) => s + r.amountTTD, 0)
  if (totalUSD <= 0 || !Number.isFinite(totalUSD) || !Number.isFinite(totalTTD)) {
    return null
  }
  return totalTTD / totalUSD
}
