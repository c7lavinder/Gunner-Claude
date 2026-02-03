/**
 * Stripe Product Configuration
 * Defines subscription tiers for Gunner white-label platform
 */

export interface SubscriptionPlan {
  id: string;
  name: string;
  code: string;
  description: string;
  priceMonthly: number; // in cents
  priceYearly: number; // in cents
  maxUsers: number;
  maxCrmIntegrations: number;
  features: string[];
  popular?: boolean;
}

export const SUBSCRIPTION_PLANS: SubscriptionPlan[] = [
  {
    id: "starter",
    name: "Starter",
    code: "starter",
    description: "Perfect for small teams getting started with AI call coaching",
    priceMonthly: 9900, // $99
    priceYearly: 99000, // $990 (2 months free)
    maxUsers: 3,
    maxCrmIntegrations: 1,
    features: [
      "AI call grading",
      "Basic analytics dashboard",
      "Team leaderboard",
      "Up to 3 team members",
      "1 CRM integration",
      "Email support",
    ],
  },
  {
    id: "growth",
    name: "Growth",
    code: "growth",
    description: "For growing teams that need more users and advanced features",
    priceMonthly: 24900, // $249
    priceYearly: 249000, // $2,490 (2 months free)
    maxUsers: 10,
    maxCrmIntegrations: 2,
    features: [
      "Everything in Starter",
      "Advanced analytics & trends",
      "Custom grading rubrics",
      "Training materials upload",
      "Up to 10 team members",
      "2 CRM integrations",
      "Priority email support",
    ],
    popular: true,
  },
  {
    id: "scale",
    name: "Scale",
    code: "scale",
    description: "Enterprise-grade features for large organizations",
    priceMonthly: 49900, // $499
    priceYearly: 499000, // $4,990 (2 months free)
    maxUsers: 999, // Unlimited
    maxCrmIntegrations: 5,
    features: [
      "Everything in Growth",
      "Unlimited team members",
      "5 CRM integrations",
      "API access",
      "Custom branding",
      "Dedicated account manager",
      "Phone support",
      "SLA guarantee",
    ],
  },
];

export const TRIAL_DAYS = 14;

export function getPlanByCode(code: string): SubscriptionPlan | undefined {
  return SUBSCRIPTION_PLANS.find((plan) => plan.code === code);
}

export function formatPrice(cents: number): string {
  return `$${(cents / 100).toFixed(0)}`;
}
