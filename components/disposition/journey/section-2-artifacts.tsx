'use client'
// components/disposition/journey/section-2-artifacts.tsx
// Three generators stacked vertically inside Section 2 of the
// Disposition Journey:
//   • Description (2-4 sentence opener)
//   • Property listing (full structured post for a listing site)
//   • Social media post (under 180 words for FB Marketplace etc.)
//
// Each generator: Generate button → backend POST → fills textarea →
// rep can edit inline → debounced PATCH on blur saves the edit.
// Persisted on Property.dispoArtifacts. Re-generate overwrites.

import { useState, useEffect } from 'react'
import { Loader2, Wand2, Copy, Check } from 'lucide-react'
import { useToast } from '@/components/ui/toaster'

type Kind = 'description' | 'listing' | 'social'

const KIND_META: Record<Kind, { label: string; helper: string; rows: number; field: 'description' | 'listingPost' | 'socialPost' }> = {
  description: {
    label: 'Description',
    helper: '2-4 sentence opener used at the top of every blast.',
    rows: 4,
    field: 'description',
  },
  listing: {
    label: 'Property Listing Post',
    helper: 'Full structured post for a public listing site. Includes property details, comps, and the closing block.',
    rows: 14,
    field: 'listingPost',
  },
  social: {
    label: 'Social Media Post',
    helper: 'Short, conversational post for FB Marketplace and groups (under 180 words).',
    rows: 8,
    field: 'socialPost',
  },
}

interface DispoArtifacts {
  description?: string
  listingPost?: string
  socialPost?: string
  generatedAt?: { description?: string; listingPost?: string; socialPost?: string }
}

export function Section2Artifacts({
  propertyId,
  initialArtifacts,
  hasDispoManager,
  hasDescription,
  onArtifactSaved,
}: {
  propertyId: string
  initialArtifacts: Record<string, unknown>
  hasDispoManager: boolean
  // True when Property.description is set (the AI uses it as a seed for
  // refinement). We surface a hint when missing so the rep knows the
  // generated text will be more generic.
  hasDescription: boolean
  // Bubbles "description" text up to the parent so the existing
  // Property.description field can stay in sync (the description block
  // also lives in the deal summary). Optional.
  onArtifactSaved?: (kind: Kind, text: string) => void
}) {
  const initial = (initialArtifacts ?? {}) as DispoArtifacts
  const [texts, setTexts] = useState<Record<Kind, string>>({
    description: initial.description ?? '',
    listing: initial.listingPost ?? '',
    social: initial.socialPost ?? '',
  })
  const [generatedAt, setGeneratedAt] = useState<Record<Kind, string | null>>({
    description: initial.generatedAt?.description ?? null,
    listing: initial.generatedAt?.listingPost ?? null,
    social: initial.generatedAt?.socialPost ?? null,
  })

  return (
    <div className="bg-white border-[0.5px] border-[rgba(0,0,0,0.08)] rounded-[12px] overflow-hidden">
      <div className="px-4 py-2 bg-surface-secondary border-b border-[rgba(0,0,0,0.04)]">
        <p className="text-[9px] font-semibold text-txt-muted uppercase tracking-wider">Generated Artifacts</p>
        <p className="text-[8px] text-txt-muted italic">
          One-click generators. Edit inline; edits save automatically.
          {!hasDispoManager && (
            <span className="text-amber-700 font-medium ml-1.5">
              Assign a Disposition Manager first (Section 1) — generators need a contact for the closing block.
            </span>
          )}
        </p>
      </div>

      <div className="divide-y divide-[rgba(0,0,0,0.04)]">
        {(Object.keys(KIND_META) as Kind[]).map(kind => (
          <ArtifactBlock
            key={kind}
            kind={kind}
            propertyId={propertyId}
            text={texts[kind]}
            generatedAt={generatedAt[kind]}
            disabled={!hasDispoManager}
            disabledReason={!hasDispoManager ? 'Assign a Disposition Manager first.' : null}
            hasDescription={hasDescription}
            onTextChange={t => setTexts(prev => ({ ...prev, [kind]: t }))}
            onGenerated={(t, at) => {
              setTexts(prev => ({ ...prev, [kind]: t }))
              setGeneratedAt(prev => ({ ...prev, [kind]: at }))
              onArtifactSaved?.(kind, t)
            }}
            onSavedEdit={t => onArtifactSaved?.(kind, t)}
          />
        ))}
      </div>
    </div>
  )
}

