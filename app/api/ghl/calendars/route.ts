// GET /api/ghl/calendars — returns all GHL calendars for the tenant
import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { db } from '@/lib/db/client'

export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const tenant = await db.tenant.findUnique({
    where: { id: session.tenantId },
    select: { ghlAccessToken: true, ghlLocationId: true },
  })
  if (!tenant?.ghlAccessToken || !tenant.ghlLocationId) {
    return NextResponse.json({ calendars: [] })
  }

  try {
    const res = await fetch(
      `https://services.leadconnectorhq.com/calendars/?locationId=${tenant.ghlLocationId}`,
      { headers: { 'Authorization': `Bearer ${tenant.ghlAccessToken}`, 'Version': '2021-07-28' } }
    )
    if (!res.ok) return NextResponse.json({ calendars: [] })
    const data = await res.json() as { calendars?: Array<{ id: string; name: string }> }
    return NextResponse.json({ calendars: data.calendars ?? [] })
  } catch {
    return NextResponse.json({ calendars: [] })
  }
}
