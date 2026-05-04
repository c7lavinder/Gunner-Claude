// app/(tenant)/[tenant]/partners/page.tsx
// Partners list — browseable index of every Partner row in the tenant.
// Distinct from /{tenant}/contacts (which surfaces sellers + buyers).
// Phase 3 of the Session 67 plan; the canonical edit-on-deal surface
// is still the property-detail Partners tab.

import { requireSession } from '@/lib/auth/session'
import { db } from '@/lib/db/client'
import { redirect } from 'next/navigation'
import { PartnersListClient } from './partners-list-client'
import type { UserRole } from '@/types/roles'
import { hasPermission } from '@/types/roles'

export default async function PartnersPage({ params }: { params: { tenant: string } }) {
  const session = await requireSession()
  const tenantId = session.tenantId
  const role = session.role as UserRole

  if (!hasPermission(role, 'properties.view.assigned')) redirect(`/${params.tenant}/day-hub`)

  const partners = await db.partner.findMany({
    where: { tenantId },
    orderBy: [{ priorityFlag: 'desc' }, { lastDealDate: 'desc' }, { createdAt: 'desc' }],
    select: {
      id: true, name: true, phone: true, email: true, company: true, ghlContactId: true,
      types: true, partnerGrade: true, tierClassification: true,
      dealsSourcedToUsCount: true, dealsTakenFromUsCount: true,
      dealsClosedWithUsCount: true, jvHistoryCount: true,
      lastDealDate: true, primaryMarkets: true,
      priorityFlag: true, badWithUsFlag: true,
      _count: { select: { properties: true } },
    },
  })

  return (
    <PartnersListClient
      tenantSlug={params.tenant}
      partners={partners.map(p => ({
        id: p.id,
        name: p.name,
        phone: p.phone,
        email: p.email,
        company: p.company,
        ghlContactId: p.ghlContactId,
        types: (p.types ?? []) as string[],
        partnerGrade: p.partnerGrade,
        tierClassification: p.tierClassification,
        dealsSourcedToUsCount: p.dealsSourcedToUsCount,
        dealsTakenFromUsCount: p.dealsTakenFromUsCount,
        dealsClosedWithUsCount: p.dealsClosedWithUsCount,
        jvHistoryCount: p.jvHistoryCount,
        lastDealDate: p.lastDealDate?.toISOString() ?? null,
        primaryMarkets: (p.primaryMarkets ?? []) as string[],
        propertyLinkCount: p._count.properties,
        priorityFlag: p.priorityFlag,
        badWithUsFlag: p.badWithUsFlag,
      }))}
    />
  )
}
