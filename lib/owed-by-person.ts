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
 * TTD is rate-locked: a usage row's owed amount comes from the amountTTD stored
 * at log time, so raising a card's rate later never rewrites past owed balances.
 * Only legacy rows that duplicated USD into amountTTD (amountTTD ≈ amountUSD, an
 * impossible ~1.0 rate) recompute from the availability rate. `rate` is still
 * resolved (MonthlyAvailability → recurring → user default) for those legacy
 * rows and for the owed-USD conversion.
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
    resolved AS (
      SELECT
        person_id,
        rate,
        -- legacy row (USD stored as TTD) -> recompute; otherwise trust stored TTD
        (amount_usd IS NOT NULL AND abs(amount_ttd - amount_usd) < 0.01) AS legacy,
        amount_usd,
        amount_ttd,
        paid_ttd
      FROM usage_rates
      WHERE rate IS NOT NULL AND rate > 0
    ),
    owed_rows AS (
      SELECT
        person_id,
        (CASE WHEN legacy THEN amount_usd * rate ELSE amount_ttd END) - paid_ttd AS owed_ttd,
        -- historical rate for the USD conversion: implied from the stored row
        CASE
          WHEN NOT legacy AND amount_usd IS NOT NULL AND amount_usd > 0
            THEN amount_ttd / amount_usd
          ELSE rate
        END AS hist_rate
      FROM resolved
    )
    SELECT
      person_id AS "personId",
      SUM(owed_ttd) AS "owedTTD",
      SUM(owed_ttd / hist_rate) AS "owedUSD"
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
