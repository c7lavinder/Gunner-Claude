// scripts/inspect-lead.ts
// Deep-dive on a single lead — shows zillowData blob keys + AI enrichment state.

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

  // 3 samples: today's lead, 04-22 lead, 04-17 lead
  const targetAddresses = [
    '200 Dorchester Dr',          // 04-24
    '86 Doty Ln',                  // 04-22
    '225 S Sweetbriar Ave',        // 04-17
  ]

  for (const addr of targetAddresses) {
    const lead = await db.property.findFirst({
      where: { address: { contains: addr } },
      select: {
        id: true, address: true, createdAt: true,
        // AI enrichment fields
        aiEnrichmentStatus: true, aiEnrichmentError: true,
        arv: true, repairEstimate: true, rentalEstimate: true,
        neighborhoodSummary: true, zestimate: true, floodZone: true,
        // Vendor enrichment markers
        zillowData: true,
        apn: true, latitude: true, county: true, googlePlaceId: true,
        distressScore: true, advancedPropertyType: true, salePropensity: true,
        fieldSources: true,
      },
      orderBy: { createdAt: 'desc' },
    })

    if (!lead) {
      console.log(`── ${addr} NOT FOUND ──\n`)
      continue
    }

    console.log(`── ${lead.address} (${lead.createdAt.toISOString()}) ──`)
    console.log(`  AI status: ${lead.aiEnrichmentStatus ?? '—'}  error: ${lead.aiEnrichmentError ?? '—'}`)
    console.log(`  AI fields: arv=${lead.arv ?? '—'} repair=${lead.repairEstimate ?? '—'} rent=${lead.rentalEstimate ?? '—'} floodZone=${lead.floodZone ?? '—'}`)
    console.log(`  Neighborhood summary: ${lead.neighborhoodSummary?.slice(0, 80) ?? '—'}`)
    console.log(`  Vendor markers:`)
    console.log(`    apn:${lead.apn ?? '—'} county:${lead.county ?? '—'} lat:${lead.latitude ?? '—'}`)
    console.log(`    googlePlaceId:${lead.googlePlaceId ?? '—'}`)
    console.log(`    distressScore:${lead.distressScore ?? '—'} advancedPropertyType:${lead.advancedPropertyType ?? '—'} salePropensity:${lead.salePropensity ?? '—'}`)
    const zillow = (lead.zillowData ?? {}) as Record<string, unknown>
    console.log(`  zillowData keys: ${Object.keys(zillow).join(', ') || '(empty)'}`)
    const fs = (lead.fieldSources ?? {}) as Record<string, string>
    console.log(`  fieldSources keys: ${Object.keys(fs).length} entries`)
    console.log('')
  }

  await db.$disconnect()
}

main().catch(e => { console.error(e); process.exit(1) })
