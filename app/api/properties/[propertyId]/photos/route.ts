// app/api/properties/[propertyId]/photos/route.ts
// POST — multi-file photo upload (max 25MB each).
// GET  — list photos for this property, with signed URLs (1hr TTL).
//
// HEIC handling: iPhone HEIC files arrive raw and get converted to JPEG
// here on the server using heic-convert (libheif via wasm — no native
// deps, works on Railway). Client never sees raw HEIC.
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

// HEIC conversion is CPU-bound; Node runtime + bumped timeout. heic-convert
// uses libheif via wasm so Edge runtime is out.
export const runtime = 'nodejs'
export const maxDuration = 60

const MAX_PHOTO_BYTES = 25 * 1024 * 1024 // 25MB
// HEIC is allowed at the wire level; we convert it to JPEG before storage.
const ALLOWED_PHOTO_MIMES = new Set([
  'image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif',
  'image/heic', 'image/heif',
])

function isHeic(file: File) {
  const t = file.type.toLowerCase()
  if (t === 'image/heic' || t === 'image/heif') return true
  return /\.(heic|heif)$/i.test(file.name)
}

async function convertHeicToJpeg(input: Buffer): Promise<Buffer> {
  // Returns Uint8Array; coerce to Buffer for Supabase upload.
  const convert = (await import('heic-convert')).default
  const out = await convert({ buffer: input, format: 'JPEG', quality: 0.9 })
  // Buffer.from(Uint8Array) returns Buffer<ArrayBuffer>; explicit cast keeps
  // the narrow type that downstream Supabase upload expects.
  return Buffer.from(out.buffer as ArrayBuffer, out.byteOffset, out.byteLength)
}

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
    try {
      if (file.size > MAX_PHOTO_BYTES) {
        created.push({ filename: file.name, error: 'File too large (max 25MB)' })
        continue
      }

      // Treat unknown mime as a candidate if the extension says HEIC — Safari
      // sometimes sends '' for HEIC depending on platform.
      const incomingType = file.type.toLowerCase()
      const heic = isHeic(file)
      if (!heic && !ALLOWED_PHOTO_MIMES.has(incomingType)) {
        created.push({ filename: file.name, error: `Unsupported image type (${incomingType || 'unknown'})` })
        continue
      }

      let buffer: Buffer = Buffer.from(await file.arrayBuffer()) as Buffer
      let storedFilename = file.name
      let storedMime = incomingType || 'image/jpeg'

      // Convert HEIC → JPEG before storage. Browsers don't render HEIC and
      // Claude vision rejects it, so we always normalize.
      if (heic) {
        try {
          buffer = await convertHeicToJpeg(buffer)
          storedFilename = file.name.replace(/\.(heic|heif)$/i, '.jpg')
          storedMime = 'image/jpeg'
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'HEIC conversion failed'
          console.error('[photos] HEIC convert failed:', file.name, msg)
          created.push({ filename: file.name, error: `HEIC conversion failed: ${msg}` })
          continue
        }
      }

      const upload = await uploadPropertyPhoto({
        tenantId: ctx.tenantId,
        propertyId: params.propertyId,
        filename: storedFilename,
        buffer,
        mimeType: storedMime,
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
          filename: storedFilename,
          mimeType: storedMime,
          size: buffer.length,
        },
        select: { id: true },
      })

      // Fire-and-forget classification — do not await. The UI polls GET to
      // pick up the eventual category. Failures land the photo in 'other'.
      classifyPhoto({ storagePath: upload.path, mimeType: storedMime })
        .then(r => db.propertyPhoto.update({
          where: { id: photo.id },
          data: { category: r.category, classificationStatus: r.status },
        }).catch(err => console.error('[photos] classify update failed:', err)))
        .catch(err => console.error('[photos] classify failed:', err))

      created.push({ id: photo.id, filename: file.name })
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'unknown error'
      console.error('[photos] upload failed for', file.name, msg)
      created.push({ filename: file.name, error: msg })
    }
  }

  return NextResponse.json({ created })
})

export const GET = withTenant<{ propertyId: string }>(async (_req, ctx, params) => {
  if (!hasPermission(ctx.userRole as UserRole, 'properties.view.assigned')) return forbiddenResponse()

  const photos = await db.propertyPhoto.findMany({
    where: { propertyId: params.propertyId, tenantId: ctx.tenantId },
    // Starred photo (cover) always first, then by sortOrder/createdAt.
    orderBy: [{ isStarred: 'desc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }],
    select: {
      id: true, filename: true, mimeType: true, size: true,
      category: true, classificationStatus: true,
      storagePath: true, createdAt: true, isStarred: true,
    },
  })

  const withUrls = await Promise.all(photos.map(async p => ({
    id: p.id,
    filename: p.filename,
    mimeType: p.mimeType,
    size: p.size,
    category: p.category,
    classificationStatus: p.classificationStatus,
    isStarred: p.isStarred,
    createdAt: p.createdAt.toISOString(),
    url: await getSignedPhotoUrl(p.storagePath),
  })))

  return NextResponse.json({ photos: withUrls })
})
