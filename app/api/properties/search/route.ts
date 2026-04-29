// GET /api/properties/search?q=123+Main — search properties by address
import { NextResponse } from 'next/server'
import { withTenant } from '@/lib/api/withTenant'
import { db } from '@/lib/db/client'

export const GET = withTenant(async (request, ctx) => {
  const q = request.nextUrl.searchParams.get('q') ?? ''
  if (q.length < 2) return NextResponse.json({ properties: [] })

  const properties = await db.property.findMany({
    where: {
      tenantId: ctx.tenantId,
      OR: [
        { address: { contains: q, mode: 'insensitive' } },
        { city: { contains: q, mode: 'insensitive' } },
        { zip: { startsWith: q } },
      ],
    },
    select: { id: true, address: true, city: true, state: true },
    take: 10,
    orderBy: { address: 'asc' },
  })

  return NextResponse.json({ properties })
})
