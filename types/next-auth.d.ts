// types/next-auth.d.ts
// Extends NextAuth v4 types with our custom session fields

import type { DefaultSession, DefaultUser } from 'next-auth'
import type { JWT, DefaultJWT } from 'next-auth/jwt'

declare module 'next-auth' {
  interface Session {
    user: {
      id: string
      role: string
      tenantId: string
      tenantSlug: string
      onboardingCompleted: boolean
    } & DefaultSession['user']
  }

  interface User extends DefaultUser {
    role: string
    tenantId: string
    tenantSlug: string
    onboardingCompleted: boolean
  }
}

declare module 'next-auth/jwt' {
  interface JWT extends DefaultJWT {
    id: string
    role: string
    tenantId: string
    tenantSlug: string
    onboardingCompleted: boolean
  }
}
