// lib/ai/enrich-property.ts
// Background AI enrichment — fires on property create, non-blocking
// WRITES TO: properties.arv, repair_estimate, rental_estimate, neighborhood_summary, flood_zone, description, field_sources, ai_enrichment_status
// API ENDPOINT: called directly from POST /api/properties and POST /api/properties/[propertyId]/re-enrich
// READ BY: property detail page via server component select

import { db } from '@/lib/db/client'
import { logAiCall, startTimer } from '@/lib/ai/log'
import { logFailure } from '@/lib/audit'
import { anthropic } from '@/config/anthropic'

export async function enrichPropertyWithAI(propertyId: string, tenantId: string) {
  try {
    // Scoped on tenantId at every site — caller is no longer load-bearing.
    await db.property.update({
      where: { id: propertyId, tenantId },
      data: { aiEnrichmentStatus: 'pending' },
    })

    const property = await db.property.findFirst({
      where: { id: propertyId, tenantId },
      select: {
        address: true, city: true, state: true, zip: true,
        beds: true, baths: true, sqft: true, yearBuilt: true,
        propertyType: true, description: true, fieldSources: true,
        arv: true,
      },
    })
    if (!property) return

    const timer = startTimer()

    // Use Claude to generate estimates
    const prompt = `You are a real estate analyst. For this property, provide estimates:
Address: ${property.address}, ${property.city}, ${property.state} ${property.zip}
${property.beds ? `Beds: ${property.beds}` : ''} ${property.baths ? `Baths: ${property.baths}` : ''} ${property.sqft ? `Sqft: ${property.sqft}` : ''} ${property.yearBuilt ? `Year: ${property.yearBuilt}` : ''} ${property.propertyType ? `Type: ${property.propertyType}` : ''}

Return ONLY JSON:
{
  "arv": number or null (after-repair value estimate in dollars),
  "repairEstimate": number or null (estimated repair costs),
  "rentalEstimate": number or null (monthly rent estimate),
  "neighborhoodSummary": "brief 2-3 sentence market/neighborhood description",
  "description": "deal summary paragraph if no description exists"
}

Base estimates on the location, size, and year. If insufficient data, use null.`

    const res = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 500,
      messages: [{ role: 'user', content: prompt }],
    })

    const text = res.content[0].type === 'text' ? res.content[0].text : '{}'

    logAiCall({
      tenantId, userId: null,
      type: 'property_enrich', pageContext: `property:${propertyId}`,
      input: `Enrich ${property.address}`, output: text.slice(0, 5000),
      tokensIn: res.usage?.input_tokens, tokensOut: res.usage?.output_tokens,
      durationMs: timer(), model: 'claude-sonnet-4-6',
    }).catch((err) => {
      logFailure(tenantId, 'enrich_property.ai_log_failed', `property:${propertyId}`, err)
    })

    const match = text.match(/\{[\s\S]*\}/)
    if (!match) throw new Error('No JSON in response')

    const data = JSON.parse(match[0]) as {
      arv?: number | null
      repairEstimate?: number | null
      rentalEstimate?: number | null
      neighborhoodSummary?: string | null
      description?: string | null
    }

    const fieldSources = { ...((property.fieldSources as Record<string, string>) ?? {}) }
    const updateData: Record<string, unknown> = {}

    // Only set ARV if property doesn't already have one
    if (data.arv && !property.arv) {
      updateData.arv = data.arv
      fieldSources.arv = 'ai'
    }
    if (data.repairEstimate) {
      updateData.repairEstimate = data.repairEstimate
      fieldSources.repairEstimate = 'ai'
    }
    if (data.rentalEstimate) {
      updateData.rentalEstimate = data.rentalEstimate
      fieldSources.rentalEstimate = 'ai'
    }
    if (data.neighborhoodSummary) {
      updateData.neighborhoodSummary = data.neighborhoodSummary
      fieldSources.neighborhoodSummary = 'ai'
    }
    if (data.description && !property.description) {
      updateData.description = data.description
      fieldSources.description = 'ai'
    }

    // Try FEMA flood zone (free API)
    try {
      const femaUrl = `https://msc.fema.gov/arcgis/rest/services/public/NFHLWMS/MapServer/identify?geometry=${encodeURIComponent(`${property.address}, ${property.city}, ${property.state} ${property.zip}`)}&geometryType=esriGeometryPoint&f=json&tolerance=10&mapExtent=-180,-90,180,90&imageDisplay=800,600,96&returnGeometry=false&layers=all`
      const femaRes = await fetch(femaUrl, { signal: AbortSignal.timeout(5000) }).catch((err) => {
        logFailure(tenantId, 'enrich_property.fema_api_failed', `property:${propertyId}`, err)
        return null
      })
      if (femaRes?.ok) {
        const femaData = await femaRes.json() as { results?: Array<{ attributes?: { FLD_ZONE?: string } }> }
        const floodZone = femaData?.results?.[0]?.attributes?.FLD_ZONE
        if (floodZone) {
          updateData.floodZone = floodZone
          fieldSources.floodZone = 'api'
        }
      }
    } catch {
      // FEMA API failure is non-fatal
    }

    updateData.fieldSources = fieldSources
    updateData.aiEnrichmentStatus = 'complete'

    await db.property.update({ where: { id: propertyId, tenantId }, data: updateData })
    console.log(`[AI Enrich] Completed for ${property.address}`)
  } catch (err) {
    console.error('[AI Enrich] Failed:', err)
    await db.property.update({
      where: { id: propertyId, tenantId },
      data: {
        aiEnrichmentStatus: 'failed',
        aiEnrichmentError: err instanceof Error ? err.message : 'Unknown',
      },
    }).catch((updateErr) => {
      logFailure(tenantId, 'enrich_property.status_update_failed', `property:${propertyId}`, updateErr)
    })
  }
}
