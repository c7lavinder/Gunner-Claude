'use client'
// components/disposition/journey/disposition-journey.tsx
// The Disposition Journey — five collapsible sections rendered in sequence.
// Mounted on the property-detail page Disposition tab. State is client-only
// (no persistence): first non-Done section auto-opens; user can manually
// expand/collapse via section chevrons.

import { useState, useMemo } from 'react'
import { JourneySection } from './journey-section'
import { Section1DealInfo } from './section-1-deal-info'
import { Section2DealBlast } from './section-2-deal-blast'
import { Section3BuyerMatch } from './section-3-buyer-match'
import { Section4Responses } from './section-4-responses'
import { Section5OffersShowings } from './section-5-offers-showings'
import type { PropertyDetail } from '@/components/inventory/property-detail-client'
import {
  computeJourneyStatus,
  firstActiveSection,
  type JourneyInputs,
} from '@/lib/disposition/journey-status'
import { checkPropertyDetailsReadiness } from '@/lib/disposition/property-details-readiness'

export function DispositionJourney({
  property,
  tenantSlug,
  onJumpToTab,
}: {
  property: PropertyDetail
  tenantSlug: string
  onJumpToTab: (tabKey: 'overview' | 'data') => void
}) {
  // Map PropertyDetail → JourneyInputs. Counts are server-computed in the
  // page query (see app/(tenant)/[tenant]/inventory/[propertyId]/page.tsx)
  // so the 5-section status badges are accurate on first paint without
  // each section having to fetch its own data first.
  const inputs: JourneyInputs = useMemo(() => {
    const detailsCheck = checkPropertyDetailsReadiness(property)
    return {
      status: property.status,
      address: property.address,
      arv: property.arv,
      hasPhotos: property.photoCount > 0,
      hasSellerLinked: (property.sellers?.length ?? 0) > 0,
      // Session 77 readiness gates
      hasContract: !!property.dispoStatus && property.dispoStatus !== 'CLOSED',
      hasDispoManager: property.propertyTeam.some(t => t.role === 'DISPOSITION_MANAGER'),
      propertyDetailsAllFilled: detailsCheck.allFilled,
      blastsSentCount: property.blastsSentCount,
      buyersMatchedCount: property.buyersMatchedCount,
      responsesCount: property.responsesCount,
      offersLoggedCount: property.offersLoggedCount,
      offersAcceptedCount: property.offersAcceptedCount,
    }
  }, [property])

  const status = useMemo(() => computeJourneyStatus(inputs), [inputs])

  const initialOpen = firstActiveSection(status)
  const [openSection, setOpenSection] = useState<1 | 2 | 3 | 4 | 5 | null>(initialOpen)

  function toggle(n: 1 | 2 | 3 | 4 | 5) {
    setOpenSection(prev => (prev === n ? null : n))
  }

  return (
    <div className="space-y-3">
      <JourneySection
        index={1}
        title="Deal info readiness"
        status={status.section1}
        summary={status.section1 === 'done' ? 'All required fields filled' : 'Missing fields — see checklist'}
        expanded={openSection === 1}
        onToggle={() => toggle(1)}
      >
        <Section1DealInfo property={property} onJumpToTab={onJumpToTab} />
      </JourneySection>

      <JourneySection
        index={2}
        title="Generate deal blast"
        status={status.section2}
        summary={status.section2 === 'done' ? 'Blast sent' : 'No blast sent yet'}
        expanded={openSection === 2}
        onToggle={() => toggle(2)}
      >
        <Section2DealBlast property={property} tenantSlug={tenantSlug} />
      </JourneySection>

      <JourneySection
        index={3}
        title="Match buyers"
        status={status.section3}
        summary={status.section3 === 'in_progress' ? 'Buyers matched' : 'No buyers matched yet'}
        expanded={openSection === 3}
        onToggle={() => toggle(3)}
      >
        <Section3BuyerMatch property={property} tenantSlug={tenantSlug} />
      </JourneySection>

      <JourneySection
        index={4}
        title="Track responses"
        status={status.section4}
        summary="Coming soon"
        expanded={openSection === 4}
        onToggle={() => toggle(4)}
      >
        <Section4Responses />
      </JourneySection>

      <JourneySection
        index={5}
        title="Offers & showings"
        status={status.section5}
        summary={
          status.section5 === 'done' ? 'Offer accepted'
          : status.section5 === 'in_progress' ? 'Offer(s) logged'
          : 'No offers yet'
        }
        expanded={openSection === 5}
        onToggle={() => toggle(5)}
      >
        <Section5OffersShowings property={property} />
      </JourneySection>
    </div>
  )
}
