// lib/ai/embeddings-query.ts
// Tiny helper used by query-tools.ts so we can ask "embed this query" without
// pulling the full embeddings.ts machinery (which also exports backfill/embed
// functions that load db models and would bloat every importer of query-tools).
//
// Kept identical to the implementation in lib/ai/embeddings.ts. Both share
// the same OpenAI text-embedding-3-small / 1536-dim contract.

const EMBEDDING_MODEL = 'text-embedding-3-small'
const EMBEDDING_DIMS = 1536

export async function generateQueryEmbedding(query: string): Promise<number[] | null> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) return null

  try {
    const res = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: EMBEDDING_MODEL,
        input: query.slice(0, 4000),
        dimensions: EMBEDDING_DIMS,
      }),
    })
    if (!res.ok) {
      console.error(`[Embeddings] OpenAI error ${res.status}`)
      return null
    }
    const data = await res.json() as { data: Array<{ embedding: number[] }> }
    return data.data?.[0]?.embedding ?? null
  } catch (err) {
    console.error('[Embeddings] generateQueryEmbedding failed:', err instanceof Error ? err.message : err)
    return null
  }
}
