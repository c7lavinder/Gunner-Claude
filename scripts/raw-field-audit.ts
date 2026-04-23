// scripts/raw-field-audit.ts
//
// Audits the full raw response from BatchData + PropertyRadar, counts distinct
// leaf fields each returns, and compares against what `buildDenormUpdate`
// actually writes to Property. Goal: answer "where are the other hundreds of
// data points going?".
//
// Usage:
//   npx tsx scripts/raw-field-audit.ts                       # defaults to 1915 S Main
//   npx tsx scripts/raw-field-audit.ts "500 Dale St" "Allentown" "PA" "18103"

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

function flattenLeaves(obj: unknown, prefix = '', out: Map<string, unknown> = new Map()): Map<string, unknown> {
  if (obj == null) return out
  if (Array.isArray(obj)) {
    // Record the array itself as 1 leaf if it contains primitives; for object
    // arrays, recurse on the first element to map shape.
    if (obj.length === 0) {
      out.set(prefix, [])
      return out
    }
    if (typeof obj[0] !== 'object' || obj[0] === null) {
      out.set(prefix, obj)
      return out
    }
    flattenLeaves(obj[0], `${prefix}[0]`, out)
    return out
  }
  if (typeof obj === 'object') {
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      const key = prefix ? `${prefix}.${k}` : k
      if (v == null) continue
      if (typeof v === 'object' && !Array.isArray(v)) {
        flattenLeaves(v, key, out)
      } else {
        flattenLeaves(v, key, out)
      }
    }
    return out
  }
  if (obj !== '' && obj !== false) {
    out.set(prefix, obj)
  }
  return out
}

async function main() {
  await loadEnvLocal()
  const [street, city, state, zip] = process.argv.slice(2).length === 4
    ? process.argv.slice(2)
    : ['1915 S Main St', 'Springfield', 'TN', '37172']

  console.log(`[Audit] ${street}, ${city}, ${state} ${zip}\n`)

  const { lookupProperty: lookupBatch } = await import('../lib/batchdata/client')
  const { lookupProperty: lookupPR } = await import('../lib/propertyradar/client')

  const [bd, pr] = await Promise.all([
    lookupBatch(street, city, state, zip).catch(e => ({ __error: String(e) })),
    lookupPR(street, city, state, zip).catch(e => ({ __error: String(e) })),
  ])

  console.log('═══ BATCHDATA ═══')
  if (bd && !('__error' in bd)) {
    const raw = (bd as Record<string, unknown>).raw ?? {}
    const normalized = { ...(bd as Record<string, unknown>), raw: undefined }
    delete (normalized as Record<string, unknown>).raw
    const rawLeaves = flattenLeaves(raw)
    const normLeaves = flattenLeaves(normalized)
    console.log(`  Normalized (first-class) fields: ${normLeaves.size}`)
    console.log(`  Raw blob leaf fields (inside result.raw): ${rawLeaves.size}`)
    console.log(`  TOTAL distinct populated leaves: ${rawLeaves.size + normLeaves.size}`)
    console.log('\n  Sample raw leaves not in our normalized shape:')
    const normKeys = new Set([...normLeaves.keys()].map(k => k.toLowerCase()))
    let shown = 0
    const dropped: string[] = []
    for (const [k, v] of rawLeaves) {
      const leaf = k.split('.').pop()!.toLowerCase()
      if (!normKeys.has(leaf)) dropped.push(`${k} = ${JSON.stringify(v).slice(0, 60)}`)
    }
    console.log(`  ${dropped.length} leaves in raw that are NOT in our normalized shape`)
    for (const d of dropped.slice(0, 40)) console.log(`    ${d}`)
    if (dropped.length > 40) console.log(`    ... and ${dropped.length - 40} more`)
  } else {
    console.log(`  Error or no match: ${JSON.stringify(bd).slice(0, 200)}`)
  }

  console.log('\n═══ PROPERTYRADAR ═══')
  if (pr && !('__error' in pr)) {
    const raw = (pr as Record<string, unknown>).raw ?? {}
    const normalized = { ...(pr as Record<string, unknown>), raw: undefined }
    delete (normalized as Record<string, unknown>).raw
    const rawLeaves = flattenLeaves(raw)
    const normLeaves = flattenLeaves(normalized)
    console.log(`  Normalized (first-class) fields: ${normLeaves.size}`)
    console.log(`  Raw blob leaf fields (inside result.raw): ${rawLeaves.size}`)
    console.log(`  TOTAL distinct populated leaves: ${rawLeaves.size + normLeaves.size}`)
    console.log('\n  Sample raw leaves not in our normalized shape:')
    const normKeys = new Set([...normLeaves.keys()].map(k => k.toLowerCase()))
    const dropped: string[] = []
    for (const [k, v] of rawLeaves) {
      const leaf = k.split('.').pop()!.toLowerCase()
      if (!normKeys.has(leaf)) dropped.push(`${k} = ${JSON.stringify(v).slice(0, 60)}`)
    }
    console.log(`  ${dropped.length} leaves in raw that are NOT in our normalized shape`)
    for (const d of dropped.slice(0, 60)) console.log(`    ${d}`)
    if (dropped.length > 60) console.log(`    ... and ${dropped.length - 60} more`)
  } else {
    console.log(`  Error or no match: ${JSON.stringify(pr).slice(0, 200)}`)
  }
}

main().catch(err => {
  console.error('[Audit] Fatal:', err)
  process.exit(1)
})
