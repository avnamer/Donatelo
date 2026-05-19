// src/lib/db/queries/agents.ts

import { prisma } from '@/lib/db/prisma'
import type { HoldingThesis, AgentInsight, OrchestratorOutput } from '@/types/agents'

// ─── Theses ──────────────────────────────────

export async function getHoldingThesis(holdingId: string): Promise<HoldingThesis | null> {
  const row = await prisma.holdingThesis.findUnique({ where: { holdingId } })
  if (!row) return null
  return {
    ...row,
    catalysts: row.catalysts as string[],
    riskFactors: row.riskFactors as string[],
    horizon: row.horizon as HoldingThesis['horizon'],
  }
}

export async function getThesesForPortfolio(portfolioId: string): Promise<HoldingThesis[]> {
  const rows = await prisma.holdingThesis.findMany({
    where: {
      holding: { folder: { portfolioId } },
    },
  })
  return rows.map((row) => ({
    ...row,
    catalysts: row.catalysts as string[],
    riskFactors: row.riskFactors as string[],
    horizon: row.horizon as HoldingThesis['horizon'],
  }))
}

export async function upsertHoldingThesis(
  data: Omit<HoldingThesis, 'id' | 'createdAt' | 'updatedAt'>
): Promise<HoldingThesis> {
  const row = await prisma.holdingThesis.upsert({
    where: { holdingId: data.holdingId },
    create: data,
    update: {
      rawText: data.rawText,
      thesis: data.thesis,
      horizon: data.horizon,
      catalysts: data.catalysts,
      riskFactors: data.riskFactors,
    },
  })
  return {
    ...row,
    catalysts: row.catalysts as string[],
    riskFactors: row.riskFactors as string[],
    horizon: row.horizon as HoldingThesis['horizon'],
  }
}

// ─── Insights ────────────────────────────────

export async function getAgentInsights(
  portfolioId: string,
  includeDismissed = false
): Promise<AgentInsight[]> {
  const rows = await prisma.agentInsight.findMany({
    where: {
      portfolioId,
      ...(includeDismissed ? {} : { dismissed: false }),
    },
    orderBy: { createdAt: 'desc' },
    take: 50,
  })
  return rows.map((r) => ({
    ...r,
    type: r.type as AgentInsight['type'],
    severity: r.severity as AgentInsight['severity'],
  }))
}

export async function saveAgentInsights(
  insights: OrchestratorOutput['insights']
): Promise<void> {
  if (insights.length === 0) return
  await prisma.agentInsight.createMany({ data: insights })
}

export async function dismissInsight(id: string): Promise<void> {
  await prisma.agentInsight.update({ where: { id }, data: { dismissed: true } })
}

export async function getLatestInsightAge(portfolioId: string): Promise<Date | null> {
  const row = await prisma.agentInsight.findFirst({
    where: { portfolioId, dismissed: false },
    orderBy: { createdAt: 'desc' },
    select: { createdAt: true },
  })
  return row?.createdAt ?? null
}
