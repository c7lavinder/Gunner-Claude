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

import { useState } from 'react'
import { X, Loader2, Send, AlertCircle } from 'lucide-react'
import { titleCase } from '@/lib/format'
import { useToast } from '@/components/ui/toaster'

type ArtifactKind = 'description' | 'listing' | 'social' | 'custom'

interface DispoArtifacts {
  description?: string
  listingPost?: string
  socialPost?: string
}

interface BuyerLite {
  id: string
  name: string
  phone: string | null
  email: string | null
  tier: string
}

const ARTIFACT_LABELS: Record<ArtifactKind, string> = {
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
  onClose,
  onSent,
}: {
  propertyId: string
  propertyAddress: string
  buyers: BuyerLite[]
  artifacts: DispoArtifacts
  onClose: () => void
  onSent: (sentBuyerIds: string[]) => void
}) {
  const { toast } = useToast()
  const [artifactKind, setArtifactKind] = useState<ArtifactKind>('description')
  const [channel, setChannel] = useState<'sms' | 'email'>('sms')
  const [customText, setCustomText] = useState('')
  const [emailSubject, setEmailSubject] = useState(`Off-market deal: ${propertyAddress}`)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set(buyers.map(b => b.id)))
  const [pendingApproval, setPendingApproval] = useState<{ gateId: string; recipientCount: number; confirmation: string } | null>(null)
  const [sending, setSending] = useState(false)

  const messageText = artifactKind === 'description' ? (artifacts.description ?? '')
    : artifactKind === 'listing' ? (artifacts.listingPost ?? '')
    : artifactKind === 'social' ? (artifacts.socialPost ?? '')
    : customText

  const eligibleBuyers = buyers.filter(b => {
    if (channel === 'sms') return !!b.phone && selectedIds.has(b.id)
    return !!b.email && selectedIds.has(b.id)
  })

  const ineligibleCount = selectedIds.size - eligibleBuyers.length

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
    if (!messageText.trim() || eligibleBuyers.length === 0) return
    setSending(true)
    try {
      const res = await fetch(`/api/properties/${propertyId}/blast`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'send',
          // Synthetic tier — the blast route honors buyerIds when present;
          // tier is just required by the schema + recorded in the audit log.
          tier: 'manual',
          channel,
          message: messageText,
          subject: channel === 'email' ? emailSubject : undefined,
          buyerIds: eligibleBuyers.map(b => b.id),
          ...(approvalGateId ? { approvalGateId } : {}),
        }),
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
                {(['description', 'listing', 'social', 'custom'] as const).map(k => {
                  const empty = (k !== 'custom') && !(
                    k === 'description' ? artifacts.description
                    : k === 'listing' ? artifacts.listingPost
                    : artifacts.socialPost
                  )
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

            {/* Channel + email subject */}
            <div className="flex items-center gap-3">
              <div>
                <label className="text-[10px] font-semibold text-txt-muted uppercase tracking-wider block mb-1">Channel</label>
                <div className="flex gap-1.5">
                  <button
                    onClick={() => setChannel('sms')}
                    className={`text-[11px] font-semibold px-3 py-1.5 rounded-full transition-colors ${
                      channel === 'sms' ? 'bg-green-600 text-white' : 'bg-surface-secondary text-txt-secondary hover:bg-surface-tertiary'
                    }`}
                  >SMS</button>
                  <button
                    onClick={() => setChannel('email')}
                    className={`text-[11px] font-semibold px-3 py-1.5 rounded-full transition-colors ${
                      channel === 'email' ? 'bg-blue-600 text-white' : 'bg-surface-secondary text-txt-secondary hover:bg-surface-tertiary'
                    }`}
                  >Email</button>
                </div>
              </div>
              {channel === 'email' && (
                <div className="flex-1">
                  <label className="text-[10px] font-semibold text-txt-muted uppercase tracking-wider block mb-1">Subject</label>
                  <input
                    value={emailSubject}
                    onChange={e => setEmailSubject(e.target.value)}
                    className="w-full bg-surface-secondary border-[0.5px] border-[rgba(0,0,0,0.08)] rounded-[10px] px-3 py-1.5 text-[12px] focus:outline-none focus:ring-1 focus:ring-gunner-red/20"
                  />
                </div>
              )}
            </div>

            {/* Recipient list */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-[10px] font-semibold text-txt-muted uppercase tracking-wider">
                  Recipients — {eligibleBuyers.length} eligible{ineligibleCount > 0 ? `, ${ineligibleCount} missing ${channel}` : ''}
                </label>
                <div className="flex gap-3">
                  <button onClick={selectAll} className="text-[10px] font-medium text-semantic-blue hover:underline">Select all</button>
                  <button onClick={clearAll} className="text-[10px] font-medium text-txt-muted hover:underline">Clear</button>
                </div>
              </div>
              <div className="max-h-32 overflow-y-auto space-y-1 border-[0.5px] border-[rgba(0,0,0,0.06)] rounded-[10px] p-2 bg-surface-secondary">
                {buyers.map(b => {
                  const eligible = channel === 'sms' ? !!b.phone : !!b.email
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
                      {!eligible && <span className="text-[9px] text-amber-700">no {channel}</span>}
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
                disabled={sending || eligibleBuyers.length === 0 || !messageText.trim()}
                className="flex-1 bg-gunner-red hover:bg-gunner-red-dark disabled:opacity-40 text-white text-ds-fine font-semibold py-2 rounded-[10px] inline-flex items-center justify-center gap-1.5"
              >
                {sending ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
                {sending ? 'Sending...' : `Send ${channel.toUpperCase()} to ${eligibleBuyers.length}`}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
