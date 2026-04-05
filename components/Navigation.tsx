'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { CreditCard, Users, Calendar, LayoutDashboard, LogOut, Building2, BarChart3, Settings } from 'lucide-react'
import { signOut, useSession } from 'next-auth/react'
import { Button } from '@/components/ui/button'

export default function Navigation() {
  const pathname = usePathname()
  const { data: session } = useSession()

  const links = [
    { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { href: '/analytics', label: 'Analytics', icon: BarChart3 },
    { href: '/people', label: 'People', icon: Users },
    { href: '/cards', label: 'Cards', icon: CreditCard },
    { href: '/availability', label: 'Availability', icon: Calendar },
    { href: '/settings', label: 'Settings', icon: Settings },
  ]

  const handleSignOut = async () => {
    await signOut({ callbackUrl: '/login' })
  }

  return (
    <nav className="bg-white border-b border-gray-200 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          <div className="flex">
            <div className="flex-shrink-0 flex items-center">
              <Link href={session ? "/dashboard" : "/"} className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center">
                  <span className="text-white font-bold text-sm">FX</span>
                </div>
                <div>
                  <h1 className="text-lg font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
                    FX Tracker
                  </h1>
                  {session?.user?.name && (
                    <p className="text-xs text-gray-500 flex items-center gap-1">
                      <Building2 className="w-3 h-3" />
                      {session.user.name}
                    </p>
                  )}
                </div>
              </Link>
            </div>
            {session && (
              <div className="hidden sm:ml-8 sm:flex sm:space-x-8">
                {links.map((link) => {
                  const Icon = link.icon
                  const isActive = pathname === link.href
                  return (
                    <Link
                      key={link.href}
                      href={link.href}
                      className={`inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium transition-colors ${
                        isActive
                          ? 'border-blue-500 text-gray-900'
                          : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
                      }`}
                    >
                      <Icon className="w-4 h-4 mr-2" />
                      {link.label}
                    </Link>
                  )
                })}
              </div>
            )}
          </div>
          
          <div className="flex items-center gap-2">
            {session ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleSignOut}
                className="text-gray-600 hover:text-gray-900"
              >
                <LogOut className="w-4 h-4 mr-2" />
                Sign out
              </Button>
            ) : (
              <>
                <Link href="/login">
                  <Button variant="ghost" size="sm">
                    Sign in
                  </Button>
                </Link>
                <Link href="/register">
                  <Button size="sm">
                    Get started
                  </Button>
                </Link>
              </>
            )}
          </div>
        </div>
      </div>
    </nav>
  )
}
