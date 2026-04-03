import { getSession, unauthorizedResponse } from '@/lib/auth/session'
// app/api/ghl/pipelines/route.ts
import { NextRequest, NextResponse } from 'next/server'


import { getGHLClient } from '@/lib/ghl/client'

export async function GET(request: NextRequest) {
  const session = await getSession()
  if (!session) return unauthorizedResponse()

  const tenantId = session.tenantId

  try {
    const ghl = await getGHLClient(tenantId)
    const result = await ghl.getPipelines()
    return NextResponse.json(result)
  } catch (err) {
    return NextResponse.json({ error: 'GHL not connected', pipelines: [] }, { status: 503 })
  }
}
