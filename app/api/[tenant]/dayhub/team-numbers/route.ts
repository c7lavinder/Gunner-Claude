// GET /api/[tenant]/dayhub/team-numbers
// Returns ALL team members with their assigned LC (LeadConnector) outbound
// SMS numbers for the "Send From" dropdown.
//
// Phone-number resolution priority for each user:
//   1. LC number where lc.userId === user.ghlUserId (owned outbound number)
//   2. (none) — dropdown will show "LC number not assigned in GHL"
//
// user.phone (personal cell) is intentionally NOT used — it's not send-capable
// and kept sending Kyle's calls from his personal #. See Phase 2c notes.
import { NextResponse } from 'next/server'
import { withTenant } from '@/lib/api/withTenant'
import { getGHLClient } from '@/lib/ghl/client'
import { db } from '@/lib/db/client'

export const GET = withTenant<{ tenant: string }>(async (_req, ctx) => {
  try {
    const dbUsers = await db.user.findMany({
      where: { tenantId: ctx.tenantId },
      select: { id: true, name: true, ghlUserId: true },
    })

    // Pull LC location numbers and map by assigned userId.
    const lcByGhlUser = new Map<string, { phone: string; label: string | null }>()
    let defaultLcNumber: string | null = null
    try {
      const ghl = await getGHLClient(ctx.tenantId)
      const result = await ghl.getPhoneNumbers()
      for (const n of result.numbers ?? []) {
        if (n.isDefault && n.phoneNumber) defaultLcNumber = n.phoneNumber
        if (n.userId && n.phoneNumber) {
          lcByGhlUser.set(n.userId, {
            phone: n.phoneNumber,
            label: n.friendlyName ?? null,
          })
        }
      }
    } catch (err) {
      console.warn('[team-numbers] Failed to load LC numbers:', err instanceof Error ? err.message : err)
    }

    const numbers = dbUsers.map(u => {
      const lc = u.ghlUserId ? lcByGhlUser.get(u.ghlUserId) : undefined
      return {
        name: u.name ?? 'Unknown',
        phone: lc?.phone ?? null,
        label: lc?.label ?? null,
        userId: u.id,
      }
    })

    return NextResponse.json({ numbers, defaultLcNumber })
  } catch {
    return NextResponse.json({ numbers: [], defaultLcNumber: null })
  }
})
