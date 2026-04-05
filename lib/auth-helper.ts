import { randomBytes } from 'crypto'

/** Public site URL (Auth.js v5 uses AUTH_URL; NEXTAUTH_URL kept for compatibility). */
export function getAppUrl(): string {
  return (
    process.env.AUTH_URL ||
    process.env.NEXTAUTH_URL ||
    'http://localhost:3004'
  )
}

export function generateVerificationToken(): string {
  return randomBytes(32).toString('hex')
}

export function getVerificationExpiry(): Date {
  const expiry = new Date()
  expiry.setHours(expiry.getHours() + 24) // 24 hours from now
  return expiry
}

export function isTokenExpired(expiry: Date): boolean {
  return new Date() > expiry
}