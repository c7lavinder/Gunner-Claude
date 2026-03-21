'use client'
// components/settings/rubric-editor.tsx
// Full CRUD UI for call grading rubrics
// Each tenant can have custom rubrics per role and call type

import { useState } from 'react'
import { Plus, Trash2, GripVertical, CheckCircle, AlertCircle, X } from 'lucide-react'
import { ROLE_LABELS, type UserRole } from '@/types/roles'

interface RubricCriteria {
  category: string
  maxPoints: number
  description: string
}

interface Rubric {
  id: string
  name: string
  role: string
  callType: string | null
  isDefault: boolean
  criteria?: RubricCriteria[]
}

interface Props {
  tenantId: string
  callTypes: string[]
  existingRubrics: Rubric[]
}

const EDITABLE_ROLES: UserRole[] = [
  'LEAD_MANAGER',
  'ACQUISITION_MANAGER',
  'DISPOSITION_MANAGER',
  'TEAM_LEAD',
]

const DEFAULT_CRITERIA: RubricCriteria[] = [
  { category: 'Opening & rapport', maxPoints: 20, description: 'Strong opener, built rapport quickly, stated purpose clearly' },
  { category: 'Qualifying', maxPoints: 25, description: 'Asked the right questions to understand motivation and timeline' },
  { category: 'Listening', maxPoints: 20, description: 'Listened actively, did not interrupt, reflected back key points' },
  { category: 'Objection handling', maxPoints: 20, description: 'Handled objections professionally without being pushy' },
  { category: 'Next step', maxPoints: 15, description: 'Set a clear next step before ending the call' },
]

