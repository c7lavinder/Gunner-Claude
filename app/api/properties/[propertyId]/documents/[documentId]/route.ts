// app/api/properties/[propertyId]/documents/[documentId]/route.ts
// PATCH  — rename a document (filename only; storage path stays put).
// DELETE — remove a document from storage + DB.

import { NextResponse } from 'next/server'
import { withTenant } from '@/lib/api/withTenant'
import { db } from '@/lib/db/client'
import { hasPermission } from '@/types/roles'
import type { UserRole } from '@/types/roles'
import { forbiddenResponse } from '@/lib/auth/session'
import { deleteDocument } from '@/lib/storage/property-assets'
import { z } from 'zod'

const patchSchema = z.object({
  filename: z.string().min(1).max(200),
})

export const PATCH = withTenant<{ propertyId: string; documentId: string }>(async (req, ctx, params) => {
  if (!hasPermission(ctx.userRole as UserRole, 'properties.edit')) return forbiddenResponse()

  const body = await req.json()
  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'Invalid input' }, { status: 400 })

  const doc = await db.propertyDocument.findFirst({
    where: { id: params.documentId, propertyId: params.propertyId, tenantId: ctx.tenantId },
    select: { id: true },
  })
  if (!doc) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  await db.propertyDocument.update({
    where: { id: doc.id },
    data: { filename: parsed.data.filename },
  })

  return NextResponse.json({ ok: true })
})

export const DELETE = withTenant<{ propertyId: string; documentId: string }>(async (_req, ctx, params) => {
  if (!hasPermission(ctx.userRole as UserRole, 'properties.edit')) return forbiddenResponse()

  const doc = await db.propertyDocument.findFirst({
    where: { id: params.documentId, propertyId: params.propertyId, tenantId: ctx.tenantId },
    select: { id: true, storagePath: true },
  })
  if (!doc) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  await deleteDocument(doc.storagePath).catch(err => {
    console.error('[documents] storage delete failed (continuing):', err)
  })
  await db.propertyDocument.delete({ where: { id: doc.id } })

  return NextResponse.json({ ok: true })
})
