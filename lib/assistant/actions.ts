import { prisma } from '@/lib/prisma'
import { loadMonthAvailabilityWithUsage } from '@/lib/month-availability-with-usage'
import { exchangeRateForUsageMonth } from '@/lib/exchange-rate-for-usage'
import { resolveUsageUsdAndTtdForMonth } from '@/lib/usage-entry-amounts'
import {
  cardHasAvailabilityForMonth,
  USAGE_REQUIRES_AVAILABILITY_MESSAGE,
} from '@/lib/card-available-for-month'
import { recordOwnerPaymentDelta } from '@/lib/sent-payment-sync'

const EPS = 1e-6

export function round2(n: number): number {
  return Math.round(n * 100) / 100
}

const BANK_LABELS: Record<string, string> = {
  SCOTIABANK: 'Scotiabank',
  REPUBLIC_BANK: 'Republic Bank',
  FIRST_CITIZENS: 'First Citizens',
  RBC: 'RBC',
}

export function cardLabel(card: {
  cardNickname: string
  lastFourDigits?: string | null
  issuingBank?: string | null
  person?: { name: string } | null
}): string {
  const parts: string[] = []
  if (card.person?.name) parts.push(card.person.name)
  let core = card.cardNickname
  if (card.lastFourDigits) core += ` ••${card.lastFourDigits}`
  if (card.issuingBank && BANK_LABELS[card.issuingBank]) {
    core += ` · ${BANK_LABELS[card.issuingBank]}`
  }
  parts.push(`(${core})`)
  return parts.join(' ')
}

export function currentYearMonth(): { year: number; month: number } {
  const now = new Date()
  return { year: now.getFullYear(), month: now.getMonth() + 1 }
}

/** ---- Reads ---------------------------------------------------------- */

export async function getMonthSummary(
  userId: string,
  yearArg?: number,
  monthArg?: number
) {
  const cur = currentYearMonth()
  const year = yearArg && yearArg >= 2000 && yearArg <= 2100 ? yearArg : cur.year
  const month = monthArg && monthArg >= 1 && monthArg <= 12 ? monthArg : cur.month

  const { availabilityWithUsage } = await loadMonthAvailabilityWithUsage(
    userId,
    year,
    month
  )

  const totalAvailableUSD = round2(
    availabilityWithUsage.reduce((s, r) => s + r.amountUSD, 0)
  )
  const totalUsedUSD = round2(
    availabilityWithUsage.reduce((s, r) => s + r.usageUSD, 0)
  )
  const totalUsedTTD = round2(
    availabilityWithUsage.reduce((s, r) => s + r.usageTTD, 0)
  )
  const totalAvailableTTD = round2(
    availabilityWithUsage.reduce((s, r) => s + r.ttdValue, 0)
  )
  const owedTTD = round2(
    availabilityWithUsage.reduce((s, r) => s + Math.max(0, r.owedTTD), 0)
  )

  return {
    year,
    month,
    cardCount: availabilityWithUsage.length,
    usdLeft: round2(totalAvailableUSD - totalUsedUSD),
    totalAvailableUSD,
    totalUsedUSD,
    ttdLeft: round2(totalAvailableTTD - totalUsedTTD),
    totalAvailableTTD,
    totalUsedTTD,
    owedToOwnersTTD: owedTTD,
  }
}

