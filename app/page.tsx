// app/page.tsx
// Root route — redirects authenticated users to their Day Hub, others to login
import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth/config'

export default async function RootPage() {
  // TEMP: DEV BYPASS — remove this if-block to restore normal auth
  if (process.env.DEV_BYPASS_AUTH === 'true') {
    redirect('/apex-dev/day-hub')
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
