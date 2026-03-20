'use client'
// components/ui/providers.tsx

import { SessionProvider } from 'next-auth/react'
import { ToastProvider } from '@/components/ui/toaster'

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <ToastProvider>
        {children}
      </ToastProvider>
    </SessionProvider>
  )
}
