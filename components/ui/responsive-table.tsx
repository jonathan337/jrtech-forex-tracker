'use client'

import * as React from 'react'

/**
 * Role a column plays in the mobile (card) layout:
 * - `title`     → shown as the card heading (top-left).
 * - `primary`   → highlighted stat in the card's metric grid (big number).
 * - `secondary` → label/value row in the card body (default).
 * - `hidden`    → desktop table only; omitted from the mobile card.
 */
type MobileRole = 'title' | 'primary' | 'secondary' | 'hidden'

export type ResponsiveColumn<T> = {
  id: string
  header: React.ReactNode
  cell: (row: T) => React.ReactNode
  align?: 'left' | 'right'
  mobile?: MobileRole
  /** Extra classes for the desktop <td>. */
  className?: string
  /** Extra classes for the desktop <th>. */
  headerClassName?: string
}

export type ResponsiveTableProps<T> = {
  columns: ResponsiveColumn<T>[]
  rows: T[]
  rowKey: (row: T) => string
  /** Rendered (in both layouts) when there are no rows. */
  empty?: React.ReactNode
  /** Optional per-row actions: desktop = trailing column, mobile = card top-right. */
  actions?: {
    header?: React.ReactNode
    render: (row: T) => React.ReactNode
  }
  /** Optional zebra/striping hook for desktop rows. */
  rowClassName?: (row: T, index: number) => string
  /** Tap handler — makes mobile cards feel interactive (e.g. expand details). */
  onRowClick?: (row: T) => void
}

function alignClass(align: 'left' | 'right' | undefined) {
  return align === 'right' ? 'text-right' : 'text-left'
}

export function ResponsiveTable<T>({
  columns,
  rows,
  rowKey,
  empty,
  actions,
  rowClassName,
  onRowClick,
}: ResponsiveTableProps<T>) {
  if (rows.length === 0) {
    return (
      <div className="py-12 px-6 text-center text-gray-500">
        {empty ?? 'Nothing to show.'}
      </div>
    )
  }

  const titleCols = columns.filter((c) => c.mobile === 'title')
  const primaryCols = columns.filter((c) => c.mobile === 'primary')
  const secondaryCols = columns.filter(
    (c) => (c.mobile ?? 'secondary') === 'secondary'
  )

  return (
    <>
      {/* Desktop / tablet: full table */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              {columns.map((col) => (
                <th
                  key={col.id}
                  className={`py-3 px-4 font-semibold text-gray-700 ${alignClass(
                    col.align
                  )} ${col.headerClassName ?? ''}`}
                >
                  {col.header}
                </th>
              ))}
              {actions ? (
                <th className="py-3 px-4 font-semibold text-gray-700 text-right w-24">
                  {actions.header ?? <span className="sr-only">Actions</span>}
                </th>
              ) : null}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.map((row, index) => (
              <tr
                key={rowKey(row)}
                className={`hover:bg-gray-50/80 ${
                  rowClassName?.(row, index) ?? ''
                }`}
              >
                {columns.map((col) => (
                  <td
                    key={col.id}
                    className={`py-3 px-4 text-gray-800 ${alignClass(
                      col.align
                    )} ${col.className ?? ''}`}
                  >
                    {col.cell(row)}
                  </td>
                ))}
                {actions ? (
                  <td className="py-3 px-4 text-right">{actions.render(row)}</td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile: stacked cards */}
      <ul className="md:hidden divide-y divide-gray-100">
        {rows.map((row) => {
          const interactive = Boolean(onRowClick)
          return (
            <li key={rowKey(row)} className="p-4">
              <div
                className={`rounded-xl border border-gray-200 bg-white p-4 shadow-sm ${
                  interactive ? 'active:bg-gray-50 cursor-pointer' : ''
                }`}
                role={interactive ? 'button' : undefined}
                tabIndex={interactive ? 0 : undefined}
                onClick={interactive ? () => onRowClick?.(row) : undefined}
                onKeyDown={
                  interactive
                    ? (e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          onRowClick?.(row)
                        }
                      }
                    : undefined
                }
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 space-y-0.5">
                    {titleCols.map((col) => (
                      <div
                        key={col.id}
                        className="font-semibold text-gray-900 leading-snug break-words"
                      >
                        {col.cell(row)}
                      </div>
                    ))}
                  </div>
                  {actions ? (
                    <div
                      className="shrink-0"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {actions.render(row)}
                    </div>
                  ) : null}
                </div>

                {primaryCols.length > 0 ? (
                  <div className="mt-3 grid grid-cols-2 gap-3">
                    {primaryCols.map((col) => (
                      <div
                        key={col.id}
                        className="rounded-lg bg-gray-50 px-3 py-2"
                      >
                        <div className="text-[11px] font-medium uppercase tracking-wide text-gray-500">
                          {col.header}
                        </div>
                        <div className="mt-0.5 text-base font-semibold tabular-nums text-gray-900">
                          {col.cell(row)}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : null}

                {secondaryCols.length > 0 ? (
                  <dl className="mt-3 space-y-1.5">
                    {secondaryCols.map((col) => (
                      <div
                        key={col.id}
                        className="flex items-baseline justify-between gap-3 text-sm"
                      >
                        <dt className="text-gray-500 shrink-0">{col.header}</dt>
                        <dd className="text-gray-800 text-right min-w-0 break-words">
                          {col.cell(row)}
                        </dd>
                      </div>
                    ))}
                  </dl>
                ) : null}
              </div>
            </li>
          )
        })}
      </ul>
    </>
  )
}
