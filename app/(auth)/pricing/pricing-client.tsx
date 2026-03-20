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
    <div className="min-h-screen bg-[#0f1117] flex flex-col items-center justify-center px-4 py-16">
      {/* Header */}
      <div className="text-center mb-12">
        <div className="flex items-center justify-center gap-3 mb-6">
          <div className="w-10 h-10 bg-orange-500 rounded-xl flex items-center justify-center">
            <span className="text-white font-bold text-lg">G</span>
          </div>
          <span className="text-white font-semibold text-xl">Gunner AI</span>
        </div>
        <h1 className="text-3xl font-bold text-white mb-3">
          Choose your plan
        </h1>
        <p className="text-gray-400 max-w-md mx-auto">
          Every call graded. Every lead scored. Every rep coached.
          Start growing revenue today.
        </p>
      </div>

      {/* Plans grid */}
      <div className="grid md:grid-cols-3 gap-6 max-w-4xl w-full">
        {PLANS.map((plan) => (
          <div
            key={plan.id}
            className={`relative bg-[#1a1d27] border rounded-2xl p-6 flex flex-col ${
              plan.popular
                ? 'border-orange-500 shadow-lg shadow-orange-500/10'
                : 'border-white/10'
            }`}
          >
            {plan.popular && (
              <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                <span className="bg-orange-500 text-white text-xs font-semibold px-3 py-1 rounded-full flex items-center gap-1">
                  <Zap size={10} /> Most popular
                </span>
              </div>
            )}

            <div className="mb-6">
              <h3 className="text-lg font-semibold text-white">{plan.name}</h3>
              <div className="mt-3 flex items-baseline gap-1">
                <span className="text-4xl font-bold text-white">${plan.price}</span>
                <span className="text-gray-500 text-sm">/month</span>
              </div>
            </div>

            <ul className="space-y-3 mb-8 flex-1">
              {plan.features.map((feature) => (
                <li key={feature} className="flex items-center gap-2 text-sm text-gray-300">
                  <Check size={14} className="text-orange-400 shrink-0" />
                  {feature}
                </li>
              ))}
            </ul>

            <button
              onClick={() => handleCheckout(plan.id)}
              disabled={loading !== null}
              className={`w-full py-3 rounded-xl font-semibold text-sm transition-colors ${
                plan.popular
                  ? 'bg-orange-500 hover:bg-orange-600 text-white'
                  : 'bg-white/5 hover:bg-white/10 text-white border border-white/10'
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
      <div className="mt-12 text-center">
        <p className="text-gray-600 text-xs">
          All plans include a 14-day free trial. Cancel anytime.
        </p>
        {!isLoggedIn && (
          <p className="text-gray-500 text-sm mt-4">
            Already have an account?{' '}
            <Link href="/login" className="text-orange-400 hover:text-orange-300">
              Sign in
            </Link>
          </p>
        )}
      </div>
    </div>
  )
}
