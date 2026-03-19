// app/api/health/route.ts
import { NextResponse } from 'next/server'
import { db } from '@/lib/db/client'

export async function GET() {
  try {
    await db.$queryRaw`SELECT 1`
    return NextResponse.json({ status: 'ok', timestamp: new Date().toISOString() })
  } catch {
    return NextResponse.json({ status: 'error', db: 'unreachable' }, { status: 503 })
  }
}
