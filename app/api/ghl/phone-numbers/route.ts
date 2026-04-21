// app/api/ghl/phone-numbers/route.ts
// Returns the location's LC (LeadConnector) outbound SMS numbers.
// These are the numbers the send_sms action must use as the "From" — NOT the
// user.phone field returned by /users/ (that's personal cell, not send-capable).
import { NextResponse } from 'next/server'
import { getSession, unauthorizedResponse } from '@/lib/auth/session'
import { getGHLClient } from '@/lib/ghl/client'

export async function GET() {
  const session = await getSession()
  if (!session) return unauthorizedResponse()

  try {
    const ghl = await getGHLClient(session.tenantId)
    const result = await ghl.getPhoneNumbers()
    return NextResponse.json({ numbers: result.numbers ?? [] })
  } catch (err) {
    console.error('[GHL phone-numbers] Failed:', err instanceof Error ? err.message : err)
    return NextResponse.json({ numbers: [] }, { status: 200 })
  }
}
