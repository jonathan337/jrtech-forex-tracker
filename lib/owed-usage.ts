import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'

export type OwedCard = {
  cardId: string
  cardNickname: string
  lastFourDigits: string | null
  issuingBank: string | null
  personId: string
  personName: string
  pendingTTD: number
  pendingUSD: number
  entryCount: number
}

export type OwedPerson = {
  personId: string
  personName: string
  pendingTTD: number
  pendingUSD: number
  entryCount: number
  cardCount: number
}

export type OwedUsage = {
  cards: OwedCard[]
  people: OwedPerson[]
  totalTTD: number
  totalUSD: number
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

/**
 * Outstanding (unsettled) usage still owed to card owners, across all history,
 * grouped both per card and per person.
 *
 * Uses the same rate-locked math as loadOwedByPerson: each usage keeps the TTD
 * stored at log time (only legacy rows where USD was duplicated into TTD, an
 * impossible ~1.0 rate, recompute from the availability rate), and only usages
 * with a positive remaining balance count. Person totals are the sum of their
 * cards', so the two views reconcile.
 */
export async function loadOwedUsage(userId: string): Promise<OwedUsage> {
  const rows = await prisma.$queryRaw<
    Array<{
      cardId: string
      cardNickname: string
      lastFourDigits: string | null
      issuingBank: string | null
      personId: string
      personName: string
      pendingTTD: number
      pendingUSD: number
      entryCount: bigint
    }>
  >(Prisma.sql`
    WITH usage_rates AS (
      SELECT
        c."id" AS card_id,
        c."cardNickname" AS card_nickname,
        c."lastFourDigits" AS last_four,
        c."issuingBank" AS issuing_bank,
        p."id" AS person_id,
        p."name" AS person_name,
        u."amountUSD" AS amount_usd,
        u."amountTTD" AS amount_ttd,
        u."paidToOwnerTTD" AS paid_ttd,
        COALESCE(
          ma."exchangeRate",
          CASE
            WHEN c."alwaysAvailable" AND c."recurringExchangeRate" IS NOT NULL
              THEN c."recurringExchangeRate"
          END,
          CASE
            WHEN usr."defaultExchangeRate" > 0 THEN usr."defaultExchangeRate"
          END
        ) AS rate
      FROM "CardUsage" u
      JOIN "Card" c ON c."id" = u."cardId"
      JOIN "Person" p ON p."id" = c."personId" AND p."userId" = ${userId}
      JOIN "User" usr ON usr."id" = p."userId"
      LEFT JOIN "MonthlyAvailability" ma
        ON ma."cardId" = u."cardId"
       AND ma."year" = u."year"
       AND ma."month" = u."month"
    ),
    resolved AS (
      SELECT
        card_id, card_nickname, last_four, issuing_bank, person_id, person_name,
        rate,
        (amount_usd IS NOT NULL AND abs(amount_ttd - amount_usd) < 0.01) AS legacy,
        amount_usd, amount_ttd, paid_ttd
      FROM usage_rates
      WHERE rate IS NOT NULL AND rate > 0
    ),
    owed_rows AS (
      SELECT
        card_id, card_nickname, last_four, issuing_bank, person_id, person_name,
        (CASE WHEN legacy THEN amount_usd * rate ELSE amount_ttd END) - paid_ttd AS owed_ttd,
        CASE
          WHEN NOT legacy AND amount_usd IS NOT NULL AND amount_usd > 0
            THEN amount_ttd / amount_usd
          ELSE rate
        END AS hist_rate
      FROM resolved
    )
    SELECT
      card_id AS "cardId",
      card_nickname AS "cardNickname",
      last_four AS "lastFourDigits",
      issuing_bank AS "issuingBank",
      person_id AS "personId",
      person_name AS "personName",
      SUM(owed_ttd) AS "pendingTTD",
      SUM(owed_ttd / hist_rate) AS "pendingUSD",
      COUNT(*) AS "entryCount"
    FROM owed_rows
    WHERE owed_ttd > 0.005
    GROUP BY card_id, card_nickname, last_four, issuing_bank, person_id, person_name
    ORDER BY "pendingTTD" DESC
  `)

  const cards: OwedCard[] = rows.map((r) => ({
    cardId: r.cardId,
    cardNickname: r.cardNickname,
    lastFourDigits: r.lastFourDigits,
    issuingBank: r.issuingBank,
    personId: r.personId,
    personName: r.personName,
    pendingTTD: round2(Number(r.pendingTTD)),
    pendingUSD: round2(Number(r.pendingUSD)),
    entryCount: Number(r.entryCount),
  }))

  const byPerson = new Map<string, OwedPerson>()
  for (const c of cards) {
    const existing = byPerson.get(c.personId)
    if (existing) {
      existing.pendingTTD = round2(existing.pendingTTD + c.pendingTTD)
      existing.pendingUSD = round2(existing.pendingUSD + c.pendingUSD)
      existing.entryCount += c.entryCount
      existing.cardCount += 1
    } else {
      byPerson.set(c.personId, {
        personId: c.personId,
        personName: c.personName,
        pendingTTD: c.pendingTTD,
        pendingUSD: c.pendingUSD,
        entryCount: c.entryCount,
        cardCount: 1,
      })
    }
  }
  const people = [...byPerson.values()].sort((a, b) => b.pendingTTD - a.pendingTTD)

  const totalTTD = round2(cards.reduce((s, c) => s + c.pendingTTD, 0))
  const totalUSD = round2(cards.reduce((s, c) => s + c.pendingUSD, 0))

  return { cards, people, totalTTD, totalUSD }
}
