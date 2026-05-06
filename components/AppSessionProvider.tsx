'use client'

import type { ReactNode } from 'react'
import { SessionProvider } from 'next-auth/react'
import type { Session } from 'next-auth'

/**
 * Hydrates NextAuth session from server `auth()` to avoid an extra `/api/session`
 * RTT before the nav and pages consider the user authenticated.
 */
export function AppSessionProvider({
  session,
  children,
}: {
  session: Session | null
  children: ReactNode
}) {
  return (
    <SessionProvider
      session={session}
      refetchOnWindowFocus={false}
      refetchInterval={0}
    >
      {children}
    </SessionProvider>
  )
}
