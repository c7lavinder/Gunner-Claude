'use client'
// app/(auth)/reset-password/page.tsx
// Simple password reset — user enters email, gets temp password set
// MVP: resets directly in DB (no email token flow yet)

import { useState } from 'react'
import Link from 'next/link'
import { Loader2, ArrowLeft, Check } from 'lucide-react'

export default function ResetPasswordPage() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')

  async function handleReset() {
    if (!email) return
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      if (res.ok) {
        setDone(true)
      } else {
        const data = await res.json()
        setError(data.error || 'Failed to reset password')
      }
    } catch {
      setError('Something went wrong')
    }
    setLoading(false)
  }

  return (
    <div className="min-h-screen bg-white flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-2 mb-8">
          <div className="w-8 h-8 rounded-[10px] bg-gunner-red flex items-center justify-center">
            <span className="text-white font-semibold text-ds-body">G</span>
          </div>
          <span className="text-txt-primary font-semibold text-ds-section">Gunner AI</span>
        </div>

        {done ? (
          <div className="bg-white border border-[rgba(0,0,0,0.08)] rounded-[14px] p-6">
            <Check size={32} className="text-semantic-green mb-3" />
            <h2 className="text-ds-section font-semibold text-txt-primary mb-2">Check your email</h2>
            <p className="text-ds-body text-txt-secondary mb-4">
              If an account exists for {email}, we've sent a temporary password.
            </p>
            <Link href="/login" className="text-ds-body text-gunner-red hover:text-gunner-red-dark transition-colors">
              Back to login
            </Link>
          </div>
        ) : (
          <div className="bg-white border border-[rgba(0,0,0,0.08)] rounded-[14px] p-6">
            <h2 className="text-ds-section font-semibold text-txt-primary mb-1">Reset password</h2>
            <p className="text-ds-body text-txt-secondary mb-6">Enter your email and we'll send a temporary password.</p>

            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="your@email.com"
              className="w-full bg-surface-secondary border border-[rgba(0,0,0,0.08)] rounded-[10px] px-4 py-3 text-ds-body text-txt-primary placeholder-txt-muted focus:outline-none focus:border-[rgba(0,0,0,0.14)] transition-colors mb-3"
              onKeyDown={e => e.key === 'Enter' && handleReset()}
            />

            {error && <p className="text-ds-fine text-semantic-red mb-3">{error}</p>}

            <button
              onClick={handleReset}
              disabled={!email || loading}
              className="w-full bg-gunner-red hover:bg-gunner-red-dark disabled:opacity-40 text-white font-semibold py-3 rounded-[10px] text-ds-body transition-colors"
            >
              {loading ? <Loader2 size={14} className="animate-spin mx-auto" /> : 'Send reset email'}
            </button>

            <Link href="/login" className="flex items-center gap-1 text-ds-body text-txt-secondary hover:text-txt-primary mt-4 justify-center transition-colors">
              <ArrowLeft size={12} /> Back to login
            </Link>
          </div>
        )}
      </div>
    </div>
  )
}
