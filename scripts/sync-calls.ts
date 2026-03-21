#!/usr/bin/env tsx
// scripts/sync-calls.ts
// Historical bulk sync — contact-based approach (finds ALL calls, not just recent conversations)
// Run: npx tsx scripts/sync-calls.ts [--days=7] [--dry-run]
//
// STEP 1: Paginate all contacts via GET /contacts/
// STEP 2: For each contact, get their conversation + messages
// STEP 3: Filter TYPE_CALL messages with real duration > 45s
// STEP 4: Fetch recording, transcribe, grade
// STEP 5: Deduplicate by messageId

import { PrismaClient } from '@prisma/client'
import { fetchCallRecording } from '../lib/ghl/fetch-recording'
import { transcribeRecording } from '../lib/ai/transcribe'
import { gradeCall } from '../lib/ai/grading'

const db = new PrismaClient()

const GHL_BASE_URL = 'https://services.leadconnectorhq.com'
const GHL_API_VERSION = '2021-04-15'
const MIN_CALL_DURATION = 45

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)) }

async function main() {
  const args = process.argv.slice(2)
  const daysArg = args.find(a => a.startsWith('--days='))
  const days = daysArg ? parseInt(daysArg.split('=')[1]) : 7
  const dryRun = args.includes('--dry-run')

  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
  console.log(`[sync-calls] Syncing calls from last ${days} days (since ${cutoff.toISOString()})`)
  if (dryRun) console.log('[sync-calls] DRY RUN')

  const tenants = await db.tenant.findMany({
    where: { ghlAccessToken: { not: null }, ghlLocationId: { not: null } },
    select: { id: true, slug: true, ghlAccessToken: true, ghlLocationId: true },
  })

  if (tenants.length === 0) {
    console.log('[sync-calls] No tenants with GHL connections')
    process.exit(0)
  }

  for (const tenant of tenants) {
    console.log(`\n[sync-calls] Tenant: ${tenant.slug}`)

    const headers = {
      'Authorization': `Bearer ${tenant.ghlAccessToken}`,
      'Content-Type': 'application/json',
      'Version': GHL_API_VERSION,
    }

    // Pre-fetch existing call IDs for dedup
    const existingIds = new Set(
      (await db.call.findMany({ where: { tenantId: tenant.id }, select: { ghlCallId: true } }))
        .map(c => c.ghlCallId).filter(Boolean) as string[]
    )

    // Pre-fetch team members
    const tenantUsers = await db.user.findMany({
      where: { tenantId: tenant.id, ghlUserId: { not: null } },
      select: { id: true, ghlUserId: true },
    })

    let contactsChecked = 0
    let callsCreated = 0
    let skippedDupe = 0
    let startAfterId: string | undefined

    // STEP 1: Paginate contacts
    for (let page = 0; ; page++) {
      const params = new URLSearchParams({ locationId: tenant.ghlLocationId!, limit: '100' })
      if (startAfterId) params.set('startAfterId', startAfterId)

      const res = await fetch(`${GHL_BASE_URL}/contacts/?${params}`, { headers })

      if (res.status === 429) {
        console.log('  Rate limited — waiting 30s...')
        await sleep(30_000)
        page--
        continue
      }
      if (!res.ok) { console.log('  Contacts fetch failed:', res.status); break }

      const data = await res.json() as { contacts?: Array<{ id: string; firstName?: string; lastName?: string; email?: string; phone?: string }> }
      const contacts = data.contacts ?? []
      if (contacts.length === 0) break

      // STEP 2: For each contact, get conversation + messages
      for (const contact of contacts) {
        contactsChecked++
        await sleep(50) // rate limit spacing

        try {
          // Get conversation for this contact
          const convRes = await fetch(
            `${GHL_BASE_URL}/conversations/search?locationId=${tenant.ghlLocationId}&contactId=${contact.id}`,
            { headers },
          )
          if (convRes.status === 429) { await sleep(30_000); continue }
          if (!convRes.ok) continue

          const convData = await convRes.json() as { conversations?: Array<{ id: string; userId?: string; assignedTo?: string }> }
          const conv = convData.conversations?.[0]
          if (!conv) continue

          // Paginate messages
          let lastMsgId: string | undefined
          for (let mp = 0; mp < 5; mp++) {
            const msgUrl = `${GHL_BASE_URL}/conversations/${conv.id}/messages${lastMsgId ? `?lastMessageId=${lastMsgId}` : ''}`
            const msgRes = await fetch(msgUrl, { headers })
            if (msgRes.status === 429) { await sleep(30_000); mp--; continue }
            if (!msgRes.ok) break

            const msgData = await msgRes.json() as { messages?: { messages?: Array<Record<string, unknown>>; lastMessageId?: string; nextPage?: boolean } }
            const pageData = msgData.messages
            const msgs = pageData?.messages ?? []
            if (msgs.length === 0) break

            let hitOld = false

            for (const msg of msgs) {
              // Check call message
              const msgType = (String(msg.messageType ?? '')).toUpperCase()
              const isCall = msgType === 'TYPE_CALL' || msgType === 'CALL' || msg.type === 1
              if (!isCall) continue

              const msgDate = new Date(String(msg.dateAdded))
              if (msgDate < cutoff) { hitOld = true; continue }

              // Real duration
              const metaDur = (msg.callDuration as number | undefined) ?? (msg.meta as { call?: { duration?: number } } | undefined)?.call?.duration ?? 0
              const elapsed = msg.dateUpdated
                ? Math.round((new Date(String(msg.dateUpdated)).getTime() - msgDate.getTime()) / 1000)
                : 0
              const realDuration = Math.min(Math.max(metaDur, elapsed), 1800)

              // Reject bad statuses
              const status = String((msg.callStatus ?? (msg.meta as { call?: { status?: string } })?.call?.status ?? msg.status) ?? '').toLowerCase()
              if (['initiated', 'ringing', 'failed', 'busy'].includes(status)) continue
              if (realDuration < MIN_CALL_DURATION) continue

              // Dedup
              const dedupeId = String(msg.altId || msg.id)
              if (existingIds.has(dedupeId) || existingIds.has(String(msg.id))) { skippedDupe++; continue }
              existingIds.add(dedupeId)

              const contactName = `${contact.firstName ?? ''} ${contact.lastName ?? ''}`.trim() || contact.email || contact.phone || null
              const ghlUserId = String(msg.userId || conv.userId || conv.assignedTo || '')
              const user = ghlUserId ? tenantUsers.find(u => u.ghlUserId === ghlUserId) : null
              const direction = String(msg.direction) === 'inbound' ? 'INBOUND' : 'OUTBOUND'

              if (dryRun) {
                console.log(`  [dry] ${contactName} | ${realDuration}s | ${direction.toLowerCase()} | ${status}`)
                callsCreated++
                continue
              }

              // Create call with cached contact name
              const call = await db.call.create({
                data: {
                  tenantId: tenant.id,
                  ghlCallId: dedupeId,
                  ghlContactId: contact.id,
                  contactName,
                  assignedToId: user?.id ?? undefined,
                  direction: direction as 'INBOUND' | 'OUTBOUND',
                  durationSeconds: realDuration,
                  calledAt: msgDate,
                  gradingStatus: 'PENDING',
                },
              })

              // Fetch recording
              await sleep(100)
              const rec = await fetchCallRecording(tenant.ghlAccessToken!, tenant.ghlLocationId!, String(msg.id))

              if (rec.status === 'success' && rec.recordingUrl) {
                await db.call.update({ where: { id: call.id }, data: { recordingUrl: rec.recordingUrl } })

                // Transcribe
                const trans = await transcribeRecording(rec.recordingUrl, tenant.ghlAccessToken!)
                if (trans.status === 'success' && trans.transcript) {
                  await db.call.update({ where: { id: call.id }, data: { transcript: trans.transcript } })
                  await gradeCall(call.id).catch(() => {})
                  callsCreated++
                  console.log(`  ${contactName} | ${realDuration}s | ${direction.toLowerCase()} | TRANSCRIBED (${trans.transcript.length} ch)`)
                } else {
                  // No transcript — delete
                  await db.call.delete({ where: { id: call.id } })
                  console.log(`  ${contactName} | ${realDuration}s | transcribe failed — skipped`)
                }
              } else {
                // No recording — delete
                await db.call.delete({ where: { id: call.id } })
              }
            }

            if (hitOld || !pageData?.nextPage) break
            lastMsgId = pageData?.lastMessageId
          }
        } catch { continue }
      }

      startAfterId = contacts[contacts.length - 1]?.id
      if (contacts.length < 100) break

      if ((page + 1) % 5 === 0) {
        console.log(`  [progress] ${contactsChecked} contacts, ${callsCreated} new calls, ${skippedDupe} dupes`)
      }
    }

    console.log(`\n[sync-calls] ${tenant.slug} done: ${contactsChecked} contacts, ${callsCreated} calls created, ${skippedDupe} dupes`)
  }

  const total = await db.call.count()
  console.log(`\n[sync-calls] Total calls in DB: ${total}`)
}

main()
  .catch(console.error)
  .finally(() => db.$disconnect())
