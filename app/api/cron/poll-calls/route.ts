// app/api/cron/poll-calls/route.ts
// HTTP endpoint for call polling — hit by Railway cron or external cron service
// Protected by CRON_SECRET to prevent unauthorized triggers

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db/client'
import { getGHLClient } from '@/lib/ghl/client'
import { gradeCall } from '@/lib/ai/grading'

export async function GET(request: NextRequest) {
  // Verify cron secret to prevent unauthorized access
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET ?? ''

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const tenants = await db.tenant.findMany({
      where: {
        ghlAccessToken: { not: null },
        ghlLocationId: { not: null },
      },
      select: { id: true, ghlLocationId: true },
    })

    if (tenants.length === 0) {
      return NextResponse.json({ status: 'no_results', tenantsChecked: 0, newCalls: 0 })
    }

    let totalNewCalls = 0

    for (const tenant of tenants) {
      try {
        const ghl = await getGHLClient(tenant.id)
        const result = await ghl.getConversations({ limit: 50 })
        const callConversations = (result.conversations ?? []).filter(
          (c) => c.lastMessageType === 'TYPE_CALL'
        )

        for (const conv of callConversations) {
          const existing = await db.call.findFirst({
            where: { tenantId: tenant.id, ghlCallId: conv.id },
            select: { id: true },
          })

          if (existing) continue

          const user = await db.user.findFirst({
            where: { tenantId: tenant.id },
            select: { id: true },
          })

          const direction = conv.lastMessageDirection === 'inbound' ? 'INBOUND' : 'OUTBOUND'

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

          gradeCall(newCall.id).catch((err) => {
            console.error(`[poll-calls] Grading failed for ${newCall.id}:`, err instanceof Error ? err.message : err)
          })
        }
      } catch (err) {
        console.error(`[poll-calls] Error for tenant ${tenant.id}:`, err instanceof Error ? err.message : err)
      }
    }

    return NextResponse.json({
      status: 'success',
      tenantsChecked: tenants.length,
      newCalls: totalNewCalls,
    })
  } catch (err) {
    console.error('[poll-calls] Fatal error:', err)
    return NextResponse.json({ status: 'error', error: err instanceof Error ? err.message : 'Unknown' }, { status: 500 })
  }
}
