// lib/ghl/reverse-sync.ts
//
// Phase 4.3 of GHL multi-pipeline redesign — UI → GHL stage writeback.
// See docs/plans/ghl-multi-pipeline-bulletproof.md §9.3.
//
// When a Gunner team member changes a property's per-lane status via the UI
// (e.g. promotes "New Lead" → "Appointment Set"), this helper pushes the
// matching stage update back to GHL so the CRM stays in sync.
//
// Behind feature flag REVERSE_SYNC_ENABLED (default off). All failures
// log to auditLog and never throw — writeback is best-effort and never
// blocks the user's UI action.

import { db } from '@/lib/db/client'
import { getGHLClient } from '@/lib/ghl/client'

export type Lane = 'acquisition' | 'disposition' | 'longterm'

// Gunner-status → GHL-stage-name map. Many GHL stages can map to the same
// Gunner status (the forward map in lib/ghl-stage-map.ts is many-to-one);
// here we pick a single canonical GHL stage to write back to. If a tenant's
// GHL pipeline is missing the canonical name, the writeback no-ops with
// reason="stage_name_not_found".
const STATUS_TO_STAGE_NAME_ACQ: Record<string, string> = {
  NEW_LEAD: 'New Lead (1)',
  APPOINTMENT_SET: 'Pending Apt(3)',
  OFFER_MADE: 'Made Offer (4)',
  UNDER_CONTRACT: 'Under Contract (5)',
  CLOSED: 'Purchased (6)',
}

const STATUS_TO_STAGE_NAME_DISPO: Record<string, string> = {
  IN_DISPOSITION: 'New deal',
  DISPO_PUSHED: 'Sent to buyers',
  DISPO_OFFERS: 'Offers Received',
  DISPO_CONTRACTED: 'UC W/ Buyer',
  CLOSED: 'Closed',
}

const STATUS_TO_STAGE_NAME_LONGTERM: Record<string, string> = {
  FOLLOW_UP: '1 Month Follow Up',
  DEAD: 'Trash',
}

function stageNameFor(lane: Lane, status: string): string | null {
  if (lane === 'acquisition') return STATUS_TO_STAGE_NAME_ACQ[status] ?? null
  if (lane === 'disposition') return STATUS_TO_STAGE_NAME_DISPO[status] ?? null
  return STATUS_TO_STAGE_NAME_LONGTERM[status] ?? null
}

export interface ReverseSyncResult {
  synced: boolean
  reason?: string
}

export async function syncStatusToGHL(opts: {
  tenantId: string
  propertyId: string
  lane: Lane
  newStatus: string
}): Promise<ReverseSyncResult> {
  // Feature flag — default OFF. Set REVERSE_SYNC_ENABLED=true in Railway env
  // to turn on. Allows safe rollout on a per-environment basis.
  if (process.env.REVERSE_SYNC_ENABLED !== 'true') {
    return { synced: false, reason: 'feature_flag_off' }
  }

  const property = await db.property.findFirst({
    where: { id: opts.propertyId, tenantId: opts.tenantId },
    select: {
      ghlAcqOppId: true, ghlDispoOppId: true, ghlLongtermOppId: true,
      ghlSyncLocked: true,
    },
  })
  if (!property) return { synced: false, reason: 'property_not_found' }

  // Auto-split divergence guard — if a property had its lane locked from a
  // prior multi-address split, don't overwrite GHL. The user manages the
  // locked side manually (plan §6).
  if (property.ghlSyncLocked) return { synced: false, reason: 'sync_locked' }

  const oppId =
    opts.lane === 'acquisition' ? property.ghlAcqOppId :
    opts.lane === 'disposition' ? property.ghlDispoOppId :
    property.ghlLongtermOppId
  if (!oppId) return { synced: false, reason: 'no_opp_id' }

  const stageName = stageNameFor(opts.lane, opts.newStatus)
  if (!stageName) return { synced: false, reason: 'no_stage_mapping' }

  const tgp = await db.tenantGhlPipeline.findFirst({
    where: { tenantId: opts.tenantId, track: opts.lane, isActive: true },
    select: { ghlPipelineId: true },
  })
  if (!tgp) return { synced: false, reason: 'no_active_pipeline' }

  try {
    const ghl = await getGHLClient(opts.tenantId)
    const pipelinesData = await ghl.getPipelines()
    const pipelineMeta = pipelinesData.pipelines.find(p => p.id === tgp.ghlPipelineId)
    if (!pipelineMeta) return { synced: false, reason: 'pipeline_not_in_ghl' }
    const stage = pipelineMeta.stages?.find(s => s.name === stageName)
    if (!stage) return { synced: false, reason: 'stage_name_not_found' }

    await ghl.updateOpportunityStage(oppId, stage.id)
    await db.auditLog.create({
      data: {
        tenantId: opts.tenantId,
        action: 'reverse_sync.stage_updated',
        resource: 'property',
        resourceId: opts.propertyId,
        severity: 'INFO',
        source: 'SYSTEM',
        payload: { lane: opts.lane, oppId, stageId: stage.id, stageName, status: opts.newStatus },
      },
    }).catch(() => {})
    return { synced: true }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    await db.auditLog.create({
      data: {
        tenantId: opts.tenantId,
        action: 'reverse_sync.failed',
        resource: 'property',
        resourceId: opts.propertyId,
        severity: 'WARNING',
        source: 'SYSTEM',
        payload: { lane: opts.lane, oppId, status: opts.newStatus, error: msg },
      },
    }).catch(() => {})
    return { synced: false, reason: msg }
  }
}

// Helper for callers that just have a status string and want to figure out
// which lane it belongs to. CLOSED is ambiguous between acq+dispo — caller
// passes a hint based on the property's current state (matching the dispatch
// logic in app/api/properties/[propertyId]/route.ts).
export function laneForStatus(status: string, closedHint: 'acquisition' | 'disposition'): Lane | null {
  const ACQ = new Set(['NEW_LEAD', 'APPOINTMENT_SET', 'OFFER_MADE', 'UNDER_CONTRACT'])
  const DISPO = new Set(['IN_DISPOSITION', 'DISPO_PUSHED', 'DISPO_OFFERS', 'DISPO_CONTRACTED'])
  const LONGTERM = new Set(['FOLLOW_UP', 'DEAD'])
  if (ACQ.has(status)) return 'acquisition'
  if (DISPO.has(status)) return 'disposition'
  if (LONGTERM.has(status)) return 'longterm'
  if (status === 'CLOSED') return closedHint
  return null
}
