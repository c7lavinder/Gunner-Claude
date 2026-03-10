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
    ADD COLUMN IF NOT EXISTS "lockedUntil" timestamp
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

  console.log("[migrations] Startup migrations complete.");
}
