'use client'
// components/inventory/comps-panel.tsx
// Manual comps for a property. Lives in Data tab, under the Property
// Assessment card. Rep types comps in by hand — no MLS / vendor pull.
//
// Used by Section 2's listing-site generator (lib/ai/dispo-generators.ts)
// to populate the ## Comps block of the listing post.
//
// Fields per comp: address, zillowUrl, beds, baths, sqft, condition (4
// enum values), price, status (sold/active/pending), notes.

import { useState, useEffect } from 'react'
import { Plus, Trash2, Pencil, Check, X, ExternalLink, Loader2 } from 'lucide-react'

interface Comp {
  id: string
  address: string
  zillowUrl: string | null
  beds: number | null
  baths: number | null
  sqft: number | null
  condition: string | null      // remodeled | updated | functional | as_is
  price: string | null          // decimal-as-string
  status: string | null         // sold | active | pending
  notes: string | null
  sortOrder: number
  createdAt: string
}

const CONDITION_OPTIONS = [
  { value: '', label: '—' },
  { value: 'remodeled', label: 'Remodeled' },
  { value: 'updated', label: 'Updated' },
  { value: 'functional', label: 'Functional' },
  { value: 'as_is', label: 'As-is' },
]

const STATUS_OPTIONS = [
  { value: '', label: '—' },
  { value: 'sold', label: 'Sold' },
  { value: 'active', label: 'Active' },
  { value: 'pending', label: 'Pending' },
]

const STATUS_PILL_COLORS: Record<string, string> = {
  sold: 'bg-green-100 text-green-700',
  active: 'bg-blue-100 text-blue-700',
  pending: 'bg-amber-100 text-amber-700',
}

const CONDITION_PILL_COLORS: Record<string, string> = {
  remodeled: 'bg-purple-100 text-purple-700',
  updated: 'bg-blue-100 text-blue-700',
  functional: 'bg-gray-100 text-gray-700',
  as_is: 'bg-amber-100 text-amber-700',
}

interface CompForm {
  address: string
  zillowUrl: string
  beds: string
  baths: string
  sqft: string
  condition: string
  price: string
  status: string
  notes: string
}

const EMPTY_FORM: CompForm = {
  address: '', zillowUrl: '', beds: '', baths: '', sqft: '',
  condition: '', price: '', status: '', notes: '',
}

