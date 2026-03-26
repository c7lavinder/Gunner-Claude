// lib/format.ts — Shared formatting utilities

/** Format phone as (XXX) XXX-XXXX. No +1 prefix. */
export function formatPhone(phone: string | null | undefined): string {
  if (!phone) return ''
  const digits = phone.replace(/\D/g, '')
  // Strip +1 country code
  const clean = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits
  if (clean.length === 10) {
    return `(${clean.slice(0, 3)}) ${clean.slice(3, 6)}-${clean.slice(6)}`
  }
  return phone // return original if can't parse
}

/** Format currency */
export function formatCurrency(value: string | number | null | undefined): string | null {
  if (value == null || value === '') return null
  const num = typeof value === 'string' ? parseFloat(value) : value
  if (isNaN(num)) return null
  return `$${num.toLocaleString()}`
}

/** Title case a name */
export function titleCase(name: string | null | undefined): string {
  if (!name) return ''
  return name.replace(/\b\w/g, c => c.toUpperCase())
}
