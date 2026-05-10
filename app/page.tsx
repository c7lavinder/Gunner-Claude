// app/page.tsx
// Root route — redirects authenticated users to their Day Hub, others to login
import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth/config'

export default async function RootPage() {
  // DEV BYPASS — set DEV_BYPASS_AUTH=true and DEV_BYPASS_TENANT_SLUG=<slug>
  // to skip auth and land directly in a tenant's day-hub. No-op in prod
  // because neither var is set there.
  if (process.env.DEV_BYPASS_AUTH === 'true') {
    const devSlug = process.env.DEV_BYPASS_TENANT_SLUG
    if (devSlug) {
      redirect(`/${devSlug}/day-hub`)
    }
  }

  const session = await getServerSession(authOptions)

  if (!session?.user) {
    redirect('/login')
  }

  const tenantSlug = (session.user as { tenantSlug?: string }).tenantSlug
  const onboardingCompleted = (session.user as { onboardingCompleted?: boolean }).onboardingCompleted

  if (!tenantSlug || !onboardingCompleted) {
    redirect('/onboarding')
  }

  redirect(`/${tenantSlug}/day-hub`)
}
