// scripts/sync-buyers.ts
// Cron job — runs daily at 6am CT via Railway Function
// Syncs all buyers from GHL buyer pipeline into local DB for each tenant

import { db } from '../lib/db/client'
import { syncAllBuyersFromGHL } from '../lib/buyers/sync'

async function syncBuyers() {
  console.log('[sync-buyers] Starting daily buyer sync...')

  try {
    const tenants = await db.tenant.findMany({
      where: { ghlAccessToken: { not: null }, ghlLocationId: { not: null } },
      select: { id: true, name: true },
    })

    if (tenants.length === 0) {
      console.log('[sync-buyers] No tenants with GHL connection')
      process.exit(0)
    }

    for (const tenant of tenants) {
      try {
        console.log(`[sync-buyers] Syncing tenant: ${tenant.name ?? tenant.id}`)
        const synced = await syncAllBuyersFromGHL(tenant.id)
        console.log(`[sync-buyers] Tenant ${tenant.name ?? tenant.id}: ${synced} buyers synced`)
      } catch (err) {
        console.error(`[sync-buyers] Tenant ${tenant.id} failed:`, err instanceof Error ? err.message : err)
      }
    }

    console.log('[sync-buyers] Complete.')
  } catch (err) {
    console.error('[sync-buyers] Fatal:', err instanceof Error ? err.message : err)
    process.exit(1)
  }

  process.exit(0)
}

syncBuyers()
