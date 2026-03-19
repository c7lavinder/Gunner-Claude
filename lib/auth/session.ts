// lib/auth/session.ts
// Typed session helpers — use these instead of getServerSession() + manual casting
// Eliminates the repetitive `(session.user as { tenantId?: string }).tenantId` pattern

import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth/config'
import { redirect } from 'next/navigation'
import { db } from '@/lib/db/client'
import type { UserRole } from '@/types/roles'

export interface AppSession {
  userId: string
  email: string
  name: string
  role: UserRole
  tenantId: string
  tenantSlug: string
  onboardingCompleted: boolean
}

// ── TEMP: DEV BYPASS ──────────────────────────────────────────────────────────
// Returns a real session for owner@apex.dev without requiring login.
// Remove DEV_BYPASS_AUTH from .env.local to restore normal auth.
// Revert target: delete this function and the two call sites below.
// ─────────────────────────────────────────────────────────────────────────────
let cachedDevSession: AppSession | null = null
async function getDevBypassSession(): Promise<AppSession> {
  if (cachedDevSession) return cachedDevSession
  const user = await db.user.findUnique({
    where: { email: 'owner@apex.dev' },
    include: { tenant: { select: { id: true, slug: true, onboardingCompleted: true } } },
  })
  if (!user) throw new Error('DEV_BYPASS_AUTH: seed user owner@apex.dev not found — run npm run db:seed')
  cachedDevSession = {
    userId: user.id,
    email: user.email,
    name: user.name,
    role: user.role as UserRole,
    tenantId: user.tenantId,
    tenantSlug: user.tenant.slug,
    onboardingCompleted: user.tenant.onboardingCompleted,
  }
  return cachedDevSession
}
// ── END TEMP: DEV BYPASS ────────────────────────────────────────────────────

// Use in server components and API routes
// Redirects to /login if no session — never returns null
export async function requireSession(): Promise<AppSession> {
  // TEMP: DEV BYPASS — remove this if-block to restore normal auth
  if (process.env.DEV_BYPASS_AUTH === 'true') return getDevBypassSession()

  const session = await getServerSession(authOptions)
  if (!session?.user) redirect('/login')
  return extractSession(session.user)
}

// Use in API routes where you want to return 401 instead of redirect
export async function getSession(): Promise<AppSession | null> {
  // TEMP: DEV BYPASS — remove this if-block to restore normal auth
  if (process.env.DEV_BYPASS_AUTH === 'true') return getDevBypassSession()

  const session = await getServerSession(authOptions)
  if (!session?.user) return null
  return extractSession(session.user)
}

function extractSession(user: Record<string, unknown>): AppSession {
  return {
    userId: (user.id as string) ?? '',
    email: (user.email as string) ?? '',
    name: (user.name as string) ?? '',
    role: ((user.role as string) ?? 'LEAD_MANAGER') as UserRole,
    tenantId: (user.tenantId as string) ?? '',
    tenantSlug: (user.tenantSlug as string) ?? '',
    onboardingCompleted: (user.onboardingCompleted as boolean) ?? false,
  }
}

// Typed 401 response for API routes
export function unauthorizedResponse() {
  return Response.json({ error: 'Unauthorized' }, { status: 401 })
}

// Typed 403 response for API routes
export function forbiddenResponse() {
  return Response.json({ error: 'Forbidden' }, { status: 403 })
}
