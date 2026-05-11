'use client'
// components/inventory/property-form.tsx
// Create-only intake form. Four sections: address, stage, source, contact.
// The contact section lets the user search existing GHL contacts OR
// create a new one — a new contact is pushed to GHL AND saved locally
// as either a Partner (agent/wholesaler/JV/etc.) or a Seller (homeowner).
//
// All other property fields (financials, beds/baths, description, etc.)
// are edited on the property detail page after creation, not at intake.

import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Save, Loader2, Plus, Search, X } from 'lucide-react'

const US_STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA',
  'KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ',
  'NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT',
  'VA','WA','WV','WI','WY',
]

// All 3 pipelines. Stored as the AppStage key — the API maps to
// status+lane internally so the property lands in the right column.
type StageOption = { key: string; label: string; group: string }
const STAGE_OPTIONS: StageOption[] = [
  { key: 'acquisition.new_lead',        label: 'New Lead',        group: 'Acquisition' },
  { key: 'acquisition.appt_set',        label: 'Appt Set',        group: 'Acquisition' },
  { key: 'acquisition.offer_made',      label: 'Offer Made',      group: 'Acquisition' },
  { key: 'acquisition.contract',        label: 'Under Contract',  group: 'Acquisition' },
  { key: 'acquisition.closed',          label: 'Closed (Acq)',    group: 'Acquisition' },
  { key: 'disposition.new_deal',        label: 'New Deal',        group: 'Disposition' },
  { key: 'disposition.pushed_out',      label: 'Pushed Out',      group: 'Disposition' },
  { key: 'disposition.offers_received', label: 'Offers Received', group: 'Disposition' },
  { key: 'disposition.contracted',      label: 'Contracted',      group: 'Disposition' },
  { key: 'disposition.closed',          label: 'Closed (Dispo)',  group: 'Disposition' },
  { key: 'longterm.follow_up',          label: 'Follow Up',       group: 'Long-Term' },
  { key: 'longterm.dead',               label: 'Dead',            group: 'Long-Term' },
]

// Locked list — the only sources the team currently runs. Keep in sync
// with the Source chip-row colors in inventory-client.tsx.
const SOURCE_OPTIONS = [
  'PPL',
  'Form',
  'Texts',
  'PPC',
  'Dialer',
  'JV',
]

interface Props {
  tenantSlug: string
  onClose: () => void
  defaultStage?: string
}

type ContactKind = 'partner' | 'seller'

type SelectedContact = {
  mode: 'existing'
  kind: ContactKind
  id: string
  name: string
  phone: string
  email: string
} | {
  mode: 'new'
  kind: ContactKind
  name: string
  phone: string
  email: string
}

