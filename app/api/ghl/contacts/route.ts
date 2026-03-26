// GET /api/ghl/contacts?q=search — search GHL contacts in real time
import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { getGHLClient } from '@/lib/ghl/client'

export async function GET(req: Request) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const url = new URL(req.url)
    const query = url.searchParams.get('q') ?? ''
    if (query.length < 2) return NextResponse.json({ contacts: [] })

    const ghl = await getGHLClient(session.tenantId)
    const result = await ghl.searchContacts({ query, limit: 20 })

    const contacts = (result.contacts ?? []).map(c => ({
      id: c.id,
      name: `${c.firstName ?? ''} ${c.lastName ?? ''}`.trim() || c.email || c.phone || 'Unknown',
      phone: c.phone ?? null,
      email: c.email ?? null,
      address: [c.address1, c.city, c.state].filter(Boolean).join(', '),
    }))

    return NextResponse.json({ contacts })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed' }, { status: 500 })
  }
}
