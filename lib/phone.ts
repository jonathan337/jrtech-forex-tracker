/**
 * North American NANP numbers only, fixed display/storage: +1 (XXX) XXX-XXXX
 * (country code +1, area in parentheses, then xxx-xxxx).
 */

const CANONICAL_REGEX = /^\+1 \(\d{3}\) \d{3}-\d{4}$/

/** National 10 digits: NXX NXX-XXXX (N = 2–9 for area and exchange leading digits). */
const NANP_NATIONAL_REGEX = /^[2-9]\d{2}[2-9]\d{6}$/

/** Initial state for the masked input (user types after "+1 ("). */
export const PHONE_INPUT_EMPTY = '+1 ('

export function extractNanpNationalDigits(raw: string): string {
  const digits = raw.replace(/\D/g, '')
  if (digits.length >= 11 && digits[0] === '1') {
    return digits.slice(1, 11)
  }
  return digits.slice(0, 10)
}

/** Builds the masked string while typing (max 10 national digits after +1). */
export function digitsToNanpDisplay(rawDigitsOrValue: string): string {
  const d = extractNanpNationalDigits(rawDigitsOrValue)
  if (d.length === 0) return PHONE_INPUT_EMPTY
  const a = d.slice(0, 3)
  if (d.length < 3) return `+1 (${a}`
  const b = d.slice(3, 6)
  const c = d.slice(6, 10)
  if (d.length === 3) return `+1 (${a}) `
  if (d.length <= 6) return `+1 (${a}) ${b}`
  return `+1 (${a}) ${b}-${c}`
}

export function canonicalNanpFromNationalDigits(digits10: string): string {
  const a = digits10.slice(0, 3)
  const b = digits10.slice(3, 6)
  const c = digits10.slice(6, 10)
  return `+1 (${a}) ${b}-${c}`
}

export function isValidNanpNational(digits10: string): boolean {
  return digits10.length === 10 && NANP_NATIONAL_REGEX.test(digits10)
}

export type NormalizePhoneResult =
  | { ok: true; value: string }
  | { ok: false; message: string }

/** Require a full valid NANP number; return canonical +1 (XXX) XXX-XXXX. */
export function normalizePhoneInput(
  raw: string | undefined | null
): NormalizePhoneResult {
  if (raw == null || raw.trim() === '') {
    return { ok: false, message: 'Phone is required' }
  }
  const d = extractNanpNationalDigits(raw)
  if (!isValidNanpNational(d)) {
    return {
      ok: false,
      message: 'Enter a complete number as +1 (XXX) XXX-XXXX',
    }
  }
  return { ok: true, value: canonicalNanpFromNationalDigits(d) }
}

/** API output: only canonical format, or null (e.g. legacy bad rows). */
export function displayPhoneCanonical(
  stored: string | null | undefined
): string | null {
  if (stored == null || stored.trim() === '') return null
  const t = stored.trim()
  if (CANONICAL_REGEX.test(t)) return t
  const d = extractNanpNationalDigits(t)
  if (isValidNanpNational(d)) return canonicalNanpFromNationalDigits(d)
  return null
}