export function RubricEditor({ tenantId, callTypes, existingRubrics }: Props) {
  const [rubrics, setRubrics] = useState<Rubric[]>(existingRubrics)
  const [creating, setCreating] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // New rubric form state
  const [newName, setNewName] = useState('')
  const [newRole, setNewRole] = useState<UserRole>('LEAD_MANAGER')
  const [newCallType, setNewCallType] = useState('')
  const [newIsDefault, setNewIsDefault] = useState(false)
  const [newCriteria, setNewCriteria] = useState<RubricCriteria[]>(DEFAULT_CRITERIA)

  const totalPoints = newCriteria.reduce((s, c) => s + c.maxPoints, 0)

  function addCriteria() {
    setNewCriteria(prev => [...prev, { category: '', maxPoints: 10, description: '' }])
  }

  function removeCriteria(idx: number) {
    setNewCriteria(prev => prev.filter((_, i) => i !== idx))
  }

  function updateCriteria(idx: number, field: keyof RubricCriteria, value: string | number) {
    setNewCriteria(prev => prev.map((c, i) => i === idx ? { ...c, [field]: value } : c))
  }

  function resetForm() {
    setNewName('')
    setNewRole('LEAD_MANAGER')
    setNewCallType('')
    setNewIsDefault(false)
    setNewCriteria(DEFAULT_CRITERIA)
    setCreating(false)
  }

  async function saveRubric() {
    if (!newName.trim() || newCriteria.some(c => !c.category.trim() || !c.description.trim())) {
      setMessage({ type: 'error', text: 'Fill in all criteria fields before saving' })
      return
    }
    if (totalPoints !== 100) {
      setMessage({ type: 'error', text: `Points must total 100 (currently ${totalPoints})` })
      return
    }

    setSaving(true)
    try {
      const res = await fetch('/api/call-rubrics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newName.trim(),
          role: newRole,
          callType: newCallType || null,
          isDefault: newIsDefault,
          criteria: newCriteria,
        }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Save failed')

      setRubrics(prev => [...prev, data.rubric])
      setMessage({ type: 'success', text: `"${newName}" rubric created` })
      resetForm()
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Failed to save' })
    }
    setSaving(false)
    setTimeout(() => setMessage(null), 4000)
  }

  async function deleteRubric(id: string, name: string) {
    if (!confirm(`Delete rubric "${name}"? This cannot be undone.`)) return

    const res = await fetch(`/api/call-rubrics/${id}`, { method: 'DELETE' })
    if (res.ok) {
      setRubrics(prev => prev.filter(r => r.id !== id))
      setMessage({ type: 'success', text: `"${name}" deleted` })
      setTimeout(() => setMessage(null), 3000)
    }
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-ds-label font-medium text-txt-primary">Call grading rubrics</h2>
          <p className="text-ds-fine text-txt-muted mt-1">
            Custom scoring criteria per role. Default rubrics are used when none are set.
          </p>
        </div>
        {!creating && (
          <button
            onClick={() => setCreating(true)}
            className="flex items-center gap-1.5 text-ds-body font-semibold bg-gunner-red hover:bg-gunner-red-dark text-white px-4 py-2 rounded-[10px] transition-colors"
          >
            <Plus size={13} /> New rubric
          </button>
        )}
      </div>

      {/* Status message */}
      {message && (
        <div className={`flex items-center gap-2 px-4 py-3 rounded-[14px] text-ds-body ${
          message.type === 'success'
            ? 'bg-semantic-green-bg border border-semantic-green/20 text-semantic-green'
            : 'bg-semantic-red-bg border border-semantic-red/20 text-semantic-red'
        }`}>
          {message.type === 'success' ? <CheckCircle size={14} /> : <AlertCircle size={14} />}
          {message.text}
        </div>
      )}

      {/* Existing rubrics list */}
      {rubrics.length > 0 ? (
        <div className="space-y-2">
          {rubrics.map((r) => (
            <div
              key={r.id}
              className="flex items-center justify-between bg-surface-primary border border-[rgba(0,0,0,0.08)] rounded-[14px] px-5 py-4 transition-all duration-150 hover:shadow-ds-float hover:border-[rgba(0,0,0,0.14)]"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-ds-label font-medium text-txt-primary">{r.name}</span>
                  {r.isDefault && (
                    <span className="text-ds-fine font-medium text-gunner-red bg-gunner-red-light px-2 py-0.5 rounded-full">default</span>
                  )}
                </div>
                <p className="text-ds-fine text-txt-muted mt-1">
                  {ROLE_LABELS[r.role as UserRole] ?? r.role}
                  {r.callType ? ` · ${r.callType}` : ' · all call types'}
                </p>
              </div>
              <button
                onClick={() => deleteRubric(r.id, r.name)}
                className="text-txt-muted hover:text-semantic-red transition-colors ml-3 shrink-0"
                title="Delete rubric"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      ) : !creating ? (
        <div className="bg-surface-primary border border-[rgba(0,0,0,0.08)] rounded-[14px] py-12 text-center">
          <p className="text-ds-body text-txt-muted">No custom rubrics yet — defaults are active</p>
          <button
            onClick={() => setCreating(true)}
            className="mt-3 text-ds-fine font-medium text-gunner-red hover:text-gunner-red-dark transition-colors"
          >
            Create your first rubric
          </button>
        </div>
      ) : null}

      {/* Create rubric form */}
      {creating && (
        <div className="bg-surface-primary border border-[rgba(0,0,0,0.08)] rounded-[14px] p-6 space-y-5">
          <div className="flex items-center justify-between">
            <h3 className="text-ds-label font-medium text-txt-primary">New rubric</h3>
            <button onClick={resetForm} className="text-txt-muted hover:text-txt-primary transition-colors">
              <X size={16} />
            </button>
          </div>

          {/* Rubric meta */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-ds-fine font-medium text-txt-secondary mb-1.5">Rubric name *</label>
              <input
                value={newName}
                onChange={e => setNewName(e.target.value)}
                placeholder="e.g. Acquisition standard"
                className="w-full bg-surface-secondary border border-[rgba(0,0,0,0.08)] rounded-[10px] px-3 py-2 text-ds-body text-txt-primary placeholder-txt-muted focus:outline-none focus:border-[rgba(0,0,0,0.14)]"
              />
            </div>
            <div>
              <label className="block text-ds-fine font-medium text-txt-secondary mb-1.5">Apply to role *</label>
              <select
                value={newRole}
                onChange={e => setNewRole(e.target.value as UserRole)}
                className="w-full bg-surface-secondary border border-[rgba(0,0,0,0.08)] rounded-[10px] px-3 py-2 text-ds-body text-txt-primary focus:outline-none focus:border-[rgba(0,0,0,0.14)]"
              >
                {EDITABLE_ROLES.map(r => (
                  <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-ds-fine font-medium text-txt-secondary mb-1.5">Call type (optional)</label>
              <select
                value={newCallType}
                onChange={e => setNewCallType(e.target.value)}
                className="w-full bg-surface-secondary border border-[rgba(0,0,0,0.08)] rounded-[10px] px-3 py-2 text-ds-body text-txt-primary focus:outline-none focus:border-[rgba(0,0,0,0.14)]"
              >
                <option value="">All call types</option>
                {callTypes.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div className="flex items-center gap-2 pt-6">
              <button
                type="button"
                onClick={() => setNewIsDefault(!newIsDefault)}
                className={`w-10 h-5 rounded-full transition-colors shrink-0 ${newIsDefault ? 'bg-gunner-red' : 'bg-surface-tertiary'}`}
              >
                <span className={`block w-4 h-4 rounded-full bg-white shadow-ds-float transition-transform mx-0.5 ${newIsDefault ? 'translate-x-5' : 'translate-x-0'}`} />
              </button>
              <span className="text-ds-fine text-txt-secondary">Set as default for this role</span>
            </div>
          </div>

          {/* Criteria */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className="text-ds-fine font-medium text-txt-primary">Scoring criteria</span>
                <span className={`text-ds-fine font-medium px-2 py-0.5 rounded-full ${
                  totalPoints === 100 ? 'bg-semantic-green-bg text-semantic-green' : 'bg-semantic-amber-bg text-semantic-amber'
                }`}>
                  {totalPoints}/100 pts
                </span>
              </div>
              <button
                onClick={addCriteria}
                className="text-ds-fine font-medium text-gunner-red hover:text-gunner-red-dark flex items-center gap-1 transition-colors"
              >
                <Plus size={11} /> Add criterion
              </button>
            </div>

            <div className="space-y-2">
              {newCriteria.map((c, idx) => (
                <div key={idx} className="bg-surface-secondary border border-[rgba(0,0,0,0.08)] rounded-[14px] p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <GripVertical size={14} className="text-txt-muted shrink-0" />
                    <input
                      value={c.category}
                      onChange={e => updateCriteria(idx, 'category', e.target.value)}
                      placeholder="Category name"
                      className="flex-1 bg-transparent text-ds-body text-txt-primary placeholder-txt-muted focus:outline-none"
                    />
                    <div className="flex items-center gap-1 shrink-0">
                      <input
                        type="number"
                        value={c.maxPoints}
                        onChange={e => updateCriteria(idx, 'maxPoints', parseInt(e.target.value) || 0)}
                        min={1}
                        max={100}
                        className="w-14 bg-surface-primary border border-[rgba(0,0,0,0.08)] rounded-[10px] px-2 py-1 text-ds-fine text-txt-primary text-center focus:outline-none focus:border-[rgba(0,0,0,0.14)]"
                      />
                      <span className="text-ds-fine text-txt-muted">pts</span>
                    </div>
                    {newCriteria.length > 1 && (
                      <button onClick={() => removeCriteria(idx)} className="text-txt-muted hover:text-semantic-red transition-colors">
                        <X size={13} />
                      </button>
                    )}
                  </div>
                  <input
                    value={c.description}
                    onChange={e => updateCriteria(idx, 'description', e.target.value)}
                    placeholder="What does a perfect score look like?"
                    className="w-full bg-transparent text-ds-fine text-txt-secondary placeholder-txt-muted focus:outline-none ml-5"
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-1">
            <button
              onClick={resetForm}
              className="text-ds-body font-medium text-txt-primary bg-surface-secondary border border-[rgba(0,0,0,0.14)] rounded-[10px] px-4 py-2 hover:border-[rgba(0,0,0,0.22)] transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={saveRubric}
              disabled={saving || !newName.trim() || totalPoints === 0}
              className="flex-1 bg-gunner-red hover:bg-gunner-red-dark disabled:opacity-40 text-white text-ds-body font-semibold py-2 rounded-[10px] transition-colors"
            >
              {saving ? 'Saving...' : 'Save rubric'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
