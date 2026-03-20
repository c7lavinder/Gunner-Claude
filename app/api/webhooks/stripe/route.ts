// app/api/webhooks/stripe/route.ts
// Handles Stripe webhook events for subscription lifecycle
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db/client'
import { stripe } from '@/lib/stripe'
import Stripe from 'stripe'

export async function POST(request: NextRequest) {
  if (!stripe) {
    return NextResponse.json({ error: 'Stripe not configured' }, { status: 503 })
  }

  const body = await request.text()
  const signature = request.headers.get('stripe-signature')

  if (!signature) {
    return NextResponse.json({ error: 'Missing signature' }, { status: 400 })
  }

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!,
    )
  } catch (err) {
    console.error('[Stripe Webhook] Signature verification failed:', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session
        const tenantId = session.metadata?.tenantId
        if (!tenantId) break

        // Fetch subscription details
        if (session.subscription) {
          const subscription = await stripe.subscriptions.retrieve(
            session.subscription as string,
          )
          await db.tenant.update({
            where: { id: tenantId },
            data: {
              stripeSubscriptionId: subscription.id,
              stripePriceId: subscription.items.data[0]?.price.id,
              subscriptionStatus: subscription.status,
              stripeCurrentPeriodEnd: new Date((subscription as unknown as { current_period_end: number }).current_period_end * 1000),
            },
          })
        }

        await db.auditLog.create({
          data: {
            tenantId,
            action: 'subscription.created',
            resource: 'tenant',
            source: 'SYSTEM',
            severity: 'INFO',
            payload: { plan: session.metadata?.planId, customerId: String(session.customer ?? '') },
          },
        })
        break
      }

      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription
        const tenantId = subscription.metadata?.tenantId
        if (!tenantId) break

        await db.tenant.update({
          where: { id: tenantId },
          data: {
            subscriptionStatus: subscription.status,
            stripePriceId: subscription.items.data[0]?.price.id,
            stripeCurrentPeriodEnd: new Date((subscription as unknown as { current_period_end: number }).current_period_end * 1000),
          },
        })
        break
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription
        const tenantId = subscription.metadata?.tenantId
        if (!tenantId) break

        await db.tenant.update({
          where: { id: tenantId },
          data: {
            subscriptionStatus: 'canceled',
          },
        })

        await db.auditLog.create({
          data: {
            tenantId,
            action: 'subscription.canceled',
            resource: 'tenant',
            source: 'SYSTEM',
            severity: 'WARNING',
            payload: { subscriptionId: subscription.id },
          },
        })
        break
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice
        const customerId = invoice.customer as string
        const tenant = await db.tenant.findFirst({
          where: { stripeCustomerId: customerId },
          select: { id: true },
        })
        if (!tenant) break

        await db.tenant.update({
          where: { id: tenant.id },
          data: { subscriptionStatus: 'past_due' },
        })

        await db.auditLog.create({
          data: {
            tenantId: tenant.id,
            action: 'subscription.payment_failed',
            resource: 'tenant',
            source: 'SYSTEM',
            severity: 'ERROR',
            payload: { invoiceId: invoice.id },
          },
        })
        break
      }
    }
  } catch (err) {
    console.error('[Stripe Webhook] Handler error:', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: 'Webhook handler failed' }, { status: 500 })
  }

  return NextResponse.json({ received: true })
}
