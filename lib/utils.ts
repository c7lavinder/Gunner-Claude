// lib/utils.ts
// Shared utility functions used across the codebase

import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

// Merge Tailwind classes without conflicts
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Format call duration from seconds
export function formatDuration(seconds: number | null | undefined): string {
  if (!seconds) return '—'
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

// Generate a URL-safe slug from a string
export function slugify(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 50)
}

// Safely get tenantId from session user (avoids repetitive casting)
export function getTenantId(user: unknown): string {
  return (user as { tenantId?: string })?.tenantId ?? ''
}

export function getUserRole(user: unknown): string {
  return (user as { role?: string })?.role ?? 'LEAD_MANAGER'
}

export function getTenantSlug(user: unknown): string {
  return (user as { tenantSlug?: string })?.tenantSlug ?? ''
}
