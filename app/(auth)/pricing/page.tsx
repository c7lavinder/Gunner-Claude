// app/(auth)/pricing/page.tsx
// Pricing page — shown after onboarding, before dashboard access
// Rule 6: paywall goes AFTER the user sees the value

import { PricingClient } from './pricing-client'
import { getSession } from '@/lib/auth/session'
import { db } from '@/lib/db/client'
import { redirect } from 'next/navigation'
import { isSubscriptionActive } from '@/lib/stripe'

export default async function PricingPage() {
  const session = await getSession()

  // If already subscribed, go to dashboard
  if (session) {
    const tenant = await db.tenant.findUnique({
      where: { id: session.tenantId },
      select: { subscriptionStatus: true },
    })
    if (isSubscriptionActive(tenant?.subscriptionStatus)) {
      redirect(`/${session.tenantSlug}/day-hub`)
    }
  }

  return <PricingClient isLoggedIn={!!session} />
}
