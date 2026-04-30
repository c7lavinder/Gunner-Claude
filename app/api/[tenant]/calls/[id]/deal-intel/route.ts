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
    select: { id: true, dealIntelHistory: true, propertyId: true, sellerId: true },
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

  // If approved or edited, dispatch to the proposal's target.
  // v1.1 Wave 4 — proposals can target 'property' (default — writes to
  // Property.dealIntel JSON blob) or 'seller' (writes to a typed Seller
  // column on the call's linked Seller row). Existing rows pre-Wave 4
  // have no `target` field; default behavior is unchanged for them.
  if (decision === 'approved' || decision === 'edited') {
    const valueToWrite = decision === 'edited' ? editedValue : change.proposedValue
    const target = change.target ?? 'property'

    if (target === 'seller') {
      if (!call.sellerId) {
        return NextResponse.json(
          { error: 'Cannot apply seller-targeted proposal: call has no linked seller' },
          { status: 400 },
        )
      }
      // Defense-in-depth: verify the Seller belongs to this tenant before
      // writing. Foreign-key trust isn't enough — if a corrupted call.sellerId
      // ever pointed cross-tenant, we'd leak a write here without this check.
      const seller = await db.seller.findFirst({
        where: { id: call.sellerId, tenantId: ctx.tenantId },
        select: { id: true, fieldSources: true },
      })
      if (!seller) {
        return NextResponse.json({ error: 'Seller not found in tenant' }, { status: 404 })
      }

      // Track provenance — match wave_2_backfill convention.
      const fieldSources: Record<string, string> = {
        ...((seller.fieldSources as Record<string, string>) ?? {}),
      }
      fieldSources[field] = decision === 'edited' ? 'user' : 'ai'

      try {
        await db.seller.update({
          where: { id: call.sellerId, tenantId: ctx.tenantId },
          data: {
            [field]: valueToWrite,
            fieldSources,
          } as Prisma.SellerUpdateInput,
        })
      } catch (err) {
        return NextResponse.json(
          {
            error: 'Failed to write seller-targeted proposal',
            field,
            detail: err instanceof Error ? err.message : 'unknown',
            suggestion: 'Verify the field name matches a Seller column.',
          },
          { status: 500 },
        )
      }
    } else if (call.propertyId) {
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
      const now = new Date().toISOString()

      if (change.updateType === 'accumulate') {
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
        currentIntel[field] = {
          value: valueToWrite,
          updatedAt: now,
          sourceCallId: call.id,
          confidence: change.confidence,
        } satisfies FieldValue<unknown>
      }

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

      // Q5 mirror-write — Property's in_* legal flags. The Seller side
      // (is_*) lands as a separate proposal with target='seller'; this
      // branch handles the Property-side typed column write. The dealIntel
      // JSON blob still gets the value (so existing UI rendering paths
      // still see it), AND the typed column gets written so inventory
      // filters keep working.
      const PROP_LEGAL_FLAG_FIELDS = new Set(['inProbate', 'inDivorce', 'inBankruptcy', 'hasRecentEviction'])
      if (PROP_LEGAL_FLAG_FIELDS.has(field) && typeof valueToWrite === 'boolean') {
        updateData[field] = valueToWrite
      }

      await db.property.update({
        where: { id: call.propertyId, tenantId: ctx.tenantId },
        data: updateData,
      })
    }
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
