// scripts/simulate-bd-gate.ts
// Replays the PR qualification gate against today's leads using data already
// captured, so we can show the projected BD spend reduction WITHOUT making
// any new API calls.

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

  // Look at the last 24h of leads across all tenants
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000)
  const leads = await db.property.findMany({
    where: { createdAt: { gte: since }, address: { not: '' } },
    select: {
      id: true, address: true, city: true, state: true,
      distressScore: true,
      preForeclosure: true, bankOwned: true, isAuction: true,
      inBankruptcy: true, inProbate: true, inDivorce: true,
      hasRecentEviction: true, deceasedOwner: true,
      expiredListing: true, taxDelinquent: true,
      // High-equity comes from BD or PR — we need BOTH to evaluate
      availableEquity: true, estimatedEquity: true, equityPercent: true,
    },
    orderBy: { createdAt: 'desc' },
  })

  console.log(`[Gate-Sim] ${leads.length} leads in last 24h — replaying PR gate`)
  console.log('')

  let qualified = 0
  let skipped = 0
  const COST = 0.30

  for (const l of leads) {
    const reasons: string[] = []
    // Matches lib/enrichment/enrich-property.ts::qualifiesForBatchData —
    // motivation signals ONLY, no pure equity qualification.
    if ((l.distressScore ?? 0) >= 40) reasons.push(`distress=${l.distressScore}`)
    if (l.preForeclosure === true) reasons.push('preforeclosure')
    if (l.bankOwned === true) reasons.push('bank_owned')
    if (l.isAuction === true) reasons.push('auction')
    if (l.inBankruptcy === true) reasons.push('bankruptcy')
    if (l.inProbate === true) reasons.push('probate')
    if (l.inDivorce === true) reasons.push('divorce')
    if (l.hasRecentEviction === true) reasons.push('recent_eviction')
    if (l.deceasedOwner === true) reasons.push('deceased')
    if (l.expiredListing === true) reasons.push('expired_listing')
    if (l.taxDelinquent === true) reasons.push('tax_delinquent')

    const q = reasons.length > 0
    if (q) qualified++
    else skipped++

    const mark = q ? '✓ FIRE BD' : '✗ skip'
    console.log(`  ${mark.padEnd(12)} ${l.address.padEnd(32)} ${l.city.padEnd(16)} ${l.state}  ${reasons.join(', ') || '(no signals)'}`)
  }

  console.log('')
  console.log('═══ Projected BD spend ═══')
  console.log(`  Without gate: ${leads.length} calls × $${COST.toFixed(2)} = $${(leads.length * COST).toFixed(2)}`)
  console.log(`  With gate:    ${qualified} calls × $${COST.toFixed(2)} = $${(qualified * COST).toFixed(2)}`)
  console.log(`  Savings:      $${((leads.length - qualified) * COST).toFixed(2)} (${Math.round((1 - qualified / leads.length) * 100)}% reduction)`)

  await db.$disconnect()
}

main().catch(err => {
  console.error('[Gate-Sim] Fatal:', err)
  process.exit(1)
})
