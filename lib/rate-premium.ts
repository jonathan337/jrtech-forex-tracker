/**
 * Extra TTD vs loading at baseline: (amountUSD × cardRate) − (amountUSD × baseline).
 * Same as TTD value at card rate minus TTD value at baseline.
 */
export function ratePremiumTtd(
  amountUSD: number,
  cardRateTtdPerUsd: number,
  baselineTtdPerUsd: number
): number {
  if (baselineTtdPerUsd <= 0) return 0
  return amountUSD * cardRateTtdPerUsd - amountUSD * baselineTtdPerUsd
}

/** USD-equivalent of that premium (extra TTD ÷ baseline). */
export function ratePremiumUsd(
  amountUSD: number,
  cardRateTtdPerUsd: number,
  baselineTtdPerUsd: number
): number {
  if (baselineTtdPerUsd <= 0) return 0
  return ratePremiumTtd(amountUSD, cardRateTtdPerUsd, baselineTtdPerUsd) / baselineTtdPerUsd
}
