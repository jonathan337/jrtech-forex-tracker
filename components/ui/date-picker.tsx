'use client'

import * as React from 'react'
import { createPortal } from 'react-dom'
import { addDays, addMonths, format, isSameDay, isSameMonth, startOfMonth, startOfWeek } from 'date-fns'
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight } from 'lucide-react'

const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']
const POPOVER_WIDTH = 296
const POPOVER_HEIGHT = 352

/** Parse a `yyyy-MM-dd` string at local noon (avoids UTC off-by-one-day). */
function parseYmd(v: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return null
  const d = new Date(`${v}T12:00:00`)
  return Number.isNaN(d.getTime()) ? null : d
}

export type DatePickerProps = {
  /** Date as `yyyy-MM-dd` (same contract as a native date input), or ''. */
  value: string
  onChange: (value: string) => void
  id?: string
  required?: boolean
  disabled?: boolean
  placeholder?: string
  className?: string
}

/**
 * Calendar popover date picker — drop-in replacement for `<Input type="date">`.
 * Renders via a portal with fixed positioning so it never gets clipped by
 * `overflow-hidden` cards.
 */
export function DatePicker({
  value,
  onChange,
  id,
  required,
  disabled,
  placeholder = 'Pick a date',
  className = '',
}: DatePickerProps) {
  const [open, setOpen] = React.useState(false)
  const [pos, setPos] = React.useState<{ top: number; left: number } | null>(null)
  const triggerRef = React.useRef<HTMLButtonElement>(null)
  const popRef = React.useRef<HTMLDivElement>(null)

  const selected = parseYmd(value)
  const [viewMonth, setViewMonth] = React.useState<Date>(selected ?? new Date())

  const reposition = React.useCallback(() => {
    const el = triggerRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const vw = window.innerWidth
    const vh = window.innerHeight
    const left = Math.min(Math.max(8, r.left), Math.max(8, vw - POPOVER_WIDTH - 8))
    // Flip above the trigger when there's not enough room below.
    const top =
      r.bottom + POPOVER_HEIGHT + 8 > vh && r.top - POPOVER_HEIGHT - 8 > 0
        ? r.top - POPOVER_HEIGHT - 4
        : r.bottom + 4
    setPos({ top, left })
  }, [])

  const openPicker = () => {
    if (disabled) return
    setViewMonth(parseYmd(value) ?? new Date())
    reposition()
    setOpen(true)
  }

  React.useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent | TouchEvent) => {
      const t = e.target as Node
      if (popRef.current?.contains(t) || triggerRef.current?.contains(t)) return
      setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    const onMove = () => reposition()
    document.addEventListener('mousedown', onDown)
    document.addEventListener('touchstart', onDown)
    document.addEventListener('keydown', onKey)
    window.addEventListener('scroll', onMove, true)
    window.addEventListener('resize', onMove)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('touchstart', onDown)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('scroll', onMove, true)
      window.removeEventListener('resize', onMove)
    }
  }, [open, reposition])

  const gridStart = startOfWeek(startOfMonth(viewMonth))
  const days = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i))
  const today = new Date()

  const pick = (day: Date) => {
    onChange(format(day, 'yyyy-MM-dd'))
    setOpen(false)
    triggerRef.current?.focus()
  }

  return (
    <div className={`relative ${className}`}>
      <button
        ref={triggerRef}
        type="button"
        id={id}
        disabled={disabled}
        onClick={() => (open ? setOpen(false) : openPicker())}
        aria-haspopup="dialog"
        aria-expanded={open}
        className="flex h-10 w-full items-center justify-between gap-2 rounded-lg border border-gray-300 bg-white px-3 text-sm text-left transition-colors hover:border-gray-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <span className={selected ? 'text-gray-900' : 'text-gray-400'}>
          {selected ? format(selected, 'MMM d, yyyy') : placeholder}
        </span>
        <CalendarIcon className="w-4 h-4 shrink-0 text-gray-400" />
      </button>

      {/* Participates in native form validation when required. */}
      {required && (
        <input
          tabIndex={-1}
          aria-hidden
          required
          value={value}
          onChange={() => {}}
          onFocus={openPicker}
          className="sr-only absolute bottom-0 left-1/2"
        />
      )}

      {open &&
        pos &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={popRef}
            role="dialog"
            aria-label="Choose date"
            style={{ position: 'fixed', top: pos.top, left: pos.left, width: POPOVER_WIDTH, zIndex: 3000 }}
            className="rounded-2xl border border-gray-200 bg-white p-3 shadow-xl shadow-gray-200/60"
          >
            <div className="flex items-center justify-between px-1 pb-2">
              <button
                type="button"
                onClick={() => setViewMonth((m) => addMonths(m, -1))}
                aria-label="Previous month"
                className="rounded-lg p-1.5 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-800"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <div className="text-sm font-semibold text-gray-900">
                {format(viewMonth, 'MMMM yyyy')}
              </div>
              <button
                type="button"
                onClick={() => setViewMonth((m) => addMonths(m, 1))}
                aria-label="Next month"
                className="rounded-lg p-1.5 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-800"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-7 pb-1">
              {WEEKDAYS.map((d) => (
                <div
                  key={d}
                  className="flex h-8 items-center justify-center text-xs font-medium text-gray-400"
                >
                  {d}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-y-0.5">
              {days.map((day) => {
                const inMonth = isSameMonth(day, viewMonth)
                const isSelected = selected != null && isSameDay(day, selected)
                const isToday = isSameDay(day, today)
                return (
                  <button
                    key={day.toISOString()}
                    type="button"
                    onClick={() => pick(day)}
                    className={`mx-auto flex h-9 w-9 items-center justify-center rounded-lg text-sm tabular-nums transition-colors ${
                      isSelected
                        ? 'bg-blue-600 font-semibold text-white shadow-sm'
                        : inMonth
                          ? `hover:bg-gray-100 ${
                              isToday ? 'font-semibold text-blue-600' : 'text-gray-700'
                            }`
                          : 'text-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    {format(day, 'd')}
                  </button>
                )
              })}
            </div>

            <div className="mt-2 border-t border-gray-100 pt-2">
              <button
                type="button"
                onClick={() => pick(today)}
                className="w-full rounded-lg py-1.5 text-sm font-medium text-blue-600 transition-colors hover:bg-blue-50"
              >
                Today
              </button>
            </div>
          </div>,
          document.body
        )}
    </div>
  )
}
