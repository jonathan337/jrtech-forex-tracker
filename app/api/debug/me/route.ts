import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export const runtime = 'nodejs'

/** Local diagnostics: who am I in the DB vs how many Person rows match. Disabled in production. */
export async function GET() {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const session = await auth()
  const userId = session?.user?.id ?? null
  const email = session?.user?.email ?? null

  const totalPeople = await prisma.person.count()
  const peopleForUser = userId
    ? await prisma.person.count({ where: { userId } })
    : 0

  const dbRows = await prisma.$queryRaw<
    Array<{ current_database: string; current_user: string; raw_person_count: bigint }>
  >`
    SELECT current_database() AS "current_database",
           current_user::text AS "current_user",
           (SELECT COUNT(*)::bigint FROM "Person") AS "raw_person_count"
  `
  const dbMeta = dbRows[0] ?? null

  let poolerHost = null as string | null
  try {
    const raw = process.env.DATABASE_URL
    if (raw) {
      const normalized = raw.replace(/^postgresql:/i, 'http:').replace(/^postgres:/i, 'http:')
      poolerHost = new URL(normalized).host
    }
  } catch {
    poolerHost = 'could-not-parse-DATABASE_URL'
  }

  return NextResponse.json({
    userId,
    email,
    peopleForThisUser: peopleForUser,
    totalPersonRowsInDatabase: totalPeople,
    prismaAndRawCountMatch:
      dbMeta != null ? Number(dbMeta.raw_person_count) === totalPeople : null,
    database: dbMeta?.current_database ?? null,
    dbRole: dbMeta?.current_user ?? null,
    rawPersonCountFromSql: dbMeta != null ? Number(dbMeta.raw_person_count) : null,
    /** Host:port from DATABASE_URL (no password) — compare to Supabase pooler host */
    databaseUrlHost: poolerHost,
    mismatch:
      Boolean(userId) && peopleForUser === 0 && totalPeople > 0
        ? 'There are Person rows, but none have userId = this session id. In Supabase SQL: UPDATE "Person" SET "userId" = \'<your User.id>\' WHERE ...'
        : null,
    notSignedIn: !userId,
  })
}
