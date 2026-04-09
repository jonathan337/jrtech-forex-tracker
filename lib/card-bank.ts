import { z } from 'zod'

/** Stored on Card.issuingBank — keep in sync with DB string values. */
export const ISSUING_BANK_CODES = [
  'SCOTIABANK',
  'REPUBLIC_BANK',
  'FIRST_CITIZENS',
  'RBC',
] as const

export type IssuingBankCode = (typeof ISSUING_BANK_CODES)[number]

export const issuingBankSchema = z.enum(ISSUING_BANK_CODES)

export const ISSUING_BANK_LABELS: Record<IssuingBankCode, string> = {
  SCOTIABANK: 'Scotiabank',
  REPUBLIC_BANK: 'Republic Bank',
  FIRST_CITIZENS: 'First Citizens Bank',
  RBC: 'Royal Bank of Canada',
}

export function issuingBankLabel(code: string | null | undefined): string {
  if (!code) return '—'
  return ISSUING_BANK_LABELS[code as IssuingBankCode] ?? code
}
