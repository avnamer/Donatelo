import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/db/supabase-server'
import { Download, FileJson, FileSpreadsheet } from 'lucide-react'

export default async function ExportPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/auth/login')

  return (
    <div className="max-w-xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Export Data</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Download your portfolio data as JSON or CSV files.
        </p>
      </div>

      <div className="space-y-3">
        <ExportCard
          href="/api/export?format=json"
          icon={<FileJson className="h-5 w-5" />}
          title="Full Backup (JSON)"
          description="Complete portfolio snapshot — folders, holdings, lots, and cash accounts. Use this to restore your data or migrate to another app."
        />
        <ExportCard
          href="/api/export?format=holdings"
          icon={<FileSpreadsheet className="h-5 w-5" />}
          title="Holdings (CSV)"
          description="Ticker, name, exchange, folder, expense ratio, and target allocation for each holding."
        />
        <ExportCard
          href="/api/export?format=lots"
          icon={<FileSpreadsheet className="h-5 w-5" />}
          title="Lots (CSV)"
          description="All purchase lots — dates, shares, cost per share, account type, and sale details."
        />
        <ExportCard
          href="/api/export?format=dividends"
          icon={<FileSpreadsheet className="h-5 w-5" />}
          title="Dividends (CSV)"
          description="Recorded dividend payments with dates, amounts, and currencies."
        />
      </div>
    </div>
  )
}

function ExportCard({
  href,
  icon,
  title,
  description,
}: {
  href: string
  icon: React.ReactNode
  title: string
  description: string
}) {
  return (
    <a
      href={href}
      download
      className="flex items-center gap-4 rounded-xl border bg-card p-4 hover:bg-muted/40 transition-colors group"
    >
      <div className="rounded-lg bg-muted p-2.5 text-muted-foreground group-hover:text-foreground transition-colors">
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-medium text-sm">{title}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
      </div>
      <Download className="h-4 w-4 text-muted-foreground shrink-0" />
    </a>
  )
}
