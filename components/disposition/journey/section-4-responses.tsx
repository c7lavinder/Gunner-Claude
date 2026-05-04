'use client'
// components/disposition/journey/section-4-responses.tsx
// Section 4 of the Disposition Journey: Track Responses.
// Placeholder. The data layer for unified inbound responses (SMS + email
// across blast + outreach surfaces) is deferred per plan Stage 5 item 4.
// Section is rendered with status='not_started' until the API exists.

import { MessageSquare } from 'lucide-react'

export function Section4Responses() {
  return (
    <div className="text-center py-8">
      <MessageSquare size={32} className="mx-auto text-txt-muted mb-3" />
      <div className="text-[14px] font-medium text-txt-primary mb-1">
        Response feed coming soon
      </div>
      <div className="text-[12px] text-txt-secondary max-w-md mx-auto">
        Inbound buyer replies across SMS and email will land here. For now
        track responses inside Section 3 (Match Buyers) and Section 5
        (Offers &amp; Showings).
      </div>
    </div>
  )
}
