// lib/ai/embeddings.ts
// Generate and search vector embeddings for knowledge documents
// Uses OpenAI text-embedding-3-small (1536 dims) via direct fetch — no SDK needed
// Falls back gracefully if OPENAI_API_KEY is not set
//
// WRITES TO: knowledge_documents.embedding (vector(1536))
// READ BY: context-builder.ts → semantic knowledge search

import { db } from '@/lib/db/client'

const EMBEDDING_MODEL = 'text-embedding-3-small'
const EMBEDDING_DIMS = 1536

// ── Generate embedding for text ──

async function generateEmbedding(text: string): Promise<number[] | null> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) return null

  try {
    const res = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: EMBEDDING_MODEL,
        input: text.slice(0, 8000), // Cap input to avoid token limits
        dimensions: EMBEDDING_DIMS,
      }),
    })

    if (!res.ok) {
      console.error(`[Embeddings] OpenAI API error: ${res.status}`)
      return null
    }

    const data = await res.json() as { data: Array<{ embedding: number[] }> }
    return data.data?.[0]?.embedding ?? null
  } catch (err) {
    console.error('[Embeddings] Failed to generate:', err instanceof Error ? err.message : err)
    return null
  }
}

// ── Embed a single knowledge document ──

export async function embedDocument(documentId: string): Promise<boolean> {
  const doc = await db.knowledgeDocument.findUnique({
    where: { id: documentId },
    select: { title: true, type: true, callType: true, role: true, content: true },
  })
  if (!doc) return false

  // Build embedding text: title + metadata + content excerpt
  const text = [
    doc.title,
    doc.type ? `Type: ${doc.type}` : '',
    doc.callType ? `Call type: ${doc.callType}` : '',
    doc.role ? `Role: ${doc.role}` : '',
    doc.content.slice(0, 6000),
  ].filter(Boolean).join('\n')

  const embedding = await generateEmbedding(text)
  if (!embedding) return false

  // Store embedding via raw SQL (Prisma doesn't support vector type)
  const vectorStr = `[${embedding.join(',')}]`
  await db.$executeRawUnsafe(
    `UPDATE knowledge_documents SET embedding = $1::vector WHERE id = $2`,
    vectorStr,
    documentId,
  )

  return true
}

// ── Embed all documents for a tenant ──

export async function embedAllDocuments(tenantId: string): Promise<{ embedded: number; skipped: number; errors: number }> {
  const docs = await db.knowledgeDocument.findMany({
    where: { tenantId, isActive: true },
    select: { id: true },
  })

  const results = { embedded: 0, skipped: 0, errors: 0 }

  for (const doc of docs) {
    try {
      // Check if already embedded
      const hasEmbedding = await db.$queryRawUnsafe<Array<{ has_embedding: boolean }>>(
        `SELECT (embedding IS NOT NULL) as has_embedding FROM knowledge_documents WHERE id = $1`,
        doc.id,
      )
      if (hasEmbedding[0]?.has_embedding) {
        results.skipped++
        continue
      }

      const success = await embedDocument(doc.id)
      if (success) results.embedded++
      else results.skipped++ // No API key or generation failed
    } catch {
      results.errors++
    }
  }

  return results
}

// ── Semantic search: find relevant documents by query ──

export async function searchKnowledgeBySimilarity(
  tenantId: string,
  query: string,
  limit = 5,
): Promise<Array<{ id: string; title: string; type: string; callType: string | null; role: string | null; content: string; similarity: number }>> {
  const queryEmbedding = await generateEmbedding(query)
  if (!queryEmbedding) return [] // No API key — caller falls back to exact matching

  const vectorStr = `[${queryEmbedding.join(',')}]`

  const results = await db.$queryRawUnsafe<Array<{
    id: string; title: string; type: string; call_type: string | null; role: string | null; content: string; similarity: number
  }>>(
    `SELECT id, title, type, call_type, role, content,
            1 - (embedding <=> $1::vector) as similarity
     FROM knowledge_documents
     WHERE tenant_id = $2
       AND is_active = true
       AND embedding IS NOT NULL
     ORDER BY embedding <=> $1::vector
     LIMIT $3`,
    vectorStr,
    tenantId,
    limit,
  )

  return results.map(r => ({
    id: r.id,
    title: r.title,
    type: r.type,
    callType: r.call_type,
    role: r.role,
    content: r.content,
    similarity: Number(r.similarity),
  }))
}

// ── Check if embeddings are available ──

export function isEmbeddingsEnabled(): boolean {
  return !!process.env.OPENAI_API_KEY
}
