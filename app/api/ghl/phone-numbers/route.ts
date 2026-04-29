// app/api/ghl/phone-numbers/route.ts
// Returns the location's LC (LeadConnector) outbound SMS numbers.
// These are the numbers the send_sms action must use as the "From" — NOT the
// user.phone field returned by /users/ (that's personal cell, not send-capable).
import { NextResponse } from 'next/server'
import { withTenant } from '@/lib/api/withTenant'
import { getGHLClient } from '@/lib/ghl/client'

export const GET = withTenant(async (_req, ctx) => {
  try {
    const ghl = await getGHLClient(ctx.tenantId)
    const result = await ghl.getPhoneNumbers()
    return NextResponse.json({ numbers: result.numbers ?? [] })
  } catch (err) {
    console.error('[GHL phone-numbers] Failed:', err instanceof Error ? err.message : err)
    return NextResponse.json({ numbers: [] }, { status: 200 })
  }
})
