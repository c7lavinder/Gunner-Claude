// scripts/poll-calls.ts
// Polling fallback for call grading — runs every 60s via Railway cron
// CallCompleted webhook is NOT available in GHL Marketplace Apps
// This script fetches recent calls from GHL and grades any ungraded ones

import { db } from '../lib/db/client'
import { getGHLClient } from '../lib/ghl/client'
import { gradeCall } from '../lib/ai/grading'

interface ToolResponse {
  status: 'success' | 'error' | 'no_results'
  data?: { tenantsChecked: number; newCallsFound: number; gradingTriggered: number }
  error?: string
  suggestion?: string
}

async function pollCalls(): Promise<ToolResponse> {
  console.log('[poll-calls] Starting call poll...')

  try {
    // Find all tenants with active GHL connections
    const tenants = await db.tenant.findMany({
      where: {
        ghlAccessToken: { not: null },
        ghlLocationId: { not: null },
      },
      select: {
        id: true,
        ghlLocationId: true,
      },
    })

    if (tenants.length === 0) {
      console.log('[poll-calls] No tenants with GHL connections')
      return { status: 'no_results', data: { tenantsChecked: 0, newCallsFound: 0, gradingTriggered: 0 } }
    }

    let totalNewCalls = 0
    let totalGrading = 0

    for (const tenant of tenants) {
      try {
        const ghl = await getGHLClient(tenant.id)

        // Fetch calls from the last 5 minutes to catch recent ones
        const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString()
        const now = new Date().toISOString()

        const result = await ghl.getRecentCalls({
          startDate: fiveMinutesAgo,
          endDate: now,
          limit: 50,
        })

        const calls = result.calls ?? []
        if (calls.length === 0) continue

        for (const ghlCall of calls) {
          // Skip if we already have this call
          const existing = await db.call.findUnique({
            where: { ghlCallId: ghlCall.id },
            select: { id: true },
          })

          if (existing) continue

          // Find the user in our system by GHL userId
          const user = await db.user.findFirst({
            where: { tenantId: tenant.id },
            select: { id: true },
          })

          // Create the call record
          const newCall = await db.call.create({
            data: {
              tenantId: tenant.id,
              ghlCallId: ghlCall.id,
              assignedToId: user?.id ?? null,
              direction: ghlCall.direction === 'inbound' ? 'INBOUND' : 'OUTBOUND',
              durationSeconds: ghlCall.duration ?? null,
              recordingUrl: ghlCall.recordingUrl ?? null,
              calledAt: ghlCall.createdAt ? new Date(ghlCall.createdAt) : new Date(),
              gradingStatus: 'PENDING',
            },
          })

          totalNewCalls++
          console.log(`[poll-calls] New call found: ${newCall.id} (GHL: ${ghlCall.id}) for tenant ${tenant.id}`)

          // Trigger grading — fire and forget
          gradeCall(newCall.id).catch((err) => {
            console.error(`[poll-calls] Grading failed for call ${newCall.id}:`, err)
          })
          totalGrading++
        }
      } catch (err) {
        console.error(`[poll-calls] Error polling tenant ${tenant.id}:`, err instanceof Error ? err.message : err)
        // Continue to next tenant — don't let one failure stop all polling
      }
    }

    console.log(`[poll-calls] Done. Tenants: ${tenants.length}, New calls: ${totalNewCalls}, Grading triggered: ${totalGrading}`)

    return {
      status: 'success',
      data: {
        tenantsChecked: tenants.length,
        newCallsFound: totalNewCalls,
        gradingTriggered: totalGrading,
      },
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[poll-calls] Fatal error:', message)
    return {
      status: 'error',
      error: message,
      suggestion: 'Check database connectivity and GHL token status',
    }
  }
}

// Run immediately when script is executed
pollCalls()
  .then((result) => {
    console.log('[poll-calls] Result:', JSON.stringify(result))
    process.exit(result.status === 'error' ? 1 : 0)
  })
  .catch((err) => {
    console.error('[poll-calls] Unhandled error:', err)
    process.exit(1)
  })
