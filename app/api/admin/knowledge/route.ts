// GET + POST + PATCH + DELETE /api/admin/knowledge
// CRUD for knowledge documents
import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { db } from '@/lib/db/client'

export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const documents = await db.knowledgeDocument.findMany({
    where: { tenantId: session.tenantId },
    select: { id: true, title: true, type: true, callType: true, role: true, source: true, isActive: true, updatedAt: true },
    orderBy: [{ type: 'asc' }, { title: 'asc' }],
  })

  return NextResponse.json({ documents })
}

export async function POST(request: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const user = await db.user.findUnique({ where: { id: session.userId }, select: { role: true } })
  if (!user || !['OWNER', 'ADMIN'].includes(user.role)) {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 })
  }

  const { title, type, callType, role, content } = await request.json()
  if (!title || !type || !content) {
    return NextResponse.json({ error: 'title, type, and content required' }, { status: 400 })
  }

  const document = await db.knowledgeDocument.create({
    data: {
      tenantId: session.tenantId,
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
}

export async function PATCH(request: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id, isActive, title, content } = await request.json()
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  await db.knowledgeDocument.updateMany({
    where: { id, tenantId: session.tenantId },
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
}

export async function DELETE(request: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await request.json()
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  await db.knowledgeDocument.deleteMany({
    where: { id, tenantId: session.tenantId, source: { not: 'playbook' } },
  })

  return NextResponse.json({ status: 'success' })
}
