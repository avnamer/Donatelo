// ─────────────────────────────────────────────
// Supabase OAuth callback handler
//
// After Google OAuth, Supabase redirects here with ?code=...
// We exchange the code for a session, then redirect to the
// original destination (or home).
// ─────────────────────────────────────────────

import { NextResponse, type NextRequest } from 'next/server'
import { createServerSupabaseClient } from '@/lib/db/supabase-server'

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const redirectTo = searchParams.get('redirectTo') ?? '/'

  if (code) {
    const supabase = await createServerSupabaseClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      return NextResponse.redirect(new URL(redirectTo, origin))
    }
  }

  // Something went wrong — redirect to error page
  return NextResponse.redirect(new URL('/auth/error', origin))
}
