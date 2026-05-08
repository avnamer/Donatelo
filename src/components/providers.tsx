'use client'

// ─────────────────────────────────────────────
// Root providers wrapper
// Wraps the app in TanStack Query + devtools
// ─────────────────────────────────────────────

import { useState } from 'react'
import { QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import { makeQueryClient } from '@/lib/query-client'

export function Providers({ children }: { children: React.ReactNode }) {
  // useState ensures the client is created once per component mount,
  // not recreated on every render (important in React 19 StrictMode)
  const [queryClient] = useState(makeQueryClient)

  return (
    <QueryClientProvider client={queryClient}>
      {children}
      {process.env.NODE_ENV === 'development' && (
        <ReactQueryDevtools initialIsOpen={false} />
      )}
    </QueryClientProvider>
  )
}
