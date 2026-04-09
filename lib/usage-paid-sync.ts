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
