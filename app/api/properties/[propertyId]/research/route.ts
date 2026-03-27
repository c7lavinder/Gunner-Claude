// POST /api/properties/[propertyId]/research — fetch property data from Google
import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { db } from '@/lib/db/client'

const GOOGLE_API_KEY = process.env.GOOGLE_PLACES_API_KEY

interface PlaceResult {
  formattedAddress?: string
  location?: { latitude: number; longitude: number }
  types?: string[]
  displayName?: { text: string }
  googleMapsUri?: string
  photos?: Array<{ name: string }>
  addressComponents?: Array<{
    longText: string
    shortText: string
    types: string[]
  }>
}

export async function POST(
  req: Request,
  { params }: { params: { propertyId: string } }
) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    if (!GOOGLE_API_KEY) {
      return NextResponse.json({ error: 'Google API key not configured' }, { status: 500 })
    }

    const tenantId = session.tenantId
    const property = await db.property.findUnique({
      where: { id: params.propertyId, tenantId },
      select: { address: true, city: true, state: true, zip: true },
    })
    if (!property) return NextResponse.json({ error: 'Property not found' }, { status: 404 })

    const fullAddress = `${property.address}, ${property.city}, ${property.state} ${property.zip}`

    // Step 1: Search for the place using Google Places (New) API
    const searchRes = await fetch('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': GOOGLE_API_KEY,
        'X-Goog-FieldMask': 'places.formattedAddress,places.location,places.types,places.displayName,places.googleMapsUri,places.photos,places.addressComponents',
      },
      body: JSON.stringify({
        textQuery: fullAddress,
        maxResultCount: 1,
      }),
    })

    if (!searchRes.ok) {
      const err = await searchRes.text()
      console.error('[Research] Google Places search failed:', searchRes.status, err)
      return NextResponse.json({ error: 'Google Places API failed' }, { status: 500 })
    }

    const searchData = await searchRes.json()
    const place: PlaceResult | null = searchData.places?.[0] ?? null

    // Step 2: Geocode for precise coordinates (if Places didn't return them)
    let lat: number | null = place?.location?.latitude ?? null
    let lng: number | null = place?.location?.longitude ?? null

    if (!lat || !lng) {
      try {
        const geoRes = await fetch(
          `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(fullAddress)}&key=${GOOGLE_API_KEY}`
        )
        const geoData = await geoRes.json()
        if (geoData.results?.[0]?.geometry?.location) {
          lat = geoData.results[0].geometry.location.lat
          lng = geoData.results[0].geometry.location.lng
        }
      } catch { /* geocoding optional */ }
    }

    // Build research data
    const researchData = {
      googlePlaceData: place ? {
        formattedAddress: place.formattedAddress,
        displayName: place.displayName?.text,
        googleMapsUrl: place.googleMapsUri,
        types: place.types,
        addressComponents: place.addressComponents,
        photoCount: place.photos?.length ?? 0,
      } : null,
      coordinates: lat && lng ? { lat, lng } : null,
      streetViewUrl: lat && lng
        ? `https://maps.googleapis.com/maps/api/streetview?size=600x400&location=${lat},${lng}&key=${GOOGLE_API_KEY}`
        : null,
      zillowUrl: `https://www.zillow.com/homes/${encodeURIComponent(fullAddress)}`,
      googleMapsUrl: `https://www.google.com/maps/place/${encodeURIComponent(fullAddress)}`,
      researchedAt: new Date().toISOString(),
    }

    // Store Google research in property
    // Merge with any existing batchData
    const existingData = await db.property.findUnique({
      where: { id: params.propertyId },
      select: { zillowData: true },
    })
    const existing = (existingData?.zillowData ?? {}) as Record<string, unknown>
    const merged = { ...existing, ...researchData }

    await db.property.update({
      where: { id: params.propertyId },
      data: {
        zillowData: merged as unknown as import('@prisma/client').Prisma.InputJsonValue,
      },
    })

    // Also trigger BatchData enrichment (non-blocking)
    if (process.env.BATCHDATA_API_KEY) {
      import('@/lib/batchdata/enrich').then(({ enrichPropertyFromBatchData }) =>
        enrichPropertyFromBatchData(params.propertyId).catch(err =>
          console.warn('[Research] BatchData enrich failed:', err)
        )
      )
    }

    return NextResponse.json({
      status: 'success',
      research: merged,
    })
  } catch (err) {
    console.error('[Research] Error:', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Research failed' }, { status: 500 })
  }
}

// GET — return existing research data
export async function GET(
  req: Request,
  { params }: { params: { propertyId: string } }
) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const property = await db.property.findUnique({
      where: { id: params.propertyId, tenantId: session.tenantId },
      select: { zillowData: true },
    })
    if (!property) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    return NextResponse.json({ research: property.zillowData })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed' }, { status: 500 })
  }
}
