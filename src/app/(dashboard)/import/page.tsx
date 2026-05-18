import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/db/supabase-server'
import { ImportClient } from '@/components/import/ImportClient'

export default async function ImportPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/auth/login')

  return <ImportClient />
}
