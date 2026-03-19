import { getSession, unauthorizedResponse } from '@/lib/auth/session'
// app/api/ghl/actions/route.ts
// Unified GHL action endpoint — execute any GHL action from the frontend
// Used by AI Coach, property pages, call detail pages

import { NextRequest, NextResponse } from 'next/server'


import { getGHLClient } from '@/lib/ghl/client'
import { db } from '@/lib/db/client'
import { hasPermission, type UserRole } from '@/types/roles'
import { z } from 'zod'

const actionSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('send_sms'),
    contactId: z.string(),
    message: z.string().min(1).max(1600),
  }),
  z.object({
    type: z.literal('add_note'),
    contactId: z.string(),
    note: z.string().min(1).max(5000),
  }),
  z.object({
    type: z.literal('create_task'),
    contactId: z.string(),
    title: z.string().min(1),
    dueDate: z.string(),
    body: z.string().optional(),
  }),
  z.object({
    type: z.literal('complete_task'),
    contactId: z.string(),
    taskId: z.string(),
  }),
  z.object({
    type: z.literal('update_stage'),
    opportunityId: z.string(),
    stageId: z.string(),
  }),
])

export async function POST(request: NextRequest) {
  const session = await getSession()
  if (!session) return unauthorizedResponse()

  const role = (session.role) as UserRole
  if (!hasPermission(role, 'ghl.actions')) {
    return NextResponse.json({ error: 'Permission denied' }, { status: 403 })
  }

  const tenantId = session.tenantId
  const body = await request.json()
  const parsed = actionSchema.safeParse(body)

  if (!parsed.success) return NextResponse.json({ error: 'Invalid action', details: parsed.error.flatten() }, { status: 400 })

  const action = parsed.data

  try {
    const ghl = await getGHLClient(tenantId)
    let result: unknown

    switch (action.type) {
      case 'send_sms':
        result = await ghl.sendSMS(action.contactId, action.message)
        break
      case 'add_note':
        result = await ghl.addNote(action.contactId, action.note)
        break
      case 'create_task':
        result = await ghl.createTask(action.contactId, {
          title: action.title,
          body: action.body,
          dueDate: action.dueDate,
        })
        break
      case 'complete_task':
        result = await ghl.completeTask(action.contactId, action.taskId)
        break
      case 'update_stage':
        result = await ghl.updateOpportunityStage(action.opportunityId, action.stageId)
        break
    }

    // Log the action
    await db.auditLog.create({
      data: {
        tenantId,
        userId: session.user.id,
        action: `ghl.${action.type}`,
        resource: 'ghl',
        source: 'USER',
        severity: 'INFO',
        payload: action as Record<string, unknown>,
      },
    })

    return NextResponse.json({ success: true, result })
  } catch (err) {
    console.error('[GHL Actions] Error:', err)
    return NextResponse.json({ error: 'GHL action failed' }, { status: 500 })
  }
}
