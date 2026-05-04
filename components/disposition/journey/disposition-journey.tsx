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

export function DispositionJourney({
  property,
  tenantSlug,
  onJumpToTab,
}: {
  property: PropertyDetail
  tenantSlug: string
  onJumpToTab: (tabKey: 'overview' | 'data') => void
}) {
  // Map PropertyDetail → JourneyInputs. Some counts (blasts, buyers,
  // responses) aren't on PropertyDetail today — defaulting to 0 means
  // those sections start at 'not_started' and update as the user works
  // inside them. Real-time counts are a future polish.
  const inputs: JourneyInputs = useMemo(() => ({
    status: property.status,
    address: property.address,
    askingPrice: property.askingPrice,
    arv: property.arv,
    description: property.description,
    assignmentFee: property.assignmentFee,
    hasPhotos: !!property.googlePhotoThumbnailUrl,
    hasSellerLinked: (property.sellers?.length ?? 0) > 0,
    blastsSentCount: 0,
    buyersMatchedCount: 0,
    responsesCount: 0,
    offersLoggedCount:
      property.lastOfferDate || property.currentOffer || property.highestOffer ? 1 : 0,
    offersAcceptedCount: property.acceptedPrice ? 1 : 0,
  }), [property])

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
