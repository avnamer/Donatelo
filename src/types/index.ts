// ─────────────────────────────────────────────
// Core domain types for the Investment Tracker
// All monetary values are BigInt (agorot/cents × 100)
// ─────────────────────────────────────────────

export type Currency = 'ILS' | 'USD'
export type Exchange = 'TASE' | 'NYSE' | 'NASDAQ' | 'OTHER'
export type TransactionType =
  | 'SECURITY_BUY'
  | 'SECURITY_SELL'
  | 'DIVIDEND'
  | 'CASH_DEPOSIT'
  | 'CASH_WITHDRAWAL'

// ─── Portfolio ───────────────────────────────

export interface Portfolio {
  id: string
  userId: string
  name: string
  baseCurrency: Currency
  createdAt: Date
  updatedAt: Date
}

// ─── Folder ──────────────────────────────────

export interface Folder {
  id: string
  portfolioId: string
  parentId: string | null
  name: string
  color: string | null
  targetAllocationPct: number | null  // e.g. 28.00
  sortOrder: number
  isHiddenWhenShared: boolean
  createdAt: Date
  // Relations (populated when needed)
  children?: Folder[]
  holdings?: Holding[]
}

// ─── Holding ─────────────────────────────────

export interface Holding {
  id: string
  folderId: string
  tickerSymbol: string
  exchange: Exchange
  name: string
  expenseRatio: number | null  // e.g. 0.0061 = 0.61%
  targetAllocationPct: number | null
  isActive: boolean
  createdAt: Date
  // Relations
  lots?: Lot[]
}

// ─── Lot ─────────────────────────────────────

export interface Lot {
  id: string
  holdingId: string
  purchaseDate: Date
  shares: number
  costPerShare: bigint       // in agorot/cents
  costCurrency: Currency
  accountType: string | null // e.g. "השתלמות"
  soldShares: number
  soldDate: Date | null
  soldPricePerShare: bigint | null
  proceedsFromSale: bigint | null
  notes: string | null
  createdAt: Date
  // Computed
  activeShares?: number       // shares - soldShares
}

// ─── Cash Account ────────────────────────────

export interface CashAccount {
  id: string
  portfolioId: string
  name: string
  currency: Currency
  balance: bigint            // in agorot or cents
  targetAllocationPct: number | null
  createdAt: Date
  updatedAt: Date
}

// ─── Transaction ─────────────────────────────

export interface Transaction {
  id: string
  portfolioId: string
  type: TransactionType
  date: Date
  holdingId: string | null
  lotId: string | null
  cashAccountId: string | null
  shares: number | null
  pricePerShare: bigint | null
  amount: bigint
  currency: Currency
  realizedGain: bigint | null
  notes: string | null
  createdAt: Date
}

// ─── Market Data ─────────────────────────────

export interface PriceData {
  tickerSymbol: string
  exchange: Exchange
  price: bigint              // in agorot (TASE) or cents (US)
  currency: Currency
  priceDate: Date
  fetchedAt: Date
}

export interface DividendData {
  tickerSymbol: string
  exchange: Exchange
  declareDate: Date | null
  exDate: Date
  payDate: Date | null
  amountPerShare: bigint     // in cents
  currency: Currency
  frequency: string | null
}

export interface FxRate {
  fromCurrency: Currency
  toCurrency: Currency
  rate: number               // e.g. 3.72
  rateDate: Date
}

// ─── Calculated / View Models ────────────────

export interface FolderWithMetrics extends Folder {
  value: bigint              // current value in portfolio base currency
  costBasis: bigint
  unrealizedGains: bigint
  unrealizedReturnPct: number
  totalReturnPct: number
  actualAllocationPct: number
  expenseRatio: number
  dividendYield: number
  childCount: number
}

export interface HoldingWithMetrics extends Holding {
  value: bigint
  costBasis: bigint
  unrealizedGains: bigint
  realizedGains: bigint
  unrealizedReturnPct: number
  totalReturnPct: number
  actualAllocationPct: number  // within parent folder
  currentPrice: bigint | null
  lastPriceDate: Date | null
}

export interface PortfolioSummary {
  totalValue: bigint
  costBasis: bigint
  unrealizedGains: bigint
  realizedGains: bigint
  returnPct: number
  expenseRatio: number
  dividendYield: number
  lastUpdated: Date
}

// ─── Chart Data ──────────────────────────────

export interface PerformancePoint {
  date: Date
  index: number              // normalized to 100 at start
}

export interface AllocationSegment {
  id: string
  name: string
  value: bigint
  color: string
  actualPct: number
  targetPct: number | null
}

// ─── Auto-Invest ─────────────────────────────

export interface AutoInvestSuggestion {
  holdingId: string
  tickerSymbol: string
  holdingName: string
  folderName: string
  suggestedAmount: bigint
  suggestedShares: number
  currentPrice: bigint
  actualPct: number
  targetPct: number
  deviation: number          // actualPct - targetPct
}

// ─── API Response Types ──────────────────────

export interface ApiResponse<T> {
  data?: T
  error?: string
}

export interface PricesResponse {
  prices: Record<string, bigint>  // tickerSymbol → price in agorot/cents
  currency: Record<string, Currency>
  date: Record<string, Date>
}
