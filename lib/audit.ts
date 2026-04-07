// lib/audit.ts
// Centralized failure logger — every error in the GHL pipeline goes through here
// so we have a queryable trail in audit_logs instead of relying on Railway console logs
import { db } from '@/lib/db/client'
import type { Prisma } from '@prisma/client'

export async function logFailure(
  tenantId: string | null | undefined,
  action: string,
  resource: string,
  err: unknown,
  context?: Record<string, unknown>,
): Promise<void> {
  const message = err instanceof Error ? err.message : String(err)
  const stack = err instanceof Error ? err.stack?.slice(0, 2000) : undefined

  // Always log to console too — Railway tail still useful in real-time
  console.error(`[FAILURE] ${action} on ${resource}: ${message}`, context ?? '')

  if (!tenantId) {
    console.warn(`[audit] Skipping audit_log write for ${action} — no tenantId`)
    return
  }

  try {
    await db.auditLog.create({
      data: {
        tenantId,
        action,
        resource,
        source: 'SYSTEM',
        severity: 'ERROR',
        payload: { error: message, stack, ...context } as unknown as Prisma.InputJsonValue,
      },
    })
  } catch (writeErr) {
    // Last-resort fallback — never let audit logging itself crash the caller
    console.error(`[audit] Failed to write audit_log for ${action}:`, writeErr instanceof Error ? writeErr.message : writeErr)
  }
}
