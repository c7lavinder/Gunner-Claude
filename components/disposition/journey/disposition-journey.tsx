'use client'
// components/disposition/journey/disposition-journey.tsx
// The Disposition Journey — five collapsible sections rendered in sequence.
// Mounted on the property-detail page Disposition tab. First non-Done
// section auto-opens; user can manually expand/collapse via section
// chevrons.
//
// Mutable property fields owned by Section 2 — description, internal
// notes, generated artifacts — are lifted up to this component so they
// survive section collapse/expand. Section 2 is unmounted while
// collapsed (per JourneySection); without this lift, every generation
// or note edit was lost the moment the rep clicked a different section.

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
import { checkPropertyDetailsReadiness, isDispoManagerRole } from '@/lib/disposition/property-details-readiness'

export function DispositionJourney({
  property,
  tenantSlug,
  primaryOfferType,
  onJumpToTab,
}: {
  property: PropertyDetail
  tenantSlug: string
  // Owned by PropertyDetailClient (NumbersColumn writes it). Read here
  // so Section 2 can show which offer type the description was generated
  // for and warn when it's stale.
  primaryOfferType: string
  onJumpToTab: (tabKey: 'overview' | 'data') => void
}) {
  // Lifted state — owned here so Section 2 can re-mount with the latest
  // values after a collapse/expand round-trip.
  const [description, setDescription] = useState<string | null>(property.description)
  const [internalNotes, setInternalNotes] = useState<string | null>(property.internalNotes)
  const [artifacts, setArtifacts] = useState<Record<string, unknown>>(property.dispoArtifacts ?? {})

  // Stale detection — when the rep generates the description, we stamp
  // dispoArtifacts.descriptionGeneratedForType. If the primary later
  // changes, Section 2 surfaces a regen nudge.
  const descriptionGeneratedForType =
    (artifacts as { descriptionGeneratedForType?: string }).descriptionGeneratedForType ?? null
  const descriptionStale = !!description
    && !!descriptionGeneratedForType
    && descriptionGeneratedForType !== primaryOfferType

  // Count generated artifact pieces (description, listing post, social
  // post, tier messages). Drives Section 2 status: 0 = not_started,
  // 1-3 = in_progress, 4 = done.
  const artifactsGeneratedCount = useMemo(() => {
    let n = 0
    if (description && description.trim().length > 0) n += 1
    const a = artifacts as { listingPost?: string; socialPost?: string; tierMessages?: Record<string, unknown> }
    if (a.listingPost && a.listingPost.trim().length > 0) n += 1
    if (a.socialPost && a.socialPost.trim().length > 0) n += 1
    if (a.tierMessages && Object.keys(a.tierMessages).length > 0) n += 1
    return n
  }, [description, artifacts])

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
      hasDispoManager: property.propertyTeam.some(t => isDispoManagerRole(t.role)),
      propertyDetailsAllFilled: detailsCheck.allFilled,
      blastsSentCount: property.blastsSentCount,
      buyersMatchedCount: property.buyersMatchedCount,
      responsesCount: property.responsesCount,
      offersLoggedCount: property.offersLoggedCount,
      offersAcceptedCount: property.offersAcceptedCount,
      artifactsGeneratedCount,
    }
  }, [property, artifactsGeneratedCount])

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
        summary={
          status.section2 === 'done' ? 'All artifacts generated'
          : status.section2 === 'in_progress' ? `${artifactsGeneratedCount} of 4 generated`
          : 'No artifacts generated yet'
        }
        expanded={openSection === 2}
        onToggle={() => toggle(2)}
      >
        <Section2DealBlast
          property={property}
          tenantSlug={tenantSlug}
          description={description}
          onDescriptionChange={setDescription}
          internalNotes={internalNotes}
          onInternalNotesChange={setInternalNotes}
          artifacts={artifacts}
          onArtifactsChange={setArtifacts}
          primaryOfferType={primaryOfferType}
          descriptionStale={descriptionStale}
          descriptionGeneratedForType={descriptionGeneratedForType}
        />
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
        summary={
          status.section4 === 'in_progress' ? 'Replies in pipeline'
          : 'No responses yet'
        }
        expanded={openSection === 4}
        onToggle={() => toggle(4)}
      >
        <Section4Responses property={property} tenantSlug={tenantSlug} />
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
        <Section5OffersShowings property={property} tenantSlug={tenantSlug} />
      </JourneySection>
    </div>
  )
}
