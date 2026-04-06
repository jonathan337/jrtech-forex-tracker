/** Persisted UI preference: group card lists by owner (Cards, Availability, Dashboard). */

export const GROUP_BY_OWNER_STORAGE_KEY = 'jrtech-fx-group-by-owner'

export function getGroupByOwnerPreference(): boolean {
  if (typeof window === 'undefined') return true
  const raw = localStorage.getItem(GROUP_BY_OWNER_STORAGE_KEY)
  if (raw === null) return true
  return raw === '1' || raw === 'true'
}

export function setGroupByOwnerPreference(value: boolean): void {
  if (typeof window === 'undefined') return
  localStorage.setItem(GROUP_BY_OWNER_STORAGE_KEY, value ? '1' : '0')
}
