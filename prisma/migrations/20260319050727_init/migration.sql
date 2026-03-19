-- CreateEnum
CREATE TYPE "user_role" AS ENUM ('OWNER', 'ADMIN', 'TEAM_LEAD', 'LEAD_MANAGER', 'ACQUISITION_MANAGER', 'DISPOSITION_MANAGER');

-- CreateEnum
CREATE TYPE "property_status" AS ENUM ('NEW_LEAD', 'CONTACTED', 'APPOINTMENT_SET', 'APPOINTMENT_COMPLETED', 'OFFER_MADE', 'UNDER_CONTRACT', 'IN_DISPOSITION', 'SOLD', 'DEAD');

-- CreateEnum
CREATE TYPE "call_direction" AS ENUM ('INBOUND', 'OUTBOUND');

-- CreateEnum
CREATE TYPE "grading_status" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "task_status" AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "task_priority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'URGENT');

-- CreateEnum
CREATE TYPE "snapshot_period" AS ENUM ('DAILY', 'WEEKLY', 'MONTHLY');

-- CreateEnum
CREATE TYPE "audit_source" AS ENUM ('USER', 'SYSTEM', 'GHL_WEBHOOK', 'AUDIT_AGENT', 'SCHEDULER');

-- CreateEnum
CREATE TYPE "audit_severity" AS ENUM ('INFO', 'WARNING', 'ERROR', 'CRITICAL');

-- CreateTable
CREATE TABLE "tenants" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "logo_url" TEXT,
    "ghl_location_id" TEXT,
    "ghl_access_token" TEXT,
    "ghl_refresh_token" TEXT,
    "ghl_token_expiry" TIMESTAMP(3),
    "ghl_webhook_id" TEXT,
    "property_pipeline_id" TEXT,
    "property_trigger_stage" TEXT,
    "onboarding_step" INTEGER NOT NULL DEFAULT 0,
    "onboarding_completed" BOOLEAN NOT NULL DEFAULT false,
    "call_types" JSONB NOT NULL DEFAULT '[]',
    "call_results" JSONB NOT NULL DEFAULT '[]',
    "config" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "tenants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "hashed_password" TEXT,
    "email_verified" TIMESTAMP(3),
    "name" TEXT NOT NULL,
    "avatar_url" TEXT,
    "phone" TEXT,
    "role" "user_role" NOT NULL,
    "reports_to" TEXT,
    "kpi_config" JSONB NOT NULL DEFAULT '{}',
    "card_config" JSONB NOT NULL DEFAULT '{}',
    "task_sort_config" JSONB NOT NULL DEFAULT '{}',
    "dashboard_config" JSONB NOT NULL DEFAULT '{}',
    "ghl_user_id" TEXT,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "properties" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "assigned_to_id" TEXT,
    "address" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "zip" TEXT NOT NULL,
    "arv" DECIMAL(12,2),
    "asking_price" DECIMAL(12,2),
    "mao" DECIMAL(12,2),
    "contract_price" DECIMAL(12,2),
    "assignment_fee" DECIMAL(12,2),
    "status" "property_status" NOT NULL DEFAULT 'NEW_LEAD',
    "ghl_contact_id" TEXT,
    "ghl_pipeline_id" TEXT,
    "ghl_pipeline_stage" TEXT,
    "zillow_data" JSONB,
    "county_data" JSONB,
    "construction_estimate" DECIMAL(12,2),
    "custom_fields" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "properties_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sellers" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tenant_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "ghl_contact_id" TEXT,

    CONSTRAINT "sellers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "property_sellers" (
    "property_id" TEXT NOT NULL,
    "seller_id" TEXT NOT NULL,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "property_sellers_pkey" PRIMARY KEY ("property_id","seller_id")
);

