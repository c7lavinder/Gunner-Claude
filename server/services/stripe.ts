import Stripe from "stripe";
import { db } from "../_core/db";
import { ENV } from "../_core/env";
import { tenants, subscriptionPlans } from "../../drizzle/schema";
import { eq } from "drizzle-orm";

const stripe = ENV.stripeSecretKey
  ? new Stripe(ENV.stripeSecretKey)
  : null;

async function findTenantByStripeCustomerId(customerId: string) {
  const [t] = await db
    .select()
    .from(tenants)
    .where(eq(tenants.stripeCustomerId, customerId));
  return t ?? null;
}

async function findPlanByPriceId(priceId: string) {
  const [p] = await db
    .select()
    .from(subscriptionPlans)
    .where(eq(subscriptionPlans.stripePriceIdMonthly, priceId));
  if (p) return p;
  const [p2] = await db
    .select()
    .from(subscriptionPlans)
    .where(eq(subscriptionPlans.stripePriceIdYearly, priceId));
  return p2 ?? null;
}

export async function createCheckoutSession(
  tenantId: number,
  planCode: string,
  successUrl: string,
  cancelUrl: string
): Promise<{ url: string | null }> {
  if (!stripe) return { url: null };
  const [tenant] = await db.select().from(tenants).where(eq(tenants.id, tenantId));
  const [plan] = await db
    .select()
    .from(subscriptionPlans)
    .where(eq(subscriptionPlans.code, planCode));
  if (!tenant || !plan?.stripePriceIdMonthly) return { url: null };
  let customerId = tenant.stripeCustomerId;
  if (!customerId) {
    const customer = await stripe.customers.create({
      metadata: { tenantId: String(tenantId) },
    });
    customerId = customer.id;
    await db
      .update(tenants)
      .set({ stripeCustomerId: customerId, updatedAt: new Date() })
      .where(eq(tenants.id, tenantId));
  }
  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: "subscription",
    line_items: [{ price: plan.stripePriceIdMonthly, quantity: 1 }],
    success_url: successUrl,
    cancel_url: cancelUrl,
    metadata: { tenantId: String(tenantId) },
  });
  return { url: session.url };
}

export async function createPortalSession(
  tenantId: number,
  returnUrl: string
): Promise<{ url: string | null }> {
  if (!stripe) return { url: null };
  const [tenant] = await db.select().from(tenants).where(eq(tenants.id, tenantId));
  if (!tenant?.stripeCustomerId) return { url: null };
  const session = await stripe.billingPortal.sessions.create({
    customer: tenant.stripeCustomerId,
    return_url: returnUrl,
  });
  return { url: session.url };
}

export async function handleWebhook(body: Buffer, signature: string): Promise<void> {
  if (!stripe || !ENV.stripeWebhookSecret) return;
  const event = stripe.webhooks.constructEvent(
    body,
    signature,
    ENV.stripeWebhookSecret
  );
  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const customerId = session.customer as string;
    const subId = session.subscription as string;
    const tenant = await findTenantByStripeCustomerId(customerId);
    if (!tenant) return;
    const sub = await stripe.subscriptions.retrieve(subId);
    const priceId = sub.items.data[0]?.price.id;
    const plan = priceId ? await findPlanByPriceId(priceId) : null;
    await db
      .update(tenants)
      .set({
        stripeSubscriptionId: subId,
        subscriptionTier: plan?.code ?? "starter",
        subscriptionStatus: "active",
        maxUsers: plan?.maxUsers ?? 3,
        updatedAt: new Date(),
      })
      .where(eq(tenants.id, tenant.id));
    return;
  }
  if (event.type === "customer.subscription.updated") {
    const sub = event.data.object as Stripe.Subscription;
    const tenant = await findTenantByStripeCustomerId(sub.customer as string);
    if (!tenant) return;
    const priceId = sub.items.data[0]?.price.id;
    const plan = priceId ? await findPlanByPriceId(priceId) : null;
    const status = sub.status === "active" ? "active" : sub.status === "past_due" ? "past_due" : "cancelled";
    await db
      .update(tenants)
      .set({
        stripeSubscriptionId: sub.id,
        subscriptionTier: plan?.code ?? tenant.subscriptionTier,
        subscriptionStatus: status,
        maxUsers: plan?.maxUsers ?? tenant.maxUsers,
        updatedAt: new Date(),
      })
      .where(eq(tenants.id, tenant.id));
    return;
  }
  if (event.type === "customer.subscription.deleted") {
    const sub = event.data.object as Stripe.Subscription;
    const tenant = await findTenantByStripeCustomerId(sub.customer as string);
    if (!tenant) return;
    await db
      .update(tenants)
      .set({
        subscriptionStatus: "cancelled",
        stripeSubscriptionId: null,
        updatedAt: new Date(),
      })
      .where(eq(tenants.id, tenant.id));
    return;
  }
  if (event.type === "invoice.payment_failed") {
    const invoice = event.data.object as Stripe.Invoice;
    const customerId = invoice.customer as string;
    const tenant = await findTenantByStripeCustomerId(customerId);
    if (!tenant) return;
    await db
      .update(tenants)
      .set({ subscriptionStatus: "past_due", updatedAt: new Date() })
      .where(eq(tenants.id, tenant.id));
  }
}

export async function getPlans() {
  const rows = await db
    .select()
    .from(subscriptionPlans)
    .where(eq(subscriptionPlans.isActive, "true"));
  return rows;
}
