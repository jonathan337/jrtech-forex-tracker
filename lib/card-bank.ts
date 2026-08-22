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

/** A user-defined bank: display name + its statement reset day (null = 1st). */
export type Bank = { name: string; cycleDay: number | null }

/** The banks every account starts with — the canonical labels of the old codes,
 *  so a legacy card storing a code and a new card storing the name resolve to the
 *  same bank via issuingBankLabel(). */
export const DEFAULT_BANK_NAMES: string[] = ISSUING_BANK_CODES.map(
  (c) => ISSUING_BANK_LABELS[c]
)

/** Clean an unknown value (from DB JSON or a request body) into a Bank[]. */
export function normalizeBanks(raw: unknown): Bank[] {
  if (!Array.isArray(raw)) return []
  const seen = new Set<string>()
  const out: Bank[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const name = String((item as { name?: unknown }).name ?? '').trim()
    if (!name || name.length > 60) continue
    const key = name.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    const rawDay = (item as { cycleDay?: unknown }).cycleDay
    const day =
      typeof rawDay === 'number' && rawDay >= 1 && rawDay <= 31
        ? Math.round(rawDay)
        : null
    out.push({ name, cycleDay: day })
  }
  return out
}

/**
 * The banks a user effectively has. Uses their saved `banks` list when set;
 * otherwise derives one from the legacy `bankCycleDays` map (code → label name,
 * with its cycle day) unioned with the defaults, so cycle days keep working
 * before the user ever opens the new Banks settings.
 */
export function resolveUserBanks(user: {
  banks?: unknown
  bankCycleDays?: unknown
}): Bank[] {
  const saved = normalizeBanks(user.banks)
  if (saved.length > 0) return saved

  const legacy =
    user.bankCycleDays && typeof user.bankCycleDays === 'object'
      ? (user.bankCycleDays as Record<string, unknown>)
      : {}

  const byName = new Map<string, Bank>()
  for (const name of DEFAULT_BANK_NAMES) {
    byName.set(name.toLowerCase(), { name, cycleDay: null })
  }
  for (const [code, dayRaw] of Object.entries(legacy)) {
    const name = issuingBankLabel(code)
    if (name === '—') continue
    const day =
      typeof dayRaw === 'number' && dayRaw >= 1 && dayRaw <= 31
        ? Math.round(dayRaw)
        : null
    byName.set(name.toLowerCase(), { name, cycleDay: day })
  }
  return [...byName.values()]
}
