// app/api/diagnostics/pr-probe/route.ts
//
// Token-gated diagnostic. Triggers a raw PropertyRadar API call for a real
// address from the database and returns the full request + response detail
// so we can diagnose why PR is returning matched=0 in production.
//
// Auth: Authorization: Bearer <DIAGNOSTIC_TOKEN env var>. 401 if missing.
//
// Use:
//   GET /api/diagnostics/pr-probe?tenant=<slug>[&propertyId=<id>]
// If propertyId is omitted, uses the most recently created property in
// that tenant.

import { NextResponse } from 'next/server'
import { db } from '@/lib/db/client'
import { enrichProperty } from '@/lib/enrichment/enrich-property'

const PR_BASE = 'https://api.propertyradar.com/v1'

export async function GET(req: Request) {
  const token = process.env.DIAGNOSTIC_TOKEN
  const auth = req.headers.get('authorization') ?? ''
  if (!token || auth !== `Bearer ${token}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const url = new URL(req.url)
  const tenantSlug = url.searchParams.get('tenant')
  const propertyId = url.searchParams.get('propertyId')
  // Purchase=1 actually materializes the record (debits 1 credit). Default
  // to 0 (preview, no credit) for safety; pass ?purchase=1 to verify real
  // data flow through the matching path.
  const purchase = url.searchParams.get('purchase') === '1' ? 1 : 0
  // ?enrich=1 also runs the full enrichProperty() orchestrator afterward
  // and reports columns written + a re-fetch of the property to show what
  // landed. Burns ~3 PR credits + 1 Google call per invocation.
  const runEnrich = url.searchParams.get('enrich') === '1'
  if (!tenantSlug) {
    return NextResponse.json({ error: 'Missing ?tenant=<slug>' }, { status: 400 })
  }

  const tenant = await db.tenant.findUnique({
    where: { slug: tenantSlug },
    select: { id: true },
  })
  if (!tenant) return NextResponse.json({ error: 'Tenant not found' }, { status: 404 })

  const property = propertyId
    ? await db.property.findFirst({
        where: { id: propertyId, tenantId: tenant.id },
        select: { id: true, address: true, city: true, state: true, zip: true },
      })
    : await db.property.findFirst({
        where: { tenantId: tenant.id, address: { not: '' } },
        select: { id: true, address: true, city: true, state: true, zip: true },
        orderBy: { createdAt: 'desc' },
      })
  if (!property) return NextResponse.json({ error: 'Property not found' }, { status: 404 })

  const apiKey = process.env.PROPERTYRADAR_API_KEY
  if (!apiKey) {
    return NextResponse.json({
      error: 'PROPERTYRADAR_API_KEY not configured',
      property,
      apiKeySet: false,
    }, { status: 500 })
  }

  const criteria = {
    Criteria: [
      { name: 'Address', value: [property.address] },
      { name: 'City',    value: [property.city] },
      { name: 'State',   value: [property.state] },
      { name: 'ZipFive', value: [property.zip] },
    ],
  }

  // Phase 1 — raw search call with full diagnostics
  const searchUrl = `${PR_BASE}/properties?Purchase=${purchase}&Limit=1`
  const startedAt = Date.now()
  let searchStatus = 0
  let searchBodyText = ''
  let searchHeaders: Record<string, string> = {}
  try {
    const res = await fetch(searchUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(criteria),
    })
    searchStatus = res.status
    searchHeaders = Object.fromEntries(res.headers.entries())
    searchBodyText = await res.text()
  } catch (err) {
    return NextResponse.json({
      stage: 'search_fetch_threw',
      error: err instanceof Error ? err.message : String(err),
      property,
      criteria,
      apiKeyPrefix: apiKey.slice(0, 8) + '…' + apiKey.slice(-4),
    }, { status: 500 })
  }

  // Try to parse the body
  let parsed: unknown = null
  let parseError: string | null = null
  try { parsed = JSON.parse(searchBodyText) } catch (e) { parseError = e instanceof Error ? e.message : String(e) }

  const parsedObj = (parsed ?? {}) as Record<string, unknown>
  const results = parsedObj.results as Array<Record<string, unknown>> | undefined
  const firstResult = results?.[0]
  const radarId = firstResult ? (firstResult.RadarID as string | undefined) : undefined

  // Optional: run the full enrichment orchestrator. Writes to DB.
  let enrichResult: unknown = null
  let propertyAfter: unknown = null
  if (runEnrich) {
    try {
      enrichResult = await enrichProperty(property.id, tenant.id)
      const after = await db.property.findUnique({
        where: { id: property.id },
        select: { fieldSources: true, distressScore: true, availableEquity: true, estimatedEquity: true, openMortgageBalance: true, beds: true, baths: true, sqft: true, yearBuilt: true, taxAssessment: true, advancedPropertyType: true, latitude: true, longitude: true, apn: true },
      })
      propertyAfter = after
    } catch (err) {
      enrichResult = { error: err instanceof Error ? err.message : String(err) }
    }
  }

  return NextResponse.json({
    durationMs: Date.now() - startedAt,
    property,
    apiKeyPrefix: apiKey.slice(0, 8) + '…' + apiKey.slice(-4),
    apiKeyLength: apiKey.length,
    request: {
      url: searchUrl,
      criteria,
    },
    enrich: enrichResult,
    propertyAfter,
    response: {
      status: searchStatus,
      headers: {
        'x-ratelimit-remaining': searchHeaders['x-ratelimit-remaining'] ?? null,
        'x-ratelimit-limit': searchHeaders['x-ratelimit-limit'] ?? null,
        'content-type': searchHeaders['content-type'] ?? null,
      },
      bodyTruncated: searchBodyText.slice(0, 4000),
      parseError,
      resultsCount: Array.isArray(results) ? results.length : null,
      hasFirstResult: !!firstResult,
      radarIdFound: !!radarId,
      // Surface envelope fields that PR uses for diagnostics
      envelope: {
        success: parsedObj.success ?? null,
        totalCount: parsedObj.totalCount ?? null,
        resultCount: parsedObj.resultCount ?? null,
        quantityFreeRemaining: parsedObj.quantityFreeRemaining ?? null,
        chargedToYou: parsedObj.chargedToYou ?? null,
        message: parsedObj.message ?? null,
        errors: parsedObj.errors ?? null,
      },
    },
  })
}
