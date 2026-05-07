// app/api/properties/[propertyId]/photos/[photoId]/route.ts
// DELETE — remove a photo from storage + DB. Best-effort: storage failures
// don't block the DB delete (orphaned blob is acceptable; a periodic cleanup
// job can prune them later if needed).

import { NextResponse } from 'next/server'
import { withTenant } from '@/lib/api/withTenant'
import { db } from '@/lib/db/client'
import { hasPermission } from '@/types/roles'
import type { UserRole } from '@/types/roles'
import { forbiddenResponse } from '@/lib/auth/session'
import { deletePhoto } from '@/lib/storage/property-assets'

export const DELETE = withTenant<{ propertyId: string; photoId: string }>(async (_req, ctx, params) => {
  if (!hasPermission(ctx.userRole as UserRole, 'properties.edit')) return forbiddenResponse()

  const photo = await db.propertyPhoto.findFirst({
    where: { id: params.photoId, propertyId: params.propertyId, tenantId: ctx.tenantId },
    select: { id: true, storagePath: true },
  })
  if (!photo) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  await deletePhoto(photo.storagePath).catch(err => {
    console.error('[photos] storage delete failed (continuing):', err)
  })
  await db.propertyPhoto.delete({ where: { id: photo.id } })

  return NextResponse.json({ ok: true })
})
