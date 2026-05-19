// src/lib/agents/rebalancing-agent.ts

import type { AllocationDrift } from '@/types/agents'

const DRIFT_WARNING_THRESHOLD = 5   // percent — show warning
const DRIFT_ALERT_THRESHOLD = 10    // percent — show alert

interface FolderInput {
  id: string
  name: string
  actualAllocationPct: number
  targetAllocationPct: number | null
}

export interface DriftResult {
  drifts: AllocationDrift[]
  hasWarnings: boolean
  hasAlerts: boolean
}

export function runRebalancingAgent(folders: FolderInput[]): DriftResult {
  const drifts: AllocationDrift[] = []

  for (const folder of folders) {
    if (folder.targetAllocationPct === null) continue

    const driftPct = folder.actualAllocationPct - folder.targetAllocationPct
    if (Math.abs(driftPct) >= DRIFT_WARNING_THRESHOLD) {
      drifts.push({
        folderId: folder.id,
        folderName: folder.name,
        actualPct: folder.actualAllocationPct,
        targetPct: folder.targetAllocationPct,
        driftPct,
      })
    }
  }

  return {
    drifts,
    hasWarnings: drifts.some((d) => Math.abs(d.driftPct) >= DRIFT_WARNING_THRESHOLD),
    hasAlerts: drifts.some((d) => Math.abs(d.driftPct) >= DRIFT_ALERT_THRESHOLD),
  }
}
