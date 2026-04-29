// app/api/ghl/pipelines/route.ts
import { NextResponse } from 'next/server'
import { withTenant } from '@/lib/api/withTenant'
import { getGHLClient } from '@/lib/ghl/client'

export const GET = withTenant(async (_req, ctx) => {
  try {
    const ghl = await getGHLClient(ctx.tenantId)
    const result = await ghl.getPipelines()
    return NextResponse.json(result)
  } catch (err) {
    return NextResponse.json({ error: 'GHL not connected', pipelines: [] }, { status: 503 })
  }
})
