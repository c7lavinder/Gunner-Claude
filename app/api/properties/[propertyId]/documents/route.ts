// app/api/properties/[propertyId]/documents/route.ts
// POST — multi-file document upload (max 50MB each).
// GET  — list documents with signed URLs (1hr TTL) for download.

import { NextResponse } from 'next/server'
import { withTenant } from '@/lib/api/withTenant'
import { db } from '@/lib/db/client'
import { hasPermission } from '@/types/roles'
import type { UserRole } from '@/types/roles'
import { forbiddenResponse } from '@/lib/auth/session'
import {
  uploadPropertyDocument,
  getSignedDocumentUrl,
} from '@/lib/storage/property-assets'

const MAX_DOC_BYTES = 50 * 1024 * 1024 // 50MB

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
    if (file.size > MAX_DOC_BYTES) {
      created.push({ filename: file.name, error: 'File too large (max 50MB)' })
      continue
    }

    const buffer = Buffer.from(await file.arrayBuffer())
    const upload = await uploadPropertyDocument({
      tenantId: ctx.tenantId,
      propertyId: params.propertyId,
      filename: file.name,
      buffer,
      mimeType: file.type || 'application/octet-stream',
    })
    if (upload.status === 'error') {
      created.push({ filename: file.name, error: upload.error })
      continue
    }

    const doc = await db.propertyDocument.create({
      data: {
        tenantId: ctx.tenantId,
        propertyId: params.propertyId,
        uploadedById: ctx.userId,
        storagePath: upload.path,
        filename: file.name,
        mimeType: file.type || 'application/octet-stream',
        size: file.size,
      },
      select: { id: true },
    })

    created.push({ id: doc.id, filename: file.name })
  }

  return NextResponse.json({ created })
})

export const GET = withTenant<{ propertyId: string }>(async (_req, ctx, params) => {
  if (!hasPermission(ctx.userRole as UserRole, 'properties.view.assigned')) return forbiddenResponse()

  const docs = await db.propertyDocument.findMany({
    where: { propertyId: params.propertyId, tenantId: ctx.tenantId },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true, filename: true, mimeType: true, size: true,
      storagePath: true, createdAt: true,
      uploadedBy: { select: { name: true } },
    },
  })

  const withUrls = await Promise.all(docs.map(async d => ({
    id: d.id,
    filename: d.filename,
    mimeType: d.mimeType,
    size: d.size,
    createdAt: d.createdAt.toISOString(),
    uploadedByName: d.uploadedBy?.name ?? null,
    url: await getSignedDocumentUrl(d.storagePath),
  })))

  return NextResponse.json({ documents: withUrls })
})
