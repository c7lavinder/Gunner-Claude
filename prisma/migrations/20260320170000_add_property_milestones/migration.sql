-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "milestone_type" AS ENUM ('LEAD', 'APPOINTMENT_SET', 'OFFER_MADE', 'UNDER_CONTRACT', 'CLOSED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "property_milestones" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tenant_id" TEXT NOT NULL,
    "property_id" TEXT NOT NULL,
    "type" "milestone_type" NOT NULL,
    "logged_by_id" TEXT,
    "source" TEXT NOT NULL DEFAULT 'MANUAL',
    "notes" TEXT,
    CONSTRAINT "property_milestones_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "property_milestones" ADD CONSTRAINT "property_milestones_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "property_milestones" ADD CONSTRAINT "property_milestones_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "property_milestones" ADD CONSTRAINT "property_milestones_logged_by_id_fkey" FOREIGN KEY ("logged_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
