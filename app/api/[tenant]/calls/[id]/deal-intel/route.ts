// app/api/[tenant]/calls/[id]/deal-intel/route.ts
// GET: Returns proposed deal intel changes for this call
// PATCH: Approve, edit, or skip a proposed change

import { NextResponse } from 'next/server'
import { withTenant } from '@/lib/api/withTenant'
import { db } from '@/lib/db/client'
import type { ProposedDealIntelChange, FieldValue, AccumulatedField } from '@/lib/types/deal-intel'
import { Prisma } from '@prisma/client'

export const GET = withTenant<{ tenant: string; id: string }>(async (_req, ctx, params) => {
  const call = await db.call.findFirst({
    where: { id: params.id, tenantId: ctx.tenantId },
    select: { dealIntelHistory: true },
  })
  if (!call) return NextResponse.json({ error: 'Call not found' }, { status: 404 })

  const changes = (call.dealIntelHistory ?? []) as unknown as ProposedDealIntelChange[]
  return NextResponse.json({ changes })
})

export const PATCH = withTenant<{ tenant: string; id: string }>(async (request, ctx, params) => {
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
    where: { id: params.id, tenantId: ctx.tenantId },
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
    decidedBy: ctx.userId,
  }

  // Save updated history to call (re-scope by tenant on update too — was scoped via the
  // findFirst above, but defense-in-depth in case call.id ever gets mass-assigned)
  await db.call.update({
    where: { id: call.id, tenantId: ctx.tenantId },
    data: { dealIntelHistory: changes as unknown as Prisma.InputJsonValue },
  })

  // If approved or edited, write to property dealIntel
  if ((decision === 'approved' || decision === 'edited') && call.propertyId) {
    // FIX (cross-tenant defense): prior code did
    //   db.property.findUnique({ where: { id: call.propertyId } })
    //   db.property.update({ where: { id: call.propertyId } })
    // both unscoped. call.propertyId is a foreign key; if a corrupted/wrong-tenant
    // value ever made it onto a call row, this could leak or overwrite another
    // tenant's property dealIntel. findFirst+tenantId enforces the boundary.
    const property = await db.property.findFirst({
      where: { id: call.propertyId, tenantId: ctx.tenantId },
      select: { dealIntel: true },
    })
    if (!property) {
      return NextResponse.json({ error: 'Property not found in tenant' }, { status: 404 })
    }
    const currentIntel = (property.dealIntel ?? {}) as Record<string, unknown>
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

    // Sync queryable columns from dealIntel (seller fields moved to Seller model)
    if (field === 'competingOffers' && Array.isArray(valueToWrite)) {
      updateData.competingOfferCount = valueToWrite.length
    }
    if (field === 'dealHealthScore' && typeof valueToWrite === 'number') {
      updateData.dealHealthScore = valueToWrite
    }

    await db.property.update({
      where: { id: call.propertyId, tenantId: ctx.tenantId },
      data: updateData,
    })
  }

  // Log for AI learning
  await db.auditLog.create({
    data: {
      tenantId: ctx.tenantId,
      userId: ctx.userId,
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
})
