import { NextRequest, NextResponse } from 'next/server'
import { validateVieiraToken, unauthorized } from '@/lib/vieira-auth'
import { db } from '@/lib/db/client'

export async function GET(req: NextRequest) {
  if (!validateVieiraToken(req)) return unauthorized()
  try {
    await db.$queryRaw`SELECT 1`
    return NextResponse.json({ status: 'ok', service: 'gunnerai', timestamp: Date.now() })
  } catch {
    return NextResponse.json({ status: 'error', db: 'unreachable' }, { status: 503 })
  }
}
