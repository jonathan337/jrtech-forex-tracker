import { randomBytes } from 'crypto'

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