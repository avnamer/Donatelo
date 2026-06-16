// ─────────────────────────────────────────────
// TanStack Query client factory
// Shared config: 5-minute stale time, 3 retries with backoff
// ─────────────────────────────────────────────

import { QueryClient } from '@tanstack/react-query'

export function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 1000 * 60 * 5,        // 5 minutes
        gcTime: 1000 * 60 * 60 * 24,    // 24h — keep around for localStorage persistence
        retry: 3,
        retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 30_000),
      },
    },
  })
}
