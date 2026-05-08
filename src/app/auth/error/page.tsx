'use client'

import Link from 'next/link'
import { TrendingUp, AlertCircle } from 'lucide-react'

export default function AuthErrorPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm space-y-8 text-center">

        <div className="space-y-2">
          <div className="flex items-center justify-center gap-2 text-primary">
            <TrendingUp className="h-8 w-8" />
            <span className="text-2xl font-bold">Investment Tracker</span>
          </div>
        </div>

        <div className="rounded-xl border bg-card p-6 shadow-sm space-y-4">
          <div className="flex justify-center">
            <AlertCircle className="h-12 w-12 text-destructive" />
          </div>
          <div className="space-y-1">
            <h2 className="text-lg font-semibold">Authentication failed</h2>
            <p className="text-sm text-muted-foreground">
              Something went wrong during sign in. Please try again.
            </p>
          </div>
          <Link
            href="/auth/login"
            className="block w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90 transition-opacity"
          >
            Back to login
          </Link>
        </div>

      </div>
    </div>
  )
}
