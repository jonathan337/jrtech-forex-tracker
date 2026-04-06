import { PrismaClient } from '@prisma/client'

// Schema declares `directUrl = env("DIRECT_URL")`. Migrations need it; for local dev,
// many setups only set DATABASE_URL — mirror it so the client and CLI can run.
if (process.env.DATABASE_URL && !process.env.DIRECT_URL) {
  process.env.DIRECT_URL = process.env.DATABASE_URL
}

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

/**
 * Supabase pooler (PgBouncer) + Prisma requires `pgbouncer=true` so the engine skips prepared
 * statements — otherwise you get: `prepared statement "s0" already exists` (42P05).
 * Applies to transaction pooler (:6543) and session pooler (often :5432 on *.pooler.supabase.com).
 * Do not add this to the direct host `db.*.supabase.co` (used for migrations / DIRECT_URL).
 * See: https://www.prisma.io/docs/orm/prisma-client/setup-and-configuration/databases-connections/pgbouncer
 */
function normalizePoolerDatabaseUrl(url: string | undefined): string | undefined {
  if (!url) return url

  // Direct Postgres only — prepared statements are fine; ?pgbouncer=true would be wrong here.
  if (/db\.[a-z0-9-]+\.supabase\.co/i.test(url)) {
    return url
  }

  const isPooler =
    url.includes('pooler.supabase.com') ||
    url.includes(':6543/') ||
    url.includes(':6543?')

  if (!isPooler) return url

  let out = url
  if (!out.includes('pgbouncer=true')) {
    out += out.includes('?') ? '&' : '?'
    out += 'pgbouncer=true'
  }
  if (!out.includes('connection_limit=')) {
    out += '&connection_limit=1'
  }
  return out
}

const databaseUrl = normalizePoolerDatabaseUrl(process.env.DATABASE_URL)

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    datasources: {
      db: {
        url: databaseUrl ?? process.env.DATABASE_URL,
      },
    },
  })

// Reuse one client per warm serverless instance (avoid opening a new pool to Supabase every request).
globalForPrisma.prisma = prisma