/** Per-card and per-owner USD availability/used/left for a month. */
export async function listCardBalances(
  userId: string,
  yearArg?: number,
  monthArg?: number,
  personName?: string
) {
  const cur = currentYearMonth()
  const year = yearArg && yearArg >= 2000 && yearArg <= 2100 ? yearArg : cur.year
  const month = monthArg && monthArg >= 1 && monthArg <= 12 ? monthArg : cur.month

  const { availabilityWithUsage } = await loadMonthAvailabilityWithUsage(
    userId,
    year,
    month
  )

  const q = personName?.trim().toLowerCase()
  const rows = q
    ? availabilityWithUsage.filter((r) =>
        r.card.person.name.toLowerCase().includes(q)
      )
    : availabilityWithUsage

  const cards = rows
    .map((r) => {
      let cardName = r.card.cardNickname
      if (r.card.lastFourDigits) cardName += ` ••${r.card.lastFourDigits}`
      return {
        owner: r.card.person.name,
        card: cardName,
        availableUSD: round2(r.amountUSD),
        usedUSD: round2(r.usageUSD),
        usdLeft: round2(r.balanceUSD),
      }
    })
    .sort(
      (a, b) =>
        a.owner.localeCompare(b.owner) || a.card.localeCompare(b.card)
    )

  const ownerLeft = new Map<string, number>()
  for (const r of rows) {
    const name = r.card.person.name
    ownerLeft.set(name, (ownerLeft.get(name) ?? 0) + r.balanceUSD)
  }
  const byOwner = [...ownerLeft.entries()]
    .map(([owner, usdLeft]) => ({ owner, usdLeft: round2(usdLeft) }))
    .sort((a, b) => a.owner.localeCompare(b.owner))

  return {
    year,
    month,
    cardCount: cards.length,
    totalUsdLeft: round2(cards.reduce((s, c) => s + c.usdLeft, 0)),
    byOwner,
    cards,
  }
}

type OwedByPerson = {
  personId: string
  name: string
  owedTTD: number
  owedUSD: number
}

/** Owed to each card owner across ALL months (same basis as People page). */
async function computeOwedByPerson(userId: string): Promise<OwedByPerson[]> {
  const [people, usageRows, baselineRow] = await Promise.all([
    prisma.person.findMany({
      where: { userId },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    }),
    prisma.cardUsage.findMany({
      where: { card: { person: { userId } } },
      select: {
        amountUSD: true,
        amountTTD: true,
        paidToOwnerTTD: true,
        year: true,
        month: true,
        cardId: true,
        card: {
          select: {
            personId: true,
            alwaysAvailable: true,
            recurringExchangeRate: true,
          },
        },
      },
    }),
    prisma.user.findUnique({
      where: { id: userId },
      select: { defaultExchangeRate: true },
    }),
  ])

  const baseline = baselineRow?.defaultExchangeRate ?? 0

  const monthKeys = [
    ...new Map(
      usageRows.map((u) => [
        `${u.cardId}\t${u.year}\t${u.month}`,
        { cardId: u.cardId, year: u.year, month: u.month },
      ])
    ).values(),
  ]
  const monthlyRates =
    monthKeys.length === 0
      ? []
      : await prisma.monthlyAvailability.findMany({
          where: { OR: monthKeys },
          select: { cardId: true, year: true, month: true, exchangeRate: true },
        })
  const rateByCardMonth = new Map(
    monthlyRates.map((m) => [`${m.cardId}\t${m.year}\t${m.month}`, m.exchangeRate])
  )

  const owedTTDByPerson = new Map<string, number>()
  const owedUSDByPerson = new Map<string, number>()
  for (const row of usageRows) {
    const pid = row.card.personId
    const rate = exchangeRateForUsageMonth(
      row.cardId,
      row.year,
      row.month,
      row.card,
      rateByCardMonth,
      baseline
    )
    if (rate == null || rate <= 0) continue
    const usageUSD =
      typeof row.amountUSD === 'number' && Number.isFinite(row.amountUSD)
        ? row.amountUSD
        : row.amountTTD / rate
    const owedTTD = usageUSD * rate - row.paidToOwnerTTD
    if (owedTTD <= 0.005) continue
    owedTTDByPerson.set(pid, (owedTTDByPerson.get(pid) ?? 0) + owedTTD)
    owedUSDByPerson.set(pid, (owedUSDByPerson.get(pid) ?? 0) + owedTTD / rate)
  }

  return people.map((p) => ({
    personId: p.id,
    name: p.name,
    owedTTD: round2(owedTTDByPerson.get(p.id) ?? 0),
    owedUSD: round2(owedUSDByPerson.get(p.id) ?? 0),
  }))
}

