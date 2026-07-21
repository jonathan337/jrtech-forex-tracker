'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'

/**
 * Slim, Apple-style top progress bar that reflects loading activity.
 *
 * It drives the bar from two signals:
 *  - in-flight `fetch` requests (saving, refetching, applying a payment, etc.)
 *  - route changes (RSC navigations also go through fetch, plus a safety net)
 *
 * Prefetch requests are ignored so hovering links never flashes the bar.
 */
export function GlobalProgress() {
  const [progress, setProgress] = useState(0)
  const [visible, setVisible] = useState(false)
  const inflight = useRef(0)
  const visibleRef = useRef(false)
  const trickle = useRef<ReturnType<typeof setInterval> | null>(null)
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pathname = usePathname()

  const stopTrickle = () => {
    if (trickle.current) {
      clearInterval(trickle.current)
      trickle.current = null
    }
  }

  const start = useCallback(() => {
    if (hideTimer.current) {
      clearTimeout(hideTimer.current)
      hideTimer.current = null
    }
    visibleRef.current = true
    setVisible(true)
    setProgress((p) => (p < 8 ? 8 : p))
    if (!trickle.current) {
      trickle.current = setInterval(() => {
        setProgress((p) => {
          if (p >= 90) return p
          // Ease toward 90%: fast at first, slow as it approaches.
          return p + Math.max(0.4, (90 - p) * 0.08)
        })
      }, 280)
    }
  }, [])

  const done = useCallback(() => {
    stopTrickle()
    if (!visibleRef.current) return
    setProgress(100)
    if (hideTimer.current) clearTimeout(hideTimer.current)
    hideTimer.current = setTimeout(() => {
      visibleRef.current = false
      setVisible(false)
      setProgress(0)
      hideTimer.current = null
    }, 260)
  }, [])

  // Patch fetch to count in-flight requests (ignoring prefetches).
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.fetch !== 'function') {
      return
    }
    const original = window.fetch
    const bound = original.bind(window)

    const isPrefetch = (input: RequestInfo | URL, init?: RequestInit) => {
      try {
        const headers = new Headers(
          init?.headers ??
            (typeof Request !== 'undefined' && input instanceof Request
              ? input.headers
              : undefined)
        )
        return (
          headers.has('next-router-prefetch') ||
          headers.get('purpose') === 'prefetch' ||
          headers.get('Purpose') === 'prefetch'
        )
      } catch {
        return false
      }
    }

    const patched: typeof window.fetch = (input, init) => {
      if (isPrefetch(input as RequestInfo | URL, init)) {
        return bound(input as RequestInfo, init)
      }
      inflight.current += 1
      if (inflight.current === 1) start()
      const settle = () => {
        inflight.current = Math.max(0, inflight.current - 1)
        if (inflight.current === 0) done()
      }
      return bound(input as RequestInfo, init).then(
        (res) => {
          settle()
          return res
        },
        (err) => {
          settle()
          throw err
        }
      )
    }

    window.fetch = patched
    return () => {
      window.fetch = original
    }
  }, [start, done])

  // Safety net: when the route finishes changing and nothing is in flight,
  // make sure the bar completes.
  useEffect(() => {
    if (inflight.current === 0) done()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname])

  useEffect(() => {
    return () => {
      stopTrickle()
      if (hideTimer.current) clearTimeout(hideTimer.current)
    }
  }, [])

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-x-0 top-0 z-[2000] h-[3px] transition-opacity duration-200"
      style={{ opacity: visible ? 1 : 0 }}
    >
      <div
        className="h-full rounded-r-full bg-gradient-to-r from-indigo-500 via-blue-500 to-indigo-500 transition-[width] duration-200 ease-out"
        style={{
          width: `${progress}%`,
          boxShadow:
            '0 0 10px rgba(79,70,229,0.7), 0 0 4px rgba(59,130,246,0.6)',
        }}
      />
    </div>
  )
}
