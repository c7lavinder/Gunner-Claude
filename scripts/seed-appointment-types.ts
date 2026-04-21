// scripts/seed-appointment-types.ts
//
// Seeds tenant.config.appointmentTypes by matching 4 canonical NAH appointment
// types to their real GHL calendar ids. Name-matches are case-insensitive and
// tolerant of separator variations (| vs -, double spaces) and the trailing
// "| New Again Houses" suffix.
//
// Run:  railway run npx tsx scripts/seed-appointment-types.ts
// Or (local env already pointed at prod DB + GHL):  npx tsx scripts/seed-appointment-types.ts

import { PrismaClient, Prisma } from '@prisma/client'
import { getGHLClient } from '../lib/ghl/client'

const db = new PrismaClient()

interface AppointmentTypeSeed {
  id: string
  label: string
  // Substrings that must all appear (case-insensitive) in the GHL calendar name
  // for it to count as a match. Intentionally strict so we don't silently map
  // the wrong calendar — if nothing matches, the seed fails loudly for that row.
  matchTerms: string[]
  defaultDurationMin: number
  titleTemplate: string
}

const SEEDS: AppointmentTypeSeed[] = [
  {
    id: 'walkthrough',
    label: 'Property Walkthrough',
    matchTerms: ['property', 'walkthrough'],
    defaultDurationMin: 60,
    titleTemplate: 'Walkthrough at {propertyAddress} w/ {contactName}',
  },
  {
    id: 'cash_offer',
    label: 'Cash Offer Call',
    matchTerms: ['cash', 'offer'],
    defaultDurationMin: 30,
    titleTemplate: 'Cash Offer Call w/ {contactName} — {propertyAddress}',
  },
  {
    id: 'qualification',
    label: 'Property Qualification Call',
    matchTerms: ['qualification'],
    defaultDurationMin: 30,
    titleTemplate: 'Qualification Call w/ {contactName} — {propertyAddress}',
  },
  {
    id: 'purchase_agreement',
    label: 'Purchase Agreement Call',
    matchTerms: ['purchase', 'agreement'],
    defaultDurationMin: 30,
    titleTemplate: 'Purchase Agreement Call w/ {contactName} — {propertyAddress}',
  },
]

// Calendars we never want to pick as a canonical match, even if they match the
// search terms — they're variants (duplicates, JV, per-rep personal), not the
// "official" calendar for the appointment type.
const DISQUALIFIER_PREFIXES = /^(copy of|jv )/i

function scoreMatch(name: string, seed: AppointmentTypeSeed): number {
  const lower = name.toLowerCase()

  // Hard requirement: every search term must appear
  if (!seed.matchTerms.every(t => lower.includes(t.toLowerCase()))) return -1

  let score = 0

  // Prefer NAH-branded (has the location suffix) over personal calendars
  if (lower.includes('new again houses')) score += 10

  // Penalize variant prefixes like "Copy of" or "JV " — these are duplicates
  // or joint-venture variants, not the canonical type.
  if (DISQUALIFIER_PREFIXES.test(name.trim())) score -= 20

  // Bonus if the name starts with the expected label (exact canonical form)
  if (lower.startsWith(seed.label.toLowerCase())) score += 5

  // Bonus for shorter names — fewer extra qualifiers usually means canonical
  score += Math.max(0, 40 - lower.length) / 10

  return score
}

function findCalendarId(
  calendars: Array<{ id: string; name: string }>,
  seed: AppointmentTypeSeed,
): { id: string; name: string; score: number } | null {
  const scored = calendars
    .map(c => ({ ...c, score: scoreMatch(c.name, seed) }))
    .filter(c => c.score >= 0)
    .sort((a, b) => b.score - a.score)
  return scored[0] ?? null
}

async function main() {
  const tenant = await db.tenant.findFirst({
    where: { ghlLocationId: { not: null } },
    select: { id: true, name: true, ghlLocationId: true, config: true },
  })
  if (!tenant) {
    console.error('❌ No GHL-connected tenant found.')
    process.exit(1)
  }
  console.log(`Tenant: ${tenant.name} (${tenant.id}) — location ${tenant.ghlLocationId}`)

  const ghl = await getGHLClient(tenant.id)
  const { calendars } = await ghl.getCalendars()
  if (!calendars || calendars.length === 0) {
    console.error('❌ GHL returned zero calendars — check GHL OAuth scopes + tenant token.')
    process.exit(1)
  }

  console.log(`\nGHL calendars available (${calendars.length}):`)
  for (const c of calendars) console.log(`  • ${c.name} — ${c.id}`)

  const appointmentTypes: Array<{
    id: string; label: string; calendarId: string; defaultDurationMin: number; titleTemplate?: string
  }> = []
  const misses: string[] = []

  console.log('\nMatching:')
  for (const seed of SEEDS) {
    const match = findCalendarId(calendars, seed)
    if (!match) {
      console.log(`  ❌ ${seed.label} — no calendar matched terms [${seed.matchTerms.join(', ')}]`)
      misses.push(seed.label)
      continue
    }
    console.log(`  ✅ ${seed.label} → "${match.name}" (${match.id})  [score ${match.score.toFixed(1)}]`)
    appointmentTypes.push({
      id: seed.id,
      label: seed.label,
      calendarId: match.id,
      defaultDurationMin: seed.defaultDurationMin,
      titleTemplate: seed.titleTemplate,
    })
  }

  if (misses.length === SEEDS.length) {
    console.error('\n❌ No appointment types matched. Not writing config.')
    process.exit(1)
  }

  const currentConfig = (tenant.config ?? {}) as Record<string, unknown>
  const newConfig = { ...currentConfig, appointmentTypes }

  await db.tenant.update({
    where: { id: tenant.id },
    data: { config: newConfig as Prisma.InputJsonValue },
  })

  console.log(`\nWrote ${appointmentTypes.length}/${SEEDS.length} appointment types to tenant.config.appointmentTypes.`)
  if (misses.length > 0) {
    console.warn(`  ⚠️  Unmatched (review Settings → Call config manually): ${misses.join(', ')}`)
  }
  console.log('Done.')
  await db.$disconnect()
}

main().catch(err => {
  console.error('Fatal:', err instanceof Error ? err.message : err)
  process.exit(1)
})