export async function listPeople(userId: string) {
  const owed = await computeOwedByPerson(userId)
  const totalOwedTTD = round2(owed.reduce((s, p) => s + p.owedTTD, 0))
  return { people: owed, totalOwedTTD }
}

export async function getPersonBalance(userId: string, personName: string) {
  const resolved = await resolvePerson(userId, personName)
  if (!resolved.ok) return resolved
  const owed = await computeOwedByPerson(userId)
  const match = owed.find((p) => p.personId === resolved.personId)
  return {
    ok: true as const,
    personId: resolved.personId,
    name: resolved.name,
    owedTTD: match?.owedTTD ?? 0,
    owedUSD: match?.owedUSD ?? 0,
  }
}

export async function listCards(userId: string, personName?: string) {
  const cards = await prisma.card.findMany({
    where: {
      person: {
        userId,
        ...(personName
          ? { name: { contains: personName, mode: 'insensitive' as const } }
          : {}),
      },
    },
    select: {
      id: true,
      cardNickname: true,
      lastFourDigits: true,
      issuingBank: true,
      person: { select: { id: true, name: true } },
    },
    orderBy: [{ person: { name: 'asc' } }, { cardNickname: 'asc' }],
  })
  return cards.map((c) => ({
    cardId: c.id,
    label: cardLabel(c),
    nickname: c.cardNickname,
    lastFourDigits: c.lastFourDigits,
    personId: c.person.id,
    personName: c.person.name,
  }))
}

/** ---- Resolvers (fuzzy id lookup for write previews) ----------------- */

type ResolvePersonResult =
  | { ok: true; personId: string; name: string }
  | { ok: false; error: string }

export async function resolvePerson(
  userId: string,
  query: string
): Promise<ResolvePersonResult> {
  const q = query.trim()
  if (!q) return { ok: false, error: 'No person name provided.' }
  const matches = await prisma.person.findMany({
    where: { userId, name: { contains: q, mode: 'insensitive' } },
    select: { id: true, name: true },
    take: 10,
  })
  if (matches.length === 0) {
    return { ok: false, error: `No person found matching "${q}".` }
  }
  const exact = matches.filter((m) => m.name.toLowerCase() === q.toLowerCase())
  const chosen = exact.length === 1 ? exact : matches
  if (chosen.length > 1) {
    return {
      ok: false,
      error: `Multiple people match "${q}": ${chosen
        .map((m) => m.name)
        .join(', ')}. Ask the user which one.`,
    }
  }
  return { ok: true, personId: chosen[0].id, name: chosen[0].name }
}

type ResolveCardResult =
  | {
      ok: true
      cardId: string
      label: string
      personId: string
      personName: string
    }
  | { ok: false; error: string }

export async function resolveCard(
  userId: string,
  query: string
): Promise<ResolveCardResult> {
  const q = query.trim()
  if (!q) return { ok: false, error: 'No card provided.' }
  const matches = await prisma.card.findMany({
    where: {
      person: { userId },
      OR: [
        { cardNickname: { contains: q, mode: 'insensitive' } },
        { lastFourDigits: { contains: q } },
        { person: { name: { contains: q, mode: 'insensitive' } } },
      ],
    },
    select: {
      id: true,
      cardNickname: true,
      lastFourDigits: true,
      issuingBank: true,
      person: { select: { id: true, name: true } },
    },
    take: 10,
  })
  if (matches.length === 0) {
    return { ok: false, error: `No card found matching "${q}".` }
  }
  if (matches.length > 1) {
    return {
      ok: false,
      error: `Multiple cards match "${q}": ${matches
        .map((m) => cardLabel(m))
        .join('; ')}. Ask the user which one.`,
    }
  }
  const c = matches[0]
  return {
    ok: true,
    cardId: c.id,
    label: cardLabel(c),
    personId: c.person.id,
    personName: c.person.name,
  }
}

