'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { CreditCard, Users, Search, X, Wallet, Landmark } from 'lucide-react'
import { issuingBankLabel } from '@/lib/card-bank'
import { useGroupByBank } from '@/hooks/use-group-by-bank'
import type { AllocationCard, PendingAllocations } from '@/lib/pending-allocations'

type View = 'cards' | 'people'

const NO_BANK_LABEL = 'No bank set'

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

const fmtUSD = (n: number) =>
  `USD $${n.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
const fmtTTD = (n: number) =>
  `TTD $${n.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`

export function PendingClient({ data }: { data: PendingAllocations }) {
  const [view, setView] = useState<View>('cards')
  const [search, setSearch] = useState('')
  const [groupByBank, setGroupByBank] = useGroupByBank()
  const q = search.trim().toLowerCase()

  const monthLabel = `${MONTHS[data.month - 1] ?? ''} ${data.year}`

  const cards = useMemo(() => {
    if (!q) return data.cards
    return data.cards.filter((c) =>
      [
        c.personName,
        c.cardNickname,
        c.lastFourDigits ?? '',
        c.issuingBank ? issuingBankLabel(c.issuingBank) : '',
      ]
        .join(' ')
        .toLowerCase()
        .includes(q)
    )
  }, [data.cards, q])

  const people = useMemo(() => {
    if (!q) return data.people
    return data.people.filter((p) => p.personName.toLowerCase().includes(q))
  }, [data.people, q])

  // Bank sections for the card view: alphabetical, cards without a bank last.
  const cardsByBank = useMemo(() => {
    const map = new Map<string, AllocationCard[]>()
    for (const c of cards) {
      const bank = c.issuingBank ? issuingBankLabel(c.issuingBank) : NO_BANK_LABEL
      const list = map.get(bank)
      if (list) list.push(c)
      else map.set(bank, [c])
    }
    return [...map.entries()]
      .map(([bankName, items]) => ({
        bankName,
        items,
        leftUSD: items.reduce((s, c) => s + c.leftUSD, 0),
        leftTTD: items.reduce((s, c) => s + c.leftTTD, 0),
      }))
      .sort((a, b) => {
        if (a.bankName === NO_BANK_LABEL) return 1
        if (b.bankName === NO_BANK_LABEL) return -1
        return a.bankName.localeCompare(b.bankName)
      })
  }, [cards])

  // Each person's cards (already sorted by USD left desc), for the bank lines
  // in the person view.
  const cardsByPerson = useMemo(() => {
    const map = new Map<string, AllocationCard[]>()
    for (const c of data.cards) {
      const list = map.get(c.personId)
      if (list) list.push(c)
      else map.set(c.personId, [c])
    }
    return map
  }, [data.cards])

  const shownCount = view === 'cards' ? cards.length : people.length
  const totalCount = view === 'cards' ? data.cards.length : data.people.length
  const nothingLeft = data.cards.length === 0

  return (
    <div className="space-y-6 min-w-0">
      <div className="min-w-0">
        <h1 className="text-2xl sm:text-3xl font-bold tracking-[-0.02em] text-blue-700">
          Pending usage
        </h1>
        <p className="text-gray-600 mt-1 text-sm sm:text-base">
          USD forex allocation still available to use this cycle ({monthLabel}) —
          by card and by owner.
        </p>
      </div>

      {/* Summary tiles */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="shadow-md">
          <CardContent className="pt-5">
            <p className="text-sm font-medium text-gray-600">Total available</p>
            <p className="mt-1 text-3xl font-bold tabular-nums text-emerald-700">
              {fmtUSD(data.totalLeftUSD)}
            </p>
            <p className="mt-1 text-xs text-gray-500 tabular-nums">
              ≈ {fmtTTD(data.totalLeftTTD)}
            </p>
          </CardContent>
        </Card>
        <Card className="shadow-md">
          <CardContent className="pt-5">
            <p className="text-sm font-medium text-gray-600">Cards with allocation left</p>
            <p className="mt-1 text-3xl font-bold tabular-nums text-gray-900">
              {data.cards.length}
            </p>
          </CardContent>
        </Card>
        <Card className="shadow-md">
          <CardContent className="pt-5">
            <p className="text-sm font-medium text-gray-600">Owners with headroom</p>
            <p className="mt-1 text-3xl font-bold tabular-nums text-gray-900">
              {data.people.length}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Toggle + search */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
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

        {view === 'cards' && (
          <label className="flex cursor-pointer select-none items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={groupByBank}
              onChange={(e) => setGroupByBank(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            Group by bank
          </label>
        )}
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

      {nothingLeft ? (
        <Card className="shadow-md">
          <CardContent className="py-12 text-center">
            <Wallet className="mx-auto mb-3 h-10 w-10 text-gray-400" />
            <p className="font-medium text-gray-900">No allocation left</p>
            <p className="mt-1 text-sm text-gray-500">
              Every card&apos;s forex allocation for {monthLabel} is fully used, or
              no availability is set for this month.
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
            ) : groupByBank ? (
              <div className="space-y-5">
                {cardsByBank.map((bank) => (
                  <section key={bank.bankName}>
                    <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-1">
                      <span className="inline-flex items-center gap-2 font-semibold text-gray-800">
                        <Landmark
                          className="h-4 w-4 shrink-0 text-slate-600"
                          aria-hidden
                        />
                        {bank.bankName}
                        <span className="font-normal text-gray-500">
                          ({bank.items.length}{' '}
                          {bank.items.length === 1 ? 'card' : 'cards'})
                        </span>
                      </span>
                      <span className="text-sm font-semibold tabular-nums text-emerald-700">
                        {fmtUSD(bank.leftUSD)}
                        <span className="ml-2 text-xs font-normal tabular-nums text-gray-500">
                          ≈ {fmtTTD(bank.leftTTD)}
                        </span>
                      </span>
                    </div>
                    <ul className="space-y-2">
                      {bank.items.map((c) => (
                        <li key={c.cardId}>
                          <CardRow c={c} showBank={false} />
                        </li>
                      ))}
                    </ul>
                  </section>
                ))}
              </div>
            ) : (
              <ul className="space-y-2">
                {cards.map((c) => (
                  <li key={c.cardId}>
                    <CardRow c={c} showBank />
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
                        {p.cardCount} {p.cardCount === 1 ? 'card' : 'cards'} with allocation left
                      </p>
                      <ul className="mt-1.5 space-y-0.5">
                        {(cardsByPerson.get(p.personId) ?? []).map((c) => (
                          <li
                            key={c.cardId}
                            className="truncate text-xs text-gray-500"
                          >
                            <span className="font-medium text-gray-700">
                              {c.cardNickname}
                              {c.lastFourDigits ? ` ••${c.lastFourDigits}` : ''}
                            </span>
                            {' · '}
                            {c.issuingBank
                              ? issuingBankLabel(c.issuingBank)
                              : NO_BANK_LABEL}
                            {' · '}
                            <span className="tabular-nums">
                              ${c.leftUSD.toLocaleString('en-US')} left
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="font-semibold tabular-nums text-emerald-700">
                        {fmtUSD(p.leftUSD)}
                      </p>
                      <p className="text-xs tabular-nums text-gray-500">
                        ≈ {fmtTTD(p.leftTTD)}
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

function CardRow({ c, showBank }: { c: AllocationCard; showBank: boolean }) {
  return (
    <Link
      href={`/cards/${c.cardId}`}
      className="flex items-center justify-between gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm outline-none transition-[transform,background-color,border-color,box-shadow] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] hover:border-blue-200 hover:bg-blue-50/40 hover:shadow-md hover:-translate-y-px active:scale-[0.99] focus-visible:ring-2 focus-visible:ring-blue-500/40 focus-visible:ring-offset-2"
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
          {showBank && c.issuingBank
            ? ` · ${issuingBankLabel(c.issuingBank)}`
            : ''}
          {' · '}
          {`$${c.usedUSD.toLocaleString('en-US')} of $${c.allocationUSD.toLocaleString('en-US')} used`}
          {c.cycleLabel ? ` · ${c.cycleLabel}` : ''}
        </p>
      </div>
      <div className="shrink-0 text-right">
        <p className="font-semibold tabular-nums text-emerald-700">
          {fmtUSD(c.leftUSD)}
        </p>
        <p className="text-xs tabular-nums text-gray-500">≈ {fmtTTD(c.leftTTD)}</p>
      </div>
    </Link>
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
