// POST /api/webhooks/ghl/buyer-response
// GHL fires this when a buyer replies to a blast SMS/email
// Matches phone to buyer -> moves to Responded -> AI classifies intent
//
// GHL WEBHOOK SETUP:
// 1. Go to GHL -> Settings -> Webhooks
// 2. Add webhook URL: https://gunner-claude-production.up.railway.app/api/webhooks/ghl/buyer-response
// 3. Select events: InboundMessage
// 4. Save

import { NextResponse } from 'next/server'
import { db } from '@/lib/db/client'
import Anthropic from '@anthropic-ai/sdk'

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const phone = body.phone || body.from || body.contactPhone
    const message = body.body || body.message || body.text || ''
    const contactId = body.contactId || body.contact_id

    if (!phone && !contactId) {
      return NextResponse.json({ status: 'skipped', reason: 'no phone or contactId' })
    }

    // Find buyer by phone or GHL contact ID
    const buyer = await db.buyer.findFirst({
      where: contactId
        ? { ghlContactId: contactId }
        : { phone: { contains: phone.replace(/\D/g, '').slice(-10) } },
    })
    if (!buyer) {
      return NextResponse.json({ status: 'skipped', reason: 'buyer not found' })
    }

    // Find all PropertyBuyerStage records for this buyer in 'matched' or 'added' stage
    const stages = await db.propertyBuyerStage.findMany({
      where: { buyerId: buyer.id, stage: { in: ['matched', 'added'] } },
    })

    if (stages.length === 0) {
      return NextResponse.json({ status: 'skipped', reason: 'no active stages' })
    }

    // Move all to 'responded'
    await db.propertyBuyerStage.updateMany({
      where: { buyerId: buyer.id, stage: { in: ['matched', 'added'] } },
      data: {
        stage: 'responded',
        ghlResponse: message,
        responseAt: new Date(),
        movedToRespondedAt: new Date(),
      },
    })

    // AI classification of buyer intent
    if (message && process.env.ANTHROPIC_API_KEY) {
      try {
        const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
        const res = await anthropic.messages.create({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 100,
          messages: [{
            role: 'user',
            content: `You are analyzing a real estate buyer's SMS reply to a property deal blast. Classify their intent as one of: interested, not_interested, needs_followup, unclear. Reply with JSON only: {"intent": "string", "confidence": number}\nMessage: "${message}"`,
          }],
        })
        const aiText = res.content[0].type === 'text' ? res.content[0].text : '{}'
        const parsed = JSON.parse(aiText.match(/\{[\s\S]*\}/)?.[0] ?? '{}') as { intent?: string; confidence?: number }
        const intent = parsed.intent

        if (intent) {
          await db.propertyBuyerStage.updateMany({
            where: { buyerId: buyer.id, stage: 'responded' },
            data: { responseIntent: intent },
          })

          // Auto-move to interested if classified as such
          if (intent === 'interested') {
            await db.propertyBuyerStage.updateMany({
              where: { buyerId: buyer.id, stage: 'responded' },
              data: { stage: 'interested', movedToInterestedAt: new Date() },
            })
          }
        }
      } catch (aiErr) {
        console.error('[Buyer Response] AI classification failed:', aiErr)
      }
    }

    return NextResponse.json({ status: 'success', buyerId: buyer.id, stagesUpdated: stages.length })
  } catch (err) {
    console.error('[Buyer Response Webhook] Error:', err)
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}
