// GET /api/[tenant]/ghl/workflows — list active GHL workflows for the tenant
import { NextResponse } from 'next/server'
import { withTenant } from '@/lib/api/withTenant'
import { getGHLClient } from '@/lib/ghl/client'

export const GET = withTenant<{ tenant: string }>(async (_req, ctx) => {
  try {
    const ghl = await getGHLClient(ctx.tenantId)
    const result = await ghl.getWorkflows()
    const workflows = (result.workflows ?? []).map(w => ({
      id: w.id,
      name: w.name,
      status: w.status ?? null,
    }))
    return NextResponse.json({ workflows })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load workflows'
    return NextResponse.json({ workflows: [], error: message }, { status: 500 })
  }
})
