// src/lib/agents/agents.test.ts

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { runRebalancingAgent } from './rebalancing-agent'

// ─── Rebalancing Agent (pure function — no mocks needed) ───

describe('runRebalancingAgent', () => {
  it('returns empty drifts when no folders have targets', () => {
    const result = runRebalancingAgent([
      { id: '1', name: 'Tech', actualAllocationPct: 50, targetAllocationPct: null },
    ])
    expect(result.drifts).toHaveLength(0)
    expect(result.hasWarnings).toBe(false)
    expect(result.hasAlerts).toBe(false)
  })

  it('returns warning drift when actual is 5%+ above target', () => {
    const result = runRebalancingAgent([
      { id: '1', name: 'Tech', actualAllocationPct: 45, targetAllocationPct: 40 },
    ])
    expect(result.drifts).toHaveLength(1)
    expect(result.drifts[0].driftPct).toBe(5)
    expect(result.hasWarnings).toBe(true)
    expect(result.hasAlerts).toBe(false)
  })

  it('flags alert when drift >= 10%', () => {
    const result = runRebalancingAgent([
      { id: '1', name: 'Tech', actualAllocationPct: 55, targetAllocationPct: 40 },
    ])
    expect(result.hasAlerts).toBe(true)
    expect(result.hasWarnings).toBe(true)
  })

  it('ignores folders within 5% of target', () => {
    const result = runRebalancingAgent([
      { id: '1', name: 'Bonds', actualAllocationPct: 22, targetAllocationPct: 20 },
    ])
    expect(result.drifts).toHaveLength(0)
  })

  it('handles underweight drift (negative)', () => {
    const result = runRebalancingAgent([
      { id: '1', name: 'Bonds', actualAllocationPct: 10, targetAllocationPct: 20 },
    ])
    expect(result.drifts[0].driftPct).toBe(-10)
    expect(result.hasAlerts).toBe(true)
  })
})

// ─── Orchestrator (mocked agents) ──────────

vi.mock('./market-agent', () => ({
  runMarketAgent: vi.fn(),
}))
vi.mock('./profile-agent', () => ({
  evaluateTheses: vi.fn(),
  buildChatSystemPrompt: vi.fn(),
}))

describe('runOrchestrator', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns good health when no issues', async () => {
    const { runMarketAgent } = await import('./market-agent')
    const { evaluateTheses } = await import('./profile-agent')
    vi.mocked(runMarketAgent).mockResolvedValue([])
    vi.mocked(evaluateTheses).mockResolvedValue([])

    const { runOrchestrator } = await import('./orchestrator')
    const result = await runOrchestrator({
      portfolioId: 'p1',
      userId: 'u1',
      holdings: [],
      folders: [],
      theses: [],
    })

    expect(result.portfolioHealth).toBe('good')
    expect(result.insights).toHaveLength(0)
  })

  it('produces THESIS_BROKEN alert when thesis is not intact', async () => {
    const { runMarketAgent } = await import('./market-agent')
    const { evaluateTheses } = await import('./profile-agent')
    vi.mocked(runMarketAgent).mockResolvedValue([])
    vi.mocked(evaluateTheses).mockResolvedValue([
      {
        holdingId: 'h1',
        tickerSymbol: 'NVDA',
        thesisIntact: false,
        explanation: 'Regulation reversed.',
        recommendation: 'rebalance',
      },
    ])

    const { runOrchestrator } = await import('./orchestrator')
    const result = await runOrchestrator({
      portfolioId: 'p1',
      userId: 'u1',
      holdings: [{ id: 'h1', tickerSymbol: 'NVDA', exchange: 'NASDAQ', name: 'Nvidia', actualAllocationPct: 20 }],
      folders: [],
      theses: [],
    })

    expect(result.portfolioHealth).toBe('alert')
    expect(result.insights).toHaveLength(1)
    expect(result.insights[0].type).toBe('THESIS_BROKEN')
    expect(result.insights[0].severity).toBe('alert')
    expect(result.insights[0].title).toContain('NVDA')
  })

  it('produces ALLOCATION_DRIFT warning for 5-9% drift', async () => {
    const { runMarketAgent } = await import('./market-agent')
    const { evaluateTheses } = await import('./profile-agent')
    vi.mocked(runMarketAgent).mockResolvedValue([])
    vi.mocked(evaluateTheses).mockResolvedValue([])

    const { runOrchestrator } = await import('./orchestrator')
    const result = await runOrchestrator({
      portfolioId: 'p1',
      userId: 'u1',
      holdings: [],
      folders: [{ id: 'f1', name: 'Tech', actualAllocationPct: 47, targetAllocationPct: 40 }],
      theses: [],
    })

    expect(result.portfolioHealth).toBe('attention')
    expect(result.insights[0].type).toBe('ALLOCATION_DRIFT')
    expect(result.insights[0].severity).toBe('warning')
  })

  it('produces MARKET_UPDATE info insight for 10%+ bullish move', async () => {
    const { runMarketAgent } = await import('./market-agent')
    const { evaluateTheses } = await import('./profile-agent')
    vi.mocked(runMarketAgent).mockResolvedValue([
      {
        tickerSymbol: 'AAPL',
        exchange: 'NASDAQ',
        priceChangePct: 12,
        currentPriceCents: 19500,
        trend: 'bullish',
        trendReason: 'Strong earnings.',
      },
    ])
    vi.mocked(evaluateTheses).mockResolvedValue([])

    const { runOrchestrator } = await import('./orchestrator')
    const result = await runOrchestrator({
      portfolioId: 'p1',
      userId: 'u1',
      holdings: [{ id: 'h1', tickerSymbol: 'AAPL', exchange: 'NASDAQ', name: 'Apple', actualAllocationPct: 15 }],
      folders: [],
      theses: [],
    })

    expect(result.insights[0].type).toBe('MARKET_UPDATE')
    expect(result.insights[0].severity).toBe('info')
    expect(result.insights[0].title).toContain('+12.0%')
  })
})
