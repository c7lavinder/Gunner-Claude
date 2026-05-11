'use client'
// components/disposition/journey/bulk-add-modal.tsx
// Bulk-add buyers (Phase A3 — disposition rebuild).
//
// Two input modes share the modal frame:
//   • Paste — spreadsheet rows, tab/comma separated. 6-column format kept
//     for back-compat with reps' existing exports. Defaults fill in for
//     missing tier/markets/buybox/etc on every parsed row.
//   • Quick add — structured rows with the FULL 14-field canonical set
//     that matches the single-add BuyerModal. New rows inherit the
//     Defaults bar values on creation; per-row edits override.
//
// Defaults bar at top: Tier, Response Speed, Verified Funding,
// Purchased Before, Markets, Buybox. Changing the bar can re-stamp
// every Quick-add row (button) — useful when the rep realises mid-import
// that everyone in this batch is JV buyers etc.
//
// Wraps POST /api/properties/[propertyId]/buyers/bulk-add.

import { useMemo, useState, useEffect } from 'react'
import { X, Loader2, Upload, AlertCircle, Check, Plus, Trash2 } from 'lucide-react'
import { SearchableSelect } from '@/components/ui/searchable-select'
import { SearchableMultiSelect } from '@/components/ui/searchable-multiselect'

interface QuickRow {
  firstName: string
  lastName: string
  phone: string
  email: string
  mobilePhone: string
  secondaryPhone: string
  secondaryEmail: string
  company: string
  tier: string
  responseSpeed: string
  verifiedFunding: boolean
  purchasedBefore: boolean
  markets: string[]
  buybox: string[]
  notes: string
}

interface Defaults {
  tier: string
  responseSpeed: string
  verifiedFunding: boolean
  purchasedBefore: boolean
  markets: string[]
  buybox: string[]
}

interface BulkResult {
  added: number
  matched: number
  created: number
  errors: Array<{ row: number; reason: string }>
}

const TIER_OPTIONS = [
  { value: 'priority', label: 'Priority' },
  { value: 'qualified', label: 'Qualified' },
  { value: 'jv', label: 'JV Buyer' },
  { value: 'realtor', label: 'Realtor' },
  { value: 'unqualified', label: 'Unqualified' },
  { value: 'halted', label: 'Halted' },
]
const RESPONSE_SPEED_OPTIONS = [
  { value: 'lightning', label: 'Lightning' },
  { value: 'same day', label: 'Same Day' },
  { value: 'slow', label: 'Slow' },
  { value: 'ghost', label: 'Ghost' },
]
const BUYBOX_OPTIONS = ['Fix and Flip', 'Rental', 'Builder', 'Wholesale', 'Land', 'Commercial', 'Multi-Family']

function rowFromDefaults(d: Defaults): QuickRow {
  return {
    firstName: '', lastName: '', phone: '', email: '',
    mobilePhone: '', secondaryPhone: '', secondaryEmail: '', company: '',
    tier: d.tier,
    responseSpeed: d.responseSpeed,
    verifiedFunding: d.verifiedFunding,
    purchasedBefore: d.purchasedBefore,
    markets: [...d.markets],
    buybox: [...d.buybox],
    notes: '',
  }
}

// Parse pasted text into Quick-add row shape. Format = tab/comma
// separated: phone, name, email, tier, markets (semicolon-sep), notes.
// Defaults fill in for anything missing.
function parsePaste(text: string, d: Defaults): QuickRow[] {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean)
  if (lines.length === 0) return []
  const firstLine = lines[0].toLowerCase()
  const looksLikeHeader = (firstLine.includes('phone') || firstLine.includes('name')) && !/\d{3}/.test(firstLine)
  const dataLines = looksLikeHeader ? lines.slice(1) : lines

  return dataLines.map(line => {
    const parts = line.includes('\t') ? line.split('\t') : line.split(',')
    const phone = (parts[0] ?? '').trim()
    const name = (parts[1] ?? '').trim()
    const nameParts = name.split(/\s+/)
    const tier = (parts[3] ?? '').trim().toLowerCase()
    const marketsRaw = (parts[4] ?? '').trim()
    const marketsParsed = marketsRaw ? marketsRaw.split(';').map(s => s.trim()).filter(Boolean) : []
    return {
      firstName: nameParts[0] ?? '',
      lastName: nameParts.slice(1).join(' '),
      phone,
      email: (parts[2] ?? '').trim(),
      mobilePhone: '', secondaryPhone: '', secondaryEmail: '', company: '',
      tier: tier || d.tier,
      responseSpeed: d.responseSpeed,
      verifiedFunding: d.verifiedFunding,
      purchasedBefore: d.purchasedBefore,
      markets: marketsParsed.length > 0 ? marketsParsed : [...d.markets],
      buybox: [...d.buybox],
      notes: (parts[5] ?? '').trim(),
    }
  }).filter(r => r.phone)
}

