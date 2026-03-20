// scripts/poll-calls.ts
// Polling fallback for call grading — runs every 60s via Railway cron
// GHL has no /calls list endpoint for Marketplace Apps
// Instead: fetch recent conversations of TYPE_CALL and grade unprocessed ones

import { db } from '../lib/db/client'
import { getGHLClient } from '../lib/ghl/client'
import { gradeCall } from '../lib/ai/grading'

async function pollCalls() {
  console.log('[poll-calls] Starting call poll...')

  try {
    const tenants = await db.tenant.findMany({
      where: {
        ghlAccessToken: { not: null },
        ghlLocationId: { not: null },
      },
      select: { id: true, ghlLocationId: true },
    })

    if (tenants.length === 0) {
      console.log('[poll-calls] No tenants with GHL connections')
      process.exit(0)
    }

    let totalNewCalls = 0

    for (const tenant of tenants) {
      try {
        const ghl = await getGHLClient(tenant.id)

        // Fetch recent conversations — filter to TYPE_CALL
        const result = await ghl.getConversations({ limit: 50 })
        const callConversations = (result.conversations ?? []).filter(
          (c) => c.lastMessageType === 'TYPE_CALL'
        )

        if (callConversations.length === 0) {
          console.log(`[poll-calls] No call conversations for tenant ${tenant.id}`)
          continue
        }

        // Pre-fetch all users with GHL mappings for this tenant
        const tenantUsers = await db.user.findMany({
          where: { tenantId: tenant.id },
          select: { id: true, ghlUserId: true },
        })

        for (const conv of callConversations) {
          // Skip if we already have this conversation as a call
          const existing = await db.call.findFirst({
            where: {
              tenantId: tenant.id,
              ghlCallId: conv.id,
            },
            select: { id: true },
          })

          if (existing) continue

          // Match to user: try GHL userId from conversation, fall back to first user
          const ghlUserId = conv.userId ?? conv.assignedTo
          const user = (ghlUserId && tenantUsers.find(u => u.ghlUserId === ghlUserId))
            || tenantUsers[0]
            || null

          // Determine call direction from conversation
          const direction = conv.lastMessageDirection === 'inbound' ? 'INBOUND' : 'OUTBOUND'

          // Create the call record
          const newCall = await db.call.create({
            data: {
              tenantId: tenant.id,
              ghlCallId: conv.id,
              assignedToId: user?.id ?? null,
              direction: direction as 'INBOUND' | 'OUTBOUND',
              calledAt: new Date(conv.lastMessageDate || conv.dateUpdated || Date.now()),
              gradingStatus: 'PENDING',
            },
          })

          totalNewCalls++
          console.log(`[poll-calls] New call: ${newCall.id} (conv: ${conv.id}, contact: ${conv.contactName || conv.phone}) for tenant ${tenant.id}`)

          // Trigger grading — fire and forget
          gradeCall(newCall.id).catch((err) => {
            console.error(`[poll-calls] Grading failed for call ${newCall.id}:`, err instanceof Error ? err.message : err)
          })
        }
      } catch (err) {
        console.error(`[poll-calls] Error polling tenant ${tenant.id}:`, err instanceof Error ? err.message : err)
      }
    }

    console.log(`[poll-calls] Done. Tenants: ${tenants.length}, New calls: ${totalNewCalls}`)
  } catch (err) {
    console.error('[poll-calls] Fatal error:', err instanceof Error ? err.message : err)
    process.exit(1)
  }

  process.exit(0)
}

pollCalls()
