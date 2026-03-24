// components/auth/auth-ui.tsx
// Shared auth page styles and components to eliminate duplication across login/register/reset/onboarding

import Link from 'next/link'

export const AUTH_INPUT_CLS = 'w-full bg-surface-secondary border border-[rgba(0,0,0,0.08)] rounded-[10px] px-4 py-2.5 text-txt-primary placeholder-txt-muted text-ds-body focus:outline-none focus:border-[rgba(0,0,0,0.14)] transition-colors'

export const AUTH_BTN_CLS = 'w-full bg-gunner-red hover:bg-gunner-red-dark disabled:opacity-50 text-white font-semibold rounded-[10px] py-2.5 text-ds-body transition-colors'

export const AUTH_ERROR_CLS = 'bg-semantic-red-bg border border-semantic-red/20 rounded-[10px] px-4 py-2.5 text-semantic-red text-ds-body'

export const AUTH_LABEL_CLS = 'block text-ds-label text-txt-primary font-medium mb-1.5'

export function AuthLogo({ tagline }: { tagline: string }) {
  return (
    <div className="text-left mb-8">
      <div className="inline-flex items-center gap-2 mb-3">
        <div className="w-8 h-8 rounded-[10px] bg-gunner-red flex items-center justify-center">
          <span className="text-white font-semibold text-ds-body">G</span>
        </div>
        <span className="text-txt-primary font-semibold text-ds-section">Gunner AI</span>
      </div>
      <p className="text-txt-secondary text-ds-body">{tagline}</p>
    </div>
  )
}

export function AuthCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-white border border-[rgba(0,0,0,0.08)] rounded-[14px] p-8">
      {children}
    </div>
  )
}

export function AuthFooterLink({ text, linkText, href }: { text: string; linkText: string; href: string }) {
  return (
    <p className="mt-6 text-left text-ds-body text-txt-muted">
      {text}{' '}
      <Link href={href} className="text-gunner-red hover:text-gunner-red-dark transition-colors">
        {linkText}
      </Link>
    </p>
  )
}
