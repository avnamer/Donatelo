'use server'

// ─────────────────────────────────────────────
// Server actions — target allocation updates
// ─────────────────────────────────────────────

import { revalidatePath } from 'next/cache'
import { getCurrentUser } from '@/lib/db/supabase-server'
import { updateFolder, updateHolding } from '@/lib/db/queries'

export async function saveTargetAllocation(
  folderId: string,
  targetPct: number
): Promise<{ success: boolean; error?: string }> {
  const user = await getCurrentUser()
  if (!user) return { success: false, error: 'Unauthorized' }

  if (targetPct < 0 || targetPct > 100) {
    return { success: false, error: 'Target must be between 0 and 100' }
  }

  const result = await updateFolder(folderId, user.id, {
    targetAllocationPct: targetPct,
  })

  if (!result) return { success: false, error: 'Folder not found' }

  revalidatePath('/allocations')
  revalidatePath('/invest')
  return { success: true }
}

export async function saveHoldingTargetAllocation(
  holdingId: string,
  targetPct: number
): Promise<{ success: boolean; error?: string }> {
  const user = await getCurrentUser()
  if (!user) return { success: false, error: 'Unauthorized' }

  if (targetPct < 0 || targetPct > 100) {
    return { success: false, error: 'Target must be between 0 and 100' }
  }

  const result = await updateHolding(holdingId, user.id, {
    targetAllocationPct: targetPct,
  })

  if (!result) return { success: false, error: 'Holding not found' }

  revalidatePath('/allocations')
  revalidatePath('/invest')
  return { success: true }
}
