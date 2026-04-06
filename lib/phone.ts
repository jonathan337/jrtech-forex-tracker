import {
  parsePhoneNumberFromString,
  isSupportedCountry,
  type CountryCode,
} from 'libphonenumber-js'

/**
 * For numbers entered without a leading + / country code, libphonenumber needs a region.
 * Set `PHONE_DEFAULT_REGION` (ISO 3166-1 alpha-2, e.g. TT, US, GB) on the server.
 * If unset, defaults to TT so existing deployments keep working; change the env for other countries.
 */
function defaultRegionForNationalFormat(): CountryCode {
  const fromEnv = process.env.PHONE_DEFAULT_REGION?.trim().toUpperCase()
  if (fromEnv && isSupportedCountry(fromEnv)) {
    return fromEnv
  }
  return 'TT'
}

function parseValidNumber(trimmed: string) {
  const international = parsePhoneNumberFromString(trimmed)
  if (international?.isValid()) return international

  const national = parsePhoneNumberFromString(
    trimmed,
    defaultRegionForNationalFormat()
  )
  if (national?.isValid()) return national

  return undefined
}

export type NormalizePhoneResult =
  | { ok: true; e164: string | null }
  | { ok: false; message: string }

/**
 * Normalize user input to E.164 for storage, or null if empty.
 * Invalid numbers are rejected — only canonical E.164 is stored.
 */
export function normalizePhoneInput(
  raw: string | undefined | null
): NormalizePhoneResult {
  if (raw == null || raw.trim() === '') {
    return { ok: true, e164: null }
  }
  const parsed = parseValidNumber(raw.trim())
  if (!parsed) {
    return {
      ok: false,
      message:
        'Invalid phone number. Use international format with + and country code (e.g. +12125551234), or a full national number for your configured default region.',
    }
  }
  return { ok: true, e164: parsed.format('E.164') }
}

/**
 * API responses only expose E.164. Values that are not valid numbers become null
 * (no alternate formatting or raw pass-through).
 */
export function displayPhoneAsE164(
  stored: string | null | undefined
): string | null {
  if (stored == null || stored.trim() === '') return null
  const parsed = parseValidNumber(stored.trim())
  if (!parsed) return null
  return parsed.format('E.164')
}
