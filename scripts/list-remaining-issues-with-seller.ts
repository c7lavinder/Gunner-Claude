#!/usr/bin/env -S npx tsx
// scripts/list-remaining-issues-with-seller.ts
// Surface every Property still flagged by audit-property-addresses.ts
// (post-merge, post-cleanup) with the linked seller's name + phone.
// Grouped by issue category for triage.

import { db } from '../lib/db/client'

const US_STATES = new Set([
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA',
  'KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ',
  'NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT',
  'VA','WA','WV','WI','WY','DC',
])

interface IssueGroup {
  title: string
  rule: (r: PropRow) => boolean
  action: string
}

interface PropRow {
  id: string
  address: string
  city: string | null
  state: string | null
  zip: string | null
  sellers: { isPrimary: boolean; seller: { name: string; phone: string | null; email: string | null } }[]
}

const groups: IssueGroup[] = [
  {
    title: 'CITY MISSING — fix in GHL',
    rule: r => !!r.address && /^\d/.test(r.address) && !(r.city ?? '').trim(),
    action: 'Update the GHL contact\'s "City" field. Gunner will sync it on the next ContactUpdate webhook.',
  },
  {
    title: 'STATE MISSING — fix in GHL',
    rule: r => !!r.address && /^\d/.test(r.address) && !!(r.city ?? '').trim() && !(r.state ?? '').trim(),
    action: 'Update the GHL contact\'s "State" field with a 2-letter code (TN, NC, etc.).',
  },
  {
    title: 'INVALID STATE — fix in GHL',
    rule: r => {
      const s = (r.state ?? '').trim().toUpperCase()
      return s.length > 0 && !US_STATES.has(s)
    },
    action: 'State field has junk (e.g. a name). Replace with the 2-letter code in GHL.',
  },
  {
    title: 'ZIP AT END OF ADDRESS — manual review',
    rule: r => /\b\d{5}\b\s*$/.test(r.address),
    action: 'Address still contains a trailing zip — usually means a contradiction with the row\'s zip column. Pick which is right.',
  },
  {
    title: 'COMMA IN ADDRESS — manual review',
    rule: r => /,/.test(r.address) && !/Apt\s+\w+,/i.test(r.address),
    action: 'Address has a comma (city/state likely embedded). Edit in GHL or via Gunner inventory edit.',
  },
  {
    title: 'PARCEL ID OR TAX ID — get a real address or delete',
    rule: r => /\b(parcel|tax\s*id|apn)\b/i.test(r.address),
    action: 'Parcel-only address. Either pull the real address from county records or delete the row.',
  },
]

async function main() {
  const tenant = await db.tenant.findFirst({ where: { slug: 'new-again-houses' }, select: { id: true } })
  if (!tenant) throw new Error('tenant not found')

  // Pull every property whose address starts with a digit (numbered address)
  // — the no-number set is already on the owner-reviewed list. We only
  // care about the 30-ish rows that still trip the audit.
  const rows: PropRow[] = await db.property.findMany({
    where: { tenantId: tenant.id },
    select: {
      id: true, address: true, city: true, state: true, zip: true,
      sellers: {
        select: {
          isPrimary: true,
          seller: { select: { name: true, phone: true, email: true } },
        },
      },
    },
  })

  for (const g of groups) {
    const hits = rows.filter(g.rule)
    if (hits.length === 0) continue
    console.log(`\n=== ${g.title} (${hits.length}) ===`)
    console.log(`Action: ${g.action}\n`)
    let n = 0
    for (const r of hits) {
      n++
      const primary = r.sellers.find(s => s.isPrimary)?.seller ?? r.sellers[0]?.seller
      const sellerName = primary?.name?.trim() || '<unnamed>'
      const sellerPhone = primary?.phone ?? ''
      const cityState = `${r.city ?? '(no city)'}, ${r.state ?? '(no state)'} ${r.zip ?? ''}`.trim()
      console.log(
        `${String(n).padStart(2, ' ')}. "${r.address}"  |  ${cityState}  |  seller: ${sellerName}${sellerPhone ? ` (${sellerPhone})` : ''}`,
      )
    }
  }
}

main().catch(e => { console.error(e); process.exit(1) }).finally(() => db.$disconnect())
