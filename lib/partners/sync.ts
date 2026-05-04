// lib/partners/sync.ts
//
// Bridges GHL contacts → local Partner rows. Partners are scattered
// across normal GHL contacts (no dedicated pipeline), so we don't have
// a bulk-pipeline-sync path like buyers/sync.ts does. Instead this file
// gives the property-detail "Link Partner" modal a single helper that
// either reuses an existing Partner row matched on ghlContactId OR
// creates a new one from the GHL contact's name/phone/email.
//
// Recognized values for `types`: agent | wholesaler | attorney | title |
// lender | inspector | contractor | photographer | property_manager |
// other. Validated minimally — the field is a free JSON array so adding
// new values requires no schema change.

import { db } from '@/lib/db/client'
import type { Prisma } from '@prisma/client'

export const PARTNER_TYPES = [
  'agent',
  'wholesaler',
  'attorney',
  'title',
  'lender',
  'inspector',
  'contractor',
  'photographer',
  'property_manager',
  'other',
] as const

export type PartnerType = (typeof PARTNER_TYPES)[number]

export function isPartnerType(v: unknown): v is PartnerType {
  return typeof v === 'string' && (PARTNER_TYPES as readonly string[]).includes(v)
}

function normalizeTypes(input: unknown): PartnerType[] {
  if (!Array.isArray(input)) return []
  const out: PartnerType[] = []
  for (const t of input) {
    if (typeof t !== 'string') continue
    const lc = t.trim().toLowerCase()
    if (isPartnerType(lc) && !out.includes(lc)) out.push(lc)
  }
  return out
}

function normalizePhone(phone: string | null | undefined): string | null {
  if (!phone) return null
  const digits = phone.replace(/\D/g, '')
  if (digits.length === 10) return `+1${digits}`
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`
  return phone
}

export interface UpsertPartnerInput {
  tenantId: string
  ghlContactId: string
  name: string
  phone?: string | null
  email?: string | null
  company?: string | null
  /** Types to set on the partner row — merged with any existing types. */
  types?: PartnerType[]
}

/**
 * Upsert a Partner row keyed on (tenantId, ghlContactId). If a row
 * already exists for the GHL contact, merges the types arrays and
 * refreshes name/phone/email/company; never overwrites with empty.
 *
 * Returns the resolved Partner id (existing or newly created).
 */
export async function upsertPartnerFromGHL(input: UpsertPartnerInput): Promise<string> {
  const types = normalizeTypes(input.types ?? [])
  const phone = normalizePhone(input.phone ?? null)
  const email = input.email?.trim() || null
  const company = input.company?.trim() || null

  const existing = await db.partner.findFirst({
    where: { tenantId: input.tenantId, ghlContactId: input.ghlContactId },
    select: { id: true, types: true },
  })

  if (existing) {
    const currentTypes = normalizeTypes(existing.types)
    const mergedTypes = Array.from(new Set([...currentTypes, ...types]))
    const update: Prisma.PartnerUpdateInput = {
      name: input.name,
      types: mergedTypes,
    }
    // Only refresh contact details when we have a non-empty value — never
    // wipe a populated field with null/empty from a partial GHL payload.
    if (phone) update.phone = phone
    if (email) update.email = email
    if (company) update.company = company
    await db.partner.update({ where: { id: existing.id }, data: update })
    return existing.id
  }

  const created = await db.partner.create({
    data: {
      tenantId: input.tenantId,
      ghlContactId: input.ghlContactId,
      name: input.name,
      phone,
      email,
      company,
      types,
    },
    select: { id: true },
  })
  return created.id
}
