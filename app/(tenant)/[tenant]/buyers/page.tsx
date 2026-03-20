// app/(tenant)/[tenant]/buyers/page.tsx
// Disposition Hub — buyer management + deal blasting
import { requireSession } from '@/lib/auth/session'
import { db } from '@/lib/db/client'
import { BuyersClient } from './buyers-client'

export default async function BuyersPage({ params }: { params: { tenant: string } }) {
  const session = await requireSession()

  const tenantId = session.tenantId

  const [buyers, properties, recentBlasts] = await Promise.all([
    db.buyer.findMany({
      where: { tenantId, isActive: true },
      orderBy: { createdAt: 'desc' },
      include: {
        _count: { select: { blastRecipients: true } },
      },
    }),
    // Properties available for blasting (in disposition or under contract)
    db.property.findMany({
      where: {
        tenantId,
        status: { in: ['IN_DISPOSITION', 'UNDER_CONTRACT', 'NEW_LEAD', 'CONTACTED', 'APPOINTMENT_SET', 'APPOINTMENT_COMPLETED', 'OFFER_MADE'] },
      },
      select: { id: true, address: true, city: true, state: true, status: true, arv: true, askingPrice: true },
      orderBy: { createdAt: 'desc' },
    }),
    db.dealBlast.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
      take: 10,
      include: {
        property: { select: { address: true } },
        createdBy: { select: { name: true } },
        _count: { select: { recipients: true } },
      },
    }),
  ])

  return (
    <BuyersClient
      tenantSlug={params.tenant}
      buyers={buyers.map(b => ({
        id: b.id,
        name: b.name,
        phone: b.phone,
        email: b.email,
        company: b.company,
        markets: b.markets as string[],
        tags: b.tags as string[],
        blastCount: b._count.blastRecipients,
      }))}
      properties={properties.map(p => ({
        id: p.id,
        address: p.address,
        city: p.city,
        state: p.state,
        status: p.status,
        arv: p.arv?.toString() ?? null,
        askingPrice: p.askingPrice?.toString() ?? null,
      }))}
      recentBlasts={recentBlasts.map(b => ({
        id: b.id,
        property: b.property.address,
        createdBy: b.createdBy.name,
        channel: b.channel,
        status: b.status,
        recipientCount: b._count.recipients,
        createdAt: b.createdAt.toISOString(),
      }))}
    />
  )
}
