// GET /api/properties/market-lookup?zip=37201
// Returns the market name for a given zip code
import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { getMarketsForZip } from '@/lib/config/crm.config'

export async function GET(req: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const url = new URL(req.url)
  const zip = url.searchParams.get('zip')
  if (!zip) return NextResponse.json({ market: null })

  const markets = getMarketsForZip(zip)
  return NextResponse.json({ market: markets[0] ?? null })
}
