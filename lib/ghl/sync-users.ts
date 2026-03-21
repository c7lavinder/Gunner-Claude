// lib/ghl/sync-users.ts
// Syncs GHL location user data (phone, name) into the app's user table
// WRITES TO: users.phone, users.name (only for users with ghlUserId set)
// READ BY: any page displaying team member phone/name
// CALLED FROM: poll-calls.ts (cron), /api/ghl/users (settings load)

import { db } from '@/lib/db/client'
import { getGHLClient } from '@/lib/ghl/client'

interface GHLUserWithPhone {
  id: string
  name: string
  firstName: string
  lastName: string
  email: string
  phone?: string
  lcPhone?: Record<string, string>
}

export async function syncGHLUsers(tenantId: string): Promise<{ synced: number; errors: number }> {
  let synced = 0
  let errors = 0

  try {
    const ghl = await getGHLClient(tenantId)

    // Get tenant's locationId for lcPhone lookup
    const tenant = await db.tenant.findUnique({
      where: { id: tenantId },
      select: { ghlLocationId: true },
    })
    const locationId = tenant?.ghlLocationId

    // Fetch GHL users (cast to include lcPhone which isn't in the base type)
    const result = await ghl.getLocationUsers()
    const ghlUsers = (result.users ?? []) as unknown as GHLUserWithPhone[]

    // Get all app users with GHL mappings for this tenant
    const appUsers = await db.user.findMany({
      where: { tenantId, ghlUserId: { not: null } },
      select: { id: true, ghlUserId: true, phone: true, name: true },
    })

    for (const appUser of appUsers) {
      const ghlUser = ghlUsers.find(g => g.id === appUser.ghlUserId)
      if (!ghlUser) continue

      // Resolve assigned phone: lcPhone[locationId] takes priority over personal phone
      const assignedPhone = (locationId && ghlUser.lcPhone?.[locationId]) || ghlUser.phone || null
      const ghlName = ghlUser.name || `${ghlUser.firstName ?? ''} ${ghlUser.lastName ?? ''}`.trim()

      // Only update if something changed
      const phoneChanged = assignedPhone && assignedPhone !== appUser.phone
      const nameChanged = ghlName && ghlName !== appUser.name

      if (phoneChanged || nameChanged) {
        try {
          await db.user.update({
            where: { id: appUser.id },
            data: {
              ...(phoneChanged ? { phone: assignedPhone } : {}),
              ...(nameChanged ? { name: ghlName } : {}),
            },
          })
          synced++
        } catch {
          errors++
        }
      }
    }
  } catch {
    // GHL connection may not exist or be expired — non-fatal
    errors++
  }

  return { synced, errors }
}
