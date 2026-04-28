// app/api/[tenant]/calls/[id]/property-suggestions/route.ts
// POST — AI analyzes call transcript and suggests property data updates
import { NextResponse } from 'next/server'
import { withTenant } from '@/lib/api/withTenant'
import { db } from '@/lib/db/client'
import Anthropic from '@anthropic-ai/sdk'
import { logAiCall, startTimer } from '@/lib/ai/log'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

export const POST = withTenant<{ tenant: string; id: string }>(async (_request, ctx, params) => {
  try {
    const call = await db.call.findFirst({
      where: { id: params.id, tenantId: ctx.tenantId },
      select: {
        transcript: true,
        aiSummary: true,
        callType: true,
        property: {
          select: {
            id: true,
            address: true,
            askingPrice: true,
            arv: true,
            beds: true,
            baths: true,
            sqft: true,
            yearBuilt: true,
            occupancy: true,
            propertyType: true,
            description: true,
            propertyCondition: true,
            waterType: true,
            sewerType: true,
            sewerCondition: true,
          },
        },
      },
    })

    if (!call?.property) return NextResponse.json({ suggestions: [] })
    if (!call.transcript && !call.aiSummary) return NextResponse.json({ suggestions: [] })

    const prop = call.property
    const transcript = call.transcript?.slice(0, 3000) ?? call.aiSummary ?? ''
    const timer = startTimer()

    const res = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      messages: [{
        role: 'user',
        content: `Analyze this real estate call transcript and extract any property data that should update the property record.

Property: ${prop.address}
Current data: beds=${prop.beds}, baths=${prop.baths}, sqft=${prop.sqft}, year=${prop.yearBuilt}, type=${prop.propertyType}, occupancy=${prop.occupancy}, asking=${prop.askingPrice}, arv=${prop.arv}, water=${prop.waterType}, sewer=${prop.sewerType}, sewerCondition=${prop.sewerCondition}, propertyCondition=${prop.propertyCondition}

Transcript:
${transcript}

Extract data points the seller mentioned. Only include data that is explicitly stated or strongly implied. Return JSON array:
[{
  "field": "<DB field name: askingPrice, beds, baths, sqft, yearBuilt, occupancy, propertyType, waterType, sewerType, sewerCondition, description, internalNotes, propertyCondition>",
  "label": "<human readable label>",
  "currentValue": "<current value or null>",
  "suggestedValue": "<extracted value>",
  "confidence": "<high|medium|low>",
  "quote": "<exact quote from transcript supporting this>"
}]

Only return fields where the call reveals NEW information not already in the record. Return empty array if nothing new.
Return ONLY the JSON array, no other text.`,
      }],
    })

    const text = res.content[0].type === 'text' ? res.content[0].text : '[]'

    logAiCall({
      tenantId: ctx.tenantId, userId: ctx.userId,
      type: 'property_enrich', pageContext: `call:${params.id}`,
      input: `Property suggestions for ${prop.address}`, output: text.slice(0, 5000),
      tokensIn: res.usage?.input_tokens, tokensOut: res.usage?.output_tokens,
      durationMs: timer(), model: 'claude-sonnet-4-6',
    }).catch(() => {})

    const match = text.match(/\[[\s\S]*\]/)
    const suggestions = match
      ? JSON.parse(match[0]).map((s: Record<string, unknown>) => ({ ...s, applied: false }))
      : []

    return NextResponse.json({ suggestions })
  } catch (err) {
    console.error('[Property Suggestions] Error:', err)
    return NextResponse.json({ error: 'Failed to analyze call' }, { status: 500 })
  }
})
