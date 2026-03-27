// app/api/health/route.ts
import { NextResponse } from 'next/server'
import { db } from '@/lib/db/client'

// Track whether webhook re-registration has been done this boot
let webhookChecked = false

export async function GET() {
  try {
    await db.$queryRaw`SELECT 1`

    // On first health check after deploy, re-register GHL webhooks
    // to ensure ContactUpdate/ContactDelete events are subscribed
    if (!webhookChecked) {
      webhookChecked = true
      // Run async — don't block the health check
      reregisterAllWebhooks().catch(err =>
        console.warn('[Health] Webhook re-registration failed:', err)
      )
    }

    return NextResponse.json({ status: 'ok', timestamp: new Date().toISOString() })
  } catch {
    return NextResponse.json({ status: 'error', db: 'unreachable' }, { status: 503 })
  }
}

async function reregisterAllWebhooks() {
  const { reregisterWebhookForTenant } = await import('@/lib/ghl/webhook-register')
  const tenants = await db.tenant.findMany({
    where: { ghlAccessToken: { not: null } },
    select: { id: true, slug: true },
  })
  for (const t of tenants) {
    try {
      await reregisterWebhookForTenant(t.id)
      console.log(`[Health] Webhook re-registered for tenant ${t.slug}`)
    } catch (err) {
      console.warn(`[Health] Webhook failed for ${t.slug}:`, err)
    }
  }
}
