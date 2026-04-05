import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

export const prisma = globalForPrisma.prisma ?? new PrismaClient()

// Reuse one client per warm serverless instance (avoid opening a new pool to Supabase every request).
globalForPrisma.prisma = prisma

