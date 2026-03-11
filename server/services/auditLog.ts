import { db } from "../_core/db";
import { auditLog } from "../../drizzle/schema";

interface LogActionParams {
  tenantId: number | null | undefined;
  userId: number | null | undefined;
  action: string;
  entityType?: string;
  entityId?: string | number;
  before?: unknown;
  after?: unknown;
  ipAddress?: string;
}

/**
 * Fire-and-forget audit log insertion.
 * Never throws — failures are silently swallowed to avoid breaking the caller.
 */
export function logAction(params: LogActionParams): void {
  db.insert(auditLog)
    .values({
      tenantId: params.tenantId ?? null,
      userId: params.userId ?? null,
      action: params.action,
      entityType: params.entityType ?? null,
      entityId: params.entityId !== undefined ? String(params.entityId) : null,
      before: (params.before as Record<string, unknown>) ?? null,
      after: (params.after as Record<string, unknown>) ?? null,
      ipAddress: params.ipAddress ?? null,
    })
    .catch(() => {
      // Silently swallow — audit log failures must never break the request
    });
}
