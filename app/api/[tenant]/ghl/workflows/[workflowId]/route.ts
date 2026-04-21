// POST /api/[tenant]/ghl/workflows/[workflowId]
// Body: { contactId: string }
// Adds the contact to the GHL workflow.
import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { getGHLClient } from '@/lib/ghl/client'
import { db } from '@/lib/db/client'

export async function POST(
  req: Request,
  { params }: { params: { tenant: string; workflowId: string } },
) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { contactId } = await req.json()
    if (!contactId) {
      return NextResponse.json({ error: 'contactId required' }, { status: 400 })
    }

    const ghl = await getGHLClient(session.tenantId)
    await ghl.addContactToWorkflow(contactId, params.workflowId)

    await db.auditLog.create({
      data: {
        tenantId: session.tenantId,
        userId: session.userId,
        action: 'ghl.workflow_contact_added',
        resource: 'workflow',
        resourceId: params.workflowId,
        source: 'USER',
        severity: 'INFO',
        payload: { contactId, workflowId: params.workflowId },
      },
    })

    return NextResponse.json({ status: 'success' })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to add contact to workflow'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
