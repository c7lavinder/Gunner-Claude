// GET /api/[tenant]/dayhub/team-numbers
// Returns ALL team members with their GHL phone numbers for SMS "from" dropdown
import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { getGHLClient } from '@/lib/ghl/client'
import { db } from '@/lib/db/client'

export async function GET(
  _req: Request,
  { params }: { params: { tenant: string } }
) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    // Get all local DB users for this tenant
    const dbUsers = await db.user.findMany({
      where: { tenantId: session.tenantId },
      select: { id: true, name: true, ghlUserId: true },
    })

    // Get GHL location users for phone numbers
    let ghlPhoneMap = new Map<string, string>()
    try {
      const ghl = await getGHLClient(session.tenantId)
      const result = await ghl.getLocationUsers()
      for (const u of (result.users ?? [])) {
        if (u.id && u.phone) ghlPhoneMap.set(u.id, u.phone)
      }
    } catch {}

    // Merge: every DB user, with their GHL phone number if available
    const numbers = dbUsers.map(u => ({
      name: u.name ?? 'Unknown',
      phone: u.ghlUserId ? ghlPhoneMap.get(u.ghlUserId) ?? null : null,
      userId: u.id,
    }))

    return NextResponse.json({ numbers })
  } catch {
    return NextResponse.json({ numbers: [] })
  }
}
