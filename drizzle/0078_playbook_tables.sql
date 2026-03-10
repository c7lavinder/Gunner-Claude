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
);

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
);

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
);
