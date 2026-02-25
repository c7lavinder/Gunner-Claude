/**
 * Stripe Checkout Service
 * Handles subscription checkout sessions
 */

import Stripe from "stripe";
import { ENV } from "../_core/env";
import { SUBSCRIPTION_PLANS, TRIAL_DAYS } from "./products";
import { getDb } from "../db";
import { subscriptionPlans } from "../../drizzle/schema";
import { eq } from "drizzle-orm";

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
 * Get plan from database, fallback to static config
 */
async function getPlanFromDatabase(planCode: string) {
  try {
    const db = await getDb();
    if (db) {
      const [dbPlan] = await db
        .select()
        .from(subscriptionPlans)
        .where(eq(subscriptionPlans.code, planCode));
      
      if (dbPlan) {
        return {
          name: dbPlan.name,
          code: dbPlan.code,
          description: dbPlan.description || "",
          priceMonthly: dbPlan.priceMonthly,
          priceYearly: dbPlan.priceYearly || dbPlan.priceMonthly * 10,
          trialDays: dbPlan.trialDays,
          stripePriceIdMonthly: dbPlan.stripePriceIdMonthly,
          stripePriceIdYearly: dbPlan.stripePriceIdYearly,
        };
      }
    }
  } catch (error) {
    console.error("[Checkout] Error fetching plan from database:", error);
  }
  
  // Fallback to static config
  const staticPlan = SUBSCRIPTION_PLANS.find((p) => p.code === planCode);
  if (staticPlan) {
    return {
      name: staticPlan.name,
      code: staticPlan.code,
      description: staticPlan.description,
      priceMonthly: staticPlan.priceMonthly,
      priceYearly: staticPlan.priceYearly,
      trialDays: TRIAL_DAYS,
      stripePriceIdMonthly: null,
      stripePriceIdYearly: null,
    };
  }
  
  return null;
}

/**
 * Create a Stripe Checkout Session for subscription
 */
export async function createCheckoutSession(
  params: CreateCheckoutParams
): Promise<CheckoutResult> {
  const plan = await getPlanFromDatabase(params.planCode);
  if (!plan) {
    throw new Error(`Invalid plan code: ${params.planCode}`);
  }

  const isYearly = params.billingPeriod === "yearly";
  const stripePriceId = isYearly ? plan.stripePriceIdYearly : plan.stripePriceIdMonthly;
  
  // Build line items - use Stripe price ID if available, otherwise create price_data
  let lineItems: Stripe.Checkout.SessionCreateParams.LineItem[];
  
  if (stripePriceId) {
    // Use existing Stripe price ID from database
    console.log(`[Checkout] Using Stripe price ID: ${stripePriceId}`);
    lineItems = [
      {
        price: stripePriceId,
        quantity: 1,
      },
    ];
  } else {
    // Create price dynamically (fallback for when no Stripe price ID is set)
    console.log(`[Checkout] No Stripe price ID found, creating dynamic price`);
    const price = isYearly ? plan.priceYearly : plan.priceMonthly;
    const interval = isYearly ? "year" : "month";
    
    lineItems = [
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
    ];
  }

  // Create the checkout session
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    payment_method_types: ["card"],
    customer_email: params.userEmail,
    client_reference_id: params.userId.toString(),
    allow_promotion_codes: true,
    subscription_data: {
      trial_period_days: plan.trialDays,
      metadata: {
        plan_code: params.planCode,
        user_id: params.userId.toString(),
        tenant_id: params.tenantId?.toString() || "",
      },
    },
    line_items: lineItems,
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
  // Skip Stripe API call for bypass/synthetic subscription IDs
  if (subscriptionId.startsWith('sub_super_admin') || subscriptionId.startsWith('sub_bypass')) {
    return null;
  }
  try {
    return await stripe.subscriptions.retrieve(subscriptionId);
  } catch (error: any) {
    // Suppress 404 errors for missing subscriptions (e.g. deleted or test subs)
    if (error?.statusCode !== 404) {
      console.error("Error retrieving subscription:", error);
    }
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

/**
 * Update subscription to a different plan (upgrade/downgrade)
 * Uses proration to handle billing changes
 */
export async function updateSubscription(
  subscriptionId: string,
  newPlanCode: string,
  billingPeriod: "monthly" | "yearly"
): Promise<Stripe.Subscription> {
  const plan = await getPlanFromDatabase(newPlanCode);
  if (!plan) {
    throw new Error(`Invalid plan code: ${newPlanCode}`);
  }

  const isYearly = billingPeriod === "yearly";
  const stripePriceId = isYearly ? plan.stripePriceIdYearly : plan.stripePriceIdMonthly;

  if (!stripePriceId) {
    throw new Error(`No Stripe price ID configured for ${newPlanCode} (${billingPeriod})`);
  }

  // Get the current subscription to find the item ID
  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  const subscriptionItemId = subscription.items.data[0]?.id;

  if (!subscriptionItemId) {
    throw new Error("No subscription item found");
  }

  // Update the subscription with the new price
  // Stripe automatically handles proration
  const updatedSubscription = await stripe.subscriptions.update(subscriptionId, {
    items: [
      {
        id: subscriptionItemId,
        price: stripePriceId,
      },
    ],
    proration_behavior: "create_prorations",
    metadata: {
      plan_code: newPlanCode,
      billing_period: billingPeriod,
    },
  });

  return updatedSubscription;
}

export { stripe };
