'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { CreditCard, Users, Search, X, CheckCircle2 } from 'lucide-react'
import { issuingBankLabel } from '@/lib/card-bank'
import type { PendingUsage } from '@/lib/pending-usage'

type View = 'cards' | 'people'

const fmtTTD = (n: number) =>
  `TTD $${n.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
const fmtUSD = (n: number) =>
  `$${n.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} USD`

export function PendingClient({ data }: { data: PendingUsage }) {
  const [view, setView] = useState<View>('cards')
  const [search, setSearch] = useState('')

  const q = search.trim().toLowerCase()

  const cards = useMemo(() => {
    if (!q) return data.cards
    return data.cards.filter((c) => {
      const hay = [
        c.personName,
        c.cardNickname,
        c.lastFourDigits ?? '',
        c.issuingBank ? issuingBankLabel(c.issuingBank) : '',
      ]
        .join(' ')
        .toLowerCase()
      return hay.includes(q)
    })
  }, [data.cards, q])

  const people = useMemo(() => {
    if (!q) return data.people
    return data.people.filter((p) => p.personName.toLowerCase().includes(q))
  }, [data.people, q])

  const shownCount = view === 'cards' ? cards.length : people.length
  const totalCount = view === 'cards' ? data.cards.length : data.people.length
  const nothingPending = data.cards.length === 0

  return (
    <div className="space-y-6 min-w-0">
      <div className="min-w-0">
        <h1 className="text-2xl sm:text-3xl font-bold tracking-[-0.02em] bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
          Pending usage
        </h1>
        <p className="text-gray-600 mt-1 text-sm sm:text-base">
          What&apos;s still owed to card owners across all months — usage you
          haven&apos;t fully paid back yet.
        </p>
      </div>

      {/* Summary tiles */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="border-l-4 border-l-red-500 shadow-md">
          <CardContent className="pt-5">
            <p className="text-sm font-medium text-gray-600">Total pending</p>
            <p className="mt-1 text-3xl font-bold tabular-nums text-red-700">
              {fmtTTD(data.totalTTD)}
            </p>
            <p className="mt-1 text-xs text-gray-500 tabular-nums">
              ≈ {fmtUSD(data.totalUSD)}
            </p>
          </CardContent>
        </Card>
        <Card className="shadow-md">
          <CardContent className="pt-5">
            <p className="text-sm font-medium text-gray-600">Cards with a balance</p>
            <p className="mt-1 text-3xl font-bold tabular-nums text-gray-900">
              {data.cards.length}
            </p>
          </CardContent>
        </Card>
        <Card className="shadow-md">
          <CardContent className="pt-5">
            <p className="text-sm font-medium text-gray-600">People owed</p>
            <p className="mt-1 text-3xl font-bold tabular-nums text-gray-900">
              {data.people.length}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Toggle + search */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="inline-flex rounded-lg border border-gray-200 bg-gray-100 p-1 self-start">
          <button
            type="button"
            onClick={() => setView('cards')}
            className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              view === 'cards'
                ? 'bg-white text-blue-700 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
            aria-pressed={view === 'cards'}
          >
            <CreditCard className="h-4 w-4" />
            By card
          </button>
          <button
            type="button"
            onClick={() => setView('people')}
            className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              view === 'people'
                ? 'bg-white text-blue-700 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
            aria-pressed={view === 'people'}
          >
            <Users className="h-4 w-4" />
            By person
          </button>
        </div>

        <div className="relative w-full sm:w-72">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={view === 'cards' ? 'Search card or owner…' : 'Search person…'}
            className="h-9 pl-8 pr-8"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              aria-label="Clear search"
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {nothingPending ? (
        <Card className="shadow-md">
          <CardContent className="py-12 text-center">
            <CheckCircle2 className="mx-auto mb-3 h-10 w-10 text-green-500" />
            <p className="font-medium text-gray-900">All settled up</p>
            <p className="mt-1 text-sm text-gray-500">
              Nothing is currently owed to any card owner.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          <p className="text-xs text-gray-500">
            Showing {shownCount} of {totalCount}
            {q ? ' (filtered)' : ''}.
          </p>

          {view === 'cards' ? (
            cards.length === 0 ? (
              <NoMatch onClear={() => setSearch('')} />
            ) : (
              <ul className="space-y-2">
                {cards.map((c) => (
                  <li key={c.cardId}>
                    <Link
                      href={`/cards/${c.cardId}`}
                      className="flex items-center justify-between gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm transition-colors hover:border-blue-200 hover:bg-blue-50/40"
                    >
                      <div className="min-w-0">
                        <p className="font-semibold text-gray-900">
                          {c.cardNickname}
                          {c.lastFourDigits ? (
                            <span className="text-gray-400"> ••{c.lastFourDigits}</span>
                          ) : null}
                        </p>
                        <p className="mt-0.5 truncate text-xs text-gray-500">
                          {c.personName}
                          {c.issuingBank ? ` · ${issuingBankLabel(c.issuingBank)}` : ''}
                          {' · '}
                          {c.entryCount} unpaid {c.entryCount === 1 ? 'entry' : 'entries'}
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="font-semibold tabular-nums text-red-700">
                          {fmtTTD(c.pendingTTD)}
                        </p>
                        <p className="text-xs tabular-nums text-gray-500">
                          {fmtUSD(c.pendingUSD)}
                        </p>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )
          ) : people.length === 0 ? (
            <NoMatch onClear={() => setSearch('')} />
          ) : (
            <ul className="space-y-2">
              {people.map((p) => (
                <li key={p.personId}>
                  <Link
                    href={`/people/${p.personId}`}
                    className="flex items-center justify-between gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm transition-colors hover:border-blue-200 hover:bg-blue-50/40"
                  >
                    <div className="min-w-0">
                      <p className="font-semibold text-gray-900">{p.personName}</p>
                      <p className="mt-0.5 truncate text-xs text-gray-500">
                        {p.cardCount} {p.cardCount === 1 ? 'card' : 'cards'} · {p.entryCount}{' '}
                        unpaid {p.entryCount === 1 ? 'entry' : 'entries'}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="font-semibold tabular-nums text-red-700">
                        {fmtTTD(p.pendingTTD)}
                      </p>
                      <p className="text-xs tabular-nums text-gray-500">
                        {fmtUSD(p.pendingUSD)}
                      </p>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}

function NoMatch({ onClear }: { onClear: () => void }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white px-6 py-10 text-center text-gray-500 shadow-sm">
      No matches.{' '}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={onClear}
        className="text-blue-700"
      >
        Clear search
      </Button>
    </div>
  )
}
