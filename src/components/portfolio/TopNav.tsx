'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import { useUIStore } from '@/store/ui'
import { createBrowserClient } from '@/lib/db/supabase'
import {
  Home, TrendingUp, BarChart2, PieChart, DollarSign, Activity,
  ChevronDown, User, LogOut
} from 'lucide-react'
import { useState } from 'react'

const NAV_ITEMS = [
  { href: '/',            label: 'Home',        icon: Home },
  { href: '/invest',      label: 'Invest',      icon: TrendingUp },
  { href: '/visualize',   label: 'Visualize',   icon: BarChart2 },
  { href: '/allocations', label: 'Allocations', icon: PieChart },
  { href: '/dividends',   label: 'Dividends',   icon: DollarSign },
  { href: '/activity',    label: 'Activity',    icon: Activity },
]

export function TopNav() {
  const pathname = usePathname()
  const router = useRouter()
  const { currency, setCurrency } = useUIStore()
  const [showUserMenu, setShowUserMenu] = useState(false)

  async function handleSignOut() {
    const supabase = createBrowserClient()
    await supabase.auth.signOut()
    router.push('/auth/login')
    router.refresh()
  }

  function toggleCurrency() {
    setCurrency(currency === 'ILS' ? 'USD' : 'ILS')
  }

  return (
    <header className="border-b bg-background sticky top-0 z-50">
      <div className="container mx-auto px-4 max-w-[1400px]">
        {/* Top bar */}
        <div className="flex items-center justify-between h-12 border-b">
          <Link href="/" className="flex items-center gap-2 font-semibold text-primary">
            <TrendingUp className="h-5 w-5" />
            <span className="hidden sm:inline">Investment Tracker</span>
          </Link>

          <nav className="flex items-center gap-3 text-sm">
            <Link
              href="/explore"
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              Explore
            </Link>

            {/* Currency toggle */}
            <button
              onClick={toggleCurrency}
              className="flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors font-medium"
              title={`Switch to ${currency === 'ILS' ? 'USD' : 'ILS'}`}
            >
              {currency} <ChevronDown className="h-3 w-3" />
            </button>

            {/* User menu */}
            <div className="relative">
              <button
                onClick={() => setShowUserMenu((v) => !v)}
                className="rounded-full border p-1.5 text-muted-foreground hover:text-foreground transition-colors"
              >
                <User className="h-4 w-4" />
              </button>

              {showUserMenu && (
                <>
                  {/* Backdrop */}
                  <div
                    className="fixed inset-0 z-10"
                    onClick={() => setShowUserMenu(false)}
                  />
                  {/* Dropdown */}
                  <div className="absolute right-0 top-full mt-1 w-40 rounded-lg border bg-card shadow-md z-20 py-1">
                    <button
                      onClick={handleSignOut}
                      className="w-full flex items-center gap-2 px-3 py-2 text-sm text-destructive hover:bg-muted transition-colors"
                    >
                      <LogOut className="h-4 w-4" />
                      Sign out
                    </button>
                  </div>
                </>
              )}
            </div>
          </nav>
        </div>

        {/* Main nav tabs */}
        <nav className="flex items-center -mb-px overflow-x-auto">
          {NAV_ITEMS.map((item) => {
            const isActive = item.href === '/'
              ? pathname === '/'
              : pathname.startsWith(item.href)

            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex items-center gap-1.5 px-3 sm:px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap flex-shrink-0',
                  isActive
                    ? 'border-primary text-primary'
                    : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
                )}
              >
                <item.icon className="h-4 w-4" />
                <span className="hidden sm:inline">{item.label}</span>
              </Link>
            )
          })}
        </nav>
      </div>
    </header>
  )
}
