// scripts/reenrich-today.ts
// Re-runs the orchestrator against every property created today to fill in
// vendor data that wasn't captured on the first run (PropertyRadar, new
// columns from the 20260423060000 migration).

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
  const { enrichProperty } = await import('../lib/enrichment/enrich-property')

  const now = new Date()
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate())

  // Only real leads with an address — skip orphan/test rows
  const leads = await db.property.findMany({
    where: {
      createdAt: { gte: startOfDay },
      address: { not: '' },
    },
    select: {
      id: true, tenantId: true, address: true, city: true, state: true, zip: true,
      advancedPropertyType: true, lotDepthFootage: true,
      zillowData: true,
    },
    orderBy: { createdAt: 'asc' },
  })

  console.log(`[Reenrich] ${leads.length} real leads to process`)

  let ran = 0
  let newPrData = 0
  for (const lead of leads) {
    console.log(`\n─── ${lead.address}, ${lead.city}, ${lead.state} ${lead.zip} ───`)

    // Bust BatchData cache so orchestrator re-fetches and catches the new
    // fields (salePropensity, ownerPortfolio, etc. from today's code)
    const zillow = (lead.zillowData ?? {}) as Record<string, unknown>
    const bd = zillow.batchData as Record<string, unknown> | undefined
    if (bd?.enrichedAt) {
      await db.property.update({
        where: { id: lead.id },
        data: { zillowData: { ...zillow, batchData: { ...bd, enrichedAt: null } } },
      })
    }

    const before = {
      advancedPropertyType: lead.advancedPropertyType,
      lotDepthFootage: lead.lotDepthFootage,
    }

    const outcome = await enrichProperty(lead.id, lead.tenantId, { skipTrace: false })
    console.log(`  BD:${outcome.batchdata.matched ? 'y' : 'n'} PR:${outcome.propertyRadar.matched ? 'y' : 'n'} G:${outcome.google.matched ? 'y' : 'n'}  ${outcome.columnsWritten} cols written  ${outcome.durationMs}ms`)

    if (outcome.propertyRadar.error) {
      console.log(`  PR error: ${outcome.propertyRadar.error}`)
    }

    // Check if PR data now populates
    const after = await db.property.findUnique({
      where: { id: lead.id },
      select: { advancedPropertyType: true, lotDepthFootage: true },
    })
    const newlyFilled: string[] = []
    if (after?.advancedPropertyType && !before.advancedPropertyType) newlyFilled.push(`advancedPropertyType=${after.advancedPropertyType}`)
    if (after?.lotDepthFootage != null && before.lotDepthFootage == null) newlyFilled.push(`lotDepthFootage=${after.lotDepthFootage}`)
    if (newlyFilled.length > 0) {
      console.log(`  NEW PR fields: ${newlyFilled.join(', ')}`)
      newPrData++
    }

    ran++
  }

  console.log(`\n═══ Done ═══`)
  console.log(`  Processed: ${ran}`)
  console.log(`  Got new PR data on: ${newPrData}`)

  await db.$disconnect()
}

main().catch(err => {
  console.error('[Reenrich] Fatal:', err)
  process.exit(1)
})
