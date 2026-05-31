'use client'

import { useEffect, useRef } from 'react'

const EVENT = 'fx:data-changed'

/** Broadcast that underlying data changed (e.g. the assistant logged usage/a payment). */
export function emitDataChanged(detail?: unknown) {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(EVENT, { detail }))
  }
}

/**
 * Run `handler` whenever data changes elsewhere in the app (assistant actions, etc.).
 * The handler is kept in a ref so the listener is only attached once.
 */
export function useDataChanged(handler: () => void) {
  const ref = useRef(handler)
  ref.current = handler
  useEffect(() => {
    const fn = () => ref.current()
    window.addEventListener(EVENT, fn)
    return () => window.removeEventListener(EVENT, fn)
  }, [])
}
