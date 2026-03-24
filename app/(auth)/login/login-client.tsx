'use client'

import { useState } from 'react'
import { signIn } from 'next-auth/react'
import { useRouter, useSearchParams } from 'next/navigation'
import { AuthLogo, AuthCard, AuthFooterLink, AUTH_INPUT_CLS, AUTH_BTN_CLS, AUTH_ERROR_CLS, AUTH_LABEL_CLS } from '@/components/auth/auth-ui'

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
        <AuthLogo tagline="Sign in to your command center" />

        <AuthCard>
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className={AUTH_LABEL_CLS}>Email</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="you@company.com" className={AUTH_INPUT_CLS} />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-ds-label text-txt-primary font-medium">Password</label>
                <a href="/reset-password" className="text-ds-fine text-gunner-red hover:text-gunner-red-dark transition-colors">Forgot password?</a>
              </div>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required placeholder="••••••••" className={AUTH_INPUT_CLS} />
            </div>

            {error && <div className={AUTH_ERROR_CLS}>{error}</div>}

            <button type="submit" disabled={loading} className={AUTH_BTN_CLS}>
              {loading ? 'Signing in…' : 'Sign in'}
            </button>
          </form>

          <AuthFooterLink text="No account?" linkText="Create one free" href="/register" />
        </AuthCard>
      </div>
    </div>
  )
}
