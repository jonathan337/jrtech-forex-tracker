'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState, type ReactNode } from 'react'
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
  Receipt,
  Menu,
  X,
} from 'lucide-react'
import { signOut, useSession } from 'next-auth/react'
import { Button } from '@/components/ui/button'

const LINKS = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/analytics', label: 'Analytics', icon: BarChart3 },
  { href: '/people', label: 'People', icon: Users },
  { href: '/cards', label: 'Cards', icon: CreditCard },
  { href: '/availability', label: 'Availability', icon: Calendar },
  { href: '/usage', label: 'Usage', icon: Wallet },
  { href: '/payments', label: 'Payments', icon: Receipt },
  { href: '/settings', label: 'Settings', icon: Settings },
]

function Logo() {
  return (
    <Link href="/dashboard" className="touch-manipulation flex items-center gap-2 min-w-0">
      <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center shrink-0">
        <span className="text-white font-bold text-sm">FX</span>
      </div>
      <span className="text-lg font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent truncate">
        FX Tracker
      </span>
    </Link>
  )
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const { data: session } = useSession()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [desktopOpen, setDesktopOpen] = useState(true)

  useEffect(() => {
    setMobileOpen(false)
  }, [pathname])

  useEffect(() => {
    if (!mobileOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMobileOpen(false)
    }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [mobileOpen])

  const handleSignOut = async () => {
    await signOut({ callbackUrl: '/login' })
  }

  const toggleMenu = () => {
    if (
      typeof window !== 'undefined' &&
      window.matchMedia('(min-width: 768px)').matches
    ) {
      setDesktopOpen((v) => !v)
    } else {
      setMobileOpen((v) => !v)
    }
  }

  const isActive = (href: string) =>
    pathname === href ||
    (href === '/people' && pathname.startsWith('/people/')) ||
    (href === '/cards' && pathname.startsWith('/cards/'))

  // Logged-out shell: simple top bar, no sidebar.
  if (!session) {
    return (
      <div className="min-h-screen min-w-0">
        <nav className="sticky top-0 z-[100] bg-white border-b border-gray-200 shadow-sm">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between items-center h-16 gap-2 min-w-0">
              <Logo />
              <div className="flex items-center gap-1 sm:gap-2 shrink-0">
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
              </div>
            </div>
          </div>
        </nav>
        <main className="max-w-7xl mx-auto w-full min-w-0 px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
          {children}
        </main>
      </div>
    )
  }

  const navLinks = (
    <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-1">
      {LINKS.map((link) => {
        const Icon = link.icon
        const active = isActive(link.href)
        return (
          <Link
            key={link.href}
            href={link.href}
            className={`touch-manipulation flex items-center gap-3 rounded-lg px-3 py-3 text-sm font-medium transition-colors ${
              active
                ? 'bg-blue-50 text-blue-800'
                : 'text-gray-700 hover:bg-gray-50'
            }`}
          >
            <Icon
              className={`w-5 h-5 shrink-0 ${
                active ? 'text-blue-600' : 'text-gray-400'
              }`}
            />
            {link.label}
          </Link>
        )
      })}
    </nav>
  )

  const signOutButton = (
    <div className="border-t border-gray-200 p-2">
      <button
        type="button"
        onClick={handleSignOut}
        className="touch-manipulation flex w-full items-center gap-3 rounded-lg px-3 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50"
      >
        <LogOut className="w-5 h-5 shrink-0 text-gray-400" />
        Sign out
      </button>
    </div>
  )

  return (
    <div className="min-h-screen flex">
      {/* Desktop sidebar: in-flow, collapsible, open by default */}
      <aside
        className={`hidden md:block md:sticky md:top-0 md:h-screen shrink-0 overflow-hidden border-r border-gray-200 bg-white transition-[width] duration-200 ease-out ${
          desktopOpen ? 'w-64' : 'w-0 border-r-0'
        }`}
      >
        <div className="w-64 h-screen flex flex-col">
          <div className="flex items-center h-16 px-4 border-b border-gray-200 shrink-0">
            <Logo />
          </div>
          {session.user?.name && (
            <p className="px-4 pt-3 text-xs text-gray-500 flex items-center gap-1 truncate">
              <Building2 className="w-3 h-3 shrink-0" />
              <span className="truncate">{session.user.name}</span>
            </p>
          )}
          {navLinks}
          {signOutButton}
        </div>
      </aside>

      {/* Mobile overlay drawer */}
      <div
        className={`md:hidden fixed inset-0 z-[110] bg-gray-900/40 backdrop-blur-sm transition-opacity duration-200 ${
          mobileOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        aria-hidden
        onClick={() => setMobileOpen(false)}
      />
      <aside
        className={`md:hidden fixed top-0 left-0 z-[120] h-full w-72 max-w-[85vw] bg-white shadow-xl transition-transform duration-200 ease-out flex flex-col ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
        role="dialog"
        aria-modal="true"
        aria-label="Navigation menu"
      >
        <div className="flex items-center justify-between h-16 px-4 border-b border-gray-200">
          <Logo />
          <button
            type="button"
            className="touch-manipulation inline-flex items-center justify-center rounded-md p-2 text-gray-600 hover:bg-gray-100 hover:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            aria-label="Close menu"
            onClick={() => setMobileOpen(false)}
          >
            <X className="w-6 h-6" />
          </button>
        </div>
        {navLinks}
        {signOutButton}
      </aside>

      {/* Main column */}
      <div className="flex-1 min-w-0 flex flex-col">
        <header className="sticky top-0 z-[100] bg-white border-b border-gray-200 shadow-sm">
          <div className="flex items-center h-16 gap-2 px-4 sm:px-6 lg:px-8 min-w-0">
            <button
              type="button"
              className="touch-manipulation inline-flex items-center justify-center rounded-md p-2 text-gray-600 hover:bg-gray-100 hover:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              aria-label="Toggle menu"
              aria-expanded={desktopOpen}
              onClick={toggleMenu}
            >
              <Menu className="w-6 h-6" />
            </button>
            {/* Logo in the top bar only when the desktop sidebar is hidden/collapsed */}
            <div className={desktopOpen ? 'md:hidden' : ''}>
              <Logo />
            </div>
            <div className="ml-auto shrink-0">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleSignOut}
                className="text-gray-600 hover:text-gray-900 px-2 sm:px-3"
              >
                <LogOut className="w-4 h-4 sm:mr-2" />
                <span className="hidden sm:inline">Sign out</span>
              </Button>
            </div>
          </div>
        </header>
        <main className="flex-1 max-w-7xl w-full mx-auto min-w-0 px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
          {children}
        </main>
      </div>
    </div>
  )
}
