// GET + POST + DELETE /api/markets — market CRUD
import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { db } from '@/lib/db/client'

export async function GET() {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const markets = await db.market.findMany({
      where: { tenantId: session.tenantId },
      orderBy: { name: 'asc' },
    })

    return NextResponse.json({ markets })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed' }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { name, zipCodes } = await req.json()
    if (!name) return NextResponse.json({ error: 'name required' }, { status: 400 })

    // Parse zip codes from string or array
    const zips = Array.isArray(zipCodes)
      ? zipCodes.map((z: string) => z.trim()).filter((z: string) => /^\d{5}$/.test(z))
      : (zipCodes ?? '').split(/[,\n\s]+/).map((z: string) => z.trim()).filter((z: string) => /^\d{5}$/.test(z))

    const market = await db.market.create({
      data: {
        tenantId: session.tenantId,
        name,
        zipCodes: zips,
      },
    })

    return NextResponse.json({ market })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed' }, { status: 500 })
  }
}

export async function DELETE(req: Request) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id } = await req.json()
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

    await db.market.delete({ where: { id, tenantId: session.tenantId } })
    return NextResponse.json({ status: 'deleted' })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed' }, { status: 500 })
  }
}
