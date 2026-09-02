'use client'

import * as React from 'react'
import { createPortal } from 'react-dom'

export type ModalProps = {
  open: boolean
  /** Called on Escape or overlay click. The caller decides whether to close. */
  onClose: () => void
  ariaLabel: string
  children: React.ReactNode
  /** Tailwind max-width class for the panel. */
  maxWidthClassName?: string
}

/**
 * Centered dialog rendered via a portal so opening it never scrolls the page —
 * the list underneath stays exactly where the user left it. Locks body scroll
 * while open; the panel itself scrolls when content is taller than the viewport.
 */
export function Modal({
  open,
  onClose,
  ariaLabel,
  children,
  maxWidthClassName = 'max-w-2xl',
}: ModalProps) {
  const panelRef = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    if (!open) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    panelRef.current?.focus()
    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', onKey)
    }
  }, [open, onClose])

  if (!open || typeof document === 'undefined') return null

  return createPortal(
    <div className="fixed inset-0 z-[1500] overflow-y-auto" role="presentation">
      <div
        className="fixed inset-0 bg-slate-900/40 modal-overlay-enter"
        aria-hidden
        // Only a press that starts on the backdrop closes — dragging out of an
        // input and releasing over the backdrop must not lose the form.
        onMouseDown={onClose}
      />
      <div className="relative min-h-full flex items-start justify-center p-4 sm:p-6 md:py-10 pointer-events-none">
        <div
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-label={ariaLabel}
          tabIndex={-1}
          className={`pointer-events-auto w-full ${maxWidthClassName} focus:outline-none modal-panel-enter`}
        >
          {children}
        </div>
      </div>
    </div>,
    document.body
  )
}
