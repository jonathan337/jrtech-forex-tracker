import { z } from 'zod'
import { displayPhoneAsE164, normalizePhoneInput } from '@/lib/phone'

const personBodySchema = z.object({
  name: z.string().min(1, 'Name is required'),
  email: z.string().email().optional().or(z.literal('')),
  phone: z.string().optional(),
  notes: z.string().optional(),
})

export type PersonPayload = {
  name: string
  email: string | null
  phone: string | null
  notes: string | null
}

export class PhoneValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PhoneValidationError'
  }
}

export function parsePersonRequestBody(body: unknown): PersonPayload {
  const data = personBodySchema.parse(body)
  const phoneResult = normalizePhoneInput(data.phone)
  if (!phoneResult.ok) {
    throw new PhoneValidationError(phoneResult.message)
  }
  return {
    name: data.name,
    email: data.email || null,
    phone: phoneResult.e164,
    notes: data.notes || null,
  }
}

export function mapPersonPhoneForResponse<
  T extends { phone: string | null },
>(person: T): T {
  return {
    ...person,
    phone: displayPhoneAsE164(person.phone),
  }
}
