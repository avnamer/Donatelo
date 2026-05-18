import type { ReactNode } from 'react'
import { cookies } from 'next/headers'
import { getCurrentUser } from '@/lib/db/supabase-server'
import { getPortfolios } from '@/lib/db/queries'
import { TopNav } from '@/components/portfolio/TopNav'

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const user = await getCurrentUser()
  const portfolios = user ? await getPortfolios(user.id) : []

  const cookieStore = await cookies()
  const selectedId = cookieStore.get('portfolio-id')?.value ?? portfolios[0]?.id ?? null

  return (
    <div className="min-h-screen bg-background">
      <TopNav portfolios={portfolios} selectedPortfolioId={selectedId} />
      <main className="container mx-auto px-4 py-6 max-w-[1400px]">
        {children}
      </main>
    </div>
  )
}
