-- Append-only log of human reclassifications (call type / outcome).
-- Feeds a future training loop so the AI can learn from corrections.

CREATE TABLE "call_reclassifications" (
  "id"                    TEXT PRIMARY KEY,
  "created_at"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "tenant_id"             TEXT NOT NULL,
  "call_id"               TEXT NOT NULL,
  "user_id"               TEXT,
  "previous_call_type"    TEXT,
  "new_call_type"         TEXT,
  "previous_call_outcome" TEXT,
  "new_call_outcome"      TEXT,
  "previous_ai_summary"   TEXT,

  CONSTRAINT "call_reclassifications_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE,
  CONSTRAINT "call_reclassifications_call_id_fkey"
    FOREIGN KEY ("call_id") REFERENCES "calls"("id") ON DELETE CASCADE,
  CONSTRAINT "call_reclassifications_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL
);

CREATE INDEX "call_reclassifications_tenant_id_created_at_idx"
  ON "call_reclassifications"("tenant_id", "created_at");
CREATE INDEX "call_reclassifications_call_id_idx"
  ON "call_reclassifications"("call_id");
