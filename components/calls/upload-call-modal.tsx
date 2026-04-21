'use client'
// components/calls/upload-call-modal.tsx
// Manual call upload — MP3/MP4/M4A/WAV or pasted transcript, linked to a GHL contact.

import { useEffect, useRef, useState } from 'react'
import { Upload, X, Loader2, Search, FileAudio, FileText } from 'lucide-react'
import { CALL_TYPES } from '@/lib/call-types'
import { useToast } from '@/components/ui/toaster'

interface GHLContactHit {
  id: string
  name: string
  phone: string | null
  email: string | null
  address: string | null
}

interface TeamMember {
  id: string
  name: string
}

interface UploadCallModalProps {
  tenantSlug: string
  teamMembers: TeamMember[]
  canAssignOthers: boolean
  currentUserId: string
  onClose: () => void
  onUploaded: () => void
}

const MAX_FILE_BYTES = 100 * 1024 * 1024
type Mode = 'audio' | 'transcript'
type Stage = 'idle' | 'uploading' | 'success'

export function UploadCallModal({
  tenantSlug,
  teamMembers,
  canAssignOthers,
  currentUserId,
  onClose,
  onUploaded,
}: UploadCallModalProps) {
  const { toast } = useToast()
  const [mode, setMode] = useState<Mode>('audio')
  const [stage, setStage] = useState<Stage>('idle')

  // Contact search
  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<GHLContactHit[]>([])
  const [searching, setSearching] = useState(false)
  const [selected, setSelected] = useState<GHLContactHit | null>(null)

  // File + transcript
  const [file, setFile] = useState<File | null>(null)
  const [transcript, setTranscript] = useState('')

  // Metadata
  const [callType, setCallType] = useState(CALL_TYPES[0]?.id ?? 'cold_call')
  const [direction, setDirection] = useState<'INBOUND' | 'OUTBOUND'>('OUTBOUND')
  const [assignedToId, setAssignedToId] = useState<string>(currentUserId)

  const dialogRef = useRef<HTMLDivElement>(null)

  // ESC to close
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && stage !== 'uploading') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, stage])

  // Debounced contact search
  useEffect(() => {
    if (selected) return
    if (query.trim().length < 2) { setHits([]); return }
    const handle = setTimeout(async () => {
      setSearching(true)
      try {
        const res = await fetch(`/api/ghl/contacts?q=${encodeURIComponent(query.trim())}`)
        const json = await res.json()
        setHits(Array.isArray(json.contacts) ? json.contacts : [])
      } catch {
        setHits([])
      } finally {
        setSearching(false)
      }
    }, 300)
    return () => clearTimeout(handle)
  }, [query, selected])

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) { setFile(null); return }
    if (f.size > MAX_FILE_BYTES) {
      toast(`File too large (max ${MAX_FILE_BYTES / 1024 / 1024} MB)`, 'error')
      e.target.value = ''
      return
    }
    setFile(f)
  }

  const canSubmit = (() => {
    if (!selected) return false
    if (stage === 'uploading') return false
    if (mode === 'audio') return !!file
    return transcript.trim().length >= 50
  })()

  async function handleSubmit() {
    if (!selected || !canSubmit) return
    setStage('uploading')

    const form = new FormData()
    form.set('ghlContactId', selected.id)
    form.set('contactName', selected.name)
    form.set('callType', callType)
    form.set('direction', direction)
    form.set('assignedToId', assignedToId)
    if (mode === 'audio' && file) form.set('file', file)
    if (mode === 'transcript') form.set('transcript', transcript.trim())

    try {
      const res = await fetch(`/api/${tenantSlug}/calls/upload`, { method: 'POST', body: form })
      const json = await res.json().catch(() => ({ success: false, error: 'Invalid response' }))
      if (!res.ok || !json.success) {
        toast(json.error ?? 'Upload failed', 'error')
        setStage('idle')
        return
      }
      setStage('success')
      toast('Call uploaded — grading started', 'success')
      onUploaded()
      setTimeout(onClose, 800)
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Upload failed', 'error')
      setStage('idle')
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/50"
        onClick={() => stage !== 'uploading' && onClose()}
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        className="relative bg-surface-primary border-[0.5px] rounded-[18px] w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-ds-float"
        style={{ borderColor: 'var(--border-medium)' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b-[0.5px]" style={{ borderColor: 'var(--border-light)' }}>
          <div className="flex items-center gap-2">
            <Upload size={18} className="text-txt-primary" />
            <h2 className="text-[16px] font-semibold text-txt-primary">Upload Call</h2>
          </div>
          <button
            onClick={onClose}
            disabled={stage === 'uploading'}
            className="p-1.5 rounded-[8px] text-txt-muted hover:text-txt-primary hover:bg-surface-secondary disabled:opacity-50"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          {/* Step 1: Contact */}
          <div>
            <label className="block text-[12px] font-medium text-txt-secondary mb-1.5">Contact *</label>
            {selected ? (
              <div className="flex items-center justify-between bg-surface-secondary rounded-[10px] px-3 py-2.5 border-[0.5px]" style={{ borderColor: 'var(--border-light)' }}>
                <div className="min-w-0">
                  <p className="text-[13px] font-medium text-txt-primary truncate">{selected.name}</p>
                  <p className="text-[11px] text-txt-muted truncate">{selected.phone ?? selected.email ?? '—'}</p>
                </div>
                <button onClick={() => { setSelected(null); setQuery('') }} className="text-[11px] text-gunner-red hover:underline">Change</button>
              </div>
            ) : (
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-txt-muted" />
                <input
                  type="text"
                  autoFocus
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  placeholder="Search GHL contacts..."
                  className="w-full bg-surface-secondary border-[0.5px] rounded-[10px] pl-9 pr-3 py-2.5 text-[13px] text-txt-primary placeholder:text-txt-muted focus:outline-none"
                  style={{ borderColor: 'var(--border-medium)' }}
                />
                {query.trim().length >= 2 && (
                  <div className="absolute z-10 left-0 right-0 mt-1 max-h-60 overflow-y-auto bg-surface-primary border-[0.5px] rounded-[10px] shadow-ds-float" style={{ borderColor: 'var(--border-medium)' }}>
                    {searching ? (
                      <div className="px-3 py-2.5 text-[12px] text-txt-muted flex items-center gap-2"><Loader2 size={12} className="animate-spin" /> Searching...</div>
                    ) : hits.length === 0 ? (
                      <div className="px-3 py-2.5 text-[12px] text-txt-muted">No contacts found</div>
                    ) : (
                      hits.map(h => (
                        <button
                          key={h.id}
                          onClick={() => { setSelected(h); setHits([]) }}
                          className="w-full text-left px-3 py-2 hover:bg-surface-secondary transition-colors"
                        >
                          <p className="text-[13px] text-txt-primary truncate">{h.name}</p>
                          <p className="text-[11px] text-txt-muted truncate">{h.phone ?? h.email ?? h.address ?? '—'}</p>
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Step 2: Source tabs */}
          <div>
            <label className="block text-[12px] font-medium text-txt-secondary mb-1.5">Source *</label>
            <div className="grid grid-cols-2 gap-2 mb-3">
              <button
                onClick={() => setMode('audio')}
                className={`flex items-center justify-center gap-2 py-2.5 rounded-[10px] text-[12px] font-medium transition-colors ${
                  mode === 'audio' ? 'bg-surface-primary border-[0.5px] text-txt-primary shadow-ds-float' : 'bg-surface-tertiary text-txt-secondary'
                }`}
                style={mode === 'audio' ? { borderColor: 'var(--border-light)' } : undefined}
              >
                <FileAudio size={14} /> Audio file
              </button>
              <button
                onClick={() => setMode('transcript')}
                className={`flex items-center justify-center gap-2 py-2.5 rounded-[10px] text-[12px] font-medium transition-colors ${
                  mode === 'transcript' ? 'bg-surface-primary border-[0.5px] text-txt-primary shadow-ds-float' : 'bg-surface-tertiary text-txt-secondary'
                }`}
                style={mode === 'transcript' ? { borderColor: 'var(--border-light)' } : undefined}
              >
                <FileText size={14} /> Transcript
              </button>
            </div>

            {mode === 'audio' ? (
              <div>
                <input
                  type="file"
                  accept="audio/mpeg,audio/mp3,audio/mp4,audio/m4a,audio/x-m4a,audio/wav,audio/x-wav,audio/webm,audio/ogg,video/mp4"
                  onChange={handleFileChange}
                  className="block w-full text-[12px] text-txt-secondary file:mr-3 file:py-2 file:px-3 file:rounded-[8px] file:border-0 file:bg-surface-secondary file:text-[12px] file:text-txt-primary hover:file:bg-surface-tertiary"
                />
                {file && (
                  <p className="mt-1.5 text-[11px] text-txt-muted">
                    {file.name} · {(file.size / 1024 / 1024).toFixed(1)} MB
                  </p>
                )}
              </div>
            ) : (
              <textarea
                value={transcript}
                onChange={e => setTranscript(e.target.value)}
                placeholder="Paste transcript (min 50 chars)..."
                rows={6}
                className="w-full bg-surface-secondary border-[0.5px] rounded-[10px] px-3 py-2 text-[13px] text-txt-primary placeholder:text-txt-muted focus:outline-none resize-y"
                style={{ borderColor: 'var(--border-medium)' }}
              />
            )}
          </div>

          {/* Step 3: Metadata */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[12px] font-medium text-txt-secondary mb-1.5">Call type *</label>
              <select
                value={callType}
                onChange={e => setCallType(e.target.value)}
                className="w-full bg-surface-secondary border-[0.5px] rounded-[10px] px-3 py-2 text-[13px] text-txt-primary focus:outline-none"
                style={{ borderColor: 'var(--border-medium)' }}
              >
                {CALL_TYPES.map(ct => <option key={ct.id} value={ct.id}>{ct.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[12px] font-medium text-txt-secondary mb-1.5">Direction</label>
              <select
                value={direction}
                onChange={e => setDirection(e.target.value as 'INBOUND' | 'OUTBOUND')}
                className="w-full bg-surface-secondary border-[0.5px] rounded-[10px] px-3 py-2 text-[13px] text-txt-primary focus:outline-none"
                style={{ borderColor: 'var(--border-medium)' }}
              >
                <option value="OUTBOUND">Outbound</option>
                <option value="INBOUND">Inbound</option>
              </select>
            </div>
          </div>

          {canAssignOthers && teamMembers.length > 0 && (
            <div>
              <label className="block text-[12px] font-medium text-txt-secondary mb-1.5">Assigned to</label>
              <select
                value={assignedToId}
                onChange={e => setAssignedToId(e.target.value)}
                className="w-full bg-surface-secondary border-[0.5px] rounded-[10px] px-3 py-2 text-[13px] text-txt-primary focus:outline-none"
                style={{ borderColor: 'var(--border-medium)' }}
              >
                {teamMembers.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t-[0.5px]" style={{ borderColor: 'var(--border-light)' }}>
          <button
            onClick={onClose}
            disabled={stage === 'uploading'}
            className="px-4 py-2 rounded-[10px] text-[13px] text-txt-secondary hover:text-txt-primary hover:bg-surface-secondary transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="px-4 py-2 rounded-[10px] bg-gunner-red text-white text-[13px] font-medium hover:bg-gunner-red-dark disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
          >
            {stage === 'uploading' && <Loader2 size={13} className="animate-spin" />}
            {stage === 'uploading' ? 'Uploading...' : stage === 'success' ? 'Uploaded' : 'Upload & grade'}
          </button>
        </div>
      </div>
    </div>
  )
}