export function BulkAddModal({
  propertyId,
  marketOptions = [],
  onClose,
  onComplete,
}: {
  propertyId: string
  marketOptions?: string[]
  onClose: () => void
  onComplete: () => void
}) {
  const [mode, setMode] = useState<'paste' | 'quick'>('quick')
  const [defaults, setDefaults] = useState<Defaults>({
    tier: 'qualified',
    responseSpeed: '',
    verifiedFunding: false,
    purchasedBefore: false,
    markets: [],
    buybox: [],
  })
  const [paste, setPaste] = useState('')
  const [quickRows, setQuickRows] = useState<QuickRow[]>([rowFromDefaults({
    tier: 'qualified', responseSpeed: '', verifiedFunding: false, purchasedBefore: false, markets: [], buybox: [],
  })])
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<BulkResult | null>(null)

  // Lock page scroll while open. Same UX as BuyerModal.
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const marketOptionsCombined = useMemo(() => {
    const set = new Set<string>([...marketOptions, ...defaults.markets])
    for (const r of quickRows) for (const m of r.markets) set.add(m)
    return Array.from(set).sort((a, b) => a.localeCompare(b))
  }, [marketOptions, defaults.markets, quickRows])

  const parsedPaste = useMemo(() => parsePaste(paste, defaults), [paste, defaults])
  const validQuick = quickRows.filter(r => r.phone.trim().length > 0)
  const validCount = mode === 'paste' ? parsedPaste.length : validQuick.length
  const noPhoneRows = mode === 'paste'
    ? paste.split(/\r?\n/).filter(l => l.trim()).length - parsedPaste.length
    : quickRows.length - validQuick.length

  function addQuickRow() {
    setQuickRows(rs => [...rs, rowFromDefaults(defaults)])
  }
  function removeQuickRow(i: number) {
    setQuickRows(rs => rs.length === 1 ? [rowFromDefaults(defaults)] : rs.filter((_, idx) => idx !== i))
  }
  function updateRow(i: number, patch: Partial<QuickRow>) {
    setQuickRows(rs => rs.map((r, idx) => idx === i ? { ...r, ...patch } : r))
  }

  function applyDefaultsToAllRows() {
    setQuickRows(rs => rs.map(r => ({
      ...r,
      tier: defaults.tier,
      responseSpeed: defaults.responseSpeed,
      verifiedFunding: defaults.verifiedFunding,
      purchasedBefore: defaults.purchasedBefore,
      markets: [...defaults.markets],
      buybox: [...defaults.buybox],
    })))
  }

  async function submit() {
    const sourceRows = mode === 'paste' ? parsedPaste : validQuick
    if (sourceRows.length === 0) return

    const rows = sourceRows.map(r => {
      const fullName = `${r.firstName.trim()} ${r.lastName.trim()}`.trim()
      return {
        phone: r.phone.trim(),
        name: fullName || null,
        email: r.email.trim() || null,
        mobilePhone: r.mobilePhone.trim() || null,
        secondaryPhone: r.secondaryPhone.trim() || null,
        secondaryEmail: r.secondaryEmail.trim() || null,
        company: r.company.trim() || null,
        tier: r.tier || defaults.tier,
        responseSpeed: r.responseSpeed || defaults.responseSpeed || null,
        verifiedFunding: r.verifiedFunding,
        purchasedBefore: r.purchasedBefore,
        markets: r.markets.length > 0 ? r.markets : (defaults.markets.length > 0 ? defaults.markets : null),
        buybox: r.buybox.length > 0 ? r.buybox : (defaults.buybox.length > 0 ? defaults.buybox : null),
        notes: r.notes.trim() || null,
      }
    })

    setSubmitting(true)
    try {
      const res = await fetch(`/api/properties/${propertyId}/buyers/bulk-add`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows }),
      })
      if (res.ok) {
        setResult(await res.json())
      } else {
        const data = await res.json().catch(() => ({}))
        setResult({ added: 0, matched: 0, created: 0, errors: [{ row: -1, reason: data.error ?? 'Bulk add failed' }] })
      }
    } catch (err) {
      setResult({ added: 0, matched: 0, created: 0, errors: [{ row: -1, reason: err instanceof Error ? err.message : 'Network error' }] })
    }
    setSubmitting(false)
  }

  function done() {
    onComplete()
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" aria-hidden="true" />

      <div className="relative w-full max-w-4xl bg-white rounded-[14px] shadow-2xl flex flex-col overflow-hidden"
           style={{ maxHeight: 'min(88vh, 760px)' }}>
        {/* Header */}
        <div className="shrink-0 px-5 py-3 border-b border-[rgba(0,0,0,0.06)] flex items-center justify-between">
          <div>
            <h3 className="text-[14px] font-semibold text-txt-primary">Bulk Add Buyers</h3>
            <p className="text-[11px] text-txt-muted">Set the defaults below, then type rows or paste from a spreadsheet.</p>
          </div>
          <button onClick={onClose} className="text-txt-muted hover:text-txt-secondary" aria-label="Close">
            <X size={18} />
          </button>
        </div>

        {result ? (
          // Result screen
          <div className="p-5 space-y-3">
            <div className="bg-surface-secondary rounded-[10px] p-4">
              <div className="grid grid-cols-3 gap-3 text-center">
                <div>
                  <p className="text-[20px] font-bold text-semantic-green">{result.added}</p>
                  <p className="text-[10px] text-txt-muted uppercase tracking-wider">Added</p>
                </div>
                <div>
                  <p className="text-[20px] font-bold text-semantic-blue">{result.matched}</p>
                  <p className="text-[10px] text-txt-muted uppercase tracking-wider">Matched existing</p>
                </div>
                <div>
                  <p className="text-[20px] font-bold text-semantic-purple">{result.created}</p>
                  <p className="text-[10px] text-txt-muted uppercase tracking-wider">Created in GHL</p>
                </div>
              </div>
            </div>
            {result.errors.length > 0 && (
              <div className="bg-red-50 border-[0.5px] border-red-200 rounded-[10px] p-3 max-h-40 overflow-y-auto">
                <p className="text-[11px] font-semibold text-red-700 mb-1.5 flex items-center gap-1">
                  <AlertCircle size={11} /> {result.errors.length} error{result.errors.length === 1 ? '' : 's'}
                </p>
                <ul className="space-y-1 text-[10px] text-red-700">
                  {result.errors.slice(0, 20).map((e, i) => (
                    <li key={i}>Row {e.row + 1}: {e.reason}</li>
                  ))}
                  {result.errors.length > 20 && <li>…and {result.errors.length - 20} more.</li>}
                </ul>
              </div>
            )}
            <button
              onClick={done}
              className="w-full bg-gunner-red hover:bg-gunner-red-dark text-white text-ds-fine font-semibold py-2.5 rounded-[10px] transition-colors inline-flex items-center justify-center gap-1.5"
            >
              <Check size={12} /> Done
            </button>
          </div>
        ) : (
          <>
            {/* Defaults bar */}
            <div className="shrink-0 px-5 py-3 bg-surface-secondary border-b border-[rgba(0,0,0,0.06)]">
              <div className="flex items-center justify-between mb-2">
                <SectionLabel>Defaults — new rows inherit these</SectionLabel>
                <button
                  onClick={applyDefaultsToAllRows}
                  className="text-[10px] font-semibold text-semantic-blue hover:text-semantic-blue/80 transition-colors"
                  title="Overwrite tier/markets/buybox/etc on every row with the defaults"
                  type="button"
                >
                  Apply to all rows
                </button>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <Field label="Tier">
                  <SearchableSelect
                    value={defaults.tier}
                    options={TIER_OPTIONS}
                    onChange={v => setDefaults(d => ({ ...d, tier: v }))}
                  />
                </Field>
                <Field label="Response Speed">
                  <SearchableSelect
                    value={defaults.responseSpeed}
                    options={RESPONSE_SPEED_OPTIONS}
                    onChange={v => setDefaults(d => ({ ...d, responseSpeed: v }))}
                    placeholder="—"
                    allowClear
                  />
                </Field>
                <div className="flex items-end gap-3 pb-1">
                  <label className="flex items-center gap-1.5 text-[11px] text-txt-secondary cursor-pointer">
                    <input type="checkbox" checked={defaults.verifiedFunding}
                      onChange={e => setDefaults(d => ({ ...d, verifiedFunding: e.target.checked }))}
                      className="accent-gunner-red" />
                    Verified Funding
                  </label>
                  <label className="flex items-center gap-1.5 text-[11px] text-txt-secondary cursor-pointer">
                    <input type="checkbox" checked={defaults.purchasedBefore}
                      onChange={e => setDefaults(d => ({ ...d, purchasedBefore: e.target.checked }))}
                      className="accent-gunner-red" />
                    Purchased Before
                  </label>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 mt-2">
                <Field label="Markets">
                  <SearchableMultiSelect
                    values={defaults.markets}
                    options={marketOptionsCombined}
                    onChange={v => setDefaults(d => ({ ...d, markets: v }))}
                    placeholder="Search markets…"
                    allowAddNew
                  />
                </Field>
                <Field label="Buybox">
                  <SearchableMultiSelect
                    values={defaults.buybox}
                    options={BUYBOX_OPTIONS}
                    onChange={v => setDefaults(d => ({ ...d, buybox: v }))}
                    placeholder="Search buybox…"
                  />
                </Field>
              </div>
            </div>

            {/* Mode toggle */}
            <div className="shrink-0 px-5 pt-3 pb-2 flex items-center justify-between">
              <div className="flex items-center gap-1 bg-surface-secondary rounded-[10px] p-0.5">
                {(['quick', 'paste'] as const).map(m => (
                  <button
                    key={m}
                    onClick={() => setMode(m)}
                    className={`text-[10px] font-semibold uppercase tracking-wider px-3 py-1 rounded-[8px] transition-colors ${
                      mode === m ? 'bg-white text-txt-primary shadow-sm' : 'text-txt-muted hover:text-txt-secondary'
                    }`}
                  >
                    {m === 'paste' ? 'Paste rows' : 'Quick add'}
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-txt-muted">
                <span className="font-semibold text-txt-primary">{validCount}</span> {validCount === 1 ? 'row' : 'rows'} ready
                {noPhoneRows > 0 && <span className="text-amber-700 ml-2">• {noPhoneRows} skipped (no phone)</span>}
              </p>
            </div>

            {/* Body */}
            <div className="flex-1 min-h-0 overflow-y-auto px-5 pb-3">
              {mode === 'paste' ? (
                <div className="flex flex-col h-full">
                  <p className="text-[10px] text-txt-muted mb-1.5 shrink-0">
                    Format: <code className="text-[10px] bg-surface-secondary px-1 rounded">phone, name, email, tier, markets, notes</code> — tab or comma separated. Markets multi-value: separate with semicolons. Missing tier/markets/buybox fall back to defaults above.
                  </p>
                  <textarea
                    value={paste}
                    onChange={e => setPaste(e.target.value)}
                    placeholder={`615-555-0001, John Smith, john@example.com, qualified, Nashville;Murfreesboro, Cash buyer flips
615-555-0002, Maria Lopez, , priority, Knoxville,
615-555-0003, , , realtor, ,`}
                    autoFocus
                    className="min-h-[200px] w-full bg-surface-secondary border-[0.5px] border-[rgba(0,0,0,0.08)] rounded-[10px] px-3 py-2 text-[11px] font-mono placeholder:text-txt-muted focus:outline-none focus:ring-1 focus:ring-gunner-red/20 resize-none"
                  />
                </div>
              ) : (
                <div className="space-y-2">
                  {quickRows.map((r, i) => (
                    <div key={i} className="bg-surface-secondary border-[0.5px] border-[rgba(0,0,0,0.06)] rounded-[10px] p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-txt-muted">Row {i + 1}</span>
                        <button onClick={() => removeQuickRow(i)} className="text-txt-muted hover:text-semantic-red transition-colors" title="Remove row" type="button">
                          <Trash2 size={12} />
                        </button>
                      </div>

                      {/* Contact info */}
                      <div className="grid grid-cols-4 gap-2">
                        <Cell value={r.firstName} onChange={v => updateRow(i, { firstName: v })} placeholder="First name" />
                        <Cell value={r.lastName} onChange={v => updateRow(i, { lastName: v })} placeholder="Last name" />
                        <Cell value={r.phone} onChange={v => updateRow(i, { phone: v })} placeholder="Phone *" />
                        <Cell value={r.email} onChange={v => updateRow(i, { email: v })} placeholder="Email" />
                      </div>
                      <div className="grid grid-cols-4 gap-2">
                        <Cell value={r.mobilePhone} onChange={v => updateRow(i, { mobilePhone: v })} placeholder="Mobile" />
                        <Cell value={r.secondaryPhone} onChange={v => updateRow(i, { secondaryPhone: v })} placeholder="Secondary phone" />
                        <Cell value={r.secondaryEmail} onChange={v => updateRow(i, { secondaryEmail: v })} placeholder="Secondary email" />
                        <Cell value={r.company} onChange={v => updateRow(i, { company: v })} placeholder="Company" />
                      </div>

                      {/* Status overrides */}
                      <div className="grid grid-cols-2 gap-2">
                        <SearchableSelect
                          value={r.tier}
                          options={TIER_OPTIONS}
                          onChange={v => updateRow(i, { tier: v })}
                          placeholder="Tier"
                        />
                        <SearchableSelect
                          value={r.responseSpeed}
                          options={RESPONSE_SPEED_OPTIONS}
                          onChange={v => updateRow(i, { responseSpeed: v })}
                          placeholder="Response speed"
                          allowClear
                        />
                      </div>
                      <div className="flex gap-4">
                        <label className="flex items-center gap-1.5 text-[11px] text-txt-secondary cursor-pointer">
                          <input type="checkbox" checked={r.verifiedFunding}
                            onChange={e => updateRow(i, { verifiedFunding: e.target.checked })}
                            className="accent-gunner-red" />
                          Verified Funding
                        </label>
                        <label className="flex items-center gap-1.5 text-[11px] text-txt-secondary cursor-pointer">
                          <input type="checkbox" checked={r.purchasedBefore}
                            onChange={e => updateRow(i, { purchasedBefore: e.target.checked })}
                            className="accent-gunner-red" />
                          Purchased Before
                        </label>
                      </div>

                      {/* Match criteria overrides */}
                      <div className="grid grid-cols-2 gap-2">
                        <SearchableMultiSelect
                          values={r.markets}
                          options={marketOptionsCombined}
                          onChange={v => updateRow(i, { markets: v })}
                          placeholder="Markets"
                          allowAddNew
                        />
                        <SearchableMultiSelect
                          values={r.buybox}
                          options={BUYBOX_OPTIONS}
                          onChange={v => updateRow(i, { buybox: v })}
                          placeholder="Buybox"
                        />
                      </div>

                      <Cell value={r.notes} onChange={v => updateRow(i, { notes: v })} placeholder="Notes" />
                    </div>
                  ))}
                  <button
                    onClick={addQuickRow}
                    className="self-start text-[10px] font-semibold text-semantic-blue hover:text-semantic-blue/80 inline-flex items-center gap-1 transition-colors"
                    type="button"
                  >
                    <Plus size={11} /> Add row
                  </button>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="shrink-0 flex gap-2 px-5 py-3 border-t border-[rgba(0,0,0,0.06)]">
              <button
                onClick={onClose}
                className="flex-1 border-[0.5px] border-[rgba(0,0,0,0.1)] text-txt-secondary text-ds-fine font-medium py-2 rounded-[10px] hover:bg-surface-secondary transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={submit}
                disabled={submitting || validCount === 0}
                className="flex-1 bg-gunner-red hover:bg-gunner-red-dark disabled:opacity-40 text-white text-ds-fine font-semibold py-2 rounded-[10px] transition-colors inline-flex items-center justify-center gap-1.5"
              >
                {submitting ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />}
                {submitting ? 'Adding…' : `Add ${validCount} ${validCount === 1 ? 'buyer' : 'buyers'}`}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <p className="text-[10px] font-semibold text-txt-muted uppercase tracking-[0.08em]">{children}</p>
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-[10px] text-txt-muted uppercase block mb-1 tracking-wider">{label}</label>
      {children}
    </div>
  )
}

function Cell({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <input
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full bg-white border-[0.5px] border-[rgba(0,0,0,0.1)] rounded-[6px] px-2 py-1.5 text-ds-fine focus:outline-none focus:ring-1 focus:ring-gunner-red/20"
    />
  )
}
