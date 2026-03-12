import { sql, eq, and, or, gte, isNull } from "drizzle-orm";
import { db } from "../_core/db";
import { calls, callGrades } from "../../drizzle/schema";
import { gradeCall } from "../services/grading";

/**
 * Idempotent DDL that must exist before the seed and runtime code runs.
 * All statements use IF NOT EXISTS so they're safe to re-execute on every deploy.
 */
export async function runStartupMigrations(): Promise<void> {
  console.log("[migrations] Running startup migrations…");

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "industry_playbooks" (
      "id" serial PRIMARY KEY NOT NULL,
      "code" varchar(100) NOT NULL UNIQUE,
      "name" varchar(255) NOT NULL,
      "description" text,
      "terminology" jsonb,
      "roles" jsonb,
      "stages" jsonb,
      "callTypes" jsonb,
      "rubrics" jsonb,
      "outcomeTypes" jsonb,
      "kpiFunnelStages" jsonb,
      "algorithmDefaults" jsonb,
      "isActive" text DEFAULT 'true',
      "createdAt" timestamp DEFAULT now() NOT NULL,
      "updatedAt" timestamp DEFAULT now() NOT NULL
    )
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "tenant_playbooks" (
      "id" serial PRIMARY KEY NOT NULL,
      "tenantId" integer NOT NULL UNIQUE REFERENCES "tenants"("id"),
      "industryCode" varchar(100),
      "roles" jsonb,
      "stages" jsonb,
      "markets" jsonb,
      "leadSources" jsonb,
      "algorithmOverrides" jsonb,
      "terminology" jsonb,
      "customConfig" jsonb,
      "createdAt" timestamp DEFAULT now() NOT NULL,
      "updatedAt" timestamp DEFAULT now() NOT NULL
    )
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "user_playbooks" (
      "id" serial PRIMARY KEY NOT NULL,
      "userId" integer NOT NULL UNIQUE REFERENCES "users"("id"),
      "tenantId" integer NOT NULL REFERENCES "tenants"("id"),
      "role" varchar(100),
      "strengths" jsonb,
      "growthAreas" jsonb,
      "gradeTrend" varchar(50),
      "communicationStyle" jsonb,
      "instructions" jsonb,
      "voiceConsentGiven" text DEFAULT 'false',
      "voiceSampleCount" integer DEFAULT 0,
      "createdAt" timestamp DEFAULT now() NOT NULL,
      "updatedAt" timestamp DEFAULT now() NOT NULL
    )
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "user_events" (
      "id" serial PRIMARY KEY NOT NULL,
      "tenantId" integer NOT NULL REFERENCES "tenants"("id"),
      "userId" integer NOT NULL REFERENCES "users"("id"),
      "eventType" text NOT NULL,
      "page" text,
      "entityType" text,
      "entityId" text,
      "metadata" jsonb,
      "source" text DEFAULT 'user',
      "suggestionId" integer,
      "createdAt" timestamp DEFAULT now() NOT NULL
    )
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "ai_suggestions" (
      "id" serial PRIMARY KEY NOT NULL,
      "tenantId" integer NOT NULL REFERENCES "tenants"("id"),
      "userId" integer NOT NULL REFERENCES "users"("id"),
      "suggestionType" text NOT NULL,
      "content" text NOT NULL,
      "reasoning" text,
      "confidence" varchar(10),
      "context" jsonb,
      "page" text,
      "status" text DEFAULT 'shown',
      "userReaction" jsonb,
      "timeToReact" integer,
      "outcome" jsonb,
      "outcomeScore" varchar(10),
      "createdAt" timestamp DEFAULT now() NOT NULL,
      "reactedAt" timestamp,
      "outcomeAt" timestamp
    )
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "playbook_insights" (
      "id" serial PRIMARY KEY NOT NULL,
      "playbookLevel" text NOT NULL,
      "tenantId" integer,
      "userId" integer,
      "industryCode" text,
      "insightType" text NOT NULL,
      "category" text,
      "content" jsonb,
      "confidence" varchar(10),
      "dataPoints" integer DEFAULT 0,
      "validUntil" timestamp,
      "createdAt" timestamp DEFAULT now() NOT NULL,
      "updatedAt" timestamp DEFAULT now() NOT NULL
    )
  `);

  // Add new columns to industry_playbooks (safe to re-run)
  await db.execute(sql`
    ALTER TABLE "industry_playbooks"
    ADD COLUMN IF NOT EXISTS "roleplayPersonas" jsonb,
    ADD COLUMN IF NOT EXISTS "trainingCategories" jsonb,
    ADD COLUMN IF NOT EXISTS "gradingPhilosophy" jsonb
  `);

  // Voice sample collection for future AI caller cloning
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "user_voice_samples" (
      "id" serial PRIMARY KEY NOT NULL,
      "tenantId" integer NOT NULL REFERENCES "tenants"("id"),
      "userId" integer NOT NULL REFERENCES "users"("id"),
      "callId" integer NOT NULL,
      "storageKey" text NOT NULL,
      "durationSeconds" varchar(20),
      "quality" text DEFAULT 'good',
      "speakerConfidence" varchar(10),
      "createdAt" timestamp DEFAULT now() NOT NULL
    )
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "user_voice_profiles" (
      "id" serial PRIMARY KEY NOT NULL,
      "tenantId" integer NOT NULL REFERENCES "tenants"("id"),
      "userId" integer NOT NULL REFERENCES "users"("id"),
      "totalSamples" integer DEFAULT 0,
      "totalDurationMinutes" varchar(20) DEFAULT '0',
      "avgPace" varchar(10),
      "consentGiven" boolean DEFAULT false,
      "consentDate" timestamp,
      "readyForCloning" boolean DEFAULT false,
      "metadata" jsonb,
      "updatedAt" timestamp DEFAULT now() NOT NULL
    )
  `);

  // Login lockout columns on users table (safe to re-run)
  await db.execute(sql`
    ALTER TABLE "users"
    ADD COLUMN IF NOT EXISTS "failedLoginAttempts" integer NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS "lockedUntil" timestamp
  `);

  // Sessions table for active login tracking
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "sessions" (
      "id" serial PRIMARY KEY NOT NULL,
      "tenantId" integer REFERENCES "tenants"("id"),
      "userId" integer NOT NULL REFERENCES "users"("id"),
      "tokenHash" text NOT NULL,
      "userAgent" text,
      "ipAddress" text,
      "createdAt" timestamp DEFAULT now() NOT NULL,
      "lastSeenAt" timestamp DEFAULT now() NOT NULL,
      "expiresAt" timestamp NOT NULL,
      "revokedAt" timestamp
    )
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "notifications" (
      "id" serial PRIMARY KEY NOT NULL,
      "tenantId" integer NOT NULL REFERENCES "tenants"("id"),
      "userId" integer NOT NULL REFERENCES "users"("id"),
      "type" text NOT NULL,
      "title" text NOT NULL,
      "body" text,
      "entityType" text,
      "entityId" text,
      "isRead" text DEFAULT 'false',
      "createdAt" timestamp DEFAULT now() NOT NULL
    )
  `);

  // Audit log — immutable record of admin/write actions
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "audit_log" (
      "id" serial PRIMARY KEY NOT NULL,
      "tenantId" integer REFERENCES "tenants"("id"),
      "userId" integer REFERENCES "users"("id"),
      "action" text NOT NULL,
      "entityType" text,
      "entityId" text,
      "before" jsonb,
      "after" jsonb,
      "ipAddress" text,
      "createdAt" timestamp DEFAULT now() NOT NULL
    )
  `);

  // Add isStarred to calls if not present
  await db.execute(sql`ALTER TABLE "calls" ADD COLUMN IF NOT EXISTS "isStarred" text DEFAULT 'false'`);

  // Performance indexes
  await db.execute(sql`CREATE INDEX IF NOT EXISTS "idx_calls_tenant_created" ON "calls" ("tenantId", "createdAt" DESC)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS "idx_calls_tenant_user" ON "calls" ("tenantId", "teamMemberId")`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS "idx_user_events_tenant_user_created" ON "user_events" ("tenantId", "userId", "createdAt" DESC)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS "idx_notifications_tenant_user_read" ON "notifications" ("tenantId", "userId", "isRead")`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS "idx_audit_log_tenant_created" ON "audit_log" ("tenantId", "createdAt" DESC)`);

  // Demo data tables for tenants without a live CRM connection
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "demo_conversations" (
      "id" serial PRIMARY KEY NOT NULL,
      "tenantId" integer NOT NULL REFERENCES "tenants"("id"),
      "contactName" text,
      "contactPhone" text,
      "lastMessageBody" text,
      "lastMessageDate" timestamp,
      "unreadCount" integer DEFAULT 0,
      "messages" jsonb DEFAULT '[]'
    )
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "demo_tasks" (
      "id" serial PRIMARY KEY NOT NULL,
      "tenantId" integer NOT NULL REFERENCES "tenants"("id"),
      "title" text,
      "contactName" text,
      "propertyAddress" text,
      "currentStage" text,
      "assignedTo" text,
      "dueDate" text,
      "overdue" boolean DEFAULT false,
      "instructions" text
    )
  `);

  // Call next steps — AI-suggested and manual post-call actions (snake_case columns)
  // Drop old camelCase version if it exists, then recreate with snake_case
  await db.execute(sql`DROP TABLE IF EXISTS "call_next_steps"`);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "call_next_steps" (
      "id" serial PRIMARY KEY NOT NULL,
      "call_id" integer NOT NULL REFERENCES "calls"("id"),
      "tenant_id" integer REFERENCES "tenants"("id"),
      "action_type" varchar(50) NOT NULL,
      "reason" text NOT NULL,
      "editable_content" text,
      "suggested" varchar(5) NOT NULL DEFAULT 'true',
      "payload" jsonb NOT NULL,
      "status" text DEFAULT 'pending',
      "result" text,
      "created_at" timestamp DEFAULT now() NOT NULL,
      "updated_at" timestamp DEFAULT now() NOT NULL
    )
  `);

  // call_feedback table for grade disputes
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "call_feedback" (
      "id" serial PRIMARY KEY NOT NULL,
      "call_id" integer NOT NULL REFERENCES "calls"("id"),
      "user_id" integer,
      "tenant_id" integer,
      "feedback_type" text DEFAULT 'general_correction',
      "current_grade" text,
      "suggested_grade" text,
      "specific_criteria" text,
      "explanation" text,
      "correct_behavior" text,
      "original_score" text,
      "created_at" timestamp DEFAULT now()
    )
  `);

  console.log("[migrations] Startup migrations complete.");

  // Grade orphaned / pending calls (limit 10 to avoid overwhelming OpenAI)
  await gradeOrphanedCalls();
}

async function gradeOrphanedCalls(): Promise<void> {
  try {
    // Find calls marked "graded" but missing a call_grades row (orphaned status)
    const orphaned = await db
      .select({ id: calls.id, tenantId: calls.tenantId })
      .from(calls)
      .leftJoin(callGrades, eq(callGrades.callId, calls.id))
      .where(and(or(eq(calls.status, "graded"), eq(calls.status, "completed"))!, isNull(callGrades.id)))
      .limit(10);

    // Find calls that are "pending" with duration >= 60 (should have been graded)
    const pending = await db
      .select({ id: calls.id, tenantId: calls.tenantId })
      .from(calls)
      .where(and(
        or(eq(calls.status, "pending"), eq(calls.status, "transcribed"))!,
        gte(calls.duration, 60),
      ))
      .limit(10 - orphaned.length);

    const toGrade = [...orphaned, ...pending].slice(0, 10);
    if (toGrade.length === 0) return;

    console.log(`[migrations] Grading ${toGrade.length} orphaned/pending calls...`);

    for (const call of toGrade) {
      try {
        // Check for transcript before attempting to grade
        const [callRow] = await db.select({ transcript: calls.transcript }).from(calls).where(eq(calls.id, call.id));
        if (!callRow?.transcript) {
          console.log(`[migrations] Skipping call ${call.id} — no transcript`);
          continue;
        }
        // Reset status to pending before grading
        await db.update(calls).set({ status: "pending" }).where(eq(calls.id, call.id));
        await gradeCall(call.id, call.tenantId);
        console.log(`[migrations] Graded call ${call.id}`);
      } catch (e) {
        console.error(`[migrations] Failed to grade call ${call.id}:`, e);
      }
    }

    console.log("[migrations] Orphaned call grading complete.");
  } catch (e) {
    console.error("[migrations] gradeOrphanedCalls error:", e);
  }
}
