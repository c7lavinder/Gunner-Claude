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
  const [blastStatus, setBlastStatus] = useState<{ type: 'success' | 'pending' | 'error'; message: string } | null>(null)
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
        setBlastStatus({ type: 'pending', message: `Blast to ${data.blast.recipientCount} buyers requires approval: ${data.blast.gateReason}` })
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

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-white">Disposition Hub</h1>
          <p className="text-sm text-gray-400 mt-0.5">{buyers.length} buyers · Manage your buyer list and send deal blasts</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowBlast(true)} className="flex items-center gap-1.5 bg-orange-500 hover:bg-orange-600 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors">
            <Send size={14} /> New blast
          </button>
          <button onClick={() => setShowAdd(true)} className="flex items-center gap-1.5 bg-white/5 hover:bg-white/10 border border-white/10 text-white text-sm px-4 py-2 rounded-lg transition-colors">
            <Plus size={14} /> Add buyer
          </button>
        </div>
      </div>

      {/* Blast status */}
      {blastStatus && (
        <div className={`p-4 rounded-xl border flex items-start gap-3 ${
          blastStatus.type === 'success' ? 'bg-green-500/10 border-green-500/20' :
          blastStatus.type === 'pending' ? 'bg-yellow-500/10 border-yellow-500/20' :
          'bg-red-500/10 border-red-500/20'
        }`}>
          {blastStatus.type === 'pending' ? <AlertTriangle size={16} className="text-yellow-400 mt-0.5 shrink-0" /> :
           blastStatus.type === 'success' ? <Check size={16} className="text-green-400 mt-0.5 shrink-0" /> :
           <X size={16} className="text-red-400 mt-0.5 shrink-0" />}
          <div className="flex-1">
            <p className={`text-sm ${blastStatus.type === 'success' ? 'text-green-300' : blastStatus.type === 'pending' ? 'text-yellow-300' : 'text-red-300'}`}>
              {blastStatus.message}
            </p>
            {blastStatus.type === 'pending' && (
              <button onClick={() => approveBlast('')} className="mt-2 text-xs bg-yellow-500 text-black font-medium px-3 py-1 rounded-lg hover:bg-yellow-400">
                Approve and send
              </button>
            )}
          </div>
          <button onClick={() => setBlastStatus(null)} className="text-gray-500 hover:text-white"><X size={14} /></button>
        </div>
      )}

      {/* Add buyer form */}
      {showAdd && (
        <div className="bg-[#1a1d27] border border-white/10 rounded-2xl p-5">
          <h2 className="text-sm font-medium text-white mb-3">Add new buyer</h2>
          <div className="grid sm:grid-cols-2 gap-3">
            <input value={addForm.name} onChange={e => setAddForm(p => ({ ...p, name: e.target.value }))} placeholder="Name *" className="bg-[#0f1117] border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-orange-500" />
            <input value={addForm.company} onChange={e => setAddForm(p => ({ ...p, company: e.target.value }))} placeholder="Company" className="bg-[#0f1117] border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-orange-500" />
            <input value={addForm.phone} onChange={e => setAddForm(p => ({ ...p, phone: e.target.value }))} placeholder="Phone" className="bg-[#0f1117] border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-orange-500" />
            <input value={addForm.email} onChange={e => setAddForm(p => ({ ...p, email: e.target.value }))} placeholder="Email" className="bg-[#0f1117] border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-orange-500" />
          </div>
          <div className="flex gap-2 mt-3">
            <button onClick={addBuyer} disabled={!addForm.name || saving} className="bg-orange-500 hover:bg-orange-600 disabled:opacity-40 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors">
              {saving ? 'Adding...' : 'Add buyer'}
            </button>
            <button onClick={() => setShowAdd(false)} className="text-gray-400 hover:text-white text-sm px-3 py-2">Cancel</button>
          </div>
        </div>
      )}

      {/* Blast composer */}
      {showBlast && (
        <div className="bg-[#1a1d27] border border-orange-500/30 rounded-2xl p-5 space-y-4">
          <h2 className="text-sm font-medium text-orange-400 flex items-center gap-2">
            <Send size={14} /> New deal blast
          </h2>
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Property</label>
              <select value={blastProperty} onChange={e => setBlastProperty(e.target.value)} className="w-full bg-[#0f1117] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none">
                <option value="">Select property...</option>
                {properties.map(p => (
                  <option key={p.id} value={p.id}>{p.address} — {p.city}, {p.state}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Channel</label>
              <div className="flex gap-2">
                <button onClick={() => setBlastChannel('sms')} className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm border transition-colors ${blastChannel === 'sms' ? 'bg-orange-500/15 border-orange-500/30 text-orange-400' : 'bg-white/5 border-white/10 text-gray-400'}`}>
                  <Phone size={12} /> SMS
                </button>
                <button onClick={() => setBlastChannel('email')} className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm border transition-colors ${blastChannel === 'email' ? 'bg-orange-500/15 border-orange-500/30 text-orange-400' : 'bg-white/5 border-white/10 text-gray-400'}`}>
                  <Mail size={12} /> Email
                </button>
              </div>
            </div>
          </div>
          <div>
            <label className="text-xs text-gray-400 mb-1 block">Message</label>
            <textarea value={blastMessage} onChange={e => setBlastMessage(e.target.value)} rows={3} placeholder="Hey, I've got a deal at..." className="w-full bg-[#0f1117] border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-orange-500 resize-none" />
          </div>
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs text-gray-400">Select buyers ({selectedBuyers.size}/{buyers.length})</label>
              <button onClick={selectAll} className="text-xs text-orange-400 hover:text-orange-300">
                {selectedBuyers.size === buyers.length ? 'Deselect all' : 'Select all'}
              </button>
            </div>
            <div className="max-h-40 overflow-y-auto space-y-1 bg-[#0f1117] border border-white/10 rounded-lg p-2">
              {buyers.map(b => (
                <button key={b.id} onClick={() => toggleBuyer(b.id)} className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-left text-sm transition-colors ${selectedBuyers.has(b.id) ? 'bg-orange-500/15 text-white' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}>
                  <div className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${selectedBuyers.has(b.id) ? 'bg-orange-500 border-orange-500' : 'border-white/20'}`}>
                    {selectedBuyers.has(b.id) && <Check size={10} className="text-white" />}
                  </div>
                  <span className="flex-1 truncate">{b.name}</span>
                  {b.company && <span className="text-xs text-gray-600">{b.company}</span>}
                </button>
              ))}
              {buyers.length === 0 && <p className="text-xs text-gray-600 text-center py-4">Add buyers first</p>}
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={sendBlast} disabled={!blastProperty || selectedBuyers.size === 0 || !blastMessage || sending} className="flex items-center gap-1.5 bg-orange-500 hover:bg-orange-600 disabled:opacity-40 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors">
              {sending ? <><Loader2 size={14} className="animate-spin" /> Sending...</> : <><Send size={14} /> Send blast ({selectedBuyers.size})</>}
            </button>
            <button onClick={() => setShowBlast(false)} className="text-gray-400 hover:text-white text-sm px-3 py-2">Cancel</button>
          </div>
          {selectedBuyers.size >= 10 && (
            <p className="text-xs text-yellow-400 flex items-center gap-1"><AlertTriangle size={10} /> Blasts to 10+ buyers require approval before sending</p>
          )}
        </div>
      )}

      {/* Buyer list */}
      <div className="bg-[#1a1d27] border border-white/10 rounded-2xl divide-y divide-white/5">
        {buyers.length === 0 ? (
          <div className="p-8 text-center">
            <Users size={24} className="text-gray-600 mx-auto mb-3" />
            <p className="text-sm text-gray-400">No buyers yet. Add your first buyer to start sending deal blasts.</p>
          </div>
        ) : (
          buyers.map(buyer => (
            <div key={buyer.id} className="flex items-center gap-3 px-5 py-4">
              <div className="w-9 h-9 rounded-full bg-purple-500/20 flex items-center justify-center shrink-0">
                <span className="text-purple-400 text-xs font-medium">{buyer.name[0]}</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-white font-medium">{buyer.name}</p>
                <p className="text-xs text-gray-500">
                  {[buyer.company, buyer.phone, buyer.email].filter(Boolean).join(' · ') || 'No contact info'}
                </p>
              </div>
              {buyer.markets.length > 0 && (
                <div className="flex gap-1 shrink-0">
                  {buyer.markets.slice(0, 2).map(m => (
                    <span key={m} className="text-xs bg-white/5 text-gray-400 px-2 py-0.5 rounded-full">{m}</span>
                  ))}
                </div>
              )}
              <span className="text-xs text-gray-600 shrink-0">{buyer.blastCount} blasts</span>
            </div>
          ))
        )}
      </div>

      {/* Recent blasts */}
      {recentBlasts.length > 0 && (
        <div className="bg-[#1a1d27] border border-white/10 rounded-2xl p-5">
          <h2 className="text-sm font-medium text-white mb-3 flex items-center gap-2">
            <Send size={14} className="text-gray-500" /> Recent blasts
          </h2>
          <div className="space-y-2">
            {recentBlasts.map(blast => {
              const statusColors: Record<string, string> = {
                pending: 'text-yellow-400 bg-yellow-500/10',
                approved: 'text-blue-400 bg-blue-500/10',
                sent: 'text-green-400 bg-green-500/10',
                failed: 'text-red-400 bg-red-500/10',
              }
              return (
                <div key={blast.id} className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-white/5">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-white truncate">{blast.property}</p>
                    <p className="text-xs text-gray-600">{blast.createdBy} · {blast.channel.toUpperCase()} · {blast.recipientCount} recipients</p>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${statusColors[blast.status] ?? 'text-gray-400 bg-white/5'}`}>
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
