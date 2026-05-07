// app/api/properties/[propertyId]/photos/route.ts
// POST — multi-file photo upload (max 25MB each).
// GET  — list photos for this property, with signed URLs (1hr TTL).
//
// Photos are auto-classified into a category by Claude Haiku vision
// fire-and-forget after upload. The UI polls until classificationStatus
// flips from 'pending' to 'done'/'failed'.

import { NextResponse } from 'next/server'
import { withTenant } from '@/lib/api/withTenant'
import { db } from '@/lib/db/client'
import { hasPermission } from '@/types/roles'
import type { UserRole } from '@/types/roles'
import { forbiddenResponse } from '@/lib/auth/session'
import {
  uploadPropertyPhoto,
  getSignedPhotoUrl,
} from '@/lib/storage/property-assets'
import { classifyPhoto } from '@/lib/ai/photo-classifier'

const MAX_PHOTO_BYTES = 25 * 1024 * 1024 // 25MB

const ALLOWED_PHOTO_MIMES = new Set([
  'image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif',
  // HEIC variants — ideally converted client-side to JPEG before upload, but
  // accept them here as a fallback. Vision classification will fail on HEIC
  // and the photo will land in 'other'.
  'image/heic', 'image/heif',
])

export const POST = withTenant<{ propertyId: string }>(async (req, ctx, params) => {
  if (!hasPermission(ctx.userRole as UserRole, 'properties.edit')) return forbiddenResponse()

  const property = await db.property.findUnique({
    where: { id: params.propertyId, tenantId: ctx.tenantId },
    select: { id: true },
  })
  if (!property) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const formData = await req.formData()
  const files = formData.getAll('files').filter((f): f is File => f instanceof File)
  if (files.length === 0) return NextResponse.json({ error: 'No files' }, { status: 400 })

  const created: Array<{ id?: string; filename: string; error?: string }> = []

  for (const file of files) {
    if (file.size > MAX_PHOTO_BYTES) {
      created.push({ filename: file.name, error: 'File too large (max 25MB)' })
      continue
    }
    if (!ALLOWED_PHOTO_MIMES.has(file.type.toLowerCase())) {
      created.push({ filename: file.name, error: 'Unsupported image type' })
      continue
    }

    const buffer = Buffer.from(await file.arrayBuffer())
    const upload = await uploadPropertyPhoto({
      tenantId: ctx.tenantId,
      propertyId: params.propertyId,
      filename: file.name,
      buffer,
      mimeType: file.type,
    })
    if (upload.status === 'error') {
      created.push({ filename: file.name, error: upload.error })
      continue
    }

    const photo = await db.propertyPhoto.create({
      data: {
        tenantId: ctx.tenantId,
        propertyId: params.propertyId,
        uploadedById: ctx.userId,
        storagePath: upload.path,
        filename: file.name,
        mimeType: file.type,
        size: file.size,
      },
      select: { id: true },
    })

    // Fire-and-forget classification — do not await. The UI polls GET to pick
    // up the eventual category. Failures land the photo in 'other'.
    classifyPhoto({ storagePath: upload.path, mimeType: file.type })
      .then(r => db.propertyPhoto.update({
        where: { id: photo.id },
        data: { category: r.category, classificationStatus: r.status },
      }).catch(err => console.error('[photos] classify update failed:', err)))
      .catch(err => console.error('[photos] classify failed:', err))

    created.push({ id: photo.id, filename: file.name })
  }

  return NextResponse.json({ created })
})

export const GET = withTenant<{ propertyId: string }>(async (_req, ctx, params) => {
  if (!hasPermission(ctx.userRole as UserRole, 'properties.view.assigned')) return forbiddenResponse()

  const photos = await db.propertyPhoto.findMany({
    where: { propertyId: params.propertyId, tenantId: ctx.tenantId },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    select: {
      id: true, filename: true, mimeType: true, size: true,
      category: true, classificationStatus: true,
      storagePath: true, createdAt: true,
    },
  })

  const withUrls = await Promise.all(photos.map(async p => ({
    id: p.id,
    filename: p.filename,
    mimeType: p.mimeType,
    size: p.size,
    category: p.category,
    classificationStatus: p.classificationStatus,
    createdAt: p.createdAt.toISOString(),
    url: await getSignedPhotoUrl(p.storagePath),
  })))

  return NextResponse.json({ photos: withUrls })
})
