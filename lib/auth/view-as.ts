// lib/auth/view-as.ts
// Resolves the effective user for API calls that support admin "View As" impersonation.
// If the caller is admin and passes asUserId, returns that user's info instead.

import { db } from '@/lib/db/client'
import type { TenantContext } from '@/lib/api/withTenant'

interface EffectiveUser {
  userId: string
  role: string
  ghlUserId: string | null
  isImpersonating: boolean
}

export async function resolveEffectiveUser(
  ctx: TenantContext,
  asUserId: string | null,
): Promise<EffectiveUser> {
  const session = { userId: ctx.userId, tenantId: ctx.tenantId }
  // No impersonation requested — use the caller
  if (!asUserId || asUserId === session.userId) {
    const user = await db.user.findUnique({
      where: { id: session.userId },
      select: { role: true, ghlUserId: true },
    })
    return {
      userId: session.userId,
      role: user?.role ?? 'LEAD_MANAGER',
      ghlUserId: user?.ghlUserId ?? null,
      isImpersonating: false,
    }
  }

  // Impersonation requested — verify caller is admin
  const caller = await db.user.findUnique({
    where: { id: session.userId },
    select: { role: true },
  })
  if (caller?.role !== 'OWNER' && caller?.role !== 'ADMIN') {
    // Non-admin trying to impersonate — silently fall back to self
    const self = await db.user.findUnique({
      where: { id: session.userId },
      select: { role: true, ghlUserId: true },
    })
    return {
      userId: session.userId,
      role: self?.role ?? 'LEAD_MANAGER',
      ghlUserId: self?.ghlUserId ?? null,
      isImpersonating: false,
    }
  }

  // Admin impersonating — return the target user's info
  const target = await db.user.findUnique({
    where: { id: asUserId, tenantId: session.tenantId },
    select: { id: true, role: true, ghlUserId: true },
  })
  if (!target) {
    // Target user not found — fall back to self
    return {
      userId: session.userId,
      role: caller.role,
      ghlUserId: null,
      isImpersonating: false,
    }
  }

  return {
    userId: target.id,
    role: target.role,
    ghlUserId: target.ghlUserId ?? null,
    isImpersonating: true,
  }
}
