// scripts/check-todays-leads.ts
// Lists every Property created today (across all tenants) and shows which
// vendor data actually landed, so we can see whether the orchestrator ran.

import fs from 'node:fs/promises'
import path from 'node:path'

async function loadEnvLocal(): Promise<void> {
  const envPath = path.join(process.cwd(), '.env.local')
  try {
    const raw = await fs.readFile(envPath, 'utf8')
    for (const line of raw.split('\n')) {
      const t = line.trim()
      if (!t || t.startsWith('#')) continue
      const eq = t.indexOf('=')
      if (eq < 0) continue
      const k = t.slice(0, eq).trim()
      let v = t.slice(eq + 1).trim()
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
      if (process.env[k] === undefined) process.env[k] = v
    }
  } catch { /* optional */ }
}

async function main() {
  await loadEnvLocal()
  const { db } = await import('../lib/db/client')

  // Start of today in local TZ
  const now = new Date()
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate())

  const leads = await db.property.findMany({
    where: { createdAt: { gte: startOfDay } },
    select: {
      id: true,
      address: true, city: true, state: true, zip: true,
      createdAt: true,
      tenantId: true,
      leadSource: true,
      ghlContactId: true,
      // Vendor data markers
      latitude: true, apn: true, county: true,
      estimatedEquity: true, availableEquity: true,
      distressScore: true, ownerPhone: true,
      // New vendor-capture columns (migration 20260423060000)
      salePropensity: true, advancedPropertyType: true,
      ownerPortfolioCount: true, addressValidity: true,
      lotDepthFootage: true, samePropertyMailing: true,
      listingStatus: true,
      // Google
      googlePlaceId: true,
      // Zillow blob carries the full batchData payload
      zillowData: true,
      // Sellers (so we can check seller enrichment)
      sellers: {
        include: {
          seller: {
            select: {
              id: true, name: true, phone: true, email: true,
              age: true, gender: true, occupation: true,
              mailingValidity: true, mailingDpvMatchCode: true,
            },
          },
        },
      },
      tenant: { select: { slug: true } },
    },
    orderBy: { createdAt: 'desc' },
  })

  console.log(`[Today] ${leads.length} lead(s) created since ${startOfDay.toISOString()}`)
  console.log('')

  if (leads.length === 0) {
    console.log('  No new leads today.')
    await db.$disconnect()
    return
  }

  for (const l of leads) {
    console.log(`─── ${l.address || '(no address)'}, ${l.city || ''}, ${l.state || ''} ${l.zip || ''} ───`)
    console.log(`  Tenant: ${l.tenant.slug}`)
    console.log(`  Created: ${l.createdAt.toISOString()}`)
    console.log(`  Lead source: ${l.leadSource ?? '—'}${l.ghlContactId ? `  GHL contact: ${l.ghlContactId}` : ''}`)

    const zillow = (l.zillowData ?? {}) as Record<string, unknown>
    const bd = (zillow.batchData ?? null) as Record<string, unknown> | null
    const pr = (zillow.propertyRadar ?? null) as Record<string, unknown> | null
    const google = (zillow.google ?? null) as Record<string, unknown> | null

    console.log(`  Vendors ran:`)
    console.log(`    BatchData:    ${bd ? '✓ ' + (bd.enrichedAt ? new Date(String(bd.enrichedAt)).toISOString() : 'yes') : '✗'}`)
    console.log(`    PropertyRadar:${pr ? '✓ ' + (pr.enrichedAt ? new Date(String(pr.enrichedAt)).toISOString() : 'yes') : '✗'}`)
    console.log(`    Google:       ${google ? '✓ ' + (google.enrichedAt ? new Date(String(google.enrichedAt)).toISOString() : 'yes') : '✗'}`)

    console.log(`  Core enrichment markers:`)
    console.log(`    latitude:      ${l.latitude ? '✓ ' + l.latitude : '—'}`)
    console.log(`    apn:           ${l.apn ?? '—'}`)
    console.log(`    county:        ${l.county ?? '—'}`)
    console.log(`    estimatedEquity:${l.estimatedEquity ? '$' + Number(l.estimatedEquity).toLocaleString() : '—'}`)
    console.log(`    distressScore: ${l.distressScore ?? '—'}`)
    console.log(`    ownerPhone:    ${l.ownerPhone ?? '—'}`)
    console.log(`    googlePlaceId: ${l.googlePlaceId ?? '—'}`)

    console.log(`  NEW vendor-capture fields:`)
    console.log(`    salePropensity:        ${l.salePropensity ?? '—'}`)
    console.log(`    advancedPropertyType:  ${l.advancedPropertyType ?? '—'}`)
    console.log(`    ownerPortfolioCount:   ${l.ownerPortfolioCount ?? '—'}`)
    console.log(`    addressValidity:       ${l.addressValidity ?? '—'}`)
    console.log(`    lotDepthFootage:       ${l.lotDepthFootage ?? '—'}`)
    console.log(`    samePropertyMailing:   ${l.samePropertyMailing == null ? '—' : l.samePropertyMailing ? '✓' : '✗'}`)
    console.log(`    listingStatus:         ${l.listingStatus ?? '—'}`)

    console.log(`  Sellers (${l.sellers.length}):`)
    for (const link of l.sellers) {
      const s = link.seller
      console.log(`    - ${s.name}  phone:${s.phone ?? '—'}  age:${s.age ?? '—'}  gender:${s.gender ?? '—'}  occupation:${s.occupation ?? '—'}  usps:${s.mailingValidity ?? '—'}/${s.mailingDpvMatchCode ?? '—'}`)
    }

    console.log('')
  }

  await db.$disconnect()
}

main().catch(err => {
  console.error('[Today] Fatal:', err)
  process.exit(1)
})
