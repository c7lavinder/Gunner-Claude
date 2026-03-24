// lib/auth/session.ts
// Typed session helpers — use these instead of getServerSession() + manual casting
// Eliminates the repetitive `(session.user as { tenantId?: string }).tenantId` pattern

import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth/config'
import { redirect } from 'next/navigation'
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

// Use in server components and API routes
// Redirects to /login if no session — never returns null
export async function requireSession(): Promise<AppSession> {
  const session = await getServerSession(authOptions)
  if (!session?.user) redirect('/login')
  return extractSession(session.user)
}

// Use in API routes where you want to return 401 instead of redirect
export async function getSession(): Promise<AppSession | null> {
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
