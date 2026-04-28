// POST /api/[tenant]/ghl/notes — Add a note to a GHL contact
// Body: { contactId: string, body: string }
import { NextResponse } from 'next/server'
import { withTenant } from '@/lib/api/withTenant'
import { getGHLClient } from '@/lib/ghl/client'
import { db } from '@/lib/db/client'

export const POST = withTenant<{ tenant: string }>(async (req, ctx) => {
  try {
    const { contactId, body } = await req.json()
    if (!contactId || !body || typeof body !== 'string' || !body.trim()) {
      return NextResponse.json({ error: 'contactId and non-empty body required' }, { status: 400 })
    }

    const ghl = await getGHLClient(ctx.tenantId)
    const result = await ghl.addNote(contactId, body.trim())

    await db.auditLog.create({
      data: {
        tenantId: ctx.tenantId,
        userId: ctx.userId,
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
})