export function CompsPanel({ propertyId }: { propertyId: string }) {
  const [comps, setComps] = useState<Comp[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState<CompForm>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)

  useEffect(() => {
    fetch(`/api/properties/${propertyId}/comps`)
      .then(r => r.json())
      .then(d => { setComps(d.comps ?? []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [propertyId])

  function startAdd() {
    setEditingId(null)
    setForm(EMPTY_FORM)
    setShowForm(true)
  }

  function startEdit(c: Comp) {
    setEditingId(c.id)
    setForm({
      address: c.address,
      zillowUrl: c.zillowUrl ?? '',
      beds: c.beds?.toString() ?? '',
      baths: c.baths?.toString() ?? '',
      sqft: c.sqft?.toString() ?? '',
      condition: c.condition ?? '',
      price: c.price ?? '',
      status: c.status ?? '',
      notes: c.notes ?? '',
    })
    setShowForm(true)
  }

  function cancelForm() {
    setShowForm(false)
    setEditingId(null)
    setForm(EMPTY_FORM)
  }

  async function save() {
    if (!form.address.trim()) return
    setSaving(true)
    const body = {
      address: form.address.trim(),
      zillowUrl: form.zillowUrl.trim() || null,
      beds: form.beds ? parseInt(form.beds, 10) : null,
      baths: form.baths ? parseFloat(form.baths) : null,
      sqft: form.sqft ? parseInt(form.sqft, 10) : null,
      condition: form.condition || null,
      price: form.price || null,
      status: form.status || null,
      notes: form.notes.trim() || null,
    }
    try {
      if (editingId) {
        const res = await fetch(`/api/properties/${propertyId}/comps/${editingId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
        if (res.ok) {
          const data = await res.json()
          setComps(prev => prev.map(c => c.id === editingId ? data.comp : c))
          cancelForm()
        }
      } else {
        const res = await fetch(`/api/properties/${propertyId}/comps`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
        if (res.ok) {
          const data = await res.json()
          setComps(prev => [...prev, data.comp])
          cancelForm()
        }
      }
    } catch {}
    setSaving(false)
  }

  async function deleteComp(id: string) {
    if (!confirm('Delete this comp?')) return
    try {
      const res = await fetch(`/api/properties/${propertyId}/comps/${id}`, {
        method: 'DELETE',
      })
      if (res.ok) setComps(prev => prev.filter(c => c.id !== id))
    } catch {}
  }

  return (
    <div className="bg-white border-[0.5px] border-[rgba(0,0,0,0.08)] rounded-[12px] overflow-hidden">
      <div className="px-4 py-2 bg-surface-secondary border-b border-[rgba(0,0,0,0.04)] flex items-center justify-between">
        <div>
          <p className="text-[9px] font-semibold text-txt-muted uppercase tracking-wider">Comps</p>
          <p className="text-[8px] text-txt-muted italic">
            Manual entries. Used in the AI-generated property listing post.
          </p>
        </div>
        {!showForm && (
          <button
            onClick={startAdd}
            className="text-[10px] font-semibold text-white bg-gunner-red hover:bg-gunner-red-dark px-2.5 py-1 rounded-[6px] inline-flex items-center gap-1 transition-colors"
          >
            <Plus size={11} /> Add Comp
          </button>
        )}
      </div>

      <div className="p-3 space-y-2">
        {loading ? (
          <p className="text-[10px] text-txt-muted text-center py-3">
            <Loader2 size={11} className="inline animate-spin mr-1" />Loading...
          </p>
        ) : (
          <>
            {comps.length === 0 && !showForm && (
              <p className="text-[10px] text-txt-muted text-center py-4">
                No comps yet. Add a few to power the AI-generated listing post.
              </p>
            )}

            {comps.map(c => (
              <div key={c.id} className="bg-surface-secondary border-[0.5px] border-[rgba(0,0,0,0.06)] rounded-[10px] p-3 group">
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-[12px] font-semibold text-txt-primary">{c.address}</p>
                      {c.status && (
                        <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full capitalize ${STATUS_PILL_COLORS[c.status] ?? 'bg-gray-100 text-gray-600'}`}>
                          {c.status}
                        </span>
                      )}
                      {c.condition && (
                        <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full capitalize ${CONDITION_PILL_COLORS[c.condition] ?? 'bg-gray-100 text-gray-600'}`}>
                          {c.condition === 'as_is' ? 'As-is' : c.condition}
                        </span>
                      )}
                      {c.zillowUrl && (
                        <a href={c.zillowUrl} target="_blank" rel="noreferrer"
                          className="text-[10px] text-semantic-blue hover:underline inline-flex items-center gap-0.5">
                          Zillow <ExternalLink size={9} />
                        </a>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-[10px] text-txt-secondary">
                      {c.price && <span className="font-semibold text-semantic-green">${Number(c.price).toLocaleString()}</span>}
                      {c.beds != null && <span>{c.beds} bed</span>}
                      {c.baths != null && <span>{c.baths} bath</span>}
                      {c.sqft != null && <span>{c.sqft.toLocaleString()} sqft</span>}
                    </div>
                    {c.notes && <p className="text-[10px] text-txt-muted mt-1.5 italic">{c.notes}</p>}
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={() => startEdit(c)}
                      className="text-txt-muted hover:text-txt-primary p-1" title="Edit">
                      <Pencil size={11} />
                    </button>
                    <button onClick={() => deleteComp(c.id)}
                      className="text-txt-muted hover:text-semantic-red p-1" title="Delete">
                      <Trash2 size={11} />
                    </button>
                  </div>
                </div>
              </div>
            ))}

            {showForm && (
              <div className="bg-surface-secondary border-[0.5px] border-[rgba(0,0,0,0.06)] rounded-[10px] p-3 space-y-2">
                <p className="text-[10px] font-semibold text-txt-muted uppercase tracking-wider">
                  {editingId ? 'Edit Comp' : 'Add Comp'}
                </p>

                <input
                  value={form.address}
                  onChange={e => setForm(f => ({ ...f, address: e.target.value }))}
                  placeholder="123 Main St (required)"
                  className="w-full bg-white border-[0.5px] border-[rgba(0,0,0,0.1)] rounded-[8px] px-2.5 py-1.5 text-ds-fine focus:outline-none focus:ring-1 focus:ring-gunner-red/20"
                  autoFocus
                />

                <input
                  value={form.zillowUrl}
                  onChange={e => setForm(f => ({ ...f, zillowUrl: e.target.value }))}
                  placeholder="Zillow link (optional)"
                  className="w-full bg-white border-[0.5px] border-[rgba(0,0,0,0.1)] rounded-[8px] px-2.5 py-1.5 text-ds-fine focus:outline-none focus:ring-1 focus:ring-gunner-red/20"
                />

                <div className="grid grid-cols-3 gap-2">
                  <input
                    value={form.beds}
                    onChange={e => setForm(f => ({ ...f, beds: e.target.value }))}
                    placeholder="Beds" type="number"
                    className="bg-white border-[0.5px] border-[rgba(0,0,0,0.1)] rounded-[8px] px-2.5 py-1.5 text-ds-fine focus:outline-none focus:ring-1 focus:ring-gunner-red/20"
                  />
                  <input
                    value={form.baths}
                    onChange={e => setForm(f => ({ ...f, baths: e.target.value }))}
                    placeholder="Baths" type="number" step="0.5"
                    className="bg-white border-[0.5px] border-[rgba(0,0,0,0.1)] rounded-[8px] px-2.5 py-1.5 text-ds-fine focus:outline-none focus:ring-1 focus:ring-gunner-red/20"
                  />
                  <input
                    value={form.sqft}
                    onChange={e => setForm(f => ({ ...f, sqft: e.target.value }))}
                    placeholder="Sqft" type="number"
                    className="bg-white border-[0.5px] border-[rgba(0,0,0,0.1)] rounded-[8px] px-2.5 py-1.5 text-ds-fine focus:outline-none focus:ring-1 focus:ring-gunner-red/20"
                  />
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <select
                    value={form.condition}
                    onChange={e => setForm(f => ({ ...f, condition: e.target.value }))}
                    className="bg-white border-[0.5px] border-[rgba(0,0,0,0.1)] rounded-[8px] px-2 py-1.5 text-ds-fine focus:outline-none"
                  >
                    {CONDITION_OPTIONS.map(o => (
                      <option key={o.value} value={o.value}>{o.label || 'Condition'}</option>
                    ))}
                  </select>
                  <input
                    value={form.price}
                    onChange={e => setForm(f => ({ ...f, price: e.target.value }))}
                    placeholder="Price" type="text"
                    className="bg-white border-[0.5px] border-[rgba(0,0,0,0.1)] rounded-[8px] px-2.5 py-1.5 text-ds-fine focus:outline-none focus:ring-1 focus:ring-gunner-red/20"
                  />
                  <select
                    value={form.status}
                    onChange={e => setForm(f => ({ ...f, status: e.target.value }))}
                    className="bg-white border-[0.5px] border-[rgba(0,0,0,0.1)] rounded-[8px] px-2 py-1.5 text-ds-fine focus:outline-none"
                  >
                    {STATUS_OPTIONS.map(o => (
                      <option key={o.value} value={o.value}>{o.label || 'Status'}</option>
                    ))}
                  </select>
                </div>

                <textarea
                  value={form.notes}
                  onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                  placeholder="Notes (optional)" rows={2}
                  className="w-full bg-white border-[0.5px] border-[rgba(0,0,0,0.1)] rounded-[8px] px-2.5 py-1.5 text-ds-fine focus:outline-none focus:ring-1 focus:ring-gunner-red/20 resize-none"
                />

                <div className="flex gap-2">
                  <button
                    onClick={cancelForm}
                    className="flex-1 text-ds-fine font-medium text-txt-secondary bg-surface-tertiary hover:bg-surface-secondary py-1.5 rounded-[8px] transition-colors inline-flex items-center justify-center gap-1"
                  >
                    <X size={11} /> Cancel
                  </button>
                  <button
                    onClick={save}
                    disabled={!form.address.trim() || saving}
                    className="flex-1 bg-gunner-red hover:bg-gunner-red-dark disabled:opacity-40 text-white text-ds-fine font-semibold py-1.5 rounded-[8px] transition-colors inline-flex items-center justify-center gap-1"
                  >
                    {saving ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} />}
                    {saving ? 'Saving...' : (editingId ? 'Save' : 'Add')}
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
