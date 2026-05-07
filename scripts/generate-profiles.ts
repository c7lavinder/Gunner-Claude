// scripts/generate-profiles.ts
// Weekly cron: regenerate user performance profiles from real call data
// Railway cron: 0 3 * * 0 (3am UTC every Sunday)

import { db } from '../lib/db/client'
import { generateUserProfiles } from '../lib/ai/generate-user-profiles'
import { withCronHeartbeat } from '../lib/cron-heartbeat'

async function main() {
  console.log('[Profile Gen] Starting weekly profile generation...')

  const tenants = await db.tenant.findMany({
    select: { id: true, name: true },
  })

  let totalUpdated = 0
  let totalSkipped = 0
  let totalErrors = 0

  for (const tenant of tenants) {
    console.log(`[Profile Gen] Processing tenant: ${tenant.name}`)
    const result = await generateUserProfiles(tenant.id)
    totalUpdated += result.updated
    totalSkipped += result.skipped
    totalErrors += result.errors.length
    console.log(`[Profile Gen] ${tenant.name}: ${result.updated} updated, ${result.skipped} skipped, ${result.errors.length} errors`)
    if (result.errors.length > 0) {
      console.log(`[Profile Gen] Errors:`, result.errors)
    }
  }

  console.log('[Profile Gen] Done.')
  return { tenants: tenants.length, updated: totalUpdated, skipped: totalSkipped, errors: totalErrors }
}

withCronHeartbeat('weekly_profiles', main)
  .catch(console.error)
  .finally(() => process.exit(0))
