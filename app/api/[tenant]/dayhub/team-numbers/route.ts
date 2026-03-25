// GET /api/[tenant]/dayhub/team-numbers
// Returns team members with phone numbers for SMS "from" dropdown
import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { getGHLClient } from '@/lib/ghl/client'

export async function GET(
  _req: Request,
  { params }: { params: { tenant: string } }
) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const ghl = await getGHLClient(session.tenantId)
    const result = await ghl.getLocationUsers()
    const users = result.users ?? []

    const numbers = users
      .filter(u => u.phone)
      .map(u => ({
        name: u.name || `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim(),
        phone: u.phone,
      }))

    return NextResponse.json({ numbers })
  } catch {
    return NextResponse.json({ numbers: [] })
  }
}
