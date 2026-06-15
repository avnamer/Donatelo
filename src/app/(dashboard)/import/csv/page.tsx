import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/db/supabase-server'
import { prisma } from '@/lib/db/prisma'
import { CsvImportClient } from '@/components/import/CsvImportClient'

export default async function ImportCsvPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/auth/login')

  // Get the user's first portfolio id (same approach as other pages)
  const portfolio = await prisma.portfolio.findFirst({
    where: { userId: user.id },
    select: { id: true },
    orderBy: { createdAt: 'asc' },
  })

  if (!portfolio) redirect('/')

  return (
    <div className="space-y-6 p-6">
      <CsvImportClient portfolioId={portfolio.id} />
    </div>
  )
}
