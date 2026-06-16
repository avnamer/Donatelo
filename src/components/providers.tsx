'use client'

import { useState } from 'react'
import { PersistQueryClientProvider, type PersistedClient } from '@tanstack/react-query-persist-client'
import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import { ThemeProvider } from 'next-themes'
import { makeQueryClient } from '@/lib/query-client'

// BigInt values (e.g. price in agorot) cannot survive JSON.stringify.
// Encode them as { __type: 'bigint', value: '...' } for safe localStorage round-trip.
function serialize(data: PersistedClient): string {
  return JSON.stringify(data, (_k, v) =>
    typeof v === 'bigint' ? { __type: 'bigint', value: v.toString() } : v
  )
}

function deserialize(str: string): PersistedClient {
  return JSON.parse(str, (_k, v) =>
    v && typeof v === 'object' && v.__type === 'bigint' ? BigInt(v.value) : v
  ) as PersistedClient
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(makeQueryClient)
  const [persister] = useState(() => {
    if (typeof window === 'undefined') return null
    return createSyncStoragePersister({
      storage: window.localStorage,
      key: 'donatelo-query-cache',
      serialize,
      deserialize,
    })
  })

  // Server: persister is null — plain ThemeProvider avoids hydration mismatch.
  // Client: PersistQueryClientProvider takes over after hydration.
  if (!persister) {
    return (
      <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
        {children}
      </ThemeProvider>
    )
  }

  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <PersistQueryClientProvider
        client={queryClient}
        persistOptions={{
          persister,
          maxAge: 1000 * 60 * 60 * 24,  // discard persisted cache older than 24h
          buster: 'v1',                  // bump when PriceData/DailyPoint shapes change
        }}
      >
        {children}
        {process.env.NODE_ENV === 'development' && (
          <ReactQueryDevtools initialIsOpen={false} />
        )}
      </PersistQueryClientProvider>
    </ThemeProvider>
  )
}
