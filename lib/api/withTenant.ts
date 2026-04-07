// lib/api/withTenant.ts
// Wraps Next.js App Router route handlers to enforce tenant context.
// Every API handler that uses this helper is GUARANTEED to have a valid tenantId.
// Every db query inside the handler MUST use ctx.tenantId in its where clause.
//
// Usage:
//   export const PATCH = withTenant<{ propertyId: string }>(async (req, ctx, params) => {
//     await db.property.update({
//       where: { id: params.propertyId, tenantId: ctx.tenantId },
//       data: { ... },
//     })
//     return NextResponse.json({ ok: true })
//   })

import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { logFailure } from '@/lib/audit'

export interface TenantContext {
  tenantId: string
  userId: string
  userRole: string
  tenantSlug: string
}

type RouteHandler<TParams> = (
  req: NextRequest,
  ctx: TenantContext,
  params: TParams,
) => Promise<Response>

export function withTenant<TParams = Record<string, never>>(
  handler: RouteHandler<TParams>,
) {
  return async (req: NextRequest, route: { params: TParams }) => {
    // getSession() returns AppSession | null — flat fields, not nested under .user
    const session = await getSession()

    if (!session || !session.tenantId || !session.userId) {
      return NextResponse.json({ error: 'Unauthorized — no tenant context' }, { status: 401 })
    }

    const ctx: TenantContext = {
      tenantId: session.tenantId,
      userId: session.userId,
      userRole: session.role,
      tenantSlug: session.tenantSlug,
    }

    try {
      return await handler(req, ctx, route.params)
    } catch (err) {
      await logFailure(ctx.tenantId, 'api.handler_error', req.nextUrl.pathname, err, {
        method: req.method,
        userId: ctx.userId,
      })
      return NextResponse.json(
        { error: err instanceof Error ? err.message : 'Internal server error' },
        { status: 500 },
      )
    }
  }
}
