'use client'
// app/(auth)/pricing/pricing-client.tsx
// Pricing plans with Stripe Checkout integration

import { useState } from 'react'
import { Check, Zap, Loader2 } from 'lucide-react'
import Link from 'next/link'

const PLANS = [
  {
    id: 'starter',
    name: 'Starter',
    price: 97,
    features: ['1 seat', '100 graded calls/mo', 'Basic KPIs', 'AI coaching'],
  },
  {
    id: 'growth',
    name: 'Growth',
    price: 197,
    popular: true,
    features: ['5 seats', '500 graded calls/mo', 'TCP scoring', 'Priority leads', 'Score trends'],
  },
  {
    id: 'team',
    name: 'Team',
    price: 397,
    features: ['15 seats', 'Unlimited calls', 'Gamification', 'Workflows', 'Training hub'],
  },
]

export function PricingClient({ isLoggedIn }: { isLoggedIn: boolean }) {
  const [loading, setLoading] = useState<string | null>(null)

  async function handleCheckout(planId: string) {
    if (!isLoggedIn) {
      window.location.href = '/register'
      return
    }

    setLoading(planId)
    try {
      const res = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planId }),
      })
      const data = await res.json()

      if (data.url) {
        window.location.href = data.url
      } else {
        alert(data.error || 'Unable to start checkout. Please try again.')
        setLoading(null)
      }
    } catch {
      alert('Something went wrong. Please try again.')
      setLoading(null)
    }
  }

  return (
    <div className="min-h-screen bg-white flex flex-col items-center justify-center px-4 py-16">
      {/* Header */}
      <div className="text-left mb-12 max-w-4xl w-full">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 bg-gunner-red rounded-[10px] flex items-center justify-center">
            <span className="text-white font-semibold text-ds-card">G</span>
          </div>
          <span className="text-txt-primary font-semibold text-ds-section">Gunner AI</span>
        </div>
        <h1 className="text-ds-hero font-semibold text-txt-primary mb-3">
          Choose your plan
        </h1>
        <p className="text-txt-secondary text-ds-body max-w-md">
          Every call graded. Every lead scored. Every rep coached.
          Start growing revenue today.
        </p>
      </div>

      {/* Plans grid */}
      <div className="grid md:grid-cols-3 gap-6 max-w-4xl w-full">
        {PLANS.map((plan) => (
          <div
            key={plan.id}
            className={`relative bg-white border rounded-[14px] p-6 flex flex-col ${
              plan.popular
                ? 'border-gunner-red'
                : 'border-[rgba(0,0,0,0.08)]'
            }`}
          >
            {plan.popular && (
              <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                <span className="bg-gunner-red text-white text-ds-fine font-semibold px-3 py-1 rounded-[9999px] flex items-center gap-1">
                  <Zap size={10} /> Most popular
                </span>
              </div>
            )}

            <div className="mb-6">
              <h3 className="text-ds-card font-semibold text-txt-primary">{plan.name}</h3>
              <div className="mt-3 flex items-baseline gap-1">
                <span className="text-ds-hero font-semibold text-txt-primary">${plan.price}</span>
                <span className="text-txt-muted text-ds-body">/month</span>
              </div>
            </div>

            <ul className="space-y-3 mb-8 flex-1">
              {plan.features.map((feature) => (
                <li key={feature} className="flex items-center gap-2 text-ds-body text-txt-secondary">
                  <Check size={14} className="text-gunner-red shrink-0" />
                  {feature}
                </li>
              ))}
            </ul>

            <button
              onClick={() => handleCheckout(plan.id)}
              disabled={loading !== null}
              className={`w-full py-3 rounded-[10px] font-semibold text-ds-body transition-colors ${
                plan.popular
                  ? 'bg-gunner-red hover:bg-gunner-red-dark text-white'
                  : 'bg-surface-secondary hover:bg-surface-tertiary text-txt-primary border border-[rgba(0,0,0,0.14)]'
              } disabled:opacity-40`}
            >
              {loading === plan.id ? (
                <span className="flex items-center justify-center gap-2">
                  <Loader2 size={14} className="animate-spin" /> Redirecting...
                </span>
              ) : (
                `Get ${plan.name}`
              )}
            </button>
          </div>
        ))}
      </div>

      {/* Footer */}
      <div className="mt-12 max-w-4xl w-full text-left">
        <p className="text-txt-muted text-ds-fine">
          All plans include a 14-day free trial. Cancel anytime.
        </p>
        {!isLoggedIn && (
          <p className="text-txt-secondary text-ds-body mt-4">
            Already have an account?{' '}
            <Link href="/login" className="text-gunner-red hover:text-gunner-red-dark transition-colors">
              Sign in
            </Link>
          </p>
        )}
      </div>
    </div>
  )
}
