// lib/gates/requireApproval.ts
// High-stakes action gates — code-level interceptors requiring explicit approval
// Rule 4: prompt instructions are not security boundaries

import { db } from '@/lib/db/client'
import { Prisma } from '@prisma/client'

interface ApprovalRequest {
  action: string          // sms_blast, bulk_update, record_delete, etc.
  description: string     // human-readable description
  data: Record<string, unknown>
  userId: string
  tenantId: string
}

interface ApprovalResult {
  approved: boolean
  gateId: string
  reason?: string
}

// Actions that require approval and their thresholds
const GATE_RULES: Record<string, { threshold?: number; alwaysGate?: boolean }> = {
  sms_blast: { threshold: 10 },       // SMS to 10+ contacts needs approval
  email_blast: { threshold: 10 },     // Email to 10+ contacts needs approval
  bulk_status_change: { threshold: 5 }, // 5+ properties at once
  record_delete: { alwaysGate: true }, // Any deletion
}

export async function requireApproval(request: ApprovalRequest): Promise<ApprovalResult> {
  const rule = GATE_RULES[request.action]

  // If no rule defined, auto-approve
  if (!rule) {
    return { approved: true, gateId: 'auto' }
  }

  // Check threshold
  const count = (request.data.count as number) ?? (request.data.recipientCount as number) ?? 0
  const needsGate = rule.alwaysGate || (rule.threshold && count >= rule.threshold)

  if (!needsGate) {
    return { approved: true, gateId: 'below_threshold' }
  }

  // Create pending approval record in audit log
  const auditEntry = await db.auditLog.create({
    data: {
      tenantId: request.tenantId,
      userId: request.userId,
      action: `gate.${request.action}.pending`,
      resource: request.action,
      source: 'SYSTEM',
      severity: 'WARNING',
      payload: {
        description: request.description,
        data: JSON.parse(JSON.stringify(request.data)),
        requiresApproval: true,
      } as unknown as Prisma.InputJsonValue,
    },
  })

  // Return pending — the UI must show a confirmation modal
  // and call approveAction() before proceeding
  return {
    approved: false,
    gateId: auditEntry.id,
    reason: request.description,
  }
}

export async function approveAction(
  gateId: string,
  userId: string,
  tenantId: string,
): Promise<boolean> {
  // Log the approval
  await db.auditLog.create({
    data: {
      tenantId,
      userId,
      action: 'gate.approved',
      resource: 'gate',
      resourceId: gateId,
      source: 'USER',
      severity: 'INFO',
      payload: { gateId, approvedBy: userId },
    },
  })

  return true
}
