// lib/ghl/resolveAssignee.ts
// Shared helper: internal user id -> GHL user id resolution for task/contact assignment.
// Extracted from app/api/[tenant]/calls/[id]/actions/route.ts so execute/route.ts
// (AI Assistant) uses the same logic — single source of truth, identical audit tags.
//
// Contract:
//   - Returns { ghlUserId, note }.
//   - ghlUserId is defined only when the internal user exists, belongs to the
//     caller's tenant, and has a ghlUserId mapping in the users table.
//   - note carries the exact failure tag used in audit_logs payloads elsewhere.
//     Consumers forward it verbatim so downstream queries find both routes.
//   - Undefined input -> returns { ghlUserId: undefined, note: undefined } so the
//     caller can pass `resolvedAssignedTo` to GHL without branching.
import { db } from '@/lib/db/client'

export type AssigneeResolutionNote =
  | 'user_not_found'
  | 'user_wrong_tenant'
  | 'user_missing_ghl_mapping'

export interface AssigneeResolution {
  ghlUserId: string | undefined
  note: AssigneeResolutionNote | undefined
}

export async function resolveAssignee(
  assigneeInternalId: string | undefined,
  ctxTenantId: string,
): Promise<AssigneeResolution> {
  if (!assigneeInternalId) {
    return { ghlUserId: undefined, note: undefined }
  }

  const assignee = await db.user.findUnique({
    where: { id: assigneeInternalId },
    select: { ghlUserId: true, tenantId: true },
  })

  if (!assignee) {
    return { ghlUserId: undefined, note: 'user_not_found' }
  }
  if (assignee.tenantId !== ctxTenantId) {
    return { ghlUserId: undefined, note: 'user_wrong_tenant' }
  }
  if (!assignee.ghlUserId) {
    return { ghlUserId: undefined, note: 'user_missing_ghl_mapping' }
  }
  return { ghlUserId: assignee.ghlUserId, note: undefined }
}
