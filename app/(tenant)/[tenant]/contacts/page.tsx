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

  const [sellers, sellerCount, buyers, buyerCount, partners, partnerCount] = await Promise.all([
    db.seller.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
      take: 500,
      select: {
        id: true, name: true, phone: true, email: true, ghlContactId: true,
        leadSource: true, totalCallCount: true, lastContactDate: true,
        createdAt: true,
        properties: {
          take: 1,
          orderBy: { isPrimary: 'desc' },
          include: {
            property: {
              select: {
                id: true, address: true, city: true, state: true,
                market: { select: { name: true } },
              },
            },
          },
        },
      },
    }),
    db.seller.count({ where: { tenantId } }),
    db.buyer.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
      take: 500,
      select: {
        id: true, name: true, phone: true, email: true, company: true, ghlContactId: true,
        mailingCity: true, mailingState: true,
        isActive: true, isVip: true, isGhost: true, doNotContact: true,
        primaryMarkets: true, tags: true, customFields: true,
        buyerGrade: true, totalDealsClosedWithUs: true,
        createdAt: true,
      },
    }),
    db.buyer.count({ where: { tenantId } }),
    // Session 67 Phase 4 — Partners tab on /contacts.
    db.partner.findMany({
      where: { tenantId },
      orderBy: [{ priorityFlag: 'desc' }, { lastDealDate: 'desc' }, { createdAt: 'desc' }],
      take: 500,
      select: {
        id: true, name: true, phone: true, email: true, company: true, ghlContactId: true,
        types: true, partnerGrade: true, primaryMarkets: true, lastDealDate: true,
        _count: { select: { properties: true } },
      },
    }),
    db.partner.count({ where: { tenantId } }),
  ])

  return (
    <ContactsClient
      sellers={sellers.map(s => {
        const prop = s.properties[0]?.property ?? null
        return {
          id: s.id, name: s.name, phone: s.phone, email: s.email, ghlContactId: s.ghlContactId,
          leadSource: s.leadSource, totalCallCount: s.totalCallCount,
          lastContactDate: s.lastContactDate?.toISOString() ?? null,
          createdAt: s.createdAt.toISOString(),
          propertyAddress: prop ? `${prop.address}, ${prop.city}, ${prop.state}` : null,
          propertyId: prop?.id ?? null,
          market: prop?.market?.name ?? null,
        }
      })}
      buyers={buyers.map(b => ({
        ...b,
        primaryMarkets: b.primaryMarkets as string[],
        tags: b.tags as string[],
        customFields: (b.customFields ?? {}) as Record<string, unknown>,
        createdAt: b.createdAt.toISOString(),
      }))}
      partners={partners.map(p => ({
        id: p.id,
        name: p.name,
        phone: p.phone,
        email: p.email,
        company: p.company,
        ghlContactId: p.ghlContactId,
        types: (p.types ?? []) as string[],
        partnerGrade: p.partnerGrade,
        primaryMarkets: (p.primaryMarkets ?? []) as string[],
        propertyLinkCount: p._count.properties,
        lastDealDate: p.lastDealDate?.toISOString() ?? null,
      }))}
      sellerCount={sellerCount}
      buyerCount={buyerCount}
      partnerCount={partnerCount}
      tenantSlug={params.tenant}
      canSync={isRoleAtLeast(role, 'ADMIN')}
    />
  )
}
