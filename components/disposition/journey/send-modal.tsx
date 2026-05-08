'use client'
// components/disposition/journey/send-modal.tsx
// Send Section-2 artifacts to one or more buyers (Session 77).
//
// Used by Section 3 Matched-column actions:
//   • Per-card "Send" — single buyer
//   • Header "Send to all matched" — every visible matched buyer
//
// Picks the artifact (description / listing / social / custom),
// picks the channel (sms / email), shows preview + recipient count,
// fires the existing /api/properties/[id]/blast endpoint.
//
// On success: caller refreshes the kanban (buyers auto-promote to
// 'sent' via the blast route's stage-promote logic added Wave 4).

import { useState, useEffect } from 'react'
import { X, Loader2, Send, AlertCircle, Search, ChevronDown } from 'lucide-react'
import { titleCase, formatPhone } from '@/lib/format'
import { useToast } from '@/components/ui/toaster'

type ArtifactKind = 'auto-tier' | 'description' | 'listing' | 'social' | 'custom'

interface TierMsg {
  emailSubject?: string
  emailBody?: string
  smsBody?: string
}

interface DispoArtifacts {
  description?: string
  listingPost?: string
  socialPost?: string
  tierMessages?: Partial<Record<string, TierMsg>>
}

interface BuyerLite {
  id: string
  name: string
  phone: string | null
  email: string | null
  tier: string
}

const ARTIFACT_LABELS: Record<ArtifactKind, string> = {
  'auto-tier': 'Auto-tier (per-buyer message)',
  description: 'Description (short)',
  listing: 'Property Listing Post',
  social: 'Social Media Post',
  custom: 'Custom Message',
}

