// GET /api/properties/market-lookup?zip=37201
// Returns the market name for a given zip code
import { NextResponse } from 'next/server'
import { withTenant } from '@/lib/api/withTenant'
import { getMarketsForZip } from '@/lib/config/crm.config'

export const GET = withTenant(async (req, _ctx) => {
  const url = new URL(req.url)
  const zip = url.searchParams.get('zip')
  if (!zip) return NextResponse.json({ market: null })

  const markets = getMarketsForZip(zip)
  return NextResponse.json({ market: markets[0] ?? null })
})
