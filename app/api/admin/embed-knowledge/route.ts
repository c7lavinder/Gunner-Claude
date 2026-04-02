// POST /api/admin/embed-knowledge
// Generate vector embeddings for all knowledge documents (requires OPENAI_API_KEY)
import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { db } from '@/lib/db/client'
import { embedAllDocuments, isEmbeddingsEnabled } from '@/lib/ai/embeddings'

export async function POST() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const user = await db.user.findUnique({ where: { id: session.userId }, select: { role: true } })
  if (!user || !['OWNER', 'ADMIN'].includes(user.role)) {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 })
  }

  if (!isEmbeddingsEnabled()) {
    return NextResponse.json({
      error: 'OPENAI_API_KEY not configured. Set this env var to enable semantic search.',
    }, { status: 400 })
  }

  const result = await embedAllDocuments(session.tenantId)

  return NextResponse.json({
    status: 'success',
    ...result,
  })
}
