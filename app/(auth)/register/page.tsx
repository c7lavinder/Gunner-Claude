'use client'
// app/(auth)/register/page.tsx

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { signIn } from 'next-auth/react'
import { AuthLogo, AuthCard, AuthFooterLink, AUTH_INPUT_CLS, AUTH_BTN_CLS, AUTH_ERROR_CLS, AUTH_LABEL_CLS } from '@/components/auth/auth-ui'

export default function RegisterPage() {
  const router = useRouter()
  const [form, setForm] = useState({
    companyName: '',
    name: '',
    email: '',
    password: '',
  })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  function update(field: keyof typeof form) {
    return (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm((f) => ({ ...f, [field]: e.target.value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    // Register the tenant + owner
    const res = await fetch('/api/tenants/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })

    const data = await res.json()

    if (!res.ok) {
      setError(data.error ?? 'Registration failed')
      setLoading(false)
      return
    }

    // Auto sign-in after registration
    const result = await signIn('credentials', {
      email: form.email,
      password: form.password,
      redirect: false,
    })

    if (result?.error) {
      setError('Account created but sign-in failed. Please log in.')
      router.push('/login')
      return
    }

    // Go straight to onboarding
    router.push('/onboarding')
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-white px-4">
      <div className="w-full max-w-md">
        <AuthLogo tagline="Create your team's command center" />

        <AuthCard>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className={AUTH_LABEL_CLS}>Company name</label>
              <input type="text" value={form.companyName} onChange={update('companyName')} required placeholder="Apex Wholesaling" className={AUTH_INPUT_CLS} />
              {form.companyName && (
                <p className="mt-1 text-ds-fine text-txt-muted">
                  Your URL: <span className="text-gunner-red">gunnerai.com/{form.companyName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}</span>
                </p>
              )}
            </div>

            <div>
              <label className={AUTH_LABEL_CLS}>Your name</label>
              <input type="text" value={form.name} onChange={update('name')} required placeholder="Alex Johnson" className={AUTH_INPUT_CLS} />
            </div>

            <div>
              <label className={AUTH_LABEL_CLS}>Work email</label>
              <input type="email" value={form.email} onChange={update('email')} required placeholder="alex@company.com" className={AUTH_INPUT_CLS} />
            </div>

            <div>
              <label className={AUTH_LABEL_CLS}>Password</label>
              <input type="password" value={form.password} onChange={update('password')} required minLength={8} placeholder="Min. 8 characters" className={AUTH_INPUT_CLS} />
            </div>

            {error && <div className={AUTH_ERROR_CLS}>{error}</div>}

            <button type="submit" disabled={loading} className={`${AUTH_BTN_CLS} py-3 mt-2`}>
              {loading ? 'Creating your account…' : 'Create account — free'}
            </button>
          </form>

          <AuthFooterLink text="Already have an account?" linkText="Sign in" href="/login" />
        </AuthCard>

        <p className="mt-4 text-left text-ds-fine text-txt-muted">
          By signing up you agree to our Terms of Service and Privacy Policy
        </p>
      </div>
    </div>
  )
}
