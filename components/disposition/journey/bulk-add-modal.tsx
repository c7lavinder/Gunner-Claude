'use client'
// components/disposition/journey/bulk-add-modal.tsx
// Bulk-add buyers to a property (Session 77).
//
// Paste mode (primary): rep pastes rows from a spreadsheet — phone is
// required, name/email/tier/markets/notes are optional. Each row is
// matched against existing buyers by phone (the only match key per
// owner spec). Phone match → link. No phone match → create GHL
// contact + Buyer + link.
//
// Wraps POST /api/properties/[propertyId]/buyers/bulk-add.

import { useState } from 'react'
import { X, Loader2, Upload, AlertCircle, Check } from 'lucide-react'

interface ParsedRow {
  phone: string
  name: string
  email: string
  tier: string
  markets: string
  notes: string
}

interface BulkResult {
  added: number
  matched: number
  created: number
  errors: Array<{ row: number; reason: string }>
}

const TIER_OPTIONS = ['priority', 'qualified', 'jv', 'unqualified', 'realtor']

// Parse pasted text into rows. Format = tab/comma separated, columns:
// phone, name, email, tier, markets (semicolon-separated), notes
// Header row is auto-detected and skipped.
function parsePaste(text: string): ParsedRow[] {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean)
  if (lines.length === 0) return []

  // Detect header: if first line contains "phone" or "name" without digits.
  const firstLine = lines[0].toLowerCase()
  const headerLooksLikeHeader = (firstLine.includes('phone') || firstLine.includes('name')) && !/\d{3}/.test(firstLine)
  const dataLines = headerLooksLikeHeader ? lines.slice(1) : lines

  return dataLines.map(line => {
    // Try tab-separated first, fall back to comma
    const parts = line.includes('\t') ? line.split('\t') : line.split(',')
    return {
      phone: (parts[0] ?? '').trim(),
      name: (parts[1] ?? '').trim(),
      email: (parts[2] ?? '').trim(),
      tier: (parts[3] ?? '').trim().toLowerCase(),
      markets: (parts[4] ?? '').trim(),
      notes: (parts[5] ?? '').trim(),
    }
  }).filter(r => r.phone)
}

export function BulkAddModal({
  propertyId,
  onClose,
  onComplete,
}: {
  propertyId: string
  onClose: () => void
  onComplete: () => void
}) {
  const [paste, setPaste] = useState('')
  const [defaultTier, setDefaultTier] = useState('unqualified')
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<BulkResult | null>(null)

  const parsed = parsePaste(paste)
  const validCount = parsed.length
  const noPhoneRows = paste.split(/\r?\n/).filter(l => l.trim()).length - validCount

  async function submit() {
    if (parsed.length === 0) return
    setSubmitting(true)
    try {
      const rows = parsed.map(r => ({
        phone: r.phone,
        name: r.name || null,
        email: r.email || null,
        tier: r.tier || defaultTier,
        markets: r.markets ? r.markets.split(';').map(s => s.trim()).filter(Boolean) : null,
        notes: r.notes || null,
      }))
      const res = await fetch(`/api/properties/${propertyId}/buyers/bulk-add`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows }),
      })
      if (res.ok) {
        const data = await res.json()
        setResult(data)
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
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-2xl mx-4 p-5 space-y-4 animate-in zoom-in-95">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-ds-label font-semibold text-txt-primary">Bulk Add Buyers</h3>
            <p className="text-[11px] text-txt-muted mt-0.5">
              Paste rows from a spreadsheet. Phone is required; everything else is optional.
            </p>
          </div>
          <button onClick={onClose} className="text-txt-muted hover:text-txt-secondary">
            <X size={16} />
          </button>
        </div>

        {result ? (
          // ── Result screen ────────────────────────────────────────────
          <div className="space-y-3">
            <div className="bg-surface-secondary rounded-[10px] p-4 space-y-2">
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
                    <li key={i}>
                      Row {e.row + 1}: {e.reason}
                    </li>
                  ))}
                  {result.errors.length > 20 && <li>...and {result.errors.length - 20} more.</li>}
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
          // ── Paste screen ─────────────────────────────────────────────
          <>
            <div>
              <label className="text-[10px] font-semibold text-txt-muted uppercase tracking-wider block mb-1">
                Paste rows
              </label>
              <p className="text-[10px] text-txt-muted mb-1.5">
                Format: <code className="text-[10px] bg-surface-secondary px-1 rounded">phone, name, email, tier, markets, notes</code> — tab or comma separated, one row per buyer. Markets multi-value: separate with semicolons.
              </p>
              <textarea
                value={paste}
                onChange={e => setPaste(e.target.value)}
                rows={10}
                placeholder={`615-555-0001, John Smith, john@example.com, qualified, Nashville;Murfreesboro, Cash buyer flips
615-555-0002, Maria Lopez, , priority, Knoxville,
615-555-0003, , , realtor, ,`}
                autoFocus
                className="w-full bg-surface-secondary border-[0.5px] border-[rgba(0,0,0,0.08)] rounded-[10px] px-3 py-2 text-[11px] font-mono placeholder:text-txt-muted focus:outline-none focus:ring-1 focus:ring-gunner-red/20 resize-none"
              />
            </div>

            <div className="flex items-center gap-3">
              <div className="flex-1">
                <label className="text-[10px] font-semibold text-txt-muted uppercase tracking-wider block mb-1">
                  Default tier (used when row tier is empty)
                </label>
                <select
                  value={defaultTier}
                  onChange={e => setDefaultTier(e.target.value)}
                  className="w-full bg-surface-secondary border-[0.5px] border-[rgba(0,0,0,0.08)] rounded-[10px] px-3 py-2 text-ds-fine focus:outline-none capitalize"
                >
                  {TIER_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div className="bg-surface-secondary border-[0.5px] border-[rgba(0,0,0,0.06)] rounded-[10px] px-3 py-2 text-[10px] flex-1">
                <p className="text-txt-secondary">
                  <span className="font-semibold text-txt-primary">{validCount}</span> {validCount === 1 ? 'row' : 'rows'} ready
                </p>
                {noPhoneRows > 0 && (
                  <p className="text-amber-700 mt-0.5">
                    {noPhoneRows} skipped (no phone)
                  </p>
                )}
              </div>
            </div>

            <div className="flex gap-2">
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
                {submitting ? 'Adding...' : `Add ${validCount} ${validCount === 1 ? 'buyer' : 'buyers'}`}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
