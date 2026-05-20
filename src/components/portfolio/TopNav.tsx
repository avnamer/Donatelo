'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useTheme } from 'next-themes'
import { cn } from '@/lib/utils'
import { useUIStore } from '@/store/ui'
import { createBrowserClient } from '@/lib/db/supabase'
import {
  Home, TrendingUp, BarChart2, PieChart, DollarSign, Activity,
  ChevronDown, User, LogOut, Sun, Moon, Menu, X, Briefcase, Check
} from 'lucide-react'
import { useState, useEffect, useRef } from 'react'

interface Portfolio { id: string; name: string }

const NAV_ITEMS = [
  { href: '/',              label: 'Home',         icon: Home },
  { href: '/my-portfolio',  label: 'My Portfolio', icon: Briefcase },
  { href: '/invest',        label: 'Invest',       icon: TrendingUp },
  { href: '/visualize',     label: 'Visualize',    icon: BarChart2 },
  { href: '/allocations',   label: 'Allocations',  icon: PieChart },
  { href: '/dividends',     label: 'Dividends',    icon: DollarSign },
  { href: '/activity',      label: 'Activity',     icon: Activity },
]

export function TopNav({
  portfolios = [],
  selectedPortfolioId = null,
}: {
  portfolios?: Portfolio[]
  selectedPortfolioId?: string | null
}) {
  const pathname = usePathname()
  const router = useRouter()
  const { currency, setCurrency, isOffTarget } = useUIStore()
  const [showUserMenu, setShowUserMenu] = useState(false)
  const [showMobileMenu, setShowMobileMenu] = useState(false)
  const [showPortfolioMenu, setShowPortfolioMenu] = useState(false)
  const portfolioMenuRef = useRef<HTMLDivElement>(null)
  const { resolvedTheme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  const selectedPortfolio = portfolios.find((p) => p.id === selectedPortfolioId) ?? portfolios[0]

  async function selectPortfolio(portfolioId: string) {
    await fetch('/api/portfolios/select', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ portfolioId }),
    })
    setShowPortfolioMenu(false)
    router.refresh()
  }

  useEffect(() => {
    if (!showPortfolioMenu) return
    function handler(e: MouseEvent) {
      if (portfolioMenuRef.current && !portfolioMenuRef.current.contains(e.target as Node)) {
        setShowPortfolioMenu(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showPortfolioMenu])

  useEffect(() => { setMounted(true) }, [])

  // Close mobile menu on route change
  useEffect(() => { setShowMobileMenu(false) }, [pathname])

  async function handleSignOut() {
    const supabase = createBrowserClient()
    await supabase.auth.signOut()
    router.push('/auth/login')
    router.refresh()
  }

  function toggleCurrency() {
    setCurrency(currency === 'ILS' ? 'USD' : 'ILS')
  }

  function toggleTheme() {
    setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')
  }

  return (
    <header className="border-b bg-background sticky top-0 z-50">
      <div className="container mx-auto px-4 max-w-[1400px]">
        {/* ── Top bar ── */}
        <div className="flex items-center justify-between h-12 border-b">
          <div className="flex items-center gap-3">
            <Link href="/" className="flex items-center gap-2 font-semibold text-primary">
              <TrendingUp className="h-5 w-5" />
              <span className="hidden sm:inline">Investment Tracker</span>
            </Link>

            {/* Portfolio switcher — only shown when user has multiple portfolios */}
            {portfolios.length > 1 && (
              <div ref={portfolioMenuRef} className="relative">
                <button
                  onClick={() => setShowPortfolioMenu((v) => !v)}
                  className="flex items-center gap-1.5 text-sm font-medium px-2 py-1 rounded-md hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                >
                  <Briefcase className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline max-w-[120px] truncate">{selectedPortfolio?.name}</span>
                  <ChevronDown className="h-3 w-3" />
                </button>

                {showPortfolioMenu && (
                  <div className="absolute left-0 top-full mt-1 w-52 rounded-lg border bg-card shadow-lg z-30 py-1">
                    {portfolios.map((p) => (
                      <button
                        key={p.id}
                        onClick={() => selectPortfolio(p.id)}
                        className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted transition-colors text-left"
                      >
                        <Check className={cn('h-3.5 w-3.5 flex-shrink-0', p.id === selectedPortfolio?.id ? 'text-primary' : 'opacity-0')} />
                        <span className="truncate">{p.name}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <nav className="flex items-center gap-2 text-sm">
            {/* Desktop: secondary links */}
            <div className="hidden md:flex items-center gap-3">
              <Link href="/explore" className="text-muted-foreground hover:text-foreground transition-colors">
                Explore
              </Link>
              <Link href="/import" className="text-muted-foreground hover:text-foreground transition-colors">
                Import
              </Link>
              <Link href="/export" className="text-muted-foreground hover:text-foreground transition-colors">
                Export
              </Link>
            </div>

            {/* Currency toggle */}
            <button
              onClick={toggleCurrency}
              className="flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors font-medium text-xs sm:text-sm"
              title={`Switch to ${currency === 'ILS' ? 'USD' : 'ILS'}`}
            >
              {currency} <ChevronDown className="h-3 w-3" />
            </button>

            {/* Dark mode toggle */}
            {mounted && (
              <button
                onClick={toggleTheme}
                className="rounded-md p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                title={resolvedTheme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
              >
                {resolvedTheme === 'dark'
                  ? <Sun className="h-4 w-4" />
                  : <Moon className="h-4 w-4" />}
              </button>
            )}

            {/* User menu */}
            <div className="relative hidden sm:block">
              <button
                onClick={() => setShowUserMenu((v) => !v)}
                className="rounded-full border p-1.5 text-muted-foreground hover:text-foreground transition-colors"
              >
                <User className="h-4 w-4" />
              </button>

              {showUserMenu && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setShowUserMenu(false)} />
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

            {/* Mobile hamburger */}
            <button
              onClick={() => setShowMobileMenu((v) => !v)}
              className="sm:hidden rounded-md p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            >
              {showMobileMenu ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </nav>
        </div>

        {/* ── Desktop nav tabs ── */}
        <nav className="hidden sm:flex items-center -mb-px overflow-x-auto">
          {NAV_ITEMS.map((item) => {
            const isActive = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href)
            const showBadge = item.href === '/allocations' && isOffTarget

            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'relative flex items-center gap-1.5 px-3 sm:px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap flex-shrink-0',
                  isActive
                    ? 'border-primary text-primary'
                    : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
                )}
              >
                <item.icon className="h-4 w-4" />
                <span>{item.label}</span>
                {showBadge && (
                  <span className="flex h-2 w-2 rounded-full bg-orange-400" title="Allocations are off-target" />
                )}
              </Link>
            )
          })}
        </nav>
      </div>

      {/* ── Mobile slide-down menu ── */}
      {showMobileMenu && (
        <div className="sm:hidden border-t bg-background shadow-lg">
          <nav className="flex flex-col py-2">
            {NAV_ITEMS.map((item) => {
              const isActive = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href)
              const showBadge = item.href === '/allocations' && isOffTarget

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    'flex items-center gap-3 px-5 py-3 text-sm font-medium transition-colors',
                    isActive ? 'text-primary bg-primary/5' : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                  )}
                >
                  <item.icon className="h-4 w-4 flex-shrink-0" />
                  {item.label}
                  {showBadge && (
                    <span className="ml-auto flex h-2 w-2 rounded-full bg-orange-400" />
                  )}
                </Link>
              )
            })}

            <div className="border-t mt-2 pt-2">
              <Link href="/explore" className="flex items-center gap-3 px-5 py-3 text-sm text-muted-foreground hover:text-foreground hover:bg-muted">
                Explore
              </Link>
              <Link href="/import" className="flex items-center gap-3 px-5 py-3 text-sm text-muted-foreground hover:text-foreground hover:bg-muted">
                Import
              </Link>
              <Link href="/export" className="flex items-center gap-3 px-5 py-3 text-sm text-muted-foreground hover:text-foreground hover:bg-muted">
                Export
              </Link>
              <button
                onClick={handleSignOut}
                className="w-full flex items-center gap-3 px-5 py-3 text-sm text-destructive hover:bg-muted transition-colors"
              >
                <LogOut className="h-4 w-4" />
                Sign out
              </button>
            </div>
          </nav>
        </div>
      )}
    </header>
  )
}
