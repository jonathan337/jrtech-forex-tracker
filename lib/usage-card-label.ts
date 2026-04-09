import { issuingBankLabel } from '@/lib/card-bank'

export interface UsageCardOption {
  id: string
  cardNickname: string
  issuingBank: string | null
  lastFourDigits: string | null
  person: { name: string }
  /** Effective TTD/USD rate for selected month (when cards are month-filtered). */
  effectiveExchangeRate?: number | null
}

export function usageCardSelectLabel(c: UsageCardOption): string {
  const owner = c.person?.name?.trim() || 'Unknown'
  const nickname = (c.cardNickname ?? '').trim() || 'Card'
  const tail: string[] = [nickname]
  if (c.issuingBank) {
    tail.push(`(${issuingBankLabel(c.issuingBank)})`)
  }
  const last4 = c.lastFourDigits?.trim()
  if (last4) {
    tail.push(last4)
  }
  return `${owner} - ${tail.join(' ')}`
}
