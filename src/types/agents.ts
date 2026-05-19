// src/types/agents.ts

export type InsightType = 'THESIS_BROKEN' | 'ALLOCATION_DRIFT' | 'MARKET_UPDATE' | 'OPPORTUNITY'
export type InsightSeverity = 'info' | 'warning' | 'alert'
export type InvestmentHorizon = 'short' | 'medium' | 'long'
export type MarketTrend = 'bullish' | 'bearish' | 'neutral'

export interface HoldingThesis {
  id: string
  holdingId: string
  userId: string
  rawText: string
  thesis: string
  horizon: InvestmentHorizon | null
  catalysts: string[]
  riskFactors: string[]
  createdAt: Date
  updatedAt: Date
}

export interface AgentInsight {
  id: string
  portfolioId: string
  userId: string
  type: InsightType
  severity: InsightSeverity
  holdingId: string | null
  title: string
  body: string
  dismissed: boolean
  createdAt: Date
}

export interface MarketUpdate {
  tickerSymbol: string
  exchange: string
  priceChangePct: number          // vs 30 days ago (or available history)
  currentPriceCents: number       // latest price in cents
  trend: MarketTrend
  trendReason: string             // 1 sentence from Claude
}

export interface ThesisEvaluation {
  holdingId: string
  tickerSymbol: string
  thesisIntact: boolean
  explanation: string             // why intact or broken
  recommendation: 'hold' | 'review' | 'rebalance'
}

export interface AllocationDrift {
  folderId: string
  folderName: string
  actualPct: number
  targetPct: number
  driftPct: number                // actualPct - targetPct
}

export interface OrchestratorInput {
  portfolioId: string
  userId: string
  holdings: Array<{
    id: string
    tickerSymbol: string
    exchange: string
    name: string
    actualAllocationPct: number
  }>
  folders: Array<{
    id: string
    name: string
    actualAllocationPct: number
    targetAllocationPct: number | null
  }>
  theses: HoldingThesis[]
}

export interface OrchestratorOutput {
  portfolioHealth: 'good' | 'attention' | 'alert'
  summary: string
  insights: Omit<AgentInsight, 'id' | 'createdAt' | 'dismissed'>[]
}

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface ExtractedThesis {
  holdingId: string
  rawText: string
  thesis: string
  horizon: InvestmentHorizon | null
  catalysts: string[]
  riskFactors: string[]
}
