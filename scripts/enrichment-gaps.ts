// scripts/enrichment-gaps.ts
// Lists every recent lead and shows exactly which vendors ran, sorted newest first.

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

  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
  const leads = await db.property.findMany({
    where: { createdAt: { gte: since }, address: { not: '' } },
    select: {
      id: true, address: true, city: true, state: true, createdAt: true,
      leadSource: true, ghlContactId: true,
      zillowData: true, googlePlaceId: true,
      distressScore: true, advancedPropertyType: true, apn: true,
      salePropensity: true,
      // v1.1 Wave 5 — ownerPortfolioCount removed from Property (moved to Seller.totalPropertiesOwned).
      tenant: { select: { slug: true } },
    },
    orderBy: { createdAt: 'desc' },
  })

  let bdHit = 0, prHit = 0, gHit = 0, nothingHit = 0

  for (const l of leads) {
    const z = (l.zillowData ?? {}) as Record<string, unknown>
    const bd = z.batchData ? '✓' : '✗'
    const pr = (l.distressScore != null || l.advancedPropertyType || l.apn) ? '✓' : '✗'
    const g = l.googlePlaceId ? '✓' : '✗'

    if (bd === '✓') bdHit++
    if (pr === '✓') prHit++
    if (g === '✓') gHit++
    if (bd === '✗' && pr === '✗' && g === '✗') nothingHit++

    const createdAt = l.createdAt.toISOString().slice(5, 16).replace('T', ' ')
    console.log(`  ${createdAt}  BD:${bd} PR:${pr} G:${g}  ${l.tenant.slug.padEnd(18)} ${(l.leadSource ?? '—').padEnd(8)} ${l.address}, ${l.city}, ${l.state}`)
  }

  console.log('')
  console.log(`═══ Last 7 days summary (${leads.length} leads) ═══`)
  console.log(`  BD ran:      ${bdHit} (${Math.round(bdHit/leads.length*100)}%)`)
  console.log(`  PR ran:      ${prHit} (${Math.round(prHit/leads.length*100)}%)`)
  console.log(`  Google ran:  ${gHit} (${Math.round(gHit/leads.length*100)}%)`)
  console.log(`  NOTHING ran: ${nothingHit} (${Math.round(nothingHit/leads.length*100)}%) ← unenriched`)

  await db.$disconnect()
}

main().catch(err => { console.error(err); process.exit(1) })
