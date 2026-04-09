/**
 * Effective TTD/USD rate for a usage month — matches People / dashboard logic:
 * MonthlyAvailability for that card+year+month, else recurring rate if always available,
 * else Settings default exchange rate.
 */
export function exchangeRateForUsageMonth(
  cardId: string,
  year: number,
  month: number,
  card: { alwaysAvailable: boolean; recurringExchangeRate: number | null },
  rateByCardMonth: Map<string, number>,
  baseline: number
): number | null {
  const k = `${cardId}\t${year}\t${month}`
  let rate = rateByCardMonth.get(k)
  if (rate == null && card.alwaysAvailable) {
    const r = card.recurringExchangeRate
    if (r != null) rate = r
  }
  if (rate == null && baseline > 0) {
    rate = baseline
  }
  return rate ?? null
}
