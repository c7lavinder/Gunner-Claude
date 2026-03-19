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
    <div className="min-h-screen flex items-center justify-center bg-[#0f1117] px-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 mb-3">
            <div className="w-8 h-8 rounded-lg bg-orange-500 flex items-center justify-center">
              <span className="text-white font-bold text-sm">G</span>
            </div>
            <span className="text-white font-semibold text-xl">Gunner AI</span>
          </div>
          <p className="text-gray-400 text-sm">Create your team's command center</p>
        </div>

        {/* Card */}
        <div className="bg-[#1a1d27] border border-white/10 rounded-2xl p-8">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm text-gray-300 mb-1.5">Company name</label>
              <input
                type="text"
                value={form.companyName}
                onChange={update('companyName')}
                required
                placeholder="Apex Wholesaling"
                className="w-full bg-[#0f1117] border border-white/10 rounded-lg px-4 py-2.5 text-white placeholder-gray-500 text-sm focus:outline-none focus:border-orange-500 transition-colors"
              />
              {form.companyName && (
                <p className="mt-1 text-xs text-gray-500">
                  Your URL:{' '}
                  <span className="text-orange-400">
                    gunnerai.com/{form.companyName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}
                  </span>
                </p>
              )}
            </div>

            <div>
              <label className="block text-sm text-gray-300 mb-1.5">Your name</label>
              <input
                type="text"
                value={form.name}
                onChange={update('name')}
                required
                placeholder="Alex Johnson"
                className="w-full bg-[#0f1117] border border-white/10 rounded-lg px-4 py-2.5 text-white placeholder-gray-500 text-sm focus:outline-none focus:border-orange-500 transition-colors"
              />
            </div>

            <div>
              <label className="block text-sm text-gray-300 mb-1.5">Work email</label>
              <input
                type="email"
                value={form.email}
                onChange={update('email')}
                required
                placeholder="alex@company.com"
                className="w-full bg-[#0f1117] border border-white/10 rounded-lg px-4 py-2.5 text-white placeholder-gray-500 text-sm focus:outline-none focus:border-orange-500 transition-colors"
              />
            </div>

            <div>
              <label className="block text-sm text-gray-300 mb-1.5">Password</label>
              <input
                type="password"
                value={form.password}
                onChange={update('password')}
                required
                minLength={8}
                placeholder="Min. 8 characters"
                className="w-full bg-[#0f1117] border border-white/10 rounded-lg px-4 py-2.5 text-white placeholder-gray-500 text-sm focus:outline-none focus:border-orange-500 transition-colors"
              />
            </div>

            {error && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-2.5 text-red-400 text-sm">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white font-medium rounded-lg py-3 text-sm transition-colors mt-2"
            >
              {loading ? 'Creating your account…' : 'Create account — free'}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-gray-500">
            Already have an account?{' '}
            <Link href="/login" className="text-orange-400 hover:text-orange-300 transition-colors">
              Sign in
            </Link>
          </p>
        </div>

        <p className="mt-4 text-center text-xs text-gray-600">
          By signing up you agree to our Terms of Service and Privacy Policy
        </p>
      </div>
    </div>
  )
}
