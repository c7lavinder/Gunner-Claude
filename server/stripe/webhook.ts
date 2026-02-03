/**
 * Stripe Webhook Handler
 * Processes subscription events from Stripe
 */

import { Request, Response } from "express";
import Stripe from "stripe";
import { ENV } from "../_core/env";
import { updateTenantStripeIds } from "../tenant";
import { getDb } from "../db";
import { tenants } from "../../drizzle/schema";
import { eq } from "drizzle-orm";

const stripe = new Stripe(ENV.stripeSecretKey || "", {
  apiVersion: "2026-01-28.clover",
});

/**
 * Handle incoming Stripe webhooks
 */
export async function handleStripeWebhook(req: Request, res: Response) {
  const sig = req.headers["stripe-signature"];

  if (!sig) {
    console.error("[Stripe Webhook] Missing signature");
    return res.status(400).send("Missing stripe-signature header");
  }

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      ENV.stripeWebhookSecret || ""
    );
  } catch (err: any) {
    console.error("[Stripe Webhook] Signature verification failed:", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Handle test events for webhook verification
  if (event.id.startsWith("evt_test_")) {
    console.log("[Stripe Webhook] Test event detected, returning verification response");
    return res.json({ verified: true });
  }

  console.log(`[Stripe Webhook] Received event: ${event.type} (${event.id})`);

  try {
    switch (event.type) {
      case "checkout.session.completed":
        await handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session);
        break;

      case "customer.subscription.created":
        await handleSubscriptionCreated(event.data.object as Stripe.Subscription);
        break;

      case "customer.subscription.updated":
        await handleSubscriptionUpdated(event.data.object as Stripe.Subscription);
        break;

      case "customer.subscription.deleted":
        await handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
        break;

      case "invoice.paid":
        await handleInvoicePaid(event.data.object as Stripe.Invoice);
        break;

      case "invoice.payment_failed":
        await handlePaymentFailed(event.data.object as Stripe.Invoice);
        break;

      default:
        console.log(`[Stripe Webhook] Unhandled event type: ${event.type}`);
    }

    res.json({ received: true });
  } catch (error) {
    console.error(`[Stripe Webhook] Error processing ${event.type}:`, error);
    res.status(500).json({ error: "Webhook handler failed" });
  }
}

/**
 * Handle checkout.session.completed - new subscription started
 */
async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  console.log("[Stripe Webhook] Processing checkout.session.completed");
  
  const userId = session.metadata?.user_id;
  const tenantId = session.metadata?.tenant_id;
  const planCode = session.metadata?.plan_code as 'starter' | 'growth' | 'scale' | undefined;
  const customerId = session.customer as string;
  const subscriptionId = session.subscription as string;

  if (!tenantId || !planCode) {
    console.log("[Stripe Webhook] No tenant_id or plan_code in metadata, skipping");
    return;
  }

  // Update tenant with Stripe IDs
  console.log(`[Stripe Webhook] Updating tenant ${tenantId} with Stripe IDs`);
  
  try {
    await updateTenantStripeIds(
      parseInt(tenantId),
      customerId,
      subscriptionId,
      planCode
    );
    console.log(`[Stripe Webhook] Successfully updated tenant ${tenantId}`);
  } catch (error) {
    console.error(`[Stripe Webhook] Failed to update tenant ${tenantId}:`, error);
  }
}

/**
 * Handle customer.subscription.created
 */
async function handleSubscriptionCreated(subscription: Stripe.Subscription) {
  console.log("[Stripe Webhook] Processing customer.subscription.created");
  const planCode = subscription.metadata?.plan_code;
  const tenantId = subscription.metadata?.tenant_id;
  
  console.log(`[Stripe Webhook] Subscription created for tenant ${tenantId}, plan: ${planCode}`);
}

/**
 * Handle customer.subscription.updated - plan change, renewal, etc.
 */
async function handleSubscriptionUpdated(subscription: Stripe.Subscription) {
  console.log("[Stripe Webhook] Processing customer.subscription.updated");
  const tenantId = subscription.metadata?.tenant_id;
  const status = subscription.status;
  
  if (!tenantId) {
    console.log("[Stripe Webhook] No tenant_id in subscription metadata, skipping");
    return;
  }
  
  console.log(`[Stripe Webhook] Subscription updated for tenant ${tenantId}, status: ${status}`);
  
  // Map Stripe status to our status
  let subscriptionStatus: "active" | "past_due" | "canceled" | "paused" = "active";
  if (subscription.cancel_at_period_end) {
    // Don't change to canceled yet - they still have access until period end
    subscriptionStatus = "active";
  } else if (status === "past_due") {
    subscriptionStatus = "past_due";
  } else if (status === "paused") {
    subscriptionStatus = "paused";
  } else if (status === "canceled") {
    subscriptionStatus = "canceled";
  }
  
  // Update tenant subscription status
  try {
    const db = await getDb();
    if (db) {
      await db.update(tenants)
        .set({ subscriptionStatus })
        .where(eq(tenants.id, parseInt(tenantId)));
      console.log(`[Stripe Webhook] Updated tenant ${tenantId} status to ${subscriptionStatus}`);
    }
  } catch (error) {
    console.error(`[Stripe Webhook] Failed to update tenant ${tenantId} status:`, error);
  }
}

/**
 * Handle customer.subscription.deleted - subscription canceled
 */
async function handleSubscriptionDeleted(subscription: Stripe.Subscription) {
  console.log("[Stripe Webhook] Processing customer.subscription.deleted");
  const tenantId = subscription.metadata?.tenant_id;
  
  if (!tenantId) {
    console.log("[Stripe Webhook] No tenant_id in subscription metadata, skipping");
    return;
  }
  
  console.log(`[Stripe Webhook] Subscription deleted for tenant ${tenantId}`);
  
  // Update tenant to canceled status and downgrade to trial
  try {
    const db = await getDb();
    if (db) {
      await db.update(tenants)
        .set({ 
          subscriptionStatus: 'canceled',
          subscriptionTier: 'trial',
          stripeSubscriptionId: null,
          maxUsers: 3,
        })
        .where(eq(tenants.id, parseInt(tenantId)));
      console.log(`[Stripe Webhook] Tenant ${tenantId} subscription canceled, downgraded to trial`);
    }
  } catch (error) {
    console.error(`[Stripe Webhook] Failed to cancel tenant ${tenantId} subscription:`, error);
  }
}

/**
 * Handle invoice.paid - successful payment
 */
async function handleInvoicePaid(invoice: Stripe.Invoice) {
  console.log("[Stripe Webhook] Processing invoice.paid");
  console.log(`[Stripe Webhook] Invoice ${invoice.id} paid, amount: ${invoice.amount_paid}`);
}

/**
 * Handle invoice.payment_failed - payment failed
 */
async function handlePaymentFailed(invoice: Stripe.Invoice) {
  console.log("[Stripe Webhook] Processing invoice.payment_failed");
  console.log(`[Stripe Webhook] Invoice ${invoice.id} payment failed`);
  
  // Could send notification to tenant admin about failed payment
}
