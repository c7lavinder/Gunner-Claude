// lib/buyers/sync.ts
// Syncs buyer data from GHL contacts into the local Buyer table
// Called by: webhook handlers, manual sync endpoint, initial population

import { db } from '@/lib/db/client'
import { getGHLClient } from '@/lib/ghl/client'

// GHL custom field ID → field name mapping
const GHL_FIELD_MAP: Record<string, string> = {
  'Y4ton500NvCkJKtb4YzP': 'buyer_tier',
  'ghOapC4jq1iSzmCzv5up': 'markets',
  'VcdWDP2lXuuV1LwedOhs': 'buybox',
  'RbNnV6OxCiF6ai2krkyy': 'response_speed',
  'IZdG26j5rw0yiU1jvDEo': 'verified_funding',
  'FRyMcgqWes9BuWqo97HF': 'last_contact_date',
  '4qyjtjm5DWVgFgMCHdqQ': 'notes',
  'DOGXpCgOc2jMoWwY4dpc': 'secondary_market',
}

const TIER_MAP: Record<string, string> = {
  'Priority': 'priority', 'Qualified': 'qualified', 'JV': 'jv', 'JV Partner': 'jv',
  'Unqualified': 'unqualified', 'Halted': 'halted',
  'A': 'priority', 'B': 'qualified', 'C': 'jv', 'Cold': 'unqualified',
}

function parseGHLContact(contact: {
  id: string; firstName?: string; lastName?: string; phone?: string; email?: string
  city?: string; state?: string; tags?: string[]
  customFields?: Array<{ id: string; value: unknown }>
}) {
  const fields = contact.customFields ?? []
  const fieldMap = new Map<string, unknown>()
  for (const f of fields) {
    const name = GHL_FIELD_MAP[f.id]
    if (name) fieldMap.set(name, f.value)
  }

  const getStr = (key: string): string => {
    const v = fieldMap.get(key)
    if (!v) return ''
    if (Array.isArray(v)) return v.join(', ')
    return String(v)
  }
  const getArr = (key: string): string[] => {
    const v = fieldMap.get(key)
    if (!v) return []
    if (Array.isArray(v)) return v.map(String)
    return String(v).split(/[,;|]/).map(m => m.trim()).filter(Boolean)
  }

  const tierRaw = getStr('buyer_tier')
  const tier = TIER_MAP[tierRaw] ?? 'unqualified'
  const fundingVal = getStr('verified_funding').toLowerCase()
  const verifiedFunding = fundingVal === 'yes' || fundingVal === 'true'
  const markets = getArr('markets')
  const secondaryMarkets = getArr('secondary_market')
  const buybox = getStr('buybox')
  const responseSpeed = getStr('response_speed')
  const buyerNotes = getStr('notes')

  // Fallback markets from tags or city
  let finalMarkets = markets
  if (finalMarkets.length === 0 && contact.tags?.length) {
    finalMarkets = contact.tags.filter(t => !['buyer', 'flipper', 'rental', 'wholesale'].includes(t.toLowerCase()))
  }
  if (finalMarkets.length === 0 && contact.city) {
    finalMarkets = [contact.city]
  }

  const phoneDigits = (contact.phone ?? '').replace(/\D/g, '')
  const phone = phoneDigits.length === 10 ? `+1${phoneDigits}` : phoneDigits.length === 11 ? `+${phoneDigits}` : contact.phone ?? null

  return {
    name: `${contact.firstName ?? ''} ${contact.lastName ?? ''}`.trim(),
    phone, email: contact.email ?? null,
    ghlContactId: contact.id,
    markets: finalMarkets,
    criteria: { tier, buybox, secondaryMarkets, verifiedFunding, hasPurchased: false, responseSpeed },
    tags: contact.tags ?? [],
    notes: buyerNotes || null,
  }
}

// Upsert a single buyer from GHL contact data
export async function syncBuyerFromGHL(
  tenantId: string,
  contact: Parameters<typeof parseGHLContact>[0],
) {
  const parsed = parseGHLContact(contact)

  await db.buyer.upsert({
    where: { id: `ghl_${contact.id}` },
    create: {
      id: `ghl_${contact.id}`,
      tenantId,
      name: parsed.name,
      phone: parsed.phone,
      email: parsed.email,
      ghlContactId: parsed.ghlContactId,
      markets: parsed.markets,
      criteria: JSON.parse(JSON.stringify(parsed.criteria)),
      tags: parsed.tags,
      notes: parsed.notes,
      isActive: true,
    },
    update: {
      name: parsed.name,
      phone: parsed.phone,
      email: parsed.email,
      markets: parsed.markets,
      criteria: JSON.parse(JSON.stringify(parsed.criteria)),
      tags: parsed.tags,
      notes: parsed.notes,
      isActive: true,
    },
  })

  return parsed
}

// Full sync: pull ALL buyers from GHL buyer pipeline into DB
export async function syncAllBuyersFromGHL(tenantId: string): Promise<number> {
  const ghl = await getGHLClient(tenantId)
  const pipelines = await ghl.getPipelines()
  const buyerPipeline = pipelines.pipelines?.find(p => p.name.toLowerCase().includes('buyer'))
  if (!buyerPipeline) {
    console.warn('[BuyerSync] No buyer pipeline found')
    return 0
  }

  console.log(`[BuyerSync] Full sync from pipeline: ${buyerPipeline.name}`)
  const contactIds = await ghl.getAllPipelineContacts(buyerPipeline.id)
  console.log(`[BuyerSync] Found ${contactIds.length} contacts`)

  let synced = 0
  for (let i = 0; i < contactIds.length; i += 20) {
    const batch = contactIds.slice(i, i + 20)
    const contacts = await Promise.all(batch.map(id => ghl.getContact(id).catch(() => null)))
    for (const c of contacts) {
      if (!c) continue
      try {
        await syncBuyerFromGHL(tenantId, {
          id: c.id, firstName: c.firstName, lastName: c.lastName,
          phone: c.phone, email: c.email, city: c.city, state: c.state,
          tags: c.tags ?? [], customFields: c.customFields ?? [],
        })
        synced++
      } catch {}
    }
    if ((i + 20) % 100 === 0) console.log(`[BuyerSync] Progress: ${Math.min(i + 20, contactIds.length)}/${contactIds.length}`)
  }

  console.log(`[BuyerSync] Synced ${synced} buyers`)
  return synced
}
