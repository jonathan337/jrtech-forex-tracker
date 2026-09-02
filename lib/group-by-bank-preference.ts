/** Persisted UI preference: group a person's card list by issuing bank. */

export const GROUP_BY_BANK_STORAGE_KEY = 'jrtech-fx-group-by-bank'

export function getGroupByBankPreference(): boolean {
  if (typeof window === 'undefined') return false
  const raw = localStorage.getItem(GROUP_BY_BANK_STORAGE_KEY)
  if (raw === null) return false
  return raw === '1' || raw === 'true'
}

export function setGroupByBankPreference(value: boolean): void {
  if (typeof window === 'undefined') return
  localStorage.setItem(GROUP_BY_BANK_STORAGE_KEY, value ? '1' : '0')
}
