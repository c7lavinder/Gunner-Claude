import { NextRequest, NextResponse } from 'next/server'

export function validateVieiraToken(req: NextRequest): boolean {
  const token = req.headers.get('x-vieira-token')
  return !!token && token === process.env.VIEIRA_SERVICE_TOKEN
}

export function unauthorized() {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
}
