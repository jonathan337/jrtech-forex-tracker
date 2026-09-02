'use client'

/**
 * POST a usage entry with the duplicate guard handled: when the server answers
 * 409 (an entry with the same card, amount, and day already exists), ask the
 * user whether to save anyway and retry with allowDuplicate on a yes.
 *
 * `cancelled: true` means the user declined the duplicate — treat it as a
 * no-op, not an error.
 */
export async function postUsageGuarded(
  payload: Record<string, unknown>
): Promise<{
  cancelled: boolean
  res: Response
  data: Record<string, unknown>
}> {
  const send = (body: Record<string, unknown>) =>
    fetch('/api/usage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(body),
    })

  let res = await send(payload)
  let data: Record<string, unknown> = await res
    .json()
    .catch(() => ({} as Record<string, unknown>))

  if (res.status === 409 && data.duplicate) {
    const serverMsg =
      typeof data.error === 'string'
        ? data.error.replace(/\s*Nothing was saved\.\s*$/, '')
        : 'This looks like a duplicate of an entry already logged.'
    const proceed = window.confirm(`${serverMsg}\n\nSave it again anyway?`)
    if (!proceed) {
      return { cancelled: true, res, data }
    }
    res = await send({ ...payload, allowDuplicate: true })
    data = await res.json().catch(() => ({} as Record<string, unknown>))
  }

  return { cancelled: false, res, data }
}
