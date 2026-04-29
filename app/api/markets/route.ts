// GET + POST + DELETE /api/markets — market CRUD
import { NextResponse } from 'next/server'
import { withTenant } from '@/lib/api/withTenant'
import { db } from '@/lib/db/client'

export const GET = withTenant(async (_req, ctx) => {
  try {
    const markets = await db.market.findMany({
      where: { tenantId: ctx.tenantId },
      orderBy: { name: 'asc' },
    })

    return NextResponse.json({ markets })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed' }, { status: 500 })
  }
})

export const POST = withTenant(async (req, ctx) => {
  try {
    const { name, zipCodes } = await req.json()
    if (!name) return NextResponse.json({ error: 'name required' }, { status: 400 })

    // Parse zip codes from string or array
    const zips = Array.isArray(zipCodes)
      ? zipCodes.map((z: string) => z.trim()).filter((z: string) => /^\d{5}$/.test(z))
      : (zipCodes ?? '').split(/[,\n\s]+/).map((z: string) => z.trim()).filter((z: string) => /^\d{5}$/.test(z))

    const market = await db.market.create({
      data: {
        tenantId: ctx.tenantId,
        name,
        zipCodes: zips,
      },
    })

    return NextResponse.json({ market })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed' }, { status: 500 })
  }
})

export const DELETE = withTenant(async (req, ctx) => {
  try {
    const { id } = await req.json()
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

    // Canonical pattern: id+tenantId in WHERE works under extendedWhereUnique.
    await db.market.delete({ where: { id, tenantId: ctx.tenantId } })
    return NextResponse.json({ status: 'deleted' })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed' }, { status: 500 })
  }
})
