// scripts/verify-session-82.ts
// One-shot deploy verifier for the Session 82 schema additions.
// Confirms the migration's effects landed on the live DB.

import { db } from '../lib/db/client'

async function main() {
  const tableRows = await db.$queryRawUnsafe<Array<{ table_name: string }>>(
    `SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name='assistant_session_summaries'`
  )
  console.log('assistant_session_summaries table:', tableRows.length === 1 ? 'EXISTS' : 'MISSING')

  const colRows = await db.$queryRawUnsafe<Array<{ column_name: string; data_type: string; udt_name: string }>>(
    `SELECT column_name, data_type, udt_name FROM information_schema.columns WHERE table_name='calls' AND column_name='transcript_embedding'`
  )
  console.log('calls.transcript_embedding column:', colRows.length === 1 ? `EXISTS (udt=${colRows[0].udt_name})` : 'MISSING')

  const idxRows = await db.$queryRawUnsafe<Array<{ indexname: string }>>(
    `SELECT indexname FROM pg_indexes WHERE indexname IN ('idx_calls_transcript_embedding_hnsw','assistant_session_summaries_tenant_id_user_id_session_date_key')`
  )
  console.log('expected indexes present:', idxRows.map(r => r.indexname).join(', ') || 'NONE')

  const extRows = await db.$queryRawUnsafe<Array<{ extname: string }>>(
    `SELECT extname FROM pg_extension WHERE extname='vector'`
  )
  console.log('pgvector extension:', extRows.length === 1 ? 'ACTIVE' : 'MISSING')
}

main()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(() => db.$disconnect())
