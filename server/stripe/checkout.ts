/**
 * Stripe Checkout Service
 * Handles subscription checkout sessions
 */

import Stripe from "stripe";
import { ENV } from "../_core/env";
import { SUBSCRIPTION_PLANS, TRIAL_DAYS } from "./products";

// Initialize Stripe with secret key
const stripe = new Stripe(ENV.stripeSecretKey || "", {
  apiVersion: "2026-01-28.clover",
});

export interface CreateCheckoutParams {
  planCode: string;
  billingPeriod: "monthly" | "yearly";
  userId: number;
  userEmail: string;
  userName: string;
  tenantId?: number;
  successUrl: string;
  cancelUrl: string;
}

export interface CheckoutResult {
  sessionId: string;
  url: string;
}

/**
 * Create a Stripe Checkout Session for subscription
 */
export async function createCheckoutSession(
  params: CreateCheckoutParams
): Promise<CheckoutResult> {
  const plan = SUBSCRIPTION_PLANS.find((p) => p.code === params.planCode);
  if (!plan) {
    throw new Error(`Invalid plan code: ${params.planCode}`);
  }

  const price = params.billingPeriod === "yearly" ? plan.priceYearly : plan.priceMonthly;
  const interval = params.billingPeriod === "yearly" ? "year" : "month";

  // Create the checkout session
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    payment_method_types: ["card"],
    customer_email: params.userEmail,
    client_reference_id: params.userId.toString(),
    allow_promotion_codes: true,
    subscription_data: {
      trial_period_days: TRIAL_DAYS,
      metadata: {
        plan_code: params.planCode,
        user_id: params.userId.toString(),
        tenant_id: params.tenantId?.toString() || "",
      },
    },
    line_items: [
      {
        price_data: {
          currency: "usd",
          product_data: {
            name: `Gunner ${plan.name} Plan`,
            description: plan.description,
            metadata: {
              plan_code: params.planCode,
            },
          },
          unit_amount: price,
          recurring: {
            interval,
          },
        },
        quantity: 1,
      },
    ],
    metadata: {
      user_id: params.userId.toString(),
      customer_email: params.userEmail,
      customer_name: params.userName,
      plan_code: params.planCode,
      billing_period: params.billingPeriod,
      tenant_id: params.tenantId?.toString() || "",
    },
    success_url: params.successUrl,
    cancel_url: params.cancelUrl,
  });

  if (!session.url) {
    throw new Error("Failed to create checkout session URL");
  }

  return {
    sessionId: session.id,
    url: session.url,
  };
}

/**
 * Create a billing portal session for managing subscription
 */
export async function createBillingPortalSession(
  customerId: string,
  returnUrl: string
): Promise<string> {
  const session = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: returnUrl,
  });

  return session.url;
}

/**
 * Get subscription details from Stripe
 */
export async function getSubscription(subscriptionId: string): Promise<Stripe.Subscription | null> {
  try {
    return await stripe.subscriptions.retrieve(subscriptionId);
  } catch (error) {
    console.error("Error retrieving subscription:", error);
    return null;
  }
}

/**
 * Cancel a subscription at period end
 */
export async function cancelSubscription(subscriptionId: string): Promise<Stripe.Subscription> {
  return await stripe.subscriptions.update(subscriptionId, {
    cancel_at_period_end: true,
  });
}

/**
 * Reactivate a canceled subscription
 */
export async function reactivateSubscription(subscriptionId: string): Promise<Stripe.Subscription> {
  return await stripe.subscriptions.update(subscriptionId, {
    cancel_at_period_end: false,
  });
}

export { stripe };
