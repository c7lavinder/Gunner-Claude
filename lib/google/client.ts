// lib/google/client.ts
//
// Google Places API (New) client. Base: https://places.googleapis.com/v1
// Auth: X-Goog-Api-Key header.
//
// What we use this for:
//   1. Canonical address verification (BatchData sometimes normalizes
//      addresses differently; Google's text search is the source of truth)
//   2. Stable place_id for external linking
//   3. Street View static image URL for the inventory list thumbnail
//   4. One photo URL for the Property row when the place has user-uploaded
//      or Google-provided imagery
//
// Pricing (as of 2026): Places Text Search = $0.017/request, Street View
// Static = free up to 100k/month.

const PLACES_BASE = 'https://places.googleapis.com/v1'
const STREETVIEW_BASE = 'https://maps.googleapis.com/maps/api/streetview'
const PLACE_PHOTO_BASE = 'https://places.googleapis.com/v1'

function getApiKey(): string {
  const key = process.env.GOOGLE_PLACES_API_KEY
  if (!key) throw new Error('GOOGLE_PLACES_API_KEY not configured')
  return key
}

export interface GooglePlaceResult {
  placeId: string
  formattedAddress?: string
  latitude?: number
  longitude?: number
  placeTypes?: string[]
  streetViewUrl?: string
  mapsUrl?: string
  photoThumbnailUrl?: string
  raw?: Record<string, unknown>
}

/**
 * Resolve a free-form address to a Google Place. Returns null on API error
 * or no-match.
 */
export async function lookupPlace(
  street: string, city: string, state: string, zip: string,
): Promise<GooglePlaceResult | null> {
  const apiKey = getApiKey()
  const fullAddress = `${street}, ${city}, ${state} ${zip}`

  try {
    const res = await fetch(`${PLACES_BASE}/places:searchText`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        // FieldMask tells Places what to return. Only what we need — costs
        // the same but keeps payload tight.
        'X-Goog-FieldMask':
          'places.id,places.formattedAddress,places.location,places.types,places.googleMapsUri,places.photos',
      },
      body: JSON.stringify({
        textQuery: fullAddress,
        maxResultCount: 1,
      }),
    })

    if (!res.ok) {
      const text = await res.text().catch(() => '')
      console.error(`[Google] Places API error: ${res.status} ${text}`)
      return null
    }

    const body = await res.json() as { places?: Array<Record<string, unknown>> }
    const place = body.places?.[0]
    if (!place) {
      console.warn(`[Google] no place match for ${fullAddress}`)
      return null
    }

    const location = (place.location ?? {}) as { latitude?: number; longitude?: number }
    const lat = num(location.latitude)
    const lng = num(location.longitude)
    const placeId = String(place.id ?? '')
    const photos = Array.isArray(place.photos) ? place.photos as Array<Record<string, unknown>> : []
    const firstPhotoName = photos[0]?.name as string | undefined

    return {
      placeId,
      formattedAddress: str(place.formattedAddress),
      latitude: lat,
      longitude: lng,
      placeTypes: Array.isArray(place.types) ? (place.types as unknown[]).map(String) : undefined,
      streetViewUrl: lat != null && lng != null
        ? `${STREETVIEW_BASE}?size=600x400&location=${lat},${lng}&key=${apiKey}`
        : undefined,
      mapsUrl: str(place.googleMapsUri)
        ?? `https://www.google.com/maps/place/?q=place_id:${encodeURIComponent(placeId)}`,
      photoThumbnailUrl: firstPhotoName
        ? `${PLACE_PHOTO_BASE}/${firstPhotoName}/media?maxWidthPx=400&key=${apiKey}`
        : undefined,
      raw: place,
    }
  } catch (err) {
    console.error('[Google] lookup failed:', err instanceof Error ? err.message : err)
    return null
  }
}

function num(v: unknown): number | undefined {
  if (v == null || v === '') return undefined
  const n = Number(v)
  return isNaN(n) ? undefined : n
}

function str(v: unknown): string | undefined {
  if (v == null || v === '') return undefined
  return String(v)
}
