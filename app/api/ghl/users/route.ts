// app/api/ghl/users/route.ts
// Fetches GHL location users for team member mapping dropdown
// Also triggers sync of GHL user data (phone, name) into app users
import { NextRequest, NextResponse } from 'next/server'
import { getSession, unauthorizedResponse } from '@/lib/auth/session'
import { getGHLClient } from '@/lib/ghl/client'
import { syncGHLUsers } from '@/lib/ghl/sync-users'

export async function GET(request: NextRequest) {
  const session = await getSession()
  if (!session) return unauthorizedResponse()

  try {
    const ghl = await getGHLClient(session.tenantId)
    const result = await ghl.getLocationUsers()

    // Sync GHL user data (phone numbers, names) into app users
    syncGHLUsers(session.tenantId).catch(() => {})

    return NextResponse.json(result)
  } catch (err) {
    return NextResponse.json({ error: 'GHL not connected', users: [] }, { status: 200 })
  }
}
