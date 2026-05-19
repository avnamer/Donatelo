// src/lib/agents/orchestrator.ts

import { runMarketAgent } from './market-agent'
import { evaluateTheses } from './profile-agent'
import { runRebalancingAgent } from './rebalancing-agent'
import type {
  OrchestratorInput,
  OrchestratorOutput,
} from '@/types/agents'

export async function runOrchestrator(input: OrchestratorInput): Promise<OrchestratorOutput> {
  const { portfolioId, userId, holdings, folders, theses } = input

  // Build holdingId → tickerSymbol lookup for profile agent
  const tickerByHoldingId = new Map(holdings.map((h) => [h.id, h.tickerSymbol]))

  // Fire market analysis + rebalancing check in parallel (rebalancing is sync)
  const [marketUpdates, driftResult] = await Promise.all([
    runMarketAgent(
      holdings.map((h) => ({
        tickerSymbol: h.tickerSymbol,
        exchange: h.exchange,
        name: h.name,
      }))
    ),
    Promise.resolve(runRebalancingAgent(folders)),
  ])

  // Profile agent evaluates theses against market updates
  const thesisEvaluations = await evaluateTheses(theses, marketUpdates, tickerByHoldingId)

  // ─── Build insights list ──────────────────

  const insights: OrchestratorOutput['insights'] = []

  // Thesis evaluations → insights
  for (const ev of thesisEvaluations) {
    if (!ev.thesisIntact) {
      insights.push({
        portfolioId,
        userId,
        type: 'THESIS_BROKEN',
        severity: 'alert',
        holdingId: ev.holdingId,
        title: `Thesis may be broken: ${ev.tickerSymbol}`,
        body: ev.explanation,
      })
    } else if (ev.recommendation === 'review') {
      insights.push({
        portfolioId,
        userId,
        type: 'THESIS_REVIEW',
        severity: 'warning',
        holdingId: ev.holdingId,
        title: `Worth reviewing: ${ev.tickerSymbol}`,
        body: ev.explanation,
      })
    }
  }

  // Significant market movers → insights
  for (const update of marketUpdates) {
    if (Math.abs(update.priceChangePct) >= 10) {
      insights.push({
        portfolioId,
        userId,
        type: 'MARKET_UPDATE',
        severity: update.trend === 'bearish' ? 'warning' : 'info',
        holdingId: null,
        title: `${update.tickerSymbol}: ${update.priceChangePct > 0 ? '+' : ''}${update.priceChangePct.toFixed(1)}% (30d)`,
        body: update.trendReason,
      })
    }
  }

  // Allocation drift → insights
  for (const drift of driftResult.drifts) {
    const severity = Math.abs(drift.driftPct) >= 10 ? 'alert' : 'warning'
    const direction = drift.driftPct > 0 ? 'overweight' : 'underweight'
    insights.push({
      portfolioId,
      userId,
      type: 'ALLOCATION_DRIFT',
      severity,
      holdingId: null,
      title: `Allocation drift: ${drift.folderName}`,
      body: `${drift.folderName} is ${direction} at ${drift.actualPct.toFixed(1)}% vs target ${drift.targetPct.toFixed(1)}% (drift: ${drift.driftPct > 0 ? '+' : ''}${drift.driftPct.toFixed(1)}%).`,
    })
  }

  // ─── Portfolio health ─────────────────────

  const hasAlerts = insights.some((i) => i.severity === 'alert')
  const hasWarnings = insights.some((i) => i.severity === 'warning')
  const portfolioHealth = hasAlerts ? 'alert' : hasWarnings ? 'attention' : 'good'

  const alertCount = insights.filter((i) => i.severity === 'alert').length
  const warningCount = insights.filter((i) => i.severity === 'warning').length
  const summary =
    portfolioHealth === 'good'
      ? 'Portfolio is on track — theses intact and allocations balanced.'
      : hasAlerts
        ? `${alertCount} issue(s) require attention.`
        : `${warningCount} item(s) worth reviewing.`

  return { portfolioHealth, summary, insights }
}