/** ---- Write executors (called only after user confirmation) ---------- */

export async function executeLogUsage(params: {
  userId: string
  cardId: string
  amountUSD?: number
  amountTTD?: number
  paidToOwnerTTD?: number
  year: number
  month: number
  notes?: string
}): Promise<{ ok: true; message: string } | { ok: false; error: string }> {
  const { userId, cardId } = params

  const card = await prisma.card.findFirst({
    where: { id: cardId, person: { userId } },
    include: { person: true },
  })
  if (!card) return { ok: false, error: 'Card not found.' }

  const allowed = await cardHasAvailabilityForMonth(
    cardId,
    params.year,
    params.month
  )
  if (!allowed) return { ok: false, error: USAGE_REQUIRES_AVAILABILITY_MESSAGE }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { defaultExchangeRate: true },
  })
  const baseline =
    typeof user?.defaultExchangeRate === 'number' &&
    Number.isFinite(user.defaultExchangeRate)
      ? user.defaultExchangeRate
      : 0

  const resolved = await resolveUsageUsdAndTtdForMonth({
    cardId,
    year: params.year,
    month: params.month,
    userBaseline: baseline,
    ...(params.amountUSD !== undefined && { amountUSD: params.amountUSD }),
    ...(params.amountTTD !== undefined && { amountTTD: params.amountTTD }),
  })
  if (!resolved.ok) return { ok: false, error: resolved.error }

  const { amountUSD, amountTTD } = resolved
  const paidToOwner = params.paidToOwnerTTD ?? 0
  if (paidToOwner - amountTTD > EPS) {
    return {
      ok: false,
      error: 'Paid to owner (TTD) cannot exceed the usage amount in TTD.',
    }
  }

  const entry = await prisma.cardUsage.create({
    data: {
      cardId,
      year: params.year,
      month: params.month,
      amountUSD,
      amountTTD,
      paidToOwnerTTD: paidToOwner,
      usageDate: new Date(),
      notes: params.notes || null,
    },
    include: { card: { include: { person: true } } },
  })

  await recordOwnerPaymentDelta({
    userId,
    personId: entry.card.personId,
    deltaTTD: paidToOwner,
    cardNickname: entry.card.cardNickname,
    month: entry.month,
    year: entry.year,
  })

  return {
    ok: true,
    message: `Logged usage of $${round2(amountUSD)} USD (TTD ${round2(
      amountTTD
    )}) on ${cardLabel(entry.card)} for ${params.month}/${params.year}.`,
  }
}

export async function executeApplyOwnerPayment(params: {
  userId: string
  personId: string
  amountTTD: number
}): Promise<
  | { ok: true; message: string; appliedTTD: number; surplusTTD: number }
  | { ok: false; error: string }
