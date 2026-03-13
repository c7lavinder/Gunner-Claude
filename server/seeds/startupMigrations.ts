import { sql } from "drizzle-orm";
import { db } from "../_core/db";

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
    ADD COLUMN IF NOT EXISTS "lockedUntil" timestamp,
    ADD COLUMN IF NOT EXISTS "profilePicture" text
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

  // Add tenantId to user_instructions if not present
  await db.execute(sql`ALTER TABLE "user_instructions" ADD COLUMN IF NOT EXISTS "tenantId" integer REFERENCES "tenants"("id")`);

  // Performance indexes
  await db.execute(sql`CREATE INDEX IF NOT EXISTS "idx_calls_tenant_created" ON "calls" ("tenantId", "createdAt" DESC)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS "idx_calls_tenant_user" ON "calls" ("tenantId", "teamMemberId")`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS "idx_user_events_tenant_user_created" ON "user_events" ("tenantId", "userId", "createdAt" DESC)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS "idx_notifications_tenant_user_read" ON "notifications" ("tenantId", "userId", "isRead")`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS "idx_audit_log_tenant_created" ON "audit_log" ("tenantId", "createdAt" DESC)`);

  // Unique index on call_grades to prevent duplicate grades per call
  await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS "call_grades_callid_unique" ON "call_grades" ("callId")`);

  // Intelligence columns on call_grades
  await db.execute(sql`ALTER TABLE "call_grades" ADD COLUMN IF NOT EXISTS "rubricSnapshot" jsonb`);

  // Intelligence columns on industry_playbooks
  await db.execute(sql`
    ALTER TABLE "industry_playbooks"
    ADD COLUMN IF NOT EXISTS "kpiMetrics" jsonb,
    ADD COLUMN IF NOT EXISTS "taskCategories" jsonb,
    ADD COLUMN IF NOT EXISTS "classificationLabels" jsonb
  `);

  // Intelligence columns on tenant_playbooks
  await db.execute(sql`
    ALTER TABLE "tenant_playbooks"
    ADD COLUMN IF NOT EXISTS "gradingPhilosophyOverride" text,
    ADD COLUMN IF NOT EXISTS "coachingTone" varchar(50),
    ADD COLUMN IF NOT EXISTS "minGradingDurationSeconds" integer
  `);

  // Intelligence columns on user_playbooks
  await db.execute(sql`
    ALTER TABLE "user_playbooks"
    ADD COLUMN IF NOT EXISTS "weakCriteria" jsonb,
    ADD COLUMN IF NOT EXISTS "gradeBaseline" numeric(4,2)
  `);

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

  // Call next steps — AI-suggested and manual post-call actions
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

  // Sync activity log — tracks all CRM sync events across 3 layers
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "sync_activity_log" (
      "id" serial PRIMARY KEY,
      "tenantId" integer REFERENCES "tenants"("id") NOT NULL,
      "layer" varchar(20) NOT NULL,
      "eventType" varchar(100),
      "status" varchar(20) NOT NULL,
      "details" text,
      "createdAt" timestamp DEFAULT now() NOT NULL
    )
  `);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS "idx_sync_activity_tenant_created" ON "sync_activity_log" ("tenantId", "createdAt" DESC)`);

  console.log("[migrations] Startup migrations complete.");

  await bootstrapDemoTenant();
}

const DEMO_TENANT_ID = 540044;
const DEMO_PW_HASH = "$2b$10$demohashedpasswordplaceholderxyz123456789abc";

async function bootstrapDemoTenant(): Promise<void> {
  try {
    // Tenant
    await db.execute(sql`
      INSERT INTO "tenants" ("id", "name", "crmType", "crmConnected", "crmConfig", "industryCode", "onboardingComplete", "createdAt", "updatedAt")
      VALUES (${DEMO_TENANT_ID}, 'Apex Property Solutions', 'demo', 'true', '{}', 're_wholesaling', 'true', now(), now())
      ON CONFLICT ("id") DO UPDATE SET "crmType" = 'demo', "crmConnected" = 'true'
    `);

    // 7 users (admin + 6 team)
    const demoUsers = [
      { email: "demo@getgunner.ai", name: "Demo Admin", role: "owner", teamRole: "acquisitions", isAdmin: true },
      { email: "marcus@apex-demo.local", name: "Marcus Williams", role: "member", teamRole: "lead_manager", isAdmin: false },
      { email: "sarah@apex-demo.local", name: "Sarah Chen", role: "member", teamRole: "lead_manager", isAdmin: false },
      { email: "jake@apex-demo.local", name: "Jake Morrison", role: "member", teamRole: "lead_generator", isAdmin: false },
      { email: "tyler@apex-demo.local", name: "Tyler Brooks", role: "member", teamRole: "lead_generator", isAdmin: false },
      { email: "alyssa@apex-demo.local", name: "Alyssa Reeves", role: "member", teamRole: "lead_generator", isAdmin: false },
      { email: "derek@apex-demo.local", name: "Derek Park", role: "member", teamRole: "acquisitions", isAdmin: false },
      { email: "nick@apex-demo.local", name: "Nick Torres", role: "member", teamRole: "dispositions", isAdmin: false },
    ];

    for (const u of demoUsers) {
      await db.execute(sql`
        INSERT INTO "users" ("tenantId", "name", "email", "passwordHash", "loginMethod", "role", "teamRole", "isTenantAdmin", "emailVerified", "createdAt", "updatedAt")
        VALUES (${DEMO_TENANT_ID}, ${u.name}, ${u.email}, ${DEMO_PW_HASH}, 'password', ${u.role}, ${u.teamRole}, ${u.isAdmin}, true, now(), now())
        ON CONFLICT ("email") DO NOTHING
      `);
    }

    // Team members (link users to team)
    for (const u of demoUsers) {
      if (u.role === "owner") continue;
      await db.execute(sql`
        INSERT INTO "team_members" ("tenantId", "userId", "role", "status", "createdAt", "updatedAt")
        SELECT ${DEMO_TENANT_ID}, u.id, ${u.teamRole}, 'active', now(), now()
        FROM "users" u WHERE u."email" = ${u.email}
        ON CONFLICT DO NOTHING
      `);
    }

    // Tenant playbook (linked to RE Wholesaling, adds lead_generator role)
    await db.execute(sql`
      INSERT INTO "tenant_playbooks" ("tenantId", "industryCode", "roles", "createdAt", "updatedAt")
      VALUES (
        ${DEMO_TENANT_ID},
        're_wholesaling',
        ${JSON.stringify([
          { code: "lead_manager", name: "Lead Manager", description: "First contact with inbound leads, qualifies and routes", color: "#0ea5e9" },
          { code: "lead_generator", name: "Lead Generator", description: "Cold calls new leads from lists, sets appointments", color: "#f59e0b" },
          { code: "acquisitions", name: "Acquisitions Manager", description: "Negotiates deals with sellers, runs comps, makes offers", color: "#6366f1" },
          { code: "dispositions", name: "Dispositions Manager", description: "Sells contracts to cash buyers, manages buyer list", color: "#8b5cf6" },
        ])}::jsonb,
        now(),
        now()
      )
      ON CONFLICT ("tenantId") DO NOTHING
    `);

    // User playbooks (one per team member with initial strengths)
    const userPlaybookSeeds: Record<string, { role: string; strengths: string[]; growthAreas: string[] }> = {
      "marcus@apex-demo.local": { role: "lead_manager", strengths: ["Qualification questions", "Rapport building"], growthAreas: ["Closing for next steps", "Handling price objections"] },
      "sarah@apex-demo.local": { role: "lead_manager", strengths: ["Empathy and active listening", "Information capture"], growthAreas: ["Urgency creation", "Deeper motivation probing"] },
      "jake@apex-demo.local": { role: "lead_generator", strengths: ["High energy openers", "Volume consistency"], growthAreas: ["Financial discovery", "Setting concrete next steps"] },
      "tyler@apex-demo.local": { role: "lead_generator", strengths: ["Overcoming initial resistance", "Clear introductions"], growthAreas: ["Property condition questions", "Timeline urgency"] },
      "alyssa@apex-demo.local": { role: "lead_generator", strengths: ["Building trust quickly", "Empathetic tone"], growthAreas: ["Financial discovery", "Pushing for appointments"] },
      "derek@apex-demo.local": { role: "acquisitions", strengths: ["Value anchoring", "Number presentation"], growthAreas: ["Handling 'let me think about it'", "Creating urgency without pressure"] },
      "nick@apex-demo.local": { role: "dispositions", strengths: ["Deal presentation clarity", "Buyer rapport"], growthAreas: ["Closing for commitment", "Urgency with buyers"] },
    };

    for (const [email, seed] of Object.entries(userPlaybookSeeds)) {
      await db.execute(sql`
        INSERT INTO "user_playbooks" ("tenantId", "userId", "role", "strengths", "growthAreas", "gradeTrend", "createdAt", "updatedAt")
        SELECT ${DEMO_TENANT_ID}, u.id, ${seed.role}, ${JSON.stringify(seed.strengths)}::jsonb, ${JSON.stringify(seed.growthAreas)}::jsonb, 'improving', now(), now()
        FROM "users" u WHERE u."email" = ${email}
        ON CONFLICT ("userId") DO NOTHING
      `);
    }

    console.log("[migrations] Demo tenant (Apex Property Solutions) bootstrapped.");
  } catch (e) {
    console.error("[migrations] Demo tenant bootstrap error:", e);
  }
}
