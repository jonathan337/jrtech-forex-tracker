/**
 * When usage amount changes: if "paid to owner" matched the previous usage (full repayment),
 * update paid to match the new usage amount. Otherwise keep the previous paid value.
 * Empty paid means $0 paid to the owner (not yet repaid).
 */
export function usageAmountPaidSync(
  prevAmount: string,
  prevPaid: string,
  nextAmount: string
): string {
  const pAmt = parseFloat(prevAmount)
  const paidTrim = prevPaid.trim()
  const paidNum = paidTrim === '' ? 0 : parseFloat(paidTrim)
  const wasFullRepayment =
    !Number.isNaN(pAmt) &&
    !Number.isNaN(paidNum) &&
    Math.abs(pAmt - paidNum) < 1e-6
  return wasFullRepayment ? nextAmount : prevPaid
}

/**
 * Like {@link usageAmountPaidSync}: if paid-to-owner (TTD) matched prior usage TTD,
 * bump paid to match the new usage TTD when the spending amount changed in USD.
 */
export function usageAmountPaidSyncFromUsdInputs(
  prevAmountUsdStr: string,
  paidToOwnerTTDStr: string,
  nextAmountUsdStr: string,
  exchangeRateTtdPerUsd: number
): string {
  if (!(exchangeRateTtdPerUsd > 0)) return paidToOwnerTTDStr
  const prevUsd = parseFloat(prevAmountUsdStr)
  const nextUsd = parseFloat(nextAmountUsdStr)
  const prevTtd = prevUsd * exchangeRateTtdPerUsd
  const nextTtd = nextUsd * exchangeRateTtdPerUsd
  const paidTrim = paidToOwnerTTDStr.trim()
  const paidNum = paidTrim === '' ? 0 : parseFloat(paidTrim)
  const wasFullRepayment =
    !Number.isNaN(prevUsd) &&
    !Number.isNaN(paidNum) &&
    Math.abs(prevTtd - paidNum) < 1e-6
  return wasFullRepayment ? String(nextTtd) : paidToOwnerTTDStr
}
