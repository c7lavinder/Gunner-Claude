'use client'
// app/(auth)/reset-password/page.tsx

import { useState } from 'react'
import Link from 'next/link'
import { Loader2, ArrowLeft, Check } from 'lucide-react'
import { AuthLogo, AuthCard, AUTH_INPUT_CLS, AUTH_BTN_CLS } from '@/components/auth/auth-ui'

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
        <AuthLogo tagline="Reset your password" />

        {done ? (
          <AuthCard>
            <Check size={32} className="text-semantic-green mb-3" />
            <h2 className="text-ds-section font-semibold text-txt-primary mb-2">Check your email</h2>
            <p className="text-ds-body text-txt-secondary mb-4">
              If an account exists for {email}, we&apos;ve sent a temporary password.
            </p>
            <Link href="/login" className="text-ds-body text-gunner-red hover:text-gunner-red-dark transition-colors">
              Back to login
            </Link>
          </AuthCard>
        ) : (
          <AuthCard>
            <h2 className="text-ds-section font-semibold text-txt-primary mb-1">Reset password</h2>
            <p className="text-ds-body text-txt-secondary mb-6">Enter your email and we&apos;ll send a temporary password.</p>

            <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="your@email.com" className={`${AUTH_INPUT_CLS} mb-3`} onKeyDown={e => e.key === 'Enter' && handleReset()} />

            {error && <p className="text-ds-fine text-semantic-red mb-3">{error}</p>}

            <button onClick={handleReset} disabled={!email || loading} className={`${AUTH_BTN_CLS} py-3`}>
              {loading ? <Loader2 size={14} className="animate-spin mx-auto" /> : 'Send reset email'}
            </button>

            <Link href="/login" className="flex items-center gap-1 text-ds-body text-txt-secondary hover:text-txt-primary mt-4 justify-center transition-colors">
              <ArrowLeft size={12} /> Back to login
            </Link>
          </AuthCard>
        )}
      </div>
    </div>
  )
}
