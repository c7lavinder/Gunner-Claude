// GET + POST + PATCH + DELETE /api/admin/knowledge
// CRUD for knowledge documents
import { NextResponse } from 'next/server'
import { withTenant } from '@/lib/api/withTenant'
import { db } from '@/lib/db/client'

export const GET = withTenant(async (_req, ctx) => {
  const documents = await db.knowledgeDocument.findMany({
    where: { tenantId: ctx.tenantId },
    select: { id: true, title: true, type: true, callType: true, role: true, source: true, isActive: true, updatedAt: true },
    orderBy: [{ type: 'asc' }, { title: 'asc' }],
  })

  return NextResponse.json({ documents })
})

export const POST = withTenant(async (request, ctx) => {
  // SIMPLIFY: removed redundant db.user.findUnique role lookup — ctx.userRole is canonical
  if (!['OWNER', 'ADMIN'].includes(ctx.userRole)) {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 })
  }

  const { title, type, callType, role, content } = await request.json()
  if (!title || !type || !content) {
    return NextResponse.json({ error: 'title, type, and content required' }, { status: 400 })
  }

  const document = await db.knowledgeDocument.create({
    data: {
      tenantId: ctx.tenantId,
      title, type, callType: callType || null, role: role || 'ALL',
      content, source: 'upload', isActive: true,
    },
    select: { id: true, title: true, type: true, callType: true, role: true, source: true, isActive: true, updatedAt: true },
  })

  // Auto-embed the new document (non-blocking)
  import('@/lib/ai/embeddings').then(({ embedDocument, isEmbeddingsEnabled }) => {
    if (isEmbeddingsEnabled()) embedDocument(document.id).catch(() => {})
  }).catch(() => {})

  return NextResponse.json({ document })
})

export const PATCH = withTenant(async (request, ctx) => {
  const { id, isActive, title, content } = await request.json()
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  await db.knowledgeDocument.updateMany({
    where: { id, tenantId: ctx.tenantId },
    data: {
      ...(isActive !== undefined ? { isActive } : {}),
      ...(title ? { title } : {}),
      ...(content ? { content } : {}),
    },
  })

  // Re-embed if content changed (non-blocking)
  if (content) {
    import('@/lib/ai/embeddings').then(({ embedDocument, isEmbeddingsEnabled }) => {
      if (isEmbeddingsEnabled()) embedDocument(id).catch(() => {})
    }).catch(() => {})
  }

  return NextResponse.json({ status: 'success' })
})

export const DELETE = withTenant(async (request, ctx) => {
  const { id } = await request.json()
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  await db.knowledgeDocument.deleteMany({
    where: { id, tenantId: ctx.tenantId, source: { not: 'playbook' } },
  })

  return NextResponse.json({ status: 'success' })
})
