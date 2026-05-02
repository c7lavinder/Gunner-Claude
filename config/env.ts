// config/env.ts
// Validated environment variables — import this instead of process.env directly
// Fails at startup if required vars are missing

import { z } from 'zod'

const envSchema = z.object({
  // App
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  NEXTAUTH_SECRET: z.string().min(32),
  NEXTAUTH_URL: z.string().url(),

  // Database
  DATABASE_URL: z.string().url(),
  DIRECT_URL: z.string().url(),

  // GHL
  GHL_CLIENT_ID: z.string(),
  GHL_CLIENT_SECRET: z.string(),
  GHL_REDIRECT_URI: z.string().url(),
  GHL_WEBHOOK_SECRET: z.string(),

  // Anthropic
  ANTHROPIC_API_KEY: z.string().startsWith('sk-ant-'),

  // Supabase
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string(),
  SUPABASE_SERVICE_ROLE_KEY: z.string(),

  // Audit schedule (optional)
  AUDIT_SCHEDULE: z.string().default('0 2 * * *'),

  // Email (optional — when unset, transactional email logs to console in dev)
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().default('Gunner AI <noreply@gunnerai.com>'),
})

const parsed = envSchema.safeParse(process.env)

// During Next.js build (`next build` page-data collection), Railway's build
// environment is intentionally minimal — it does NOT have access to runtime
// secrets like GHL_WEBHOOK_SECRET. Strict env validation must skip
// process.exit() in this phase, otherwise the build worker dies and Railway
// reports "build failed" for what is actually a deploy-environment-shape
// issue, not a code defect. Strict validation still applies at dev startup
// and at production runtime (instrumentation.ts boot path).
//
// Reference: NEXT_PHASE='phase-production-build' is set by Next.js during
// `next build` only. https://nextjs.org/docs/app/api-reference/next-config-js
const isBuildPhase = process.env.NEXT_PHASE === 'phase-production-build'

if (!parsed.success) {
  console.error('❌ Missing or invalid environment variables:')
  console.error(parsed.error.flatten().fieldErrors)
  if (process.env.NODE_ENV === 'production' && !isBuildPhase) {
    process.exit(1)
  }
}

export const env = parsed.success ? parsed.data : ({} as z.infer<typeof envSchema>)
