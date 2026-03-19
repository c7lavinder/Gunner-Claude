// app/(auth)/onboarding/page.tsx
import { Suspense } from 'react'
import OnboardingClient from './onboarding-client'

export default function OnboardingPage() {
  return (
    <Suspense>
      <OnboardingClient />
    </Suspense>
  )
}
