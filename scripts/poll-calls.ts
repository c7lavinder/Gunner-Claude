// scripts/poll-calls.ts
// Polling fallback for call grading — runs every 60s via Railway cron
// Iterates individual call MESSAGES within GHL conversations (not 1-per-conversation)
// Recording URLs come via webhook, not polling — this captures metadata + triggers grading

import { db } from '../lib/db/client'
import { getGHLClient } from '../lib/ghl/client'
import { gradeCall } from '../lib/ai/grading'
import { syncGHLUsers } from '../lib/ghl/sync-users'

interface GHLMessage {
  id: string
  direction: string
  status: string
  type: number
  contactId: string
  conversationId: string
  userId?: string
  dateAdded: string
  dateUpdated?: string
  meta?: { call?: { duration?: number; status?: string } }
  altId?: string
  from?: string
  to?: string
  messageType: string
}

async function pollCalls() {
  console.log('[poll-calls] Starting call poll...')

  try {
    const tenants = await db.tenant.findMany({
      where: {
        ghlAccessToken: { not: null },
        ghlLocationId: { not: null },
      },
      select: { id: true, ghlLocationId: true, ghlAccessToken: true },
    })

    if (tenants.length === 0) {
      console.log('[poll-calls] No tenants with GHL connections')
      process.exit(0)
    }

    let totalNewCalls = 0

    for (const tenant of tenants) {
      try {
        // Sync GHL user data (phone numbers, names) on every poll cycle
        const syncResult = await syncGHLUsers(tenant.id)
        if (syncResult.synced > 0) {
          console.log(`[poll-calls] Synced ${syncResult.synced} user(s) from GHL for tenant ${tenant.id}`)
        }

        const ghl = await getGHLClient(tenant.id)

        // Pre-fetch all users with GHL mappings for this tenant
        const tenantUsers = await db.user.findMany({
          where: { tenantId: tenant.id, ghlUserId: { not: null } },
          select: { id: true, ghlUserId: true },
        })

        // Fetch recent conversations (all types — we'll filter messages inside)
        const result = await ghl.getConversations({ limit: 50 })
        const conversations = result.conversations ?? []

        if (conversations.length === 0) {
          console.log(`[poll-calls] No conversations for tenant ${tenant.id}`)
          continue
        }

        // For each conversation, fetch messages and find call messages
        for (const conv of conversations) {
          try {
            const headers = {
              'Authorization': `Bearer ${tenant.ghlAccessToken}`,
              'Content-Type': 'application/json',
              'Version': '2021-07-28',
            }

            const msgRes = await fetch(
              `https://services.leadconnectorhq.com/conversations/${conv.id}/messages`,
              { headers }
            )
            if (!msgRes.ok) continue

            const msgData = await msgRes.json() as { messages?: { messages?: GHLMessage[] } }
            const messages = msgData.messages?.messages ?? []

            // Filter to call messages only
            const callMessages = messages.filter(m => m.messageType === 'TYPE_CALL')

            for (const msg of callMessages) {
              const duration = msg.meta?.call?.duration ?? 0
              const callStatus = msg.meta?.call?.status ?? ''

              // Skip no-answer / very short calls
              if (duration < 45) continue

              // Use message ID as the unique identifier (not conversation ID)
              const ghlCallId = msg.altId || msg.id

              // Check if we already have this call
              const existing = await db.call.findFirst({
                where: {
                  tenantId: tenant.id,
                  OR: [
                    { ghlCallId },
                    // Also check by altId in case it was stored differently
                    ...(msg.altId ? [{ ghlCallId: msg.altId }] : []),
                    ...(msg.id !== ghlCallId ? [{ ghlCallId: msg.id }] : []),
                  ],
                },
                select: { id: true },
              })

              if (existing) continue

              // Match to user by GHL userId
              const ghlUserId = msg.userId || conv.userId || conv.assignedTo
              const user = ghlUserId
                ? tenantUsers.find(u => u.ghlUserId === ghlUserId)
                : null

              const direction = msg.direction === 'inbound' ? 'INBOUND' : 'OUTBOUND'
              const contactName = conv.contactName || conv.fullName || null

              // Create the call record
              const newCall = await db.call.create({
                data: {
                  tenantId: tenant.id,
                  ghlCallId,
                  ghlContactId: msg.contactId ?? conv.contactId ?? null,
                  assignedToId: user?.id ?? null,
                  direction: direction as 'INBOUND' | 'OUTBOUND',
                  durationSeconds: duration,
                  calledAt: new Date(msg.dateAdded || Date.now()),
                  gradingStatus: 'PENDING',
                },
              })

              totalNewCalls++
              console.log(`[poll-calls] New call: ${newCall.id} (msg: ${msg.id}, contact: ${contactName ?? conv.phone}, dur: ${duration}s) for tenant ${tenant.id}`)

              // Trigger grading — fire and forget
              gradeCall(newCall.id).catch((err) => {
                console.error(`[poll-calls] Grading failed for call ${newCall.id}:`, err instanceof Error ? err.message : err)
              })
            }
          } catch (err) {
            // Skip conversations that error (e.g. deleted contacts)
            continue
          }
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