> {
  const { userId, personId, amountTTD } = params

  const person = await prisma.person.findFirst({
    where: { id: personId, userId },
    select: { id: true, name: true },
  })
  if (!person) return { ok: false, error: 'Person not found.' }

  const [usages, baselineRow] = await Promise.all([
    prisma.cardUsage.findMany({
      where: { card: { personId, person: { userId } } },
      include: {
        card: {
          select: {
            cardNickname: true,
            alwaysAvailable: true,
            recurringExchangeRate: true,
          },
        },
      },
      orderBy: [{ usageDate: 'asc' }, { createdAt: 'asc' }],
    }),
    prisma.user.findUnique({
      where: { id: userId },
      select: { defaultExchangeRate: true },
    }),
  ])

  const baseline = baselineRow?.defaultExchangeRate ?? 0

  const monthKeys = [
    ...new Map(
      usages.map((u) => [
        `${u.cardId}\t${u.year}\t${u.month}`,
        { cardId: u.cardId, year: u.year, month: u.month },
      ])
    ).values(),
  ]
  const monthlyRates =
    monthKeys.length === 0
      ? []
      : await prisma.monthlyAvailability.findMany({
          where: { OR: monthKeys },
          select: { cardId: true, year: true, month: true, exchangeRate: true },
        })
  const rateByCardMonth = new Map(
    monthlyRates.map((m) => [`${m.cardId}\t${m.year}\t${m.month}`, m.exchangeRate])
  )

  type Row = (typeof usages)[number]
  const canonicalTtd = (row: Row): number => {
    const rate = exchangeRateForUsageMonth(
      row.cardId,
      row.year,
      row.month,
      row.card,
      rateByCardMonth,
      baseline
    )
    if (rate == null || rate <= 0) return round2(row.amountTTD)
    const usageUSD =
      typeof row.amountUSD === 'number' && Number.isFinite(row.amountUSD)
        ? row.amountUSD
        : row.amountTTD / rate
    return round2(usageUSD * rate)
  }

  const unpaidRows: { row: Row; unpaidTTD: number; usageTtdTotal: number }[] = []
  for (const row of usages) {
    const usageTtdTotal = canonicalTtd(row)
    const unpaidTTD = round2(usageTtdTotal - row.paidToOwnerTTD)
    if (unpaidTTD > EPS) unpaidRows.push({ row, unpaidTTD, usageTtdTotal })
  }

  if (unpaidRows.length === 0) {
    return {
      ok: false,
      error: `No unpaid usage for ${person.name} — already fully paid back.`,
    }
  }

  let remainingTTD = round2(amountTTD)
  const updates: { id: string; newPaid: number; syncAmountTTD?: number }[] = []
  let appliedTTD = 0
  let cardsTouched = 0

  for (const { row, unpaidTTD, usageTtdTotal } of unpaidRows) {
    if (remainingTTD <= EPS) break
    const applyTTD = round2(Math.min(remainingTTD, unpaidTTD))
    if (applyTTD <= EPS) continue
    const newPaid = round2(row.paidToOwnerTTD + applyTTD)
    const syncAmountTTD =
      Math.abs(usageTtdTotal - row.amountTTD) > EPS ? usageTtdTotal : undefined
    updates.push({ id: row.id, newPaid, syncAmountTTD })
    appliedTTD = round2(appliedTTD + applyTTD)
    cardsTouched += 1
    remainingTTD = round2(remainingTTD - applyTTD)
  }

  if (updates.length === 0) {
    return { ok: false, error: 'Could not apply payment.' }
  }

  await prisma.$transaction(
    updates.map((u) =>
      prisma.cardUsage.update({
        where: { id: u.id },
        data: {
          paidToOwnerTTD: u.newPaid,
          ...(u.syncAmountTTD !== undefined
            ? { amountTTD: u.syncAmountTTD }
            : {}),
        },
      })
    )
  )

  const surplusTTD = round2(amountTTD - appliedTTD)

  if (appliedTTD > EPS) {
    try {
      await prisma.sentPayment.create({
        data: {
          userId,
          personId,
          amountTTD: appliedTTD,
          paidAt: new Date(),
          notes: `Owner payment — applied across ${cardsTouched} usage row${
            cardsTouched === 1 ? '' : 's'
          } (via assistant)`,
        },
      })
    } catch (logErr) {
      console.error('[assistant] Failed to log SentPayment:', logErr)
    }
  }

  const surplusNote =
    surplusTTD > EPS
      ? ` $${surplusTTD} TTD was left over (more than what ${person.name} was owed).`
      : ''

  return {
    ok: true,
    appliedTTD,
    surplusTTD: surplusTTD > EPS ? surplusTTD : 0,
    message: `Applied ${appliedTTD} TTD to ${person.name} across ${cardsTouched} usage row${
      cardsTouched === 1 ? '' : 's'
    }.${surplusNote}`,
  }
}

