// ─────────────────────────────────────────────
// Supabase server clients
// SERVER ONLY — do NOT import from 'use client' components
//
// TWO flavors:
//  1. createServerSupabaseClient() — Server Components, Route Handlers, Actions
//  2. createAdminClient()          — server-only, bypasses RLS
// ─────────────────────────────────────────────

import { createServerClient as _createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'

// ─── 1. Server client (use in Server Components / Route Handlers) ─────

export async function createServerSupabaseClient() {
  const cookieStore = await cookies()

  return _createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // setAll can't be called in Server Components (read-only context)
            // This is expected — cookies will be set in middleware instead
          }
        },
      },
    }
  )
}

// ─── 2. Admin client (server-only, bypasses RLS) ─────────────

export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  )
}

// ─── Helper: get current user (server) ──────────────────────

export async function getCurrentUser() {
  const supabase = await createServerSupabaseClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return null
  return user
}
