// scripts/full-leaf-dump.ts
//
// Dumps every leaf field returned by BatchData + PropertyRadar across the 3
// test properties. Used to design the schema migration that captures 100%
// of vendor output.

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

function walk(obj: unknown, prefix: string, out: Map<string, Set<string>>): void {
  if (obj == null) return
  if (Array.isArray(obj)) {
    if (obj.length > 0 && typeof obj[0] === 'object' && obj[0] !== null) {
      walk(obj[0], `${prefix}[]`, out)
    } else {
      let set = out.get(prefix)
      if (!set) { set = new Set(); out.set(prefix, set) }
      set.add(JSON.stringify(obj).slice(0, 80))
    }
    return
  }
  if (typeof obj === 'object') {
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      const key = prefix ? `${prefix}.${k}` : k
      walk(v, key, out)
    }
    return
  }
  if (obj === '' || obj === false) return
  let set = out.get(prefix)
  if (!set) { set = new Set(); out.set(prefix, set) }
  set.add(String(obj).slice(0, 40))
}

const ADDRS = [
  ['1915 S Main St', 'Springfield', 'TN', '37172'],
  ['331 Eastland Ave', 'Ripley', 'TN', '38063'],
  ['1400 Johnson St', 'Etowah', 'TN', '37331'],
] as const

async function main() {
  await loadEnvLocal()
  const { lookupProperty: lookupBatch } = await import('../lib/batchdata/client')
  const { lookupProperty: lookupPR } = await import('../lib/propertyradar/client')

  const bdLeaves = new Map<string, Set<string>>()
  const prLeaves = new Map<string, Set<string>>()

  for (const [street, city, state, zip] of ADDRS) {
    console.log(`Fetching ${street}, ${city}...`)
    const [bd, pr] = await Promise.all([
      lookupBatch(street, city, state, zip).catch(() => null),
      lookupPR(street, city, state, zip).catch(() => null),
    ])
    if (bd) {
      const bdRaw = (bd as Record<string, unknown>).raw ?? {}
      walk(bdRaw, '', bdLeaves)
      const bdNorm = { ...(bd as Record<string, unknown>) }
      delete bdNorm.raw
      walk(bdNorm, 'NORM.', bdLeaves)
    }
    if (pr) {
      const prRaw = (pr as Record<string, unknown>).raw ?? {}
      walk(prRaw, '', prLeaves)
      const prNorm = { ...(pr as Record<string, unknown>) }
      delete prNorm.raw
      walk(prNorm, 'NORM.', prLeaves)
    }
  }

  console.log('\n═══ BATCHDATA — all leaves seen ═══')
  const bdSorted = [...bdLeaves.keys()].sort()
  for (const key of bdSorted) {
    const samples = [...bdLeaves.get(key)!].slice(0, 2).join(' | ')
    console.log(`  ${key.padEnd(60)} ${samples}`)
  }
  console.log(`\n  TOTAL: ${bdSorted.length} distinct leaves`)

  console.log('\n═══ PROPERTYRADAR — all leaves seen ═══')
  const prSorted = [...prLeaves.keys()].sort()
  for (const key of prSorted) {
    const samples = [...prLeaves.get(key)!].slice(0, 2).join(' | ')
    console.log(`  ${key.padEnd(60)} ${samples}`)
  }
  console.log(`\n  TOTAL: ${prSorted.length} distinct leaves`)
}

main().catch(e => { console.error(e); process.exit(1) })
