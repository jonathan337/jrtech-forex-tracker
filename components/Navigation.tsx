'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { memo, useEffect, useState } from 'react'
import {
  CreditCard,
  Users,
  Calendar,
  LayoutDashboard,
  LogOut,
  Building2,
  BarChart3,
  Settings,
  Wallet,
  Menu,
  X,
} from 'lucide-react'
import { signOut, useSession } from 'next-auth/react'
import { Button } from '@/components/ui/button'

function Navigation() {
  const pathname = usePathname()
  const { data: session } = useSession()
  const [mobileOpen, setMobileOpen] = useState(false)

  const links = [
    { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { href: '/analytics', label: 'Analytics', icon: BarChart3 },
    { href: '/people', label: 'People', icon: Users },
    { href: '/cards', label: 'Cards', icon: CreditCard },
    { href: '/availability', label: 'Availability', icon: Calendar },
    { href: '/usage', label: 'Usage', icon: Wallet },
    { href: '/settings', label: 'Settings', icon: Settings },
  ]

  useEffect(() => {
    setMobileOpen(false)
  }, [pathname])

  const handleSignOut = async () => {
    await signOut({ callbackUrl: '/login' })
  }

  return (
    <nav className="sticky top-0 z-[100] bg-white border-b border-gray-200 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16 gap-2 min-w-0">
          <div className="flex items-center min-w-0 flex-1">
            <div className="flex-shrink-0 flex items-center min-w-0">
              <Link
                href={session ? '/dashboard' : '/'}
                className="touch-manipulation flex items-center gap-2 min-w-0"
              >
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center shrink-0">
                  <span className="text-white font-bold text-sm">FX</span>
                </div>
                <div className="min-w-0">
                  <h1 className="text-lg font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent truncate">
                    FX Tracker
                  </h1>
                  {session?.user?.name && (
                    <p className="text-xs text-gray-500 flex items-center gap-1 truncate">
                      <Building2 className="w-3 h-3 shrink-0" />
                      <span className="truncate">{session.user.name}</span>
                    </p>
                  )}
                </div>
              </Link>
            </div>
            {session && (
              <div className="hidden sm:ml-8 sm:flex sm:space-x-6 lg:space-x-8">
                {links.map((link) => {
                  const Icon = link.icon
                  const isActive =
                    pathname === link.href ||
                    (link.href === '/people' &&
                      pathname.startsWith('/people/'))
                  return (
                    <Link
                      key={link.href}
                      href={link.href}
                      className={`touch-manipulation inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium transition-colors whitespace-nowrap ${
                        isActive
                          ? 'border-blue-500 text-gray-900'
                          : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
                      }`}
                    >
                      <Icon className="w-4 h-4 mr-2 shrink-0" />
                      {link.label}
                    </Link>
                  )
                })}
              </div>
            )}
          </div>

          <div className="flex items-center gap-1 sm:gap-2 shrink-0">
            {session && (
              <button
                type="button"
                className="sm:hidden inline-flex items-center justify-center rounded-md p-2 text-gray-600 hover:bg-gray-100 hover:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                aria-expanded={mobileOpen}
                aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
                onClick={() => setMobileOpen((o) => !o)}
              >
                {mobileOpen ? (
                  <X className="w-6 h-6" />
                ) : (
                  <Menu className="w-6 h-6" />
                )}
              </button>
            )}
            {session ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleSignOut}
                className="text-gray-600 hover:text-gray-900 px-2 sm:px-3"
              >
                <LogOut className="w-4 h-4 sm:mr-2" />
                <span className="hidden sm:inline">Sign out</span>
              </Button>
            ) : (
              <>
                <Link href="/login">
                  <Button variant="ghost" size="sm">
                    Sign in
                  </Button>
                </Link>
                <Link href="/register">
                  <Button size="sm" className="whitespace-nowrap">
                    Get started
                  </Button>
                </Link>
              </>
            )}
          </div>
        </div>

        {session && mobileOpen && (
          <div className="sm:hidden border-t border-gray-100 py-3 space-y-1 pb-4">
            {links.map((link) => {
              const Icon = link.icon
              const isActive =
                pathname === link.href ||
                (link.href === '/people' &&
                  pathname.startsWith('/people/'))
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`touch-manipulation flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium ${
                    isActive
                      ? 'bg-blue-50 text-blue-800'
                      : 'text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  <Icon className="w-4 h-4 shrink-0 opacity-80" />
                  {link.label}
                </Link>
              )
            })}
          </div>
        )}
      </div>
    </nav>
  )
}

export default memo(Navigation)
