// app/(tenant)/[tenant]/contacts/page.tsx

import { requireSession } from '@/lib/auth/session'
import { db } from '@/lib/db/client'
import { redirect } from 'next/navigation'
import { ContactsClient } from '@/components/contacts/contacts-client'
import type { UserRole } from '@/types/roles'
import { hasPermission, isRoleAtLeast } from '@/types/roles'

export default async function ContactsPage({ params }: { params: { tenant: string } }) {
  const session = await requireSession()
  const tenantId = session.tenantId
  const role = session.role as UserRole

  if (!hasPermission(role, 'properties.view.assigned')) redirect(`/${params.tenant}/dashboard`)

  const [sellers, sellerCount, buyers, buyerCount] = await Promise.all([
    db.seller.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
      take: 200,
      select: {
        id: true, name: true, phone: true, email: true, ghlContactId: true,
        motivationPrimary: true, urgencyLevel: true, leadScore: true,
        predictedCloseProbability: true, followUpPriority: true,
        totalCallCount: true, lastContactDate: true,
        createdAt: true,
      },
    }),
    db.seller.count({ where: { tenantId } }),
    db.buyer.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
      take: 200,
      select: {
        id: true, name: true, phone: true, email: true, company: true, ghlContactId: true,
        buyerGrade: true, isVip: true, isGhost: true, isActive: true,
        primaryMarkets: true, totalDealsClosedWithUs: true,
        blastResponseRate: true, lastCommunicationDate: true,
        createdAt: true,
      },
    }),
    db.buyer.count({ where: { tenantId } }),
  ])

  return (
    <ContactsClient
      sellers={sellers.map(s => ({
        ...s,
        lastContactDate: s.lastContactDate?.toISOString() ?? null,
        createdAt: s.createdAt.toISOString(),
      }))}
      buyers={buyers.map(b => ({
        ...b,
        primaryMarkets: b.primaryMarkets as string[],
        lastCommunicationDate: b.lastCommunicationDate?.toISOString() ?? null,
        createdAt: b.createdAt.toISOString(),
      }))}
      sellerCount={sellerCount}
      buyerCount={buyerCount}
      tenantSlug={params.tenant}
      canSync={isRoleAtLeast(role, 'ADMIN')}
    />
  )
}