export function SendModal({
  propertyId,
  propertyAddress,
  buyers,
  artifacts,
  tenantSlug,
  onClose,
  onSent,
}: {
  propertyId: string
  propertyAddress: string
  buyers: BuyerLite[]
  artifacts: DispoArtifacts
  tenantSlug: string
  onClose: () => void
  onSent: (sentBuyerIds: string[]) => void
}) {
  const { toast } = useToast()
  // Default to auto-tier when tier messages exist (the common path for
  // "Send all matched"); fall back to description for one-off sends.
  const tierMessages = artifacts.tierMessages ?? {}
  const hasTierMessages = Object.keys(tierMessages).length > 0
  const isMulti = buyers.length > 1
  const [artifactKind, setArtifactKind] = useState<ArtifactKind>(
    hasTierMessages && isMulti ? 'auto-tier' : 'description'
  )
  // Channel intentionally unset on first render — rep must choose
  // SMS or Email explicitly. Prevents accidental sends on the wrong channel.
  const [channel, setChannel] = useState<'sms' | 'email' | null>(null)
  const [customText, setCustomText] = useState('')
  const [emailSubject, setEmailSubject] = useState(`Off-market deal: ${propertyAddress}`)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set(buyers.map(b => b.id)))
  const [pendingApproval, setPendingApproval] = useState<{ gateId: string; recipientCount: number; confirmation: string } | null>(null)
  const [sending, setSending] = useState(false)
  const [recipientSearch, setRecipientSearch] = useState('')

  // Team FROM numbers — same source as the legacy Section 2 dropdown.
  // For SMS this is the LC outbound number; for Email this is the
  // sender's verified email. Surfaced so the rep knows exactly which
  // identity their buyers will see.
  const [teamMembers, setTeamMembers] = useState<Array<{ name: string; phone: string; email?: string }>>([])
  const [selectedFrom, setSelectedFrom] = useState<{ name: string; phone: string; email?: string } | null>(null)
  const [fromDropdownOpen, setFromDropdownOpen] = useState(false)

  useEffect(() => {
    fetch(`/api/${tenantSlug}/dayhub/team-numbers`)
      .then(r => r.ok ? r.json() : { numbers: [] })
      .then(d => {
        const members = (d.numbers ?? []) as Array<{ name: string; phone: string; email?: string }>
        setTeamMembers(members)
        if (members.length > 0) setSelectedFrom(members[0])
      })
      .catch(() => {})
  }, [tenantSlug])

  // Per-buyer message resolver for auto-tier mode. Returns null if the
  // buyer's tier has no generated message — they're filtered out.
  function tierMessageFor(tier: string): { message: string; subject?: string } | null {
    const m = tierMessages[tier]
    if (!m) return null
    if (channel === 'sms') {
      return m.smsBody ? { message: m.smsBody } : null
    }
    if (channel === 'email') {
      return m.emailBody
        ? { message: m.emailBody, subject: m.emailSubject || `Off-market deal: ${propertyAddress}` }
        : null
    }
    return null
  }

  const messageText = artifactKind === 'auto-tier' ? '[per-tier]'
    : artifactKind === 'description' ? (artifacts.description ?? '')
    : artifactKind === 'listing' ? (artifacts.listingPost ?? '')
    : artifactKind === 'social' ? (artifacts.socialPost ?? '')
    : customText

  // Filter buyers by search term first (case-insensitive across name/phone).
  const searchLower = recipientSearch.toLowerCase()
  const visibleBuyers = recipientSearch
    ? buyers.filter(b =>
        b.name.toLowerCase().includes(searchLower) ||
        (b.phone ?? '').includes(recipientSearch) ||
        (b.email ?? '').toLowerCase().includes(searchLower),
      )
    : buyers

  const eligibleBuyers = buyers.filter(b => {
    if (!selectedIds.has(b.id)) return false
    if (!channel) return false
    if (channel === 'sms' ? !b.phone : !b.email) return false
    if (artifactKind === 'auto-tier') {
      // Buyer must have a tier message in the chosen channel.
      return !!tierMessageFor(b.tier)
    }
    return true
  })

  const ineligibleCount = selectedIds.size - eligibleBuyers.length

  // For auto-tier, group eligible buyers by tier for the preview.
  const tierGroups = (() => {
    if (artifactKind !== 'auto-tier') return null
    const groups: Record<string, number> = {}
    for (const b of eligibleBuyers) groups[b.tier] = (groups[b.tier] ?? 0) + 1
    return groups
  })()

  function toggleBuyer(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  function selectAll() { setSelectedIds(new Set(buyers.map(b => b.id))) }
  function clearAll() { setSelectedIds(new Set()) }

  async function send(approvalGateId?: string) {
    if (eligibleBuyers.length === 0) return
    if (artifactKind !== 'auto-tier' && !messageText.trim()) return
    setSending(true)
    try {
      // Auto-tier path uses the multi-message endpoint so each buyer
      // gets their tier-specific copy in a single approval flow.
      const body = artifactKind === 'auto-tier'
        ? {
            action: 'send-multi',
            channel,
            buyerMessages: eligibleBuyers.map(b => {
              const tm = tierMessageFor(b.tier)!
              return { buyerId: b.id, message: tm.message, subject: tm.subject }
            }),
            ...(approvalGateId ? { approvalGateId } : {}),
          }
        : {
            action: 'send',
            // Synthetic tier — the blast route honors buyerIds when present;
            // tier is just required by the schema + recorded in the audit log.
            tier: 'manual',
            channel,
            message: messageText,
            subject: channel === 'email' ? emailSubject : undefined,
            buyerIds: eligibleBuyers.map(b => b.id),
            ...(approvalGateId ? { approvalGateId } : {}),
          }
      const res = await fetch(`/api/properties/${propertyId}/blast`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (res.status === 202 && data.status === 'pending_approval') {
        setPendingApproval({
          gateId: data.gateId,
          recipientCount: data.recipientCount,
          confirmation: data.confirmationMessage,
        })
      } else if (res.ok) {
        toast(`Sent to ${data.sentTo} ${data.sentTo === 1 ? 'buyer' : 'buyers'}${data.skipped ? `, ${data.skipped} skipped` : ''}`, 'success')
        onSent(eligibleBuyers.map(b => b.id))
        onClose()
      } else {
        toast(data.error ?? 'Send failed', 'error')
      }
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Send failed', 'error')
    }
    setSending(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-2xl mx-4 p-5 space-y-4 animate-in zoom-in-95 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-ds-label font-semibold text-txt-primary">
              Send to {selectedIds.size} {selectedIds.size === 1 ? 'buyer' : 'buyers'}
            </h3>
            <p className="text-[11px] text-txt-muted mt-0.5">{propertyAddress}</p>
          </div>
          <button onClick={onClose} className="text-txt-muted hover:text-txt-secondary"><X size={16} /></button>
        </div>

        {pendingApproval ? (
          // ── Approval gate confirmation ───────────────────────────────
          <div className="space-y-3">
            <div className="bg-amber-50 border-[0.5px] border-amber-200 rounded-[10px] p-4">
              <p className="text-[12px] font-semibold text-amber-800 flex items-center gap-1.5 mb-1.5">
                <AlertCircle size={13} /> Confirm send
              </p>
              <p className="text-[12px] text-amber-900">
                {pendingApproval.confirmation}
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setPendingApproval(null)}
                className="flex-1 border-[0.5px] border-[rgba(0,0,0,0.1)] text-txt-secondary text-ds-fine font-medium py-2 rounded-[10px] hover:bg-surface-secondary transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => send(pendingApproval.gateId)}
                disabled={sending}
                className="flex-1 bg-gunner-red hover:bg-gunner-red-dark disabled:opacity-40 text-white text-ds-fine font-semibold py-2 rounded-[10px] inline-flex items-center justify-center gap-1.5"
              >
                {sending ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
                {sending ? 'Sending...' : `Confirm — Send to ${pendingApproval.recipientCount}`}
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* Artifact picker */}
            <div>
              <label className="text-[10px] font-semibold text-txt-muted uppercase tracking-wider block mb-1.5">Artifact</label>
              <div className="grid grid-cols-2 gap-2">
                {(['auto-tier', 'description', 'listing', 'social', 'custom'] as const).map(k => {
                  const empty =
                    k === 'auto-tier' ? !hasTierMessages
                    : k === 'description' ? !artifacts.description
                    : k === 'listing' ? !artifacts.listingPost
                    : k === 'social' ? !artifacts.socialPost
                    : false  // custom is never empty
                  return (
                    <button
                      key={k}
                      onClick={() => setArtifactKind(k)}
                      disabled={empty}
                      className={`text-left text-[11px] px-3 py-2 rounded-[8px] border-[0.5px] transition-colors ${
                        artifactKind === k
                          ? 'border-gunner-red bg-gunner-red-light text-gunner-red font-semibold'
                          : empty
                          ? 'border-[rgba(0,0,0,0.06)] bg-surface-secondary text-txt-muted opacity-50'
                          : 'border-[rgba(0,0,0,0.08)] bg-surface-secondary text-txt-secondary hover:bg-surface-tertiary'
                      }`}
                    >
                      {ARTIFACT_LABELS[k]}
                      {empty && <span className="block text-[9px] text-txt-muted mt-0.5">Generate first in Section 2</span>}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Message preview / custom editor */}
            {artifactKind === 'custom' ? (
              <div>
                <label className="text-[10px] font-semibold text-txt-muted uppercase tracking-wider block mb-1">Custom message</label>
                <textarea
                  value={customText}
                  onChange={e => setCustomText(e.target.value)}
                  rows={6}
                  placeholder="Type your message..."
                  className="w-full bg-surface-secondary border-[0.5px] border-[rgba(0,0,0,0.08)] rounded-[10px] px-3 py-2 text-ds-fine focus:outline-none focus:ring-1 focus:ring-gunner-red/20 resize-none"
                />
              </div>
            ) : artifactKind === 'auto-tier' ? (
              <div>
                <label className="text-[10px] font-semibold text-txt-muted uppercase tracking-wider block mb-1">
                  Per-tier breakdown (each buyer gets the message for their tier)
                </label>
                <div className="bg-surface-secondary border-[0.5px] border-[rgba(0,0,0,0.06)] rounded-[10px] px-3 py-2 space-y-1">
                  {tierGroups && Object.keys(tierGroups).length > 0 ? (
                    Object.entries(tierGroups).map(([tier, count]) => (
                      <div key={tier} className="flex items-center justify-between text-[11px]">
                        <span className="capitalize font-medium text-txt-primary">{tier}</span>
                        <span className="text-txt-muted">{count} {count === 1 ? 'buyer' : 'buyers'}</span>
                      </div>
                    ))
                  ) : (
                    <p className="text-[11px] text-txt-muted italic">No eligible buyers — either tier messages are missing or buyers lack a {channel}.</p>
                  )}
                </div>
                <p className="text-[10px] text-txt-muted mt-1.5 italic">
                  Edit per-tier copy in Section 2 → Tier Messages.
                </p>
              </div>
            ) : (
              <div>
                <label className="text-[10px] font-semibold text-txt-muted uppercase tracking-wider block mb-1">Preview</label>
                <div className="bg-surface-secondary border-[0.5px] border-[rgba(0,0,0,0.06)] rounded-[10px] px-3 py-2 max-h-32 overflow-y-auto">
                  {messageText
                    ? <pre className="whitespace-pre-wrap text-[11px] text-txt-primary font-mono">{messageText}</pre>
                    : <p className="text-[11px] text-txt-muted italic">Generate this artifact in Section 2 first.</p>
                  }
                </div>
              </div>
            )}

            {/* Channel — required. No default, both buttons start neutral. */}
            <div>
              <label className="text-[10px] font-semibold text-txt-muted uppercase tracking-wider block mb-1">Channel <span className="text-semantic-red">*</span></label>
              <div className="flex gap-1.5">
                <button
                  onClick={() => setChannel('sms')}
                  className={`text-[11px] font-semibold px-3 py-1.5 rounded-full transition-colors ${
                    channel === 'sms'
                      ? 'bg-green-600 text-white ring-2 ring-green-200'
                      : 'bg-surface-secondary text-txt-secondary border-[0.5px] border-[rgba(0,0,0,0.1)] hover:bg-surface-tertiary'
                  }`}
                >SMS</button>
                <button
                  onClick={() => setChannel('email')}
                  className={`text-[11px] font-semibold px-3 py-1.5 rounded-full transition-colors ${
                    channel === 'email'
                      ? 'bg-blue-600 text-white ring-2 ring-blue-200'
                      : 'bg-surface-secondary text-txt-secondary border-[0.5px] border-[rgba(0,0,0,0.1)] hover:bg-surface-tertiary'
                  }`}
                >Email</button>
                {!channel && (
                  <span className="text-[10px] text-amber-700 italic ml-1 self-center">Pick SMS or Email to continue.</span>
                )}
              </div>
            </div>

            {/* FROM identity + email subject (when applicable) */}
            {channel && (
              <div>
                <label className="text-[10px] font-semibold text-txt-muted uppercase tracking-wider block mb-1">
                  Sending from
                </label>
                <div className="bg-surface-secondary border-[0.5px] border-[rgba(0,0,0,0.08)] rounded-[10px] px-3 py-2 flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    {selectedFrom ? (
                      <div className="text-[11px] text-txt-primary">
                        <span className="font-semibold">{selectedFrom.name}</span>
                        <span className="text-txt-muted ml-1.5">
                          {channel === 'sms'
                            ? formatPhone(selectedFrom.phone)
                            : (selectedFrom.email ?? selectedFrom.phone)}
                        </span>
                      </div>
                    ) : (
                      <span className="text-[11px] text-amber-700 italic">No team {channel === 'sms' ? 'numbers' : 'emails'} configured</span>
                    )}
                  </div>
                  {teamMembers.length > 1 && (
                    <div className="relative">
                      <button onClick={() => setFromDropdownOpen(p => !p)}
                        className="text-[10px] font-medium text-semantic-blue hover:underline inline-flex items-center gap-0.5">
                        Change <ChevronDown size={9} />
                      </button>
                      {fromDropdownOpen && (
                        <div className="absolute right-0 top-full mt-1 z-50 bg-white rounded-[8px] border-[0.5px] border-[rgba(0,0,0,0.1)] shadow-lg py-1 min-w-[220px]">
                          {teamMembers.map((m, i) => (
                            <button
                              key={i}
                              onClick={() => { setSelectedFrom(m); setFromDropdownOpen(false) }}
                              className={`w-full text-left px-3 py-1.5 text-[10px] hover:bg-surface-secondary transition-colors ${
                                selectedFrom?.phone === m.phone ? 'bg-gunner-red-light text-txt-primary font-semibold' : 'text-txt-secondary'
                              }`}
                            >
                              {m.name} — {channel === 'sms' ? formatPhone(m.phone) : (m.email ?? m.phone)}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}

            {channel === 'email' && artifactKind !== 'auto-tier' && (
              <div>
                <label className="text-[10px] font-semibold text-txt-muted uppercase tracking-wider block mb-1">Subject</label>
                <input
                  value={emailSubject}
                  onChange={e => setEmailSubject(e.target.value)}
                  className="w-full bg-surface-secondary border-[0.5px] border-[rgba(0,0,0,0.08)] rounded-[10px] px-3 py-1.5 text-[12px] focus:outline-none focus:ring-1 focus:ring-gunner-red/20"
                />
              </div>
            )}

            {/* Recipient list */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-[10px] font-semibold text-txt-muted uppercase tracking-wider">
                  Recipients — {eligibleBuyers.length} eligible{channel && ineligibleCount > 0 ? `, ${ineligibleCount} missing ${channel}` : ''}
                </label>
                <div className="flex gap-3">
                  <button onClick={selectAll} className="text-[10px] font-medium text-semantic-blue hover:underline">Select all</button>
                  <button onClick={clearAll} className="text-[10px] font-medium text-txt-muted hover:underline">Clear</button>
                </div>
              </div>
              <div className="relative mb-1.5">
                <Search size={11} className="absolute left-2 top-1/2 -translate-y-1/2 text-txt-muted" />
                <input
                  value={recipientSearch}
                  onChange={e => setRecipientSearch(e.target.value)}
                  placeholder="Search by name, phone, or email..."
                  className="w-full bg-surface-secondary border-[0.5px] border-[rgba(0,0,0,0.06)] rounded-[8px] pl-7 pr-2 py-1.5 text-[11px] focus:outline-none focus:ring-1 focus:ring-gunner-red/20"
                />
              </div>
              <div className="max-h-32 overflow-y-auto space-y-1 border-[0.5px] border-[rgba(0,0,0,0.06)] rounded-[10px] p-2 bg-surface-secondary">
                {visibleBuyers.length === 0 && (
                  <p className="text-[10px] text-txt-muted italic text-center py-2">No buyers match &ldquo;{recipientSearch}&rdquo;.</p>
                )}
                {visibleBuyers.map(b => {
                  const eligible = !channel ? false : channel === 'sms' ? !!b.phone : !!b.email
                  return (
                    <label
                      key={b.id}
                      className={`flex items-center gap-2 px-2 py-1 rounded text-[11px] ${
                        eligible ? 'hover:bg-white cursor-pointer' : 'opacity-50 cursor-not-allowed'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={selectedIds.has(b.id)}
                        onChange={() => toggleBuyer(b.id)}
                        disabled={!eligible}
                        className="accent-gunner-red"
                      />
                      <span className="font-medium text-txt-primary truncate flex-1">{titleCase(b.name)}</span>
                      <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full capitalize ${
                        b.tier === 'priority' ? 'bg-amber-100 text-amber-700'
                        : b.tier === 'qualified' ? 'bg-green-100 text-green-700'
                        : b.tier === 'jv' ? 'bg-blue-100 text-blue-700'
                        : b.tier === 'realtor' ? 'bg-fuchsia-100 text-fuchsia-700'
                        : 'bg-gray-100 text-gray-600'
                      }`}>{b.tier}</span>
                      {channel && !eligible && <span className="text-[9px] text-amber-700">no {channel}</span>}
                    </label>
                  )
                })}
              </div>
            </div>

            <div className="flex gap-2 pt-1">
              <button
                onClick={onClose}
                className="flex-1 border-[0.5px] border-[rgba(0,0,0,0.1)] text-txt-secondary text-ds-fine font-medium py-2 rounded-[10px] hover:bg-surface-secondary transition-colors"
              >Cancel</button>
              <button
                onClick={() => send()}
                disabled={
                  sending
                  || !channel
                  || eligibleBuyers.length === 0
                  || (artifactKind !== 'auto-tier' && !messageText.trim())
                }
                className="flex-1 bg-gunner-red hover:bg-gunner-red-dark disabled:opacity-40 text-white text-ds-fine font-semibold py-2 rounded-[10px] inline-flex items-center justify-center gap-1.5"
              >
                {sending ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
                {sending ? 'Sending...'
                  : !channel ? 'Pick a channel'
                  : `Send ${channel.toUpperCase()} to ${eligibleBuyers.length}`}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