function ArtifactBlock({
  kind, propertyId, text, generatedAt, disabled, disabledReason,
  hasDescription, onTextChange, onGenerated, onSavedEdit,
}: {
  kind: Kind
  propertyId: string
  text: string
  generatedAt: string | null
  disabled: boolean
  disabledReason: string | null
  hasDescription: boolean
  onTextChange: (t: string) => void
  onGenerated: (text: string, at: string) => void
  onSavedEdit: (text: string) => void
}) {
  const meta = KIND_META[kind]
  const { toast } = useToast()
  const [generating, setGenerating] = useState(false)
  const [savingEdit, setSavingEdit] = useState(false)
  const [copied, setCopied] = useState(false)
  const [localText, setLocalText] = useState(text)
  const [savedText, setSavedText] = useState(text)

  // Keep local in sync if parent updates (e.g. after a generation).
  useEffect(() => {
    setLocalText(text)
    setSavedText(text)
  }, [text])

  async function generate() {
    if (disabled) return
    setGenerating(true)
    try {
      const res = await fetch(`/api/properties/${propertyId}/dispo-generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast(data.error ?? `Failed to generate ${meta.label}`, 'error')
      } else {
        const newText = data.text ?? ''
        setLocalText(newText)
        setSavedText(newText)
        onTextChange(newText)
        onGenerated(newText, new Date().toISOString())
        toast(`${meta.label} generated`, 'success')
      }
    } catch {
      toast(`Failed to generate ${meta.label}`, 'error')
    }
    setGenerating(false)
  }

  async function saveEdit() {
    if (localText === savedText) return  // no change
    setSavingEdit(true)
    try {
      const res = await fetch(`/api/properties/${propertyId}/dispo-generate`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind, text: localText }),
      })
      if (res.ok) {
        setSavedText(localText)
        onSavedEdit(localText)
      } else {
        toast('Failed to save edit', 'error')
      }
    } catch {
      toast('Failed to save edit', 'error')
    }
    setSavingEdit(false)
  }

  function copyToClipboard() {
    if (!localText) return
    navigator.clipboard.writeText(localText)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  const isEdited = localText !== savedText

  return (
    <div className="px-4 py-3">
      <div className="flex items-center justify-between mb-1.5">
        <div>
          <p className="text-[11px] font-semibold text-txt-primary">{meta.label}</p>
          <p className="text-[9px] text-txt-muted">{meta.helper}</p>
        </div>
        <div className="flex items-center gap-2">
          {generatedAt && !isEdited && (
            <span className="text-[8px] text-txt-muted">
              Generated {new Date(generatedAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
            </span>
          )}
          {isEdited && (
            <span className="text-[8px] font-semibold text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded">Edited</span>
          )}
          {localText && (
            <button
              onClick={copyToClipboard}
              className="text-[10px] font-medium text-txt-muted hover:text-txt-secondary inline-flex items-center gap-1"
              title="Copy"
            >
              {copied ? <Check size={11} className="text-green-600" /> : <Copy size={11} />}
              {copied ? 'Copied' : 'Copy'}
            </button>
          )}
          <button
            onClick={generate}
            disabled={generating || disabled}
            title={disabled ? disabledReason ?? '' : ''}
            className="text-[10px] font-semibold text-white bg-gunner-red hover:bg-gunner-red-dark disabled:opacity-40 px-2.5 py-1 rounded-[6px] inline-flex items-center gap-1 transition-colors"
          >
            {generating ? <Loader2 size={11} className="animate-spin" /> : <Wand2 size={11} />}
            {generating ? 'Generating...' : (text ? 'Regenerate' : 'Generate')}
          </button>
        </div>
      </div>

      <textarea
        value={localText}
        onChange={e => { setLocalText(e.target.value); onTextChange(e.target.value) }}
        onBlur={saveEdit}
        rows={meta.rows}
        placeholder={text ? '' : `Click Generate to create the ${meta.label.toLowerCase()}...`}
        disabled={disabled}
        className="w-full bg-surface-secondary border-[0.5px] border-[rgba(0,0,0,0.06)] rounded-[8px] px-3 py-2 text-ds-fine text-txt-primary placeholder:text-txt-muted focus:outline-none focus:ring-1 focus:ring-gunner-red/20 disabled:opacity-50 resize-vertical font-mono"
      />

      {savingEdit && <p className="text-[9px] text-txt-muted mt-1">Saving...</p>}
      {kind === 'description' && !hasDescription && !text && (
        <p className="text-[9px] text-txt-muted mt-1 italic">
          Tip: filling in the rough Description on Overview gives the generator a seed to refine.
        </p>
      )}
    </div>
  )
}
