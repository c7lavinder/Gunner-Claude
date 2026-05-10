// app/api/auth/crm/callback/route.ts
// Handles the OAuth redirect from GHL Marketplace App.
// Exchanges code for tokens and saves them to the tenant. Webhook
// registration happens at the GHL Marketplace App level (Bug #10) — no
// per-tenant call needed here.

import { getSession } from '@/lib/auth/session'
import { NextRequest, NextResponse } from 'next/server'
import { exchangeGHLCode } from '@/lib/ghl/client'
import { db } from '@/lib/db/client'

export async function GET(request: NextRequest) {
  const baseUrl = process.env.NEXTAUTH_URL ?? request.nextUrl.origin

  const session = await getSession()
  if (!session) {
    return NextResponse.redirect(new URL('/login', baseUrl))
  }

  const { searchParams } = request.nextUrl
  const code = searchParams.get('code')
  const error = searchParams.get('error')

  const tenantId = session.tenantId
  const tenantSlug = session.tenantSlug

  if (error || !code) {
    console.error('[GHL OAuth] Error:', error)
    return NextResponse.redirect(
      new URL(`/${tenantSlug}/settings?error=ghl_oauth_failed`, baseUrl),
    )
  }

  try {
    // Exchange code for tokens
    const tokens = await exchangeGHLCode(code)

    // Check if tenant already completed onboarding (reconnect vs first connect)
    const tenant = await db.tenant.findUnique({
      where: { id: tenantId },
      select: { onboardingCompleted: true },
    })
    const isReconnect = tenant?.onboardingCompleted === true

    // Save tokens — only advance onboarding step if first-time connect
    await db.tenant.update({
      where: { id: tenantId },
      data: {
        ghlLocationId: tokens.locationId,
        ghlAccessToken: tokens.access_token,
        ghlRefreshToken: tokens.refresh_token,
        ghlTokenExpiry: new Date(Date.now() + tokens.expires_in * 1000),
        ...(!isReconnect && { onboardingStep: 2 }),
      },
    })

    // Bug #10 (Session 79): per-tenant webhook registration removed —
    // GHL Marketplace apps register webhooks at the App level, not per
    // location. The webhook URL is configured once in the marketplace
    // dashboard. Real-time events still flow to /api/webhooks/ghl via
    // that global registration; the polling fallback runs as redundancy.

    // Reconnect → back to settings. First connect → onboarding step 2.
    if (isReconnect) {
      return NextResponse.redirect(
        new URL(`/${tenantSlug}/settings?success=ghl_reconnected`, baseUrl),
      )
    }
    return NextResponse.redirect(
      new URL(`/onboarding?step=2&success=ghl_connected`, baseUrl),
    )
  } catch (err) {
    console.error('[GHL OAuth] Token exchange failed:', err)
    // Reconnect → back to settings with error. First connect → onboarding with error.
    const tenant = await db.tenant.findUnique({
      where: { id: tenantId },
      select: { onboardingCompleted: true },
    }).catch(() => null)
    if (tenant?.onboardingCompleted) {
      return NextResponse.redirect(
        new URL(`/${tenantSlug}/settings?error=ghl_connection_failed`, baseUrl),
      )
    }
    return NextResponse.redirect(
      new URL(`/onboarding?step=1&error=ghl_connection_failed`, baseUrl),
    )
  }
}
