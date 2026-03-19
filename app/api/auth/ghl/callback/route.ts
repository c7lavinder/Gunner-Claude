import { getSession, unauthorizedResponse } from '@/lib/auth/session'
// app/api/auth/ghl/callback/route.ts
// Handles the OAuth redirect from GHL Marketplace App
// Exchanges code for tokens, saves to tenant, registers webhooks

import { NextRequest, NextResponse } from 'next/server'


import { exchangeGHLCode, getGHLClient } from '@/lib/ghl/client'
import { db } from '@/lib/db/client'

const GHL_WEBHOOK_EVENTS = [
  'CallCompleted',
  'OpportunityStageChanged',
  'ContactCreated',
  'TaskCompleted',
  'AppointmentCreated',
  'InboundMessage',
]

export async function GET(request: NextRequest) {
  const session = await getSession()
  if (!session?.user) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  const { searchParams } = request.nextUrl
  const code = searchParams.get('code')
  const error = searchParams.get('error')

  const tenantId = (session.user as { tenantId?: string }).tenantId
  const tenantSlug = session.tenantSlug

  if (error || !code) {
    console.error('[GHL OAuth] Error:', error)
    return NextResponse.redirect(
      new URL(`/${tenantSlug}/settings?error=ghl_oauth_failed`, request.url),
    )
  }

  try {
    // Exchange code for tokens
    const tokens = await exchangeGHLCode(code)

    // Save tokens to tenant
    await db.tenant.update({
      where: { id: tenantId },
      data: {
        ghlLocationId: tokens.locationId,
        ghlAccessToken: tokens.access_token,
        ghlRefreshToken: tokens.refresh_token,
        ghlTokenExpiry: new Date(Date.now() + tokens.expires_in * 1000),
      },
    })

    // Register webhooks with GHL
    const ghlClient = await getGHLClient(tenantId!)
    const webhookUrl = `${process.env.NEXTAUTH_URL}/api/webhooks/ghl`

    const webhook = await ghlClient.registerWebhook(webhookUrl, GHL_WEBHOOK_EVENTS)

    await db.tenant.update({
      where: { id: tenantId },
      data: { ghlWebhookId: webhook.id },
    })

    // Advance onboarding step
    await db.tenant.update({
      where: { id: tenantId },
      data: { onboardingStep: 2 },
    })

    return NextResponse.redirect(
      new URL(`/onboarding?step=2&success=ghl_connected`, request.url),
    )
  } catch (err) {
    console.error('[GHL OAuth] Token exchange failed:', err)
    return NextResponse.redirect(
      new URL(`/onboarding?step=1&error=ghl_connection_failed`, request.url),
    )
  }
}
