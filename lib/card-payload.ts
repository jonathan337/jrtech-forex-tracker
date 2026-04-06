import { z } from 'zod'

export const cardBodySchema = z
  .object({
    personId: z.string().min(1, 'Person is required'),
    cardNickname: z.string().min(1, 'Card nickname is required'),
    lastFourDigits: z.string().optional(),
    notes: z.string().optional(),
    alwaysAvailable: z.boolean().optional().default(false),
    recurringAmountUSD: z.number().positive().optional(),
    recurringExchangeRate: z.number().positive().optional(),
    recurringPaymentDay: z.number().int().min(1).max(31).optional(),
    recurringFeeAmount: z.number().nonnegative().optional(),
    recurringFeeCurrency: z.enum(['USD', 'TTD']).optional(),
    recurringNotes: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    if (!data.alwaysAvailable) return
    if (data.recurringAmountUSD == null) {
      ctx.addIssue({
        code: 'custom',
        message: 'Amount (USD) is required when always available',
        path: ['recurringAmountUSD'],
      })
    }
    if (data.recurringExchangeRate == null) {
      ctx.addIssue({
        code: 'custom',
        message: 'Exchange rate is required when always available',
        path: ['recurringExchangeRate'],
      })
    }
    if (data.recurringPaymentDay == null) {
      ctx.addIssue({
        code: 'custom',
        message: 'Payment day of month (1–31) is required when always available',
        path: ['recurringPaymentDay'],
      })
    }
  })

export type CardBodyInput = z.infer<typeof cardBodySchema>

export function prismaDataFromCardBody(data: CardBodyInput) {
  const on = data.alwaysAvailable === true
  return {
    personId: data.personId,
    cardNickname: data.cardNickname,
    lastFourDigits: data.lastFourDigits || null,
    notes: data.notes || null,
    alwaysAvailable: on,
    recurringAmountUSD: on ? data.recurringAmountUSD! : null,
    recurringExchangeRate: on ? data.recurringExchangeRate! : null,
    recurringPaymentDay: on ? data.recurringPaymentDay! : null,
    recurringFeeAmount: on ? (data.recurringFeeAmount ?? null) : null,
    recurringFeeCurrency: on ? (data.recurringFeeCurrency ?? 'USD') : null,
    recurringNotes: on ? (data.recurringNotes || null) : null,
  }
}
