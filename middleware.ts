// middleware.ts
// Runs on every request — resolves tenant from URL slug, enforces auth

import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { getToken } from 'next-auth/jwt'

const PUBLIC_PATHS = [
  '/login',
  '/register',
  '/onboarding',
  '/api/auth',
  '/api/health',
  '/api/tenants/register',
  '/api/webhooks',
  '/_next',
  '/favicon.ico',
]

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // ── TEMP: DEV BYPASS ──────────────────────────────────────────────────────
  // Skips all auth checks. Remove DEV_BYPASS_AUTH from .env.local to restore.
  // Revert target: delete this block and the env var to go live.
  // ─────────────────────────────────────────────────────────────────────────
  if (process.env.DEV_BYPASS_AUTH === 'true') {
    // Root path → send straight to dev tenant dashboard
    if (pathname === '/') {
      return NextResponse.redirect(new URL('/apex-dev/dashboard', request.url))
    }
    return NextResponse.next()
  }
  // ── END TEMP: DEV BYPASS ──────────────────────────────────────────────────

  // Allow public paths through
  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next()
  }

  // Verify auth session (NextAuth v4 JWT)
  const token = await getToken({
    req: request,
    secret: process.env.NEXTAUTH_SECRET!,
  })

  if (!token) {
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('callbackUrl', pathname)
    return NextResponse.redirect(loginUrl)
  }

  // Extract tenant slug from path: /{tenant-slug}/...
  const segments = pathname.split('/').filter(Boolean)
  const tenantSlug = segments[0]

  // Root path — redirect to onboarding if not completed, otherwise dashboard
  if (!tenantSlug || tenantSlug === '') {
    const userTenantSlug = token.tenantSlug as string | undefined
    const onboardingCompleted = token.onboardingCompleted as boolean | undefined
    if (userTenantSlug && onboardingCompleted) {
      return NextResponse.redirect(new URL(`/${userTenantSlug}/dashboard`, request.url))
    }
    return NextResponse.redirect(new URL('/onboarding', request.url))
  }

  // Skip tenant check for API routes (they validate tenant themselves)
  if (pathname.startsWith('/api/')) {
    return NextResponse.next()
  }

  // Verify the user belongs to this tenant
  const userTenantSlug = token.tenantSlug as string | undefined
  if (userTenantSlug && tenantSlug !== userTenantSlug) {
    return NextResponse.redirect(new URL(`/${userTenantSlug}/dashboard`, request.url))
  }

  // Inject tenant context into headers for server components
  const response = NextResponse.next()
  response.headers.set('x-tenant-slug', tenantSlug)
  response.headers.set('x-tenant-id', (token.tenantId as string) ?? '')
  response.headers.set('x-user-id', (token.sub as string) ?? '')
  response.headers.set('x-user-role', (token.role as string) ?? '')

  return response
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