-- CreateTable
CREATE TABLE "calls" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tenant_id" TEXT NOT NULL,
    "assigned_to_id" TEXT,
    "property_id" TEXT,
    "ghl_call_id" TEXT,
    "recording_url" TEXT,
    "transcript" TEXT,
    "call_type" TEXT,
    "call_result" TEXT,
    "direction" "call_direction" NOT NULL DEFAULT 'OUTBOUND',
    "duration_seconds" INTEGER,
    "called_at" TIMESTAMP(3),
    "grading_status" "grading_status" NOT NULL DEFAULT 'PENDING',
    "score" DOUBLE PRECISION,
    "rubric_scores" JSONB,
    "ai_summary" TEXT,
    "ai_feedback" TEXT,
    "ai_coaching_tips" JSONB,
    "graded_at" TIMESTAMP(3),

    CONSTRAINT "calls_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "call_rubrics" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "role" "user_role" NOT NULL,
    "call_type" TEXT,
    "name" TEXT NOT NULL,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "criteria" JSONB NOT NULL,

    CONSTRAINT "call_rubrics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tasks" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "assigned_to_id" TEXT,
    "property_id" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT,
    "status" "task_status" NOT NULL DEFAULT 'PENDING',
    "priority" "task_priority" NOT NULL DEFAULT 'MEDIUM',
    "due_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "ghl_task_id" TEXT,

    CONSTRAINT "tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kpi_snapshots" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tenant_id" TEXT NOT NULL,
    "user_id" TEXT,
    "snapshot_date" DATE NOT NULL,
    "period" "snapshot_period" NOT NULL DEFAULT 'DAILY',
    "metrics" JSONB NOT NULL,

    CONSTRAINT "kpi_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_configs" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "role" "user_role" NOT NULL,
    "default_kpis" JSONB NOT NULL,
    "allowed_kpis" JSONB NOT NULL,
    "permissions" JSONB NOT NULL,
    "task_categories" JSONB NOT NULL,

    CONSTRAINT "role_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tenant_id" TEXT,
    "user_id" TEXT,
    "action" TEXT NOT NULL,
    "resource" TEXT,
    "resource_id" TEXT,
    "payload" JSONB,
    "source" "audit_source" NOT NULL DEFAULT 'USER',
    "severity" "audit_severity",
    "resolved" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tenants_slug_key" ON "tenants"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "tenants_ghl_location_id_key" ON "tenants"("ghl_location_id");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "calls_ghl_call_id_key" ON "calls"("ghl_call_id");

-- CreateIndex
CREATE UNIQUE INDEX "tasks_ghl_task_id_key" ON "tasks"("ghl_task_id");

-- CreateIndex
CREATE UNIQUE INDEX "kpi_snapshots_tenant_id_user_id_snapshot_date_period_key" ON "kpi_snapshots"("tenant_id", "user_id", "snapshot_date", "period");

-- CreateIndex
CREATE UNIQUE INDEX "role_configs_tenant_id_role_key" ON "role_configs"("tenant_id", "role");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_reports_to_fkey" FOREIGN KEY ("reports_to") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "properties" ADD CONSTRAINT "properties_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "properties" ADD CONSTRAINT "properties_assigned_to_id_fkey" FOREIGN KEY ("assigned_to_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sellers" ADD CONSTRAINT "sellers_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "property_sellers" ADD CONSTRAINT "property_sellers_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "property_sellers" ADD CONSTRAINT "property_sellers_seller_id_fkey" FOREIGN KEY ("seller_id") REFERENCES "sellers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calls" ADD CONSTRAINT "calls_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calls" ADD CONSTRAINT "calls_assigned_to_id_fkey" FOREIGN KEY ("assigned_to_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calls" ADD CONSTRAINT "calls_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "call_rubrics" ADD CONSTRAINT "call_rubrics_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_assigned_to_id_fkey" FOREIGN KEY ("assigned_to_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kpi_snapshots" ADD CONSTRAINT "kpi_snapshots_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kpi_snapshots" ADD CONSTRAINT "kpi_snapshots_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_configs" ADD CONSTRAINT "role_configs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
