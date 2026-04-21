// POST /api/[tenant]/ghl/notes — Add a note to a GHL contact
// Body: { contactId: string, body: string }
import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { getGHLClient } from '@/lib/ghl/client'
import { db } from '@/lib/db/client'

export async function POST(req: Request) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { contactId, body } = await req.json()
    if (!contactId || !body || typeof body !== 'string' || !body.trim()) {
      return NextResponse.json({ error: 'contactId and non-empty body required' }, { status: 400 })
    }

    const ghl = await getGHLClient(session.tenantId)
    const result = await ghl.addNote(contactId, body.trim())

    await db.auditLog.create({
      data: {
        tenantId: session.tenantId,
        userId: session.userId,
        action: 'ghl.note_added',
        resource: 'contact',
        resourceId: contactId,
        source: 'USER',
        severity: 'INFO',
        payload: { contactId, length: body.length },
      },
    })

    return NextResponse.json({ status: 'success', result })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to add note'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
