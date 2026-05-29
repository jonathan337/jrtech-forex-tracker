'use client'

import { Plus } from 'lucide-react'

/**
 * Thumb-reachable floating action button shown only on mobile (`md:hidden`).
 * Pairs with an existing top-of-page "Add" action; the desktop button stays.
 */
export function MobileAddButton({
  onClick,
  label,
}: {
  onClick: () => void
  label: string
}) {
  return (
    <button
      type="button"
      onClick={() => {
        onClick()
        if (typeof window !== 'undefined') {
          window.scrollTo({ top: 0, behavior: 'smooth' })
        }
      }}
      aria-label={label}
      className="md:hidden fixed bottom-5 right-5 z-40 h-14 w-14 rounded-full bg-gradient-to-br from-blue-600 to-indigo-600 text-white shadow-lg shadow-blue-600/30 flex items-center justify-center active:scale-95 transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
    >
      <Plus className="w-6 h-6" />
    </button>
  )
}
