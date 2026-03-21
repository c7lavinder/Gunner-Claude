import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './pages/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './app/**/*.{ts,tsx}',
    './src/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        // Gunner Design System
        gunner: {
          red: '#C0392B',
          'red-light': '#FAEDEC',
          'red-dark': '#922B21',
        },
        surface: {
          primary: '#FFFFFF',
          secondary: '#F8F7F4',
          tertiary: '#F0EEE9',
        },
        txt: {
          primary: '#1A1A18',
          secondary: '#6B6B66',
          muted: '#9B9A94',
        },
        semantic: {
          green: '#1D9E75',
          'green-bg': '#E1F5EE',
          amber: '#BA7517',
          'amber-bg': '#FAEEDA',
          red: '#A32D2D',
          'red-bg': '#FCEBEB',
          blue: '#185FA5',
          'blue-bg': '#E6F1FB',
          purple: '#534AB7',
          'purple-bg': '#EEEDFE',
        },
        // Shadcn compat
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      fontSize: {
        'ds-fine': ['11px', { lineHeight: '16px' }],
        'ds-body': ['13px', { lineHeight: '20px' }],
        'ds-label': ['14px', { lineHeight: '20px' }],
        'ds-card': ['15px', { lineHeight: '22px' }],
        'ds-section': ['20px', { lineHeight: '28px' }],
        'ds-page': ['24px', { lineHeight: '32px' }],
        'ds-hero': ['30px', { lineHeight: '36px' }],
      },
      boxShadow: {
        'ds-float': '0 1px 2px rgba(0,0,0,0.06)',
      },
      keyframes: {
        'accordion-down': {
          from: { height: '0' },
          to: { height: 'var(--radix-accordion-content-height)' },
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to: { height: 'var(--radix-accordion-content-height)' },
        },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
}

export default config
