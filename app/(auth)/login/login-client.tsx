'use client'

import { useState } from 'react'
import { signIn } from 'next-auth/react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'

export default function LoginClient() {
  const router = useRouter()
  const params = useSearchParams()
  const callbackUrl = params.get('callbackUrl') ?? '/'

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const result = await signIn('credentials', {
      email,
      password,
      redirect: false,
    })

    if (result?.error) {
      setError('Invalid email or password')
      setLoading(false)
      return
    }

    router.push(callbackUrl)
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-white px-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-left mb-8">
          <div className="inline-flex items-center gap-2 mb-3">
            <div className="w-8 h-8 rounded-[10px] bg-gunner-red flex items-center justify-center">
              <span className="text-white font-semibold text-ds-body">G</span>
            </div>
            <span className="text-txt-primary font-semibold text-ds-section">Gunner AI</span>
          </div>
          <p className="text-txt-secondary text-ds-body">Sign in to your command center</p>
        </div>

        {/* Card */}
        <div className="bg-white border border-[rgba(0,0,0,0.08)] rounded-[14px] p-8">
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-ds-label text-txt-primary font-medium mb-1.5">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="you@company.com"
                className="w-full bg-surface-secondary border border-[rgba(0,0,0,0.08)] rounded-[10px] px-4 py-2.5 text-txt-primary placeholder-txt-muted text-ds-body focus:outline-none focus:border-[rgba(0,0,0,0.14)] transition-colors"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-ds-label text-txt-primary font-medium">Password</label>
                <a href="/reset-password" className="text-ds-fine text-gunner-red hover:text-gunner-red-dark transition-colors">Forgot password?</a>
              </div>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                placeholder="••••••••"
                className="w-full bg-surface-secondary border border-[rgba(0,0,0,0.08)] rounded-[10px] px-4 py-2.5 text-txt-primary placeholder-txt-muted text-ds-body focus:outline-none focus:border-[rgba(0,0,0,0.14)] transition-colors"
              />
            </div>

            {error && (
              <div className="bg-semantic-red-bg border border-semantic-red/20 rounded-[10px] px-4 py-2.5 text-semantic-red text-ds-body">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-gunner-red hover:bg-gunner-red-dark disabled:opacity-50 text-white font-semibold rounded-[10px] py-2.5 text-ds-body transition-colors"
            >
              {loading ? 'Signing in…' : 'Sign in'}
            </button>
          </form>

          <p className="mt-6 text-left text-ds-body text-txt-muted">
            No account?{' '}
            <Link href="/register" className="text-gunner-red hover:text-gunner-red-dark transition-colors">
              Create one free
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
