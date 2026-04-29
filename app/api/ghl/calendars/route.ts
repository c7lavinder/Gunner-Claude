// GET /api/ghl/calendars — returns all GHL calendars for the tenant
import { NextResponse } from 'next/server'
import { withTenant } from '@/lib/api/withTenant'
import { db } from '@/lib/db/client'

export const GET = withTenant(async (_req, ctx) => {
  const tenant = await db.tenant.findUnique({
    where: { id: ctx.tenantId },
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
})
