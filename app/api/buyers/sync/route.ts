// POST /api/buyers/sync — sync buyers from GHL in batches
// Each call processes ~100 contacts (takes ~15s), returns progress.
// Client loops until done.
import { NextResponse } from 'next/server'
import { withTenant } from '@/lib/api/withTenant'
import { getGHLClient } from '@/lib/ghl/client'
import { syncBuyerFromGHL } from '@/lib/buyers/sync'

export const POST = withTenant(async (request, ctx) => {
  const body = await request.json().catch(() => ({}))
  const offset = (body.offset as number) ?? 0
  const batchSize = 100

  try {
    const ghl = await getGHLClient(ctx.tenantId)
    const pipelines = await ghl.getPipelines()
    const buyerPipeline = pipelines.pipelines?.find(p => p.name.toLowerCase().includes('buyer'))
    if (!buyerPipeline) return NextResponse.json({ error: 'No buyer pipeline found' }, { status: 404 })

    // Get all contact IDs (fast — just opportunity metadata)
    const contactIds = await ghl.getAllPipelineContacts(buyerPipeline.id)
    const total = contactIds.length

    if (offset >= total) {
      return NextResponse.json({ synced: 0, total, offset, done: true })
    }

    // Process this batch
    const batch = contactIds.slice(offset, offset + batchSize)
    let synced = 0

    for (let i = 0; i < batch.length; i += 20) {
      const chunk = batch.slice(i, i + 20)
      const contacts = await Promise.all(chunk.map(id => ghl.getContact(id).catch(() => null)))
      for (const c of contacts) {
        if (!c) continue
        try {
          await syncBuyerFromGHL(ctx.tenantId, {
            id: c.id, firstName: c.firstName, lastName: c.lastName,
            phone: c.phone, email: c.email, city: c.city, state: c.state,
            tags: c.tags ?? [], customFields: c.customFields ?? [],
          })
          synced++
        } catch {}
      }
    }

    const nextOffset = offset + batchSize
    const done = nextOffset >= total

    return NextResponse.json({
      synced,
      total,
      offset: nextOffset,
      done,
      message: done
        ? `Sync complete — ${total} buyers`
        : `Synced ${Math.min(nextOffset, total)} of ${total}...`,
    })
  } catch (err) {
    console.error('[BuyerSync]', err)
    return NextResponse.json({ error: 'Sync failed' }, { status: 500 })
  }
})