export async function executeLogPayment(params: {
  userId: string
  amountTTD: number
  personId?: string | null
  paidAt?: string
  notes?: string | null
}): Promise<{ ok: true; message: string } | { ok: false; error: string }> {
  const { userId, amountTTD } = params

  let personId: string | null = params.personId?.trim() || null
  let personName: string | null = null
  if (personId) {
    const person = await prisma.person.findFirst({
      where: { id: personId, userId },
      select: { id: true, name: true },
    })
    if (!person) return { ok: false, error: 'Person not found.' }
    personName = person.name
  } else {
    personId = null
  }

  const paidAtStr = params.paidAt?.trim()
  const paidAt = paidAtStr
    ? new Date(`${paidAtStr}T12:00:00.000Z`)
    : new Date()
  if (Number.isNaN(paidAt.getTime())) {
    return { ok: false, error: 'Invalid payment date.' }
  }

  await prisma.sentPayment.create({
    data: {
      userId,
      personId,
      amountTTD: round2(amountTTD),
      paidAt,
      notes: params.notes?.trim() || null,
    },
  })

  return {
    ok: true,
    message: `Logged a payment of ${round2(amountTTD)} TTD${
      personName ? ` for ${personName}` : ''
    }.`,
  }
}

/** Map free-text bank names to the stored issuingBank codes. */
export function normalizeIssuingBank(input: string | null | undefined): string | null {
  const q = (input ?? '').trim().toLowerCase()
  if (!q) return null
  if (q.includes('scotia')) return 'SCOTIABANK'
  if (q.includes('republic')) return 'REPUBLIC_BANK'
  if (q.includes('first citizen') || q === 'fcb') return 'FIRST_CITIZENS'
  if (q.includes('rbc') || q.includes('royal')) return 'RBC'
  return null
}

export async function executeAddCard(params: {
  userId: string
  personId: string
  cardNickname: string
  issuingBank?: string | null
  lastFourDigits?: string | null
  notes?: string | null
  recurringAmountUSD?: number
  recurringExchangeRate?: number
  recurringPaymentDay?: number
}): Promise<{ ok: true; message: string } | { ok: false; error: string }> {
  const { userId, personId } = params

  const person = await prisma.person.findFirst({
    where: { id: personId, userId },
    select: { id: true, name: true },
  })
  if (!person) return { ok: false, error: 'Person not found.' }

  const nickname = params.cardNickname.trim()
  if (!nickname) return { ok: false, error: 'Card nickname is required.' }

  const last4 = params.lastFourDigits?.trim() || null
  if (last4 && !/^\d{4}$/.test(last4)) {
    return { ok: false, error: 'Last four digits must be exactly 4 numbers.' }
  }

  const hasRecurring =
    typeof params.recurringAmountUSD === 'number' &&
    params.recurringAmountUSD > 0 &&
    typeof params.recurringExchangeRate === 'number' &&
    params.recurringExchangeRate > 0

  const card = await prisma.card.create({
    data: {
      personId: person.id,
      cardNickname: nickname,
      issuingBank: params.issuingBank || null,
      lastFourDigits: last4,
      notes: params.notes?.trim() || null,
      alwaysAvailable: hasRecurring,
      recurringAmountUSD: hasRecurring ? params.recurringAmountUSD : null,
      recurringExchangeRate: hasRecurring ? params.recurringExchangeRate : null,
      recurringPaymentDay: hasRecurring
        ? Math.min(Math.max(params.recurringPaymentDay ?? 1, 1), 31)
        : null,
    },
  })

  return {
    ok: true,
    message: `Added card "${card.cardNickname}"${
      last4 ? ` ••${last4}` : ''
    } for ${person.name}${
      hasRecurring
        ? ` with $${params.recurringAmountUSD} USD available every month at ${params.recurringExchangeRate}`
        : ''
    }.`,
  }
}
