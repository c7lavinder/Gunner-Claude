// lib/cron-heartbeat.ts
// Bug #23 close — every cron writes started/finished/failed audit rows
// per AGENTS.md "Background Worker Conventions" / OPERATIONS.md "Cron
// heartbeat coverage status".
//
// Health query (per cron):
//   SELECT MAX(created_at) FROM audit_logs WHERE action = 'cron.<name>.started';
// MAX > expected interval = worker not running.
// .started present but no matching .finished = died mid-run.

import { db } from '@/lib/db/client'
import type { Prisma } from '@prisma/client'

export async function withCronHeartbeat<T>(
  cronName: string,
  fn: () => Promise<T>,
): Promise<T> {
  const startedAt = Date.now()

  await db.auditLog.create({
    data: {
      tenantId: null,
      userId: null,
      action: `cron.${cronName}.started`,
      resource: 'cron',
      resourceId: cronName,
      severity: 'INFO',
      source: 'SYSTEM',
      payload: { startedAt: new Date().toISOString() } as unknown as Prisma.InputJsonValue,
    },
  }).catch(err => console.error('[heartbeat] started write failed:', err instanceof Error ? err.message : err))

  try {
    const result = await fn()

    await db.auditLog.create({
      data: {
        tenantId: null,
        userId: null,
        action: `cron.${cronName}.finished`,
        resource: 'cron',
        resourceId: cronName,
        severity: 'INFO',
        source: 'SYSTEM',
        payload: {
          durationMs: Date.now() - startedAt,
          stats: (result ?? null) as unknown,
        } as unknown as Prisma.InputJsonValue,
      },
    }).catch(err => console.error('[heartbeat] finished write failed:', err instanceof Error ? err.message : err))

    return result
  } catch (err) {
    await db.auditLog.create({
      data: {
        tenantId: null,
        userId: null,
        action: `cron.${cronName}.failed`,
        resource: 'cron',
        resourceId: cronName,
        severity: 'ERROR',
        source: 'SYSTEM',
        payload: {
          durationMs: Date.now() - startedAt,
          error: err instanceof Error ? err.message : String(err),
        } as unknown as Prisma.InputJsonValue,
      },
    }).catch(writeErr => console.error('[heartbeat] failed write failed:', writeErr instanceof Error ? writeErr.message : writeErr))

    throw err
  }
}
