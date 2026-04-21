// GET /api/[tenant]/ghl/workflows — list active GHL workflows for the tenant
import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { getGHLClient } from '@/lib/ghl/client'

export async function GET() {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const ghl = await getGHLClient(session.tenantId)
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
}
