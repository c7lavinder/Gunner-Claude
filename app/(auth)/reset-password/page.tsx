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
    <div className="min-h-screen bg-[#0f1117] flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-2 mb-8">
          <div className="w-8 h-8 rounded-lg bg-orange-500 flex items-center justify-center">
            <span className="text-white font-bold text-sm">G</span>
          </div>
          <span className="text-white font-semibold">Gunner AI</span>
        </div>

        {done ? (
          <div className="bg-[#1a1d27] border border-white/10 rounded-2xl p-6 text-center">
            <Check size={32} className="text-green-400 mx-auto mb-3" />
            <h2 className="text-lg font-semibold text-white mb-2">Check your email</h2>
            <p className="text-sm text-gray-400 mb-4">
              If an account exists for {email}, we've sent a temporary password.
            </p>
            <Link href="/login" className="text-sm text-orange-400 hover:text-orange-300">
              Back to login
            </Link>
          </div>
        ) : (
          <div className="bg-[#1a1d27] border border-white/10 rounded-2xl p-6">
            <h2 className="text-lg font-semibold text-white mb-1">Reset password</h2>
            <p className="text-sm text-gray-400 mb-6">Enter your email and we'll send a temporary password.</p>

            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="your@email.com"
              className="w-full bg-[#0f1117] border border-white/10 rounded-lg px-4 py-3 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-orange-500 mb-3"
              onKeyDown={e => e.key === 'Enter' && handleReset()}
            />

            {error && <p className="text-xs text-red-400 mb-3">{error}</p>}

            <button
              onClick={handleReset}
              disabled={!email || loading}
              className="w-full bg-orange-500 hover:bg-orange-600 disabled:opacity-40 text-white font-medium py-3 rounded-lg text-sm transition-colors"
            >
              {loading ? <Loader2 size={14} className="animate-spin mx-auto" /> : 'Send reset email'}
            </button>

            <Link href="/login" className="flex items-center gap-1 text-sm text-gray-400 hover:text-white mt-4 justify-center">
              <ArrowLeft size={12} /> Back to login
            </Link>
          </div>
        )}
      </div>
    </div>
  )
}
