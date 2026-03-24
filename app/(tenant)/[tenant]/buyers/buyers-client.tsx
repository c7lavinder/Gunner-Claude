'use client'
// app/(tenant)/[tenant]/buyers/buyers-client.tsx
// Disposition Hub — buyer list, add buyer, create blast

import { useState } from 'react'
import { Users, Plus, Send, Check, AlertTriangle, Loader2, X, Phone, Mail } from 'lucide-react'

interface BuyerEntry {
  id: string; name: string; phone: string | null; email: string | null
  company: string | null; markets: string[]; tags: string[]; blastCount: number
}
interface PropertyEntry {
  id: string; address: string; city: string; state: string
  status: string; arv: string | null; askingPrice: string | null
}
interface BlastEntry {
  id: string; property: string; createdBy: string
  channel: string; status: string; recipientCount: number; createdAt: string
}

export function BuyersClient({
  tenantSlug, buyers: initialBuyers, properties, recentBlasts,
}: {
  tenantSlug: string
  buyers: BuyerEntry[]
  properties: PropertyEntry[]
  recentBlasts: BlastEntry[]
}) {
  const [buyers, setBuyers] = useState(initialBuyers)
  const [showAdd, setShowAdd] = useState(false)
  const [showBlast, setShowBlast] = useState(false)
  const [addForm, setAddForm] = useState({ name: '', phone: '', email: '', company: '' })
  const [saving, setSaving] = useState(false)

  // Blast state
  const [blastProperty, setBlastProperty] = useState('')
  const [blastChannel, setBlastChannel] = useState<'sms' | 'email'>('sms')
  const [blastMessage, setBlastMessage] = useState('')
  const [selectedBuyers, setSelectedBuyers] = useState<Set<string>>(new Set())
  const [blastStatus, setBlastStatus] = useState<{ type: 'success' | 'pending' | 'error'; message: string; blastId?: string } | null>(null)
  const [sending, setSending] = useState(false)

  async function addBuyer() {
    if (!addForm.name) return
    setSaving(true)
    try {
      const res = await fetch('/api/buyers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(addForm),
      })
      const data = await res.json()
      if (data.buyer) {
        setBuyers(prev => [{ ...data.buyer, markets: [], tags: [], blastCount: 0 }, ...prev])
        setAddForm({ name: '', phone: '', email: '', company: '' })
        setShowAdd(false)
      }
    } catch { /* ignore */ }
    setSaving(false)
  }

  function toggleBuyer(id: string) {
    setSelectedBuyers(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function selectAll() {
    if (selectedBuyers.size === buyers.length) {
      setSelectedBuyers(new Set())
    } else {
      setSelectedBuyers(new Set(buyers.map(b => b.id)))
    }
  }

  async function sendBlast() {
    if (!blastProperty || selectedBuyers.size === 0 || !blastMessage) return
    setSending(true)
    setBlastStatus(null)
    try {
      const res = await fetch('/api/blasts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          propertyId: blastProperty,
          buyerIds: Array.from(selectedBuyers),
          channel: blastChannel,
          message: blastMessage,
        }),
      })
      const data = await res.json()
      if (data.blast?.requiresApproval) {
        setBlastStatus({ type: 'pending', message: `Blast to ${data.blast.recipientCount} buyers requires approval: ${data.blast.gateReason}`, blastId: data.blast.id })
      } else if (data.blast) {
        setBlastStatus({ type: 'success', message: `Blast created for ${data.blast.recipientCount} buyers` })
        setShowBlast(false)
        setSelectedBuyers(new Set())
        setBlastMessage('')
      } else {
        setBlastStatus({ type: 'error', message: data.error || 'Failed to create blast' })
      }
    } catch {
      setBlastStatus({ type: 'error', message: 'Something went wrong' })
    }
    setSending(false)
  }

  async function approveBlast(blastId: string) {
    await fetch('/api/blasts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'approve', blastId }),
    })
    setBlastStatus({ type: 'success', message: 'Blast approved and queued for sending' })
  }

  const inputCls = 'bg-surface-secondary border-[0.5px] border-[rgba(0,0,0,0.14)] rounded-[10px] px-3 py-2 text-ds-body text-txt-primary placeholder-txt-muted focus:outline-none focus:border-gunner-red/60 transition-colors'

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-ds-page font-semibold text-txt-primary">Disposition Hub</h1>
          <p className="text-ds-body text-txt-secondary mt-0.5">{buyers.length} buyers · Manage your buyer list and send deal blasts</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowBlast(true)} className="flex items-center gap-1.5 bg-gunner-red hover:bg-gunner-red-dark text-white text-ds-body font-semibold px-4 py-2.5 rounded-[10px] transition-colors">
            <Send size={14} /> New blast
          </button>
          <button onClick={() => setShowAdd(true)} className="flex items-center gap-1.5 bg-surface-secondary hover:bg-surface-tertiary border-[0.5px] border-[rgba(0,0,0,0.14)] text-txt-primary text-ds-body font-medium px-4 py-2.5 rounded-[10px] transition-colors">
            <Plus size={14} /> Add buyer
          </button>
        </div>
      </div>

      {/* Blast status */}
      {blastStatus && (
        <div className={`p-4 rounded-[14px] border-[0.5px] flex items-start gap-3 ${
          blastStatus.type === 'success' ? 'bg-semantic-green-bg border-semantic-green/20' :
          blastStatus.type === 'pending' ? 'bg-semantic-amber-bg border-semantic-amber/20' :
          'bg-semantic-red-bg border-semantic-red/20'
        }`}>
          {blastStatus.type === 'pending' ? <AlertTriangle size={16} className="text-semantic-amber mt-0.5 shrink-0" /> :
           blastStatus.type === 'success' ? <Check size={16} className="text-semantic-green mt-0.5 shrink-0" /> :
           <X size={16} className="text-semantic-red mt-0.5 shrink-0" />}
          <div className="flex-1">
            <p className={`text-ds-body ${blastStatus.type === 'success' ? 'text-semantic-green' : blastStatus.type === 'pending' ? 'text-semantic-amber' : 'text-semantic-red'}`}>
              {blastStatus.message}
            </p>
            {blastStatus.type === 'pending' && (
              <button onClick={() => approveBlast(blastStatus.blastId ?? '')} className="mt-2 text-ds-fine bg-semantic-amber text-white font-semibold px-3 py-1 rounded-[10px] hover:opacity-90 transition-opacity">
                Approve and send
              </button>
            )}
          </div>
          <button onClick={() => setBlastStatus(null)} className="text-txt-muted hover:text-txt-primary transition-colors"><X size={14} /></button>
        </div>
      )}

      {/* Add buyer form */}
      {showAdd && (
        <div className="bg-white border-[0.5px] border-[rgba(0,0,0,0.08)] rounded-[14px] p-5">
          <h2 className="text-ds-label font-medium text-txt-primary mb-3">Add new buyer</h2>
          <div className="grid sm:grid-cols-2 gap-3">
            <input value={addForm.name} onChange={e => setAddForm(p => ({ ...p, name: e.target.value }))} placeholder="Name *" className={inputCls} />
            <input value={addForm.company} onChange={e => setAddForm(p => ({ ...p, company: e.target.value }))} placeholder="Company" className={inputCls} />
            <input value={addForm.phone} onChange={e => setAddForm(p => ({ ...p, phone: e.target.value }))} placeholder="Phone" className={inputCls} />
            <input value={addForm.email} onChange={e => setAddForm(p => ({ ...p, email: e.target.value }))} placeholder="Email" className={inputCls} />
          </div>
          <div className="flex gap-2 mt-3">
            <button onClick={addBuyer} disabled={!addForm.name || saving} className="bg-gunner-red hover:bg-gunner-red-dark disabled:opacity-40 text-white text-ds-body font-semibold px-4 py-2.5 rounded-[10px] transition-colors">
              {saving ? 'Adding...' : 'Add buyer'}
            </button>
            <button onClick={() => setShowAdd(false)} className="text-txt-secondary hover:text-txt-primary text-ds-body px-3 py-2.5 transition-colors">Cancel</button>
          </div>
        </div>
      )}

      {/* Blast composer */}
      {showBlast && (
        <div className="bg-white border-[0.5px] border-gunner-red/20 rounded-[14px] p-5 space-y-4">
          <h2 className="text-ds-label font-medium text-gunner-red flex items-center gap-2">
            <Send size={14} /> New deal blast
          </h2>
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label className="text-ds-fine text-txt-secondary mb-1 block">Property</label>
              <select value={blastProperty} onChange={e => setBlastProperty(e.target.value)} className={`w-full ${inputCls}`}>
                <option value="">Select property...</option>
                {properties.map(p => (
                  <option key={p.id} value={p.id}>{p.address} — {p.city}, {p.state}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-ds-fine text-txt-secondary mb-1 block">Channel</label>
              <div className="flex gap-2">
                <button onClick={() => setBlastChannel('sms')} className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-[10px] text-ds-body border-[0.5px] transition-colors ${blastChannel === 'sms' ? 'bg-gunner-red-light border-gunner-red/20 text-gunner-red' : 'bg-surface-secondary border-[rgba(0,0,0,0.08)] text-txt-secondary'}`}>
                  <Phone size={12} /> SMS
                </button>
                <button onClick={() => setBlastChannel('email')} className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-[10px] text-ds-body border-[0.5px] transition-colors ${blastChannel === 'email' ? 'bg-gunner-red-light border-gunner-red/20 text-gunner-red' : 'bg-surface-secondary border-[rgba(0,0,0,0.08)] text-txt-secondary'}`}>
                  <Mail size={12} /> Email
                </button>
              </div>
            </div>
          </div>
          <div>
            <label className="text-ds-fine text-txt-secondary mb-1 block">Message</label>
            <textarea value={blastMessage} onChange={e => setBlastMessage(e.target.value)} rows={3} placeholder="Hey, I've got a deal at..." className={`w-full resize-none ${inputCls}`} />
          </div>
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-ds-fine text-txt-secondary">Select buyers ({selectedBuyers.size}/{buyers.length})</label>
              <button onClick={selectAll} className="text-ds-fine text-gunner-red hover:text-gunner-red-dark transition-colors">
                {selectedBuyers.size === buyers.length ? 'Deselect all' : 'Select all'}
              </button>
            </div>
            <div className="max-h-40 overflow-y-auto space-y-1 bg-surface-secondary border-[0.5px] border-[rgba(0,0,0,0.08)] rounded-[10px] p-2">
              {buyers.map(b => (
                <button key={b.id} onClick={() => toggleBuyer(b.id)} className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-[10px] text-left text-ds-body transition-colors ${selectedBuyers.has(b.id) ? 'bg-gunner-red-light text-txt-primary' : 'text-txt-secondary hover:text-txt-primary hover:bg-surface-tertiary'}`}>
                  <div className={`w-4 h-4 rounded border-[0.5px] flex items-center justify-center shrink-0 ${selectedBuyers.has(b.id) ? 'bg-gunner-red border-gunner-red' : 'border-[rgba(0,0,0,0.14)]'}`}>
                    {selectedBuyers.has(b.id) && <Check size={10} className="text-white" />}
                  </div>
                  <span className="flex-1 truncate">{b.name}</span>
                  {b.company && <span className="text-ds-fine text-txt-muted">{b.company}</span>}
                </button>
              ))}
              {buyers.length === 0 && <p className="text-ds-fine text-txt-muted text-center py-4">Add buyers first</p>}
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={sendBlast} disabled={!blastProperty || selectedBuyers.size === 0 || !blastMessage || sending} className="flex items-center gap-1.5 bg-gunner-red hover:bg-gunner-red-dark disabled:opacity-40 text-white text-ds-body font-semibold px-4 py-2.5 rounded-[10px] transition-colors">
              {sending ? <><Loader2 size={14} className="animate-spin" /> Sending...</> : <><Send size={14} /> Send blast ({selectedBuyers.size})</>}
            </button>
            <button onClick={() => setShowBlast(false)} className="text-txt-secondary hover:text-txt-primary text-ds-body px-3 py-2.5 transition-colors">Cancel</button>
          </div>
          {selectedBuyers.size >= 10 && (
            <p className="text-ds-fine text-semantic-amber flex items-center gap-1"><AlertTriangle size={10} /> Blasts to 10+ buyers require approval before sending</p>
          )}
        </div>
      )}

      {/* Buyer list */}
      <div className="bg-white border-[0.5px] border-[rgba(0,0,0,0.08)] rounded-[14px] divide-y divide-[rgba(0,0,0,0.06)]">
        {buyers.length === 0 ? (
          <div className="p-8 text-center">
            <Users size={24} className="text-txt-muted mx-auto mb-3" />
            <p className="text-ds-body text-txt-secondary">No buyers yet. Add your first buyer to start sending deal blasts.</p>
          </div>
        ) : (
          buyers.map(buyer => (
            <div key={buyer.id} className="flex items-center gap-3 px-5 py-4 hover:bg-surface-secondary transition-colors">
              <div className="w-9 h-9 rounded-full bg-semantic-purple-bg flex items-center justify-center shrink-0">
                <span className="text-semantic-purple text-ds-fine font-medium">{buyer.name[0]}</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-ds-body text-txt-primary font-medium">{buyer.name}</p>
                <p className="text-ds-fine text-txt-muted">
                  {[buyer.company, buyer.phone, buyer.email].filter(Boolean).join(' · ') || 'No contact info'}
                </p>
              </div>
              {buyer.markets.length > 0 && (
                <div className="flex gap-1 shrink-0">
                  {buyer.markets.slice(0, 2).map(m => (
                    <span key={m} className="text-ds-fine bg-surface-tertiary text-txt-secondary px-2 py-0.5 rounded-full">{m}</span>
                  ))}
                </div>
              )}
              <span className="text-ds-fine text-txt-muted shrink-0">{buyer.blastCount} blasts</span>
            </div>
          ))
        )}
      </div>

      {/* Recent blasts */}
      {recentBlasts.length > 0 && (
        <div className="bg-white border-[0.5px] border-[rgba(0,0,0,0.08)] rounded-[14px] p-5">
          <h2 className="text-ds-label font-medium text-txt-primary mb-3 flex items-center gap-2">
            <Send size={14} className="text-txt-muted" /> Recent blasts
          </h2>
          <div className="space-y-2">
            {recentBlasts.map(blast => {
              const statusColors: Record<string, string> = {
                pending: 'text-semantic-amber bg-semantic-amber-bg',
                approved: 'text-semantic-blue bg-semantic-blue-bg',
                sent: 'text-semantic-green bg-semantic-green-bg',
                failed: 'text-semantic-red bg-semantic-red-bg',
              }
              return (
                <div key={blast.id} className="flex items-center gap-3 p-2.5 rounded-[10px] hover:bg-surface-secondary transition-colors">
                  <div className="flex-1 min-w-0">
                    <p className="text-ds-body text-txt-primary truncate">{blast.property}</p>
                    <p className="text-ds-fine text-txt-muted">{blast.createdBy} · {blast.channel.toUpperCase()} · {blast.recipientCount} recipients</p>
                  </div>
                  <span className={`text-ds-fine font-medium px-2 py-0.5 rounded-full ${statusColors[blast.status] ?? 'text-txt-secondary bg-surface-tertiary'}`}>
                    {blast.status}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
