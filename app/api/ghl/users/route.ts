// app/api/ghl/users/route.ts
// Fetches GHL location users for team member mapping dropdown
// Also triggers sync of GHL user data (phone, name) into app users
import { NextResponse } from 'next/server'
import { withTenant } from '@/lib/api/withTenant'
import { getGHLClient } from '@/lib/ghl/client'
import { syncGHLUsers } from '@/lib/ghl/sync-users'

export const GET = withTenant(async (_req, ctx) => {
  try {
    const ghl = await getGHLClient(ctx.tenantId)
    const result = await ghl.getLocationUsers()

    // Sync GHL user data (phone numbers, names) into app users
    syncGHLUsers(ctx.tenantId).catch(() => {})

    return NextResponse.json(result)
  } catch (err) {
    return NextResponse.json({ error: 'GHL not connected', users: [] }, { status: 200 })
  }
})
