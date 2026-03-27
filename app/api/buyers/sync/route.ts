// POST /api/buyers/sync — trigger full buyer sync from GHL pipeline
// This populates/refreshes the local Buyer table from GHL
import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { syncAllBuyersFromGHL } from '@/lib/buyers/sync'

export async function POST() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const count = await syncAllBuyersFromGHL(session.tenantId)
    return NextResponse.json({ success: true, synced: count })
  } catch (err) {
    console.error('[BuyerSync API]', err)
    return NextResponse.json({ error: 'Sync failed' }, { status: 500 })
  }
}
