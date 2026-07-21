import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'

export type OwedByPerson = {
  owedTTDByPerson: Map<string, number>
  owedUSDByPerson: Map<string, number>
}

/**
 * TTD/USD owed to each person across the user's entire usage history.
 *
 * This used to be computed in JS from a fetch of every CardUsage row ever
 * recorded — a query that got slower every month. The same math now runs as a
 * single aggregate in Postgres, so only one row per person crosses the wire.
 *
 * Semantics mirror the original `exchangeRateForUsageMonth` chain exactly:
 *   rate = MonthlyAvailability rate for that card+month
 *        → else recurringExchangeRate when the card is alwaysAvailable (even 0,
 *          which then fails the rate > 0 filter rather than falling back)
 *        → else the user's default rate when > 0
 *   usageUSD = amountUSD, else amountTTD / rate
 *   owed     = usageUSD * rate - paidToOwnerTTD, counted only when > 0.005
 */
export async function loadOwedByPerson(userId: string): Promise<OwedByPerson> {
  const rows = await prisma.$queryRaw<
    Array<{ personId: string; owedTTD: number; owedUSD: number }>
  >(Prisma.sql`
    WITH usage_rates AS (
      SELECT
        p."id" AS person_id,
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
    owed_rows AS (
      SELECT
        person_id,
        rate,
        COALESCE(amount_usd, amount_ttd / rate) * rate - paid_ttd AS owed_ttd
      FROM usage_rates
      WHERE rate IS NOT NULL AND rate > 0
    )
    SELECT
      person_id AS "personId",
      SUM(owed_ttd) AS "owedTTD",
      SUM(owed_ttd / rate) AS "owedUSD"
    FROM owed_rows
    WHERE owed_ttd > 0.005
    GROUP BY person_id
  `)

  const owedTTDByPerson = new Map<string, number>()
  const owedUSDByPerson = new Map<string, number>()
  for (const row of rows) {
    owedTTDByPerson.set(row.personId, Number(row.owedTTD))
    owedUSDByPerson.set(row.personId, Number(row.owedUSD))
  }
  return { owedTTDByPerson, owedUSDByPerson }
}
