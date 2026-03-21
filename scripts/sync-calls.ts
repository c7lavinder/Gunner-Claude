#!/usr/bin/env tsx
// scripts/sync-calls.ts
// Historical bulk sync — pulls ALL calls from GHL, fetches recordings, stores in DB
// Run: npx tsx scripts/sync-calls.ts [--days=7] [--dry-run]
//
// STEP 1: Paginate all conversations (100 per page, cursor-based)
// STEP 2: For each conversation, paginate messages, filter TYPE_CALL with duration > 45
// STEP 3: For each qualifying call, fetch recording with rate limiting (10 req/s max)
// STEP 4: Deduplicate by messageId before inserting

import { PrismaClient } from '@prisma/client'
import { fetchCallRecording } from '../lib/ghl/fetch-recording'

const db = new PrismaClient()

const GHL_BASE_URL = 'https://services.leadconnectorhq.com'
const GHL_API_VERSION = '2021-04-15'
const RATE_LIMIT_MS = 100 // 10 requests per second
const MIN_CALL_DURATION = 45

interface GHLMessage {
  id: string
  messageType: string
  messageTypeId?: number
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
  callDuration?: number
  callStatus?: string
}

async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function main() {
  const args = process.argv.slice(2)
  const daysArg = args.find(a => a.startsWith('--days='))
  const days = daysArg ? parseInt(daysArg.split('=')[1]) : 7
  const dryRun = args.includes('--dry-run')

  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
  console.log(`[sync-calls] Syncing calls from last ${days} days (since ${cutoff.toISOString()})`)
  if (dryRun) console.log('[sync-calls] DRY RUN — no writes')

  // Get tenant
  const tenants = await db.tenant.findMany({
    where: { ghlAccessToken: { not: null }, ghlLocationId: { not: null } },
    select: { id: true, slug: true, ghlAccessToken: true, ghlLocationId: true },
  })

  if (tenants.length === 0) {
    console.log('[sync-calls] No tenants with GHL connections')
    process.exit(0)
  }

  for (const tenant of tenants) {
    console.log(`\n[sync-calls] Processing tenant: ${tenant.slug}`)

    const headers = {
      'Authorization': `Bearer ${tenant.ghlAccessToken}`,
      'Content-Type': 'application/json',
      'Version': GHL_API_VERSION,
    }

    // Pre-fetch existing call IDs for deduplication
    const existingCalls = await db.call.findMany({
      where: { tenantId: tenant.id },
      select: { ghlCallId: true },
    })
    const existingIds = new Set(existingCalls.map(c => c.ghlCallId).filter(Boolean))
    console.log(`[sync-calls] ${existingIds.size} existing calls in DB`)

    // Pre-fetch team members for user mapping
    const tenantUsers = await db.user.findMany({
      where: { tenantId: tenant.id, ghlUserId: { not: null } },
      select: { id: true, ghlUserId: true },
    })

    let conversationsScanned = 0
    let callsFound = 0
    let callsCreated = 0
    let callsSkippedDupe = 0
    let recordingsFetched = 0
    let recordingsFound = 0

    // STEP 1: Paginate all conversations
    let startAfterId: string | undefined

    for (let page = 0; ; page++) {
      const params = new URLSearchParams({
        locationId: tenant.ghlLocationId!,
        limit: '100',
      })
      if (startAfterId) params.set('startAfterId', startAfterId)

      const convRes = await fetch(`${GHL_BASE_URL}/conversations/search?${params}`, { headers })
      if (!convRes.ok) {
        console.error(`[sync-calls] Conversations fetch failed: ${convRes.status}`)
        break
      }

      const convData = await convRes.json() as {
        conversations?: Array<{
          id: string
          contactName?: string
          fullName?: string
          phone?: string
          contactId?: string
          userId?: string
          assignedTo?: string
        }>
      }
      const conversations = convData.conversations ?? []
      if (conversations.length === 0) break

      // STEP 2: For each conversation, get messages
      for (const conv of conversations) {
        conversationsScanned++

        let lastMessageId: string | undefined

        for (let msgPage = 0; msgPage < 10; msgPage++) {
          const msgUrl = `${GHL_BASE_URL}/conversations/${conv.id}/messages${lastMessageId ? `?lastMessageId=${lastMessageId}` : ''}`
          const msgRes = await fetch(msgUrl, { headers })
          if (!msgRes.ok) break

          const msgData = await msgRes.json() as {
            messages?: {
              messages?: GHLMessage[]
              lastMessageId?: string
              nextPage?: boolean
            }
          }
          const pageData = msgData.messages
          const messages = pageData?.messages ?? []
          if (messages.length === 0) break

          let hitOldMessage = false

          for (const msg of messages) {
            // Check if this is a call message
            const msgType = (msg.messageType ?? '').toUpperCase()
            const isCall = msgType === 'TYPE_CALL' || msgType === 'CALL' || msg.type === 1 || msg.messageTypeId === 1

            if (!isCall) continue

            // Check date
            const msgDate = new Date(msg.dateAdded)
            if (msgDate < cutoff) {
              hitOldMessage = true
              continue
            }

            // Get real duration — use callDuration, meta.call.duration, or elapsed time
            const metaDuration = msg.callDuration ?? msg.meta?.call?.duration ?? 0
            const elapsed = msg.dateUpdated
              ? Math.round((new Date(msg.dateUpdated).getTime() - new Date(msg.dateAdded).getTime()) / 1000)
              : 0
            const realDuration = Math.max(metaDuration, elapsed)

            // Check call status — accept completed or voicemail with real duration
            // Reject initiated/ringing/failed — these have big elapsed times but no actual conversation
            const status = (msg.callStatus ?? msg.meta?.call?.status ?? msg.status ?? '').toLowerCase()
            const isRejectedStatus = status === 'initiated' || status === 'ringing' || status === 'failed' || status === 'busy'
            if (isRejectedStatus) continue

            // Cap elapsed time at 30 minutes — anything longer is a data artifact
            const cappedDuration = Math.min(realDuration, 1800)
            if (cappedDuration < MIN_CALL_DURATION) continue

            callsFound++

            // STEP 4: Deduplicate
            const dedupeId = msg.altId || msg.id
            if (existingIds.has(dedupeId) || existingIds.has(msg.id)) {
              callsSkippedDupe++
              continue
            }

            // Mark as seen
            existingIds.add(dedupeId)
            if (msg.id !== dedupeId) existingIds.add(msg.id)

            const contactName = conv.contactName || conv.fullName || conv.phone || 'Unknown'
            const ghlUserId = msg.userId || conv.userId || conv.assignedTo
            const user = ghlUserId ? tenantUsers.find(u => u.ghlUserId === ghlUserId) : null
            const direction = msg.direction === 'inbound' ? 'INBOUND' : 'OUTBOUND'

            if (dryRun) {
              console.log(`  [dry] ${contactName} | ${cappedDuration}s (meta:${metaDuration}/elapsed:${elapsed}) | ${status} | ${direction.toLowerCase()} | ${msgDate.toLocaleString()}`)
              callsCreated++
              continue
            }

            // Create call record
            const call = await db.call.create({
              data: {
                tenantId: tenant.id,
                ghlCallId: dedupeId,
                ghlContactId: msg.contactId ?? conv.contactId ?? undefined,
                assignedToId: user?.id ?? undefined,
                direction: direction as 'INBOUND' | 'OUTBOUND',
                durationSeconds: cappedDuration,
                calledAt: msgDate,
                gradingStatus: 'PENDING',
              },
            })
            callsCreated++

            // STEP 3: Fetch recording with rate limiting
            await sleep(RATE_LIMIT_MS)
            recordingsFetched++

            const recordingResult = await fetchCallRecording(
              tenant.ghlAccessToken!,
              tenant.ghlLocationId!,
              msg.id, // use message ID, not altId
            )

            if (recordingResult.status === 'success' && recordingResult.recordingUrl) {
              await db.call.update({
                where: { id: call.id },
                data: { recordingUrl: recordingResult.recordingUrl },
              })
              recordingsFound++
              console.log(`  Created: ${contactName} | ${cappedDuration}s | ${direction.toLowerCase()} | RECORDING: YES`)
            } else {
              console.log(`  Created: ${contactName} | ${cappedDuration}s | ${direction.toLowerCase()} | recording: ${recordingResult.status}`)
            }
          }

          // Stop paginating messages if we hit old messages or no more pages
          if (hitOldMessage || !pageData?.nextPage) break
          lastMessageId = pageData?.lastMessageId
        }
      }

      startAfterId = conversations[conversations.length - 1]?.id
      if (conversations.length < 100) break // last page

      if ((page + 1) % 5 === 0) {
        console.log(`  [progress] Page ${page + 1}: ${conversationsScanned} convs, ${callsFound} calls found, ${callsCreated} created`)
      }
    }

    console.log(`\n[sync-calls] Tenant ${tenant.slug} complete:`)
    console.log(`  Conversations scanned: ${conversationsScanned}`)
    console.log(`  Gradeable calls found: ${callsFound}`)
    console.log(`  New calls created: ${callsCreated}`)
    console.log(`  Skipped (duplicate): ${callsSkippedDupe}`)
    console.log(`  Recordings fetched: ${recordingsFetched}`)
    console.log(`  Recordings found: ${recordingsFound}`)
  }

  const total = await db.call.count()
  console.log(`\n[sync-calls] Done. Total calls in DB: ${total}`)
}

main()
  .catch(console.error)
  .finally(() => db.$disconnect())
