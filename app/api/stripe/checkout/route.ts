// app/api/stripe/checkout/route.ts
// Creates a Stripe Checkout Session for subscription signup
import { NextRequest, NextResponse } from 'next/server'
import { getSession, unauthorizedResponse } from '@/lib/auth/session'
import { db } from '@/lib/db/client'
import { stripe, PLANS, type PlanId } from '@/lib/stripe'
import { z } from 'zod'

const checkoutSchema = z.object({
  planId: z.enum(['starter', 'growth', 'team']),
})

export async function POST(request: NextRequest) {
  const session = await getSession()
  if (!session) return unauthorizedResponse()

  if (!stripe) {
    return NextResponse.json({ error: 'Stripe not configured' }, { status: 503 })
  }

  const body = await request.json()
  const parsed = checkoutSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid plan' }, { status: 400 })
  }

  const plan = PLANS[parsed.data.planId as PlanId]
  if (!plan.stripePriceId) {
    return NextResponse.json({ error: 'Plan not configured in Stripe' }, { status: 503 })
  }

  const tenant = await db.tenant.findUnique({
    where: { id: session.tenantId },
    select: { stripeCustomerId: true, name: true },
  })

  // Get or create Stripe customer
  let customerId = tenant?.stripeCustomerId
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: session.email,
      name: tenant?.name ?? session.name,
      metadata: { tenantId: session.tenantId },
    })
    customerId = customer.id
    await db.tenant.update({
      where: { id: session.tenantId },
      data: { stripeCustomerId: customerId },
    })
  }

  const appUrl = process.env.NEXTAUTH_URL ?? 'http://localhost:3000'

  const checkoutSession = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: 'subscription',
    line_items: [{ price: plan.stripePriceId, quantity: 1 }],
    success_url: `${appUrl}/${session.tenantSlug}/dashboard?subscription=success`,
    cancel_url: `${appUrl}/pricing?canceled=true`,
    metadata: {
      tenantId: session.tenantId,
      planId: parsed.data.planId,
    },
    subscription_data: {
      metadata: {
        tenantId: session.tenantId,
        planId: parsed.data.planId,
      },
    },
  })

  return NextResponse.json({ url: checkoutSession.url })
}
