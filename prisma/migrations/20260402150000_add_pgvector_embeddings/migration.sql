-- pgvector embeddings for semantic knowledge search
-- Supabase auto-enables pgvector, but explicit for clarity
CREATE EXTENSION IF NOT EXISTS vector;

-- Add embedding column to knowledge_documents (1536 dims = text-embedding-3-small)
ALTER TABLE "knowledge_documents" ADD COLUMN IF NOT EXISTS "embedding" vector(1536);

-- HNSW index for fast cosine similarity search
CREATE INDEX IF NOT EXISTS "idx_knowledge_embedding_hnsw"
  ON "knowledge_documents"
  USING hnsw (embedding vector_cosine_ops);
