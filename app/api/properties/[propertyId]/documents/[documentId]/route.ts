// app/api/properties/[propertyId]/documents/[documentId]/route.ts
// DELETE — remove a document from storage + DB.

import { NextResponse } from 'next/server'
import { withTenant } from '@/lib/api/withTenant'
import { db } from '@/lib/db/client'
import { hasPermission } from '@/types/roles'
import type { UserRole } from '@/types/roles'
import { forbiddenResponse } from '@/lib/auth/session'
import { deleteDocument } from '@/lib/storage/property-assets'

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
