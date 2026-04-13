// app/api/[tenant]/contacts/route.ts
// GET — list sellers and/or buyers with search + pagination

import { NextResponse } from 'next/server'
import { db } from '@/lib/db/client'
import { withTenant } from '@/lib/api/withTenant'

type Params = { tenant: string }

export const GET = withTenant<Params>(async (req, ctx) => {
  const url = req.nextUrl
  const type = url.searchParams.get('type') ?? 'all'
  const search = url.searchParams.get('search') ?? ''
  const page = Math.max(1, parseInt(url.searchParams.get('page') ?? '1', 10))
  const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get('limit') ?? '50', 10)))
  const skip = (page - 1) * limit

  const searchFilter = search.length >= 2
    ? {
        OR: [
          { name: { contains: search, mode: 'insensitive' as const } },
          { phone: { contains: search, mode: 'insensitive' as const } },
          { email: { contains: search, mode: 'insensitive' as const } },
        ],
      }
    : {}

  const fetchSellers = type === 'all' || type === 'sellers'
  const fetchBuyers = type === 'all' || type === 'buyers'

  const [sellers, sellerCount, buyers, buyerCount] = await Promise.all([
    fetchSellers
      ? db.seller.findMany({
          where: { tenantId: ctx.tenantId, ...searchFilter },
          orderBy: { createdAt: 'desc' },
          skip,
          take: limit,
          select: {
            id: true, name: true, phone: true, email: true, ghlContactId: true,
            motivationPrimary: true, urgencyLevel: true, leadScore: true,
            predictedCloseProbability: true, followUpPriority: true,
            totalCallCount: true, lastContactDate: true,
            createdAt: true,
          },
        })
      : Promise.resolve([]),
    fetchSellers
      ? db.seller.count({ where: { tenantId: ctx.tenantId, ...searchFilter } })
      : Promise.resolve(0),
    fetchBuyers
      ? db.buyer.findMany({
          where: { tenantId: ctx.tenantId, ...searchFilter },
          orderBy: { createdAt: 'desc' },
          skip,
          take: limit,
          select: {
            id: true, name: true, phone: true, email: true, company: true, ghlContactId: true,
            buyerGrade: true, isVip: true, isGhost: true, isActive: true,
            primaryMarkets: true, totalDealsClosedWithUs: true,
            blastResponseRate: true, lastCommunicationDate: true,
            createdAt: true,
          },
        })
      : Promise.resolve([]),
    fetchBuyers
      ? db.buyer.count({ where: { tenantId: ctx.tenantId, ...searchFilter } })
      : Promise.resolve(0),
  ])

  return NextResponse.json({
    sellers,
    buyers,
    sellerCount,
    buyerCount,
  })
})
