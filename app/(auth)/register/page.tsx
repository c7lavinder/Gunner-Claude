'use client'
// app/(auth)/register/page.tsx

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { signIn } from 'next-auth/react'
import Link from 'next/link'

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
        {/* Logo */}
        <div className="text-left mb-8">
          <div className="inline-flex items-center gap-2 mb-3">
            <div className="w-8 h-8 rounded-[10px] bg-gunner-red flex items-center justify-center">
              <span className="text-white font-semibold text-ds-body">G</span>
            </div>
            <span className="text-txt-primary font-semibold text-ds-section">Gunner AI</span>
          </div>
          <p className="text-txt-secondary text-ds-body">Create your team's command center</p>
        </div>

        {/* Card */}
        <div className="bg-white border border-[rgba(0,0,0,0.08)] rounded-[14px] p-8">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-ds-label text-txt-primary font-medium mb-1.5">Company name</label>
              <input
                type="text"
                value={form.companyName}
                onChange={update('companyName')}
                required
                placeholder="Apex Wholesaling"
                className="w-full bg-surface-secondary border border-[rgba(0,0,0,0.08)] rounded-[10px] px-4 py-2.5 text-txt-primary placeholder-txt-muted text-ds-body focus:outline-none focus:border-[rgba(0,0,0,0.14)] transition-colors"
              />
              {form.companyName && (
                <p className="mt-1 text-ds-fine text-txt-muted">
                  Your URL:{' '}
                  <span className="text-gunner-red">
                    gunnerai.com/{form.companyName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}
                  </span>
                </p>
              )}
            </div>

            <div>
              <label className="block text-ds-label text-txt-primary font-medium mb-1.5">Your name</label>
              <input
                type="text"
                value={form.name}
                onChange={update('name')}
                required
                placeholder="Alex Johnson"
                className="w-full bg-surface-secondary border border-[rgba(0,0,0,0.08)] rounded-[10px] px-4 py-2.5 text-txt-primary placeholder-txt-muted text-ds-body focus:outline-none focus:border-[rgba(0,0,0,0.14)] transition-colors"
              />
            </div>

            <div>
              <label className="block text-ds-label text-txt-primary font-medium mb-1.5">Work email</label>
              <input
                type="email"
                value={form.email}
                onChange={update('email')}
                required
                placeholder="alex@company.com"
                className="w-full bg-surface-secondary border border-[rgba(0,0,0,0.08)] rounded-[10px] px-4 py-2.5 text-txt-primary placeholder-txt-muted text-ds-body focus:outline-none focus:border-[rgba(0,0,0,0.14)] transition-colors"
              />
            </div>

            <div>
              <label className="block text-ds-label text-txt-primary font-medium mb-1.5">Password</label>
              <input
                type="password"
                value={form.password}
                onChange={update('password')}
                required
                minLength={8}
                placeholder="Min. 8 characters"
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
              className="w-full bg-gunner-red hover:bg-gunner-red-dark disabled:opacity-50 text-white font-semibold rounded-[10px] py-3 text-ds-body transition-colors mt-2"
            >
              {loading ? 'Creating your account…' : 'Create account — free'}
            </button>
          </form>

          <p className="mt-6 text-left text-ds-body text-txt-muted">
            Already have an account?{' '}
            <Link href="/login" className="text-gunner-red hover:text-gunner-red-dark transition-colors">
              Sign in
            </Link>
          </p>
        </div>

        <p className="mt-4 text-left text-ds-fine text-txt-muted">
          By signing up you agree to our Terms of Service and Privacy Policy
        </p>
      </div>
    </div>
  )
}
