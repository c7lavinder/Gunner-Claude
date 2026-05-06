// app/api/tenants/ghl-pipelines/[id]/route.ts
// Per-row mutations on tenant_ghl_pipelines.

import { NextResponse } from 'next/server'
import { withTenant } from '@/lib/api/withTenant'
import { db } from '@/lib/db/client'

export const DELETE = withTenant<{ id: string }>(async (_req, ctx, params) => {
  const result = await db.tenantGhlPipeline.deleteMany({
    where: { id: params.id, tenantId: ctx.tenantId },
  })
  if (result.count === 0) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  return NextResponse.json({ ok: true })
})
