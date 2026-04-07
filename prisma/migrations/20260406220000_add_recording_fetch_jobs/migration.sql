-- CreateTable
CREATE TABLE "recording_fetch_jobs" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "call_id" TEXT NOT NULL,
    "ghl_message_id" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "next_attempt_at" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "last_error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "recording_fetch_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "recording_fetch_jobs_call_id_key" ON "recording_fetch_jobs"("call_id");

-- CreateIndex
CREATE INDEX "recording_fetch_jobs_status_next_attempt_at_idx" ON "recording_fetch_jobs"("status", "next_attempt_at");

-- AddForeignKey
ALTER TABLE "recording_fetch_jobs" ADD CONSTRAINT "recording_fetch_jobs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recording_fetch_jobs" ADD CONSTRAINT "recording_fetch_jobs_call_id_fkey" FOREIGN KEY ("call_id") REFERENCES "calls"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
