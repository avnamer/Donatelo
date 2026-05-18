// ─────────────────────────────────────────────
// UI store — client-side ephemeral state
//
// Persists currency, timeRange, and benchmark to localStorage as user preferences.
// ─────────────────────────────────────────────

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Currency } from '@/types'

export type TimeRange = '1M' | '3M' | '6M' | 'YTD' | '1Y' | '3Y' | 'ALL'

export type BenchmarkId =
  | 'none'
  | '^GSPC'
  | 'URTH'
  | '^IXIC'
  | '^TA35.TA'
  | '^TA90.TA'
  | '^TA125.TA'

export const BENCHMARK_LABELS: Record<BenchmarkId, string> = {
  'none':      'ללא השוואה',
  '^GSPC':     'S&P 500',
  'URTH':      'MSCI World',
  '^IXIC':     'Nasdaq',
  '^TA35.TA':  'תל אביב 35',
  '^TA90.TA':  'תל אביב 90',
  '^TA125.TA': 'תל אביב 125',
}

interface UIState {
  // Display currency (ILS or USD)
  currency: Currency
  setCurrency: (c: Currency) => void

  // Which folder/portfolio is expanded in the tree
  expandedFolderIds: string[]
  toggleFolder: (id: string) => void
  setExpandedFolders: (ids: string[]) => void

  // Time range for performance chart
  timeRange: TimeRange
  setTimeRange: (r: TimeRange) => void

  // Selected benchmark for performance chart
  benchmark: BenchmarkId
  setBenchmark: (b: BenchmarkId) => void

  // Selected portfolio id (null = all portfolios)
  selectedPortfolioId: string | null
  setSelectedPortfolioId: (id: string | null) => void

  // Whether any folder's actual allocation deviates from target by >2%
  isOffTarget: boolean
  setOffTarget: (v: boolean) => void
}

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      // ── Currency ──────────────────────────────
      currency: 'ILS',
      setCurrency: (currency) => set({ currency }),

      // ── Folders ───────────────────────────────
      expandedFolderIds: [],
      toggleFolder: (id) =>
        set((s) => ({
          expandedFolderIds: s.expandedFolderIds.includes(id)
            ? s.expandedFolderIds.filter((x) => x !== id)
            : [...s.expandedFolderIds, id],
        })),
      setExpandedFolders: (ids) => set({ expandedFolderIds: ids }),

      // ── Time Range ────────────────────────────
      timeRange: '1Y',
      setTimeRange: (timeRange) => set({ timeRange }),

      // ── Benchmark ─────────────────────────────
      benchmark: '^GSPC',
      setBenchmark: (benchmark) => set({ benchmark }),

      // ── Portfolio ─────────────────────────────
      selectedPortfolioId: null,
      setSelectedPortfolioId: (id) => set({ selectedPortfolioId: id }),

      // ── Off-target allocations ─────────────────
      isOffTarget: false,
      setOffTarget: (isOffTarget) => set({ isOffTarget }),
    }),
    {
      name: 'donatelo-ui',
      // Only persist currency, timeRange, and benchmark; tree expansion is ephemeral
      partialize: (state) => ({
        currency: state.currency,
        timeRange: state.timeRange,
        benchmark: state.benchmark,
      }),
    }
  )
)
