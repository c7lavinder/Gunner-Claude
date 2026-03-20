// lib/stripe/index.ts
// Stripe server-side client and plan configuration
// NEVER import this file client-side — contains secret key

import Stripe from 'stripe'

if (!process.env.STRIPE_SECRET_KEY) {
  console.warn('[Stripe] STRIPE_SECRET_KEY not set — Stripe features disabled')
}

export const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2025-01-27.acacia' as Stripe.LatestApiVersion })
  : null

// ─── Plan definitions ────────────────────────────────────────────────────────
// Price IDs are set via env vars after creating products in Stripe Dashboard.
// Each plan maps to a Stripe Price ID.

export const PLANS = {
  starter: {
    name: 'Starter',
    price: 97,
    interval: 'month' as const,
    features: ['1 seat', '100 graded calls/mo', 'Basic KPIs', 'AI coaching'],
    stripePriceId: process.env.STRIPE_PRICE_STARTER ?? '',
  },
  growth: {
    name: 'Growth',
    price: 197,
    interval: 'month' as const,
    features: ['5 seats', '500 graded calls/mo', 'TCP scoring', 'Priority leads', 'Score trends'],
    stripePriceId: process.env.STRIPE_PRICE_GROWTH ?? '',
    popular: true,
  },
  team: {
    name: 'Team',
    price: 397,
    interval: 'month' as const,
    features: ['15 seats', 'Unlimited calls', 'Gamification', 'Workflows', 'Training hub'],
    stripePriceId: process.env.STRIPE_PRICE_TEAM ?? '',
  },
} as const

export type PlanId = keyof typeof PLANS

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function isSubscriptionActive(status: string | null | undefined): boolean {
  return status === 'active' || status === 'trialing'
}