export function PropertyForm({ tenantSlug, onClose, defaultStage = 'acquisition.new_lead' }: Props) {
  const router = useRouter()
  const [address, setAddress] = useState('')
  const [city, setCity] = useState('')
  const [state, setState] = useState('')
  const [zip, setZip] = useState('')
  const [stage, setStage] = useState(defaultStage)
  const [source, setSource] = useState('')
  const [contact, setContact] = useState<SelectedContact | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const resolvedSource = source

  async function handleSubmit(e?: React.FormEvent) {
    e?.preventDefault()
    if (saving || !canSubmit) return
    setSaving(true)
    setError('')

    const payload: Record<string, unknown> = {
      address,
      city,
      state,
      zip,
      stage,
      leadSource: resolvedSource || null,
    }
    if (contact?.mode === 'existing') {
      payload.contact = {
        mode: 'existing',
        kind: contact.kind,
        ghlContactId: contact.id,
        name: contact.name,
        phone: contact.phone || null,
        email: contact.email || null,
      }
    } else if (contact?.mode === 'new') {
      payload.contact = {
        mode: 'new',
        kind: contact.kind,
        name: contact.name,
        phone: contact.phone || null,
        email: contact.email || null,
      }
    }

    try {
      const res = await fetch('/api/properties', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Something went wrong')
        setSaving(false)
        return
      }
      router.push(`/${tenantSlug}/inventory/${data.property.id}`)
      router.refresh()
    } catch {
      setError('Network error — please try again')
      setSaving(false)
    }
  }

  const inputCls = 'w-full bg-surface-secondary border-[0.5px] border-[rgba(0,0,0,0.14)] rounded-[10px] px-4 py-2.5 text-ds-body text-txt-primary placeholder-txt-muted focus:outline-none focus:border-gunner-red/60 transition-colors'
  const labelCls = 'block text-ds-fine font-medium text-txt-secondary mb-1.5'
  const sectionCls = 'bg-surface-secondary border-[0.5px] border-[rgba(0,0,0,0.06)] rounded-[12px] p-5 space-y-4'

  const canSubmit = address.trim() && city.trim() && state.trim() && stage && contact && (
    contact.mode === 'existing' || (contact.mode === 'new' && contact.name.trim().length > 0)
  )

  // Close on Escape — standard modal expectation.
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape' && !saving) onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, saving])

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      onClick={() => { if (!saving) onClose() }}
    >
      <div
        className="bg-white rounded-[16px] shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-[rgba(0,0,0,0.06)]">
          <h2 className="text-ds-label font-semibold text-txt-primary">Add property</h2>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="text-txt-muted hover:text-txt-primary disabled:opacity-40 transition-colors"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="flex-1 flex flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
        {/* Address */}
        <div className={sectionCls}>
          <h2 className="text-ds-label font-medium text-txt-primary">Address</h2>
          <div>
            <label className={labelCls}>Street address *</label>
            <input value={address} onChange={e => setAddress(e.target.value)} required placeholder="123 Main St" className={inputCls} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>City *</label>
              <input value={city} onChange={e => setCity(e.target.value)} required placeholder="Memphis" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>State *</label>
              <select value={state} onChange={e => setState(e.target.value)} required className={inputCls}>
                <option value="">Select state</option>
                {US_STATES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className={labelCls}>ZIP code</label>
            <input value={zip} onChange={e => setZip(e.target.value)} placeholder="38104" className={inputCls} />
          </div>
        </div>

        {/* Stage */}
        <div className={sectionCls}>
          <h2 className="text-ds-label font-medium text-txt-primary">Stage *</h2>
          <p className="text-ds-fine text-txt-muted -mt-2">Where this property enters the pipeline.</p>
          <select value={stage} onChange={e => setStage(e.target.value)} required className={inputCls}>
            {(['Acquisition', 'Disposition', 'Long-Term'] as const).map(group => (
              <optgroup key={group} label={group}>
                {STAGE_OPTIONS.filter(s => s.group === group).map(s => (
                  <option key={s.key} value={s.key}>{s.label}</option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>

        {/* Source */}
        <div className={sectionCls}>
          <h2 className="text-ds-label font-medium text-txt-primary">Source</h2>
          <p className="text-ds-fine text-txt-muted -mt-2">How did this deal come to us?</p>
          <select value={source} onChange={e => setSource(e.target.value)} className={inputCls}>
            <option value="">Select source…</option>
            {SOURCE_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>

        {/* Contact */}
        <div className={sectionCls}>
          <h2 className="text-ds-label font-medium text-txt-primary">Contact *</h2>
          <p className="text-ds-fine text-txt-muted -mt-2">Search an existing GHL contact, or create a new one.</p>
          <ContactPicker value={contact} onChange={setContact} />
        </div>

            {error && (
              <div className="bg-semantic-red-bg border-[0.5px] border-semantic-red/20 rounded-[12px] px-4 py-3 text-semantic-red text-ds-body">
                {error}
              </div>
            )}
          </div>
          <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-[rgba(0,0,0,0.06)] bg-surface-secondary/40">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="px-5 py-2.5 text-ds-body text-txt-secondary hover:text-txt-primary bg-white border-[0.5px] border-[rgba(0,0,0,0.14)] rounded-[10px] transition-colors font-medium disabled:opacity-40"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || !canSubmit}
              className="flex items-center gap-2 bg-gunner-red hover:bg-gunner-red-dark disabled:opacity-40 text-white text-ds-body font-semibold px-6 py-2.5 rounded-[10px] transition-colors"
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              {saving ? 'Saving…' : 'Add property'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Contact picker ──────────────────────────────────────────────────────────

function ContactPicker({ value, onChange }: {
  value: SelectedContact | null
  onChange: (next: SelectedContact | null) => void
}) {
  const [mode, setMode] = useState<'search' | 'new'>('search')

  // Selected (either existing or new) — render a confirmation card with
  // an inline Partner/Seller toggle and a Change action. The toggle
  // applies to both modes so the user always tags the contact's role on
  // this deal (drives whether we write a Partner row or Seller row).
  if (value) {
    const modeLabel = value.mode === 'new' ? 'New contact' : 'Existing GHL contact'
    function setKind(kind: ContactKind) {
      if (value!.mode === 'existing') onChange({ ...value!, kind })
      else onChange({ ...value!, kind })
    }
    return (
      <div className="bg-surface-secondary border-[0.5px] border-[rgba(0,0,0,0.08)] rounded-[10px] p-3 space-y-3">
        <div className="flex items-start gap-3">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <p className="text-ds-body font-medium text-txt-primary">{value.name || '(no name)'}</p>
              <span className="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-white text-txt-muted border-[0.5px] border-[rgba(0,0,0,0.08)]">
                {modeLabel}
              </span>
            </div>
            <div className="flex gap-3 text-ds-fine text-txt-secondary">
              {value.phone && <span>{value.phone}</span>}
              {value.email && <span>{value.email}</span>}
            </div>
          </div>
          <button type="button" onClick={() => onChange(null)} className="text-ds-fine text-txt-muted hover:text-semantic-red transition-colors">
            Change
          </button>
        </div>
        <div>
          <p className="text-ds-fine font-medium text-txt-secondary mb-1.5">Role on this deal</p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setKind('seller')}
              className={`flex-1 text-ds-fine font-medium px-3 py-2 rounded-[8px] border-[0.5px] transition-colors ${value.kind === 'seller' ? 'bg-gunner-red-light border-gunner-red text-gunner-red' : 'bg-white border-[rgba(0,0,0,0.14)] text-txt-secondary hover:border-[rgba(0,0,0,0.24)]'}`}
            >
              Seller
              <p className="text-[10px] font-normal text-txt-muted mt-0.5">Homeowner who owns the property</p>
            </button>
            <button
              type="button"
              onClick={() => setKind('partner')}
              className={`flex-1 text-ds-fine font-medium px-3 py-2 rounded-[8px] border-[0.5px] transition-colors ${value.kind === 'partner' ? 'bg-gunner-red-light border-gunner-red text-gunner-red' : 'bg-white border-[rgba(0,0,0,0.14)] text-txt-secondary hover:border-[rgba(0,0,0,0.24)]'}`}
            >
              Partner
              <p className="text-[10px] font-normal text-txt-muted mt-0.5">JV, agent, wholesaler, contractor…</p>
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-1 bg-surface-tertiary rounded-lg p-0.5 w-fit">
        <button
          type="button"
          onClick={() => setMode('search')}
          className={`text-[11px] font-semibold uppercase tracking-wider px-3 py-1 rounded-md transition-colors flex items-center gap-1 ${mode === 'search' ? 'bg-white text-txt-primary shadow-sm' : 'text-txt-muted hover:text-txt-secondary'}`}
        >
          <Search size={11} /> Search GHL
        </button>
        <button
          type="button"
          onClick={() => setMode('new')}
          className={`text-[11px] font-semibold uppercase tracking-wider px-3 py-1 rounded-md transition-colors flex items-center gap-1 ${mode === 'new' ? 'bg-white text-txt-primary shadow-sm' : 'text-txt-muted hover:text-txt-secondary'}`}
        >
          <Plus size={11} /> Create new
        </button>
      </div>
      {mode === 'search'
        ? <GHLContactSearch onPick={(c) => onChange({ mode: 'existing', kind: 'seller', id: c.id, name: c.name, phone: c.phone, email: c.email })} />
        : <NewContactForm onCreate={(c) => onChange({ mode: 'new', ...c })} />
      }
    </div>
  )
}

// ─── New contact form ────────────────────────────────────────────────────────
// Local-only at this stage — the actual GHL contact + Partner/Seller row
// are created server-side when the parent form submits, so the user can
// still back out without leaving orphan records in GHL.

function NewContactForm({ onCreate }: {
  onCreate: (c: { kind: ContactKind; name: string; phone: string; email: string }) => void
}) {
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')

  const inputCls = 'w-full bg-white border-[0.5px] border-[rgba(0,0,0,0.14)] rounded-[10px] px-3 py-2 text-ds-body text-txt-primary placeholder-txt-muted focus:outline-none focus:border-gunner-red/60 transition-colors'

  return (
    <div className="space-y-3 bg-surface-secondary border-[0.5px] border-[rgba(0,0,0,0.06)] rounded-[10px] p-3">
      <div>
        <p className="text-ds-fine font-medium text-txt-secondary mb-1.5">Name *</p>
        <input value={name} onChange={e => setName(e.target.value)} placeholder="Jane Smith" className={inputCls} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <p className="text-ds-fine font-medium text-txt-secondary mb-1.5">Phone</p>
          <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="(555) 555-1212" className={inputCls} />
        </div>
        <div>
          <p className="text-ds-fine font-medium text-txt-secondary mb-1.5">Email</p>
          <input value={email} onChange={e => setEmail(e.target.value)} placeholder="jane@example.com" className={inputCls} />
        </div>
      </div>
      <button
        type="button"
        disabled={!name.trim()}
        onClick={() => onCreate({ kind: 'partner', name: name.trim(), phone: phone.trim(), email: email.trim() })}
        className="w-full flex items-center justify-center gap-1.5 bg-gunner-red hover:bg-gunner-red-dark disabled:opacity-40 text-white text-ds-fine font-semibold px-3 py-2 rounded-[8px] transition-colors"
      >
        <Plus size={12} /> Use this contact
      </button>
      <p className="text-[10px] text-txt-muted text-center">
        Pick the role (Partner / Seller) on the next screen. The contact is saved to GHL + Gunner when you click <span className="font-medium">Add property</span>.
      </p>
    </div>
  )
}

// ─── GHL Contact Search ──────────────────────────────────────────────────────

function GHLContactSearch({ onPick }: {
  onPick: (contact: { id: string; name: string; phone: string; email: string }) => void
}) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Array<{ id: string; name: string; phone: string | null; email: string | null; address: string }>>([])
  const [searching, setSearching] = useState(false)
  const [open, setOpen] = useState(false)
  const timerRef = useRef<NodeJS.Timeout | null>(null)

  function search(q: string) {
    setQuery(q)
    if (timerRef.current) clearTimeout(timerRef.current)
    if (q.length < 2) { setResults([]); return }
    timerRef.current = setTimeout(async () => {
      setSearching(true)
      try {
        const res = await fetch(`/api/ghl/contacts?q=${encodeURIComponent(q)}`)
        const data = await res.json()
        setResults(data.contacts ?? [])
        setOpen(true)
      } catch { setResults([]) }
      setSearching(false)
    }, 300)
  }

  return (
    <div className="relative">
      <input
        value={query}
        onChange={(e) => search(e.target.value)}
        placeholder="Search by name, phone, or email..."
        className="w-full bg-surface-secondary border-[0.5px] border-[rgba(0,0,0,0.14)] rounded-[10px] px-3 py-2 text-ds-body text-txt-primary placeholder-txt-muted focus:outline-none"
      />
      {searching && <Loader2 size={14} className="absolute right-3 top-2.5 animate-spin text-txt-muted" />}
      {open && results.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-white border-[0.5px] border-[rgba(0,0,0,0.14)] rounded-[10px] shadow-lg z-20 max-h-[240px] overflow-y-auto">
          {results.map(c => (
            <button
              key={c.id}
              type="button"
              onClick={() => { onPick({ id: c.id, name: c.name, phone: c.phone ?? '', email: c.email ?? '' }); setOpen(false); setQuery('') }}
              className="w-full text-left px-3 py-2.5 hover:bg-surface-secondary transition-colors border-b border-[rgba(0,0,0,0.04)] last:border-b-0"
            >
              <p className="text-ds-body font-medium text-txt-primary">{c.name}</p>
              <div className="flex gap-3 text-ds-fine text-txt-muted">
                {c.phone && <span>{c.phone}</span>}
                {c.email && <span>{c.email}</span>}
              </div>
              {c.address && <p className="text-ds-fine text-txt-muted">{c.address}</p>}
            </button>
          ))}
        </div>
      )}
      {open && query.length >= 2 && !searching && results.length === 0 && (
        <p className="text-ds-fine text-txt-muted mt-2 flex items-center gap-1">
          <X size={12} /> No GHL contacts matched. Switch to <span className="font-semibold">Create new</span> above.
        </p>
      )}
    </div>
  )
}
