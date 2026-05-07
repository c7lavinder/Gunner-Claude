// app/api/properties/[propertyId]/photos/[photoId]/route.ts
// PATCH  — toggle the cover-photo star. Only one starred photo per property
//          at a time; setting one starred unstars the rest in the same tx.
// DELETE — remove a photo from storage + DB. Best-effort: storage failures
//          don't block the DB delete (orphaned blob is acceptable).

import { NextResponse } from 'next/server'
import { withTenant } from '@/lib/api/withTenant'
import { db } from '@/lib/db/client'
import { hasPermission } from '@/types/roles'
import type { UserRole } from '@/types/roles'
import { forbiddenResponse } from '@/lib/auth/session'
import { deletePhoto } from '@/lib/storage/property-assets'
import { z } from 'zod'

const patchSchema = z.object({
  isStarred: z.boolean(),
})

export const PATCH = withTenant<{ propertyId: string; photoId: string }>(async (req, ctx, params) => {
  if (!hasPermission(ctx.userRole as UserRole, 'properties.edit')) return forbiddenResponse()

  const body = await req.json()
  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'Invalid input' }, { status: 400 })

  const photo = await db.propertyPhoto.findFirst({
    where: { id: params.photoId, propertyId: params.propertyId, tenantId: ctx.tenantId },
    select: { id: true },
  })
  if (!photo) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if (parsed.data.isStarred) {
    // Unstar everything else for this property, then star the target —
    // single transaction so concurrent stars don't end up with two coverages.
    await db.$transaction([
      db.propertyPhoto.updateMany({
        where: { propertyId: params.propertyId, tenantId: ctx.tenantId, isStarred: true },
        data: { isStarred: false },
      }),
      db.propertyPhoto.update({
        where: { id: photo.id },
        data: { isStarred: true },
      }),
    ])
  } else {
    await db.propertyPhoto.update({
      where: { id: photo.id },
      data: { isStarred: false },
    })
  }

  return NextResponse.json({ ok: true })
})

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
