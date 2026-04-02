-- CreateTable
CREATE TABLE IF NOT EXISTS "property_team_members" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "property_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'manual',

    CONSTRAINT "property_team_members_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "property_team_members_property_id_user_id_key" ON "property_team_members"("property_id", "user_id");

-- AddForeignKey (only if not exists)
DO $$ BEGIN
  ALTER TABLE "property_team_members" ADD CONSTRAINT "property_team_members_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "property_team_members" ADD CONSTRAINT "property_team_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "property_team_members" ADD CONSTRAINT "property_team_members_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Migrate existing assignedToId data into PropertyTeamMember table
INSERT INTO "property_team_members" ("id", "property_id", "user_id", "tenant_id", "role", "source")
SELECT
  gen_random_uuid()::text,
  p."id",
  p."assigned_to_id",
  p."tenant_id",
  u."role"::text,
  'migration'
FROM "properties" p
JOIN "users" u ON p."assigned_to_id" = u."id"
WHERE p."assigned_to_id" IS NOT NULL
ON CONFLICT ("property_id", "user_id") DO NOTHING;
