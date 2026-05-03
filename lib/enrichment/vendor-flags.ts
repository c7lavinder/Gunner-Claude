// lib/enrichment/vendor-flags.ts
//
// Single source of truth for "is this property-data vendor enabled?".
// Set ENRICHMENT_VENDORS_ENABLED on Railway to a comma-separated list of
// vendor names. Default = 'propertyradar,google' (Session 66 simplification —
// PR is the primary data source + Google supplies Inventory page Street
// View images). The remaining 4 vendors (batchdata, courtlistener, rentcast,
// realestateapi) are gated off by default; set them explicitly to re-enable.
//
// To restore the pre-Session-66 4-vendor flow:
//   ENRICHMENT_VENDORS_ENABLED=propertyradar,google,batchdata,courtlistener
//
// To go pure PropertyRadar-only (no images on new properties):
//   ENRICHMENT_VENDORS_ENABLED=propertyradar
//
// Recognized names (lowercased): propertyradar, google, batchdata,
// courtlistener, rentcast, realestateapi.

export type EnrichmentVendor =
  | 'propertyradar'
  | 'google'
  | 'batchdata'
  | 'courtlistener'
  | 'rentcast'
  | 'realestateapi'

const DEFAULT_ENABLED: ReadonlyArray<EnrichmentVendor> = ['propertyradar', 'google']

function parseEnabledVendors(): Set<EnrichmentVendor> {
  const raw = process.env.ENRICHMENT_VENDORS_ENABLED
  if (!raw || raw.trim() === '') {
    return new Set(DEFAULT_ENABLED)
  }
  const parts = raw
    .split(',')
    .map(s => s.trim().toLowerCase())
    .filter(Boolean) as EnrichmentVendor[]
  return new Set(parts)
}

const ENABLED = parseEnabledVendors()

export function isVendorEnabled(vendor: EnrichmentVendor): boolean {
  return ENABLED.has(vendor)
}

export function listEnabledVendors(): EnrichmentVendor[] {
  return Array.from(ENABLED)
}
