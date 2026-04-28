// POST /api/admin/embed-knowledge
// Generate vector embeddings for all knowledge documents (requires OPENAI_API_KEY)
import { NextResponse } from 'next/server'
import { withTenant } from '@/lib/api/withTenant'
import { embedAllDocuments, isEmbeddingsEnabled } from '@/lib/ai/embeddings'

export const POST = withTenant(async (_req, ctx) => {
  // ctx.userRole is set by withTenant — no need for a follow-up user lookup
  if (!['OWNER', 'ADMIN'].includes(ctx.userRole)) {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 })
  }

  if (!isEmbeddingsEnabled()) {
    return NextResponse.json({
      error: 'OPENAI_API_KEY not configured. Set this env var to enable semantic search.',
    }, { status: 400 })
  }

  const result = await embedAllDocuments(ctx.tenantId)

  return NextResponse.json({
    status: 'success',
    ...result,
  })
})
