// app/api/health/route.ts
import { NextResponse } from 'next/server'
import { db } from '@/lib/db/client'

// Track whether webhook re-registration has been done this boot
let webhookChecked = false
let sourcesFixed = false

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

    // One-time fix: rename 'ai' → 'api' for BatchData-sourced fields
    if (!sourcesFixed) {
      sourcesFixed = true
      fixOldAiSources().catch(err => console.warn('[Health] Source fix failed:', err))
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

// One-time: fix old 'ai' → 'api' for BatchData-sourced property fields
async function fixOldAiSources() {
  const apiFields = ['beds', 'baths', 'sqft', 'yearBuilt', 'lotSize', 'propertyType']
  const properties = await db.property.findMany({
    where: { fieldSources: { not: 'null' as unknown as undefined } },
    select: { id: true, fieldSources: true },
  })
  let fixed = 0
  for (const p of properties) {
    const sources = (p.fieldSources ?? {}) as Record<string, string>
    let changed = false
    for (const f of apiFields) {
      if (sources[f] === 'ai') { sources[f] = 'api'; changed = true }
    }
    if (changed) {
      await db.property.update({ where: { id: p.id }, data: { fieldSources: sources } })
      fixed++
    }
  }
  if (fixed > 0) console.log(`[Health] Fixed ${fixed} properties: 'ai' → 'api' for BatchData fields`)
}
