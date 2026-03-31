// app/api/[tenant]/calls/[id]/deal-intel/route.ts
// GET: Returns proposed deal intel changes for this call
// PATCH: Approve, edit, or skip a proposed change

import { NextRequest, NextResponse } from 'next/server'
import { getSession, unauthorizedResponse } from '@/lib/auth/session'
import { db } from '@/lib/db/client'
import type { ProposedDealIntelChange, DealIntel, FieldValue, AccumulatedField } from '@/lib/types/deal-intel'
import { Prisma } from '@prisma/client'

export async function GET(
  request: NextRequest,
  { params }: { params: { tenant: string; id: string } },
) {
  const session = await getSession()
  if (!session) return unauthorizedResponse()

  const call = await db.call.findFirst({
    where: { id: params.id, tenantId: session.tenantId },
    select: { dealIntelHistory: true },
  })
  if (!call) return NextResponse.json({ error: 'Call not found' }, { status: 404 })

  const changes = (call.dealIntelHistory ?? []) as unknown as ProposedDealIntelChange[]
  return NextResponse.json({ changes })
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { tenant: string; id: string } },
) {
  const session = await getSession()
  if (!session) return unauthorizedResponse()

  const body = await request.json()
  const { field, decision, editedValue } = body as {
    field: string
    decision: 'approved' | 'edited' | 'skipped'
    editedValue?: unknown
  }

  if (!field || !decision) {
    return NextResponse.json({ error: 'field and decision required' }, { status: 400 })
  }

  const call = await db.call.findFirst({
    where: { id: params.id, tenantId: session.tenantId },
    select: { id: true, dealIntelHistory: true, propertyId: true },
  })
  if (!call) return NextResponse.json({ error: 'Call not found' }, { status: 404 })

  const changes = (call.dealIntelHistory ?? []) as unknown as ProposedDealIntelChange[]
  const changeIdx = changes.findIndex(c => c.field === field)
  if (changeIdx === -1) return NextResponse.json({ error: 'Change not found' }, { status: 404 })

  const change = changes[changeIdx]

  // Update the decision on the change record
  changes[changeIdx] = {
    ...change,
    decision,
    editedValue: decision === 'edited' ? editedValue : undefined,
    decidedAt: new Date().toISOString(),
    decidedBy: session.userId,
  }

  // Save updated history to call
  await db.call.update({
    where: { id: call.id },
    data: { dealIntelHistory: changes as unknown as Prisma.InputJsonValue },
  })

  // If approved or edited, write to property dealIntel
  if ((decision === 'approved' || decision === 'edited') && call.propertyId) {
    const property = await db.property.findUnique({
      where: { id: call.propertyId },
      select: { dealIntel: true },
    })
    const currentIntel = (property?.dealIntel ?? {}) as Record<string, unknown>
    const valueToWrite = decision === 'edited' ? editedValue : change.proposedValue
    const now = new Date().toISOString()

    if (change.updateType === 'accumulate') {
      // Add to existing array
      const existing = currentIntel[field] as AccumulatedField<unknown> | undefined
      const currentItems = existing?.items ?? []
      const newItems = Array.isArray(valueToWrite) ? valueToWrite : [valueToWrite]
      currentIntel[field] = {
        items: [...currentItems, ...newItems.map((item: unknown) => ({
          ...(typeof item === 'object' && item !== null ? item : { value: item }),
          _addedAt: now,
          _sourceCallId: call.id,
        }))],
        updatedAt: now,
      }
    } else {
      // Overwrite single value
      currentIntel[field] = {
        value: valueToWrite,
        updatedAt: now,
        sourceCallId: call.id,
        confidence: change.confidence,
      } satisfies FieldValue<unknown>
    }

    // Write dealIntel + update queryable fields
    const updateData: Record<string, unknown> = {
      dealIntel: currentIntel as Prisma.InputJsonValue,
    }

    // Sync queryable columns from dealIntel
    if (field === 'sellerMotivationLevel' && typeof valueToWrite === 'number') {
      updateData.sellerMotivationLevel = valueToWrite
    }
    if (field === 'sellerTimelineUrgency' && typeof valueToWrite === 'string') {
      updateData.timelineUrgency = valueToWrite
    }
    if (field === 'decisionMakersConfirmed' && typeof valueToWrite === 'boolean') {
      updateData.decisionMakersConfirmed = valueToWrite
    }
    if (field === 'competingOffers' && Array.isArray(valueToWrite)) {
      updateData.competingOfferCount = valueToWrite.length
    }
    if (field === 'dealHealthScore' && typeof valueToWrite === 'number') {
      updateData.dealHealthScore = valueToWrite
    }

    await db.property.update({
      where: { id: call.propertyId },
      data: updateData,
    })
  }

  // Log for AI learning
  await db.auditLog.create({
    data: {
      tenantId: session.tenantId,
      userId: session.userId,
      action: 'deal_intel.decision',
      resource: 'call',
      resourceId: call.id,
      source: 'USER',
      severity: 'INFO',
      payload: {
        field,
        decision,
        proposedValue: change.proposedValue,
        editedValue: decision === 'edited' ? editedValue : undefined,
        confidence: change.confidence,
        propertyId: call.propertyId,
      } as Prisma.InputJsonValue,
    },
  })

  return NextResponse.json({ success: true })
}
