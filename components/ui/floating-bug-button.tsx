'use client'

import { useState, useRef, useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { Bug, X, Loader2, Check, AlertTriangle, ImagePlus } from 'lucide-react'

type Severity = 'low' | 'medium' | 'high' | 'critical'

const SEVERITY_OPTIONS: { value: Severity; label: string; hint: string; color: string }[] = [
  { value: 'low', label: 'Small', hint: 'Annoying but not blocking', color: 'bg-gray-100 text-gray-700 border-gray-200' },
  { value: 'medium', label: 'Medium', hint: 'Something is wrong', color: 'bg-amber-100 text-amber-700 border-amber-200' },
  { value: 'high', label: 'Big', hint: 'Stops me from doing my job', color: 'bg-orange-100 text-orange-700 border-orange-200' },
  { value: 'critical', label: 'Emergency', hint: 'The app is broken', color: 'bg-red-100 text-red-700 border-red-200' },
]

// 5MB raw image cap. Server independently validates the encoded data URL
// length (~7.5MB ceiling). Anything larger is a likely raw-camera misuse;
// rejecting client-side gives the user a friendlier error than a 400 from
// the API. Common UI screenshots are well under 1MB.
const MAX_IMAGE_BYTES = 5 * 1024 * 1024
const ACCEPTED_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp']

function readFileAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error('Could not read file'))
    reader.readAsDataURL(file)
  })
}

export function FloatingBugButton() {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const [description, setDescription] = useState('')
  const [severity, setSeverity] = useState<Severity>('medium')
  const [screenshot, setScreenshot] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  async function attachFile(file: File) {
    setError(null)
    if (!ACCEPTED_TYPES.includes(file.type)) {
      setError('Only PNG, JPG, GIF, or WEBP images.')
      return
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setError(`Image is too big (${(file.size / 1024 / 1024).toFixed(1)}MB). Max is 5MB.`)
      return
    }
    try {
      const dataUrl = await readFileAsDataURL(file)
      setScreenshot(dataUrl)
    } catch {
      setError('Could not read that file.')
    }
  }

  function onFilePick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) void attachFile(file)
    // Reset so the same filename can be picked twice in a row
    e.target.value = ''
  }

  // Paste support: when the modal is open and the user hits Cmd/Ctrl+V with
  // an image on the clipboard (the most common screenshot workflow on macOS
  // and Windows), grab it and use it as the attachment. Falls back silently
  // if the paste contains text or no image.
  useEffect(() => {
    if (!open) return
    const handler = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items
      if (!items) return
      for (let i = 0; i < items.length; i++) {
        const item = items[i]
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile()
          if (file) {
            e.preventDefault()
            void attachFile(file)
            return
          }
        }
      }
    }
    window.addEventListener('paste', handler)
    return () => window.removeEventListener('paste', handler)
  }, [open])

  async function submit() {
    if (description.trim().length < 3) {
      setError('Please describe the problem in a few words.')
      return
    }
    setError(null)
    setSubmitting(true)
    try {
      const res = await fetch('/api/bugs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          description: description.trim(),
          severity,
          pageUrl: typeof window !== 'undefined' ? window.location.href : null,
          userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
          screenshot,
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error ?? 'Could not send report')
      }
      setDone(true)
      setTimeout(() => {
        setOpen(false)
        setDone(false)
        setDescription('')
        setSeverity('medium')
        setScreenshot(null)
      }, 1400)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setSubmitting(false)
    }
  }

  function close() {
    if (submitting) return
    setOpen(false)
    setError(null)
  }

  return (
    <>
      {/* Toggle button — bottom-left so it doesn't collide with the AI Coach button on the right */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-6 left-6 z-50 flex items-center gap-2 bg-white border-[0.5px] text-txt-primary px-3 py-2 rounded-full shadow-lg hover:shadow-xl transition-all"
          style={{ borderColor: 'var(--border-medium)' }}
          title="Report a bug"
        >
          <Bug size={14} className="text-semantic-red" />
          <span className="text-[12px] font-medium hidden md:inline">Report a Bug</span>
        </button>
      )}

      {/* Modal panel */}
      {open && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-50 bg-black/20"
            onClick={close}
          />

          {/* Panel */}
          <div
            ref={panelRef}
            className="fixed bottom-6 left-6 z-50 w-[380px] max-w-[calc(100vw-3rem)] bg-white border-[0.5px] rounded-[16px] shadow-2xl flex flex-col"
            style={{ borderColor: 'var(--border-medium)', maxHeight: 'calc(100vh - 3rem)' }}
          >
            {/* Header */}
            <div className="flex items-center gap-2 px-4 py-3 border-b shrink-0" style={{ borderColor: 'var(--border-light)' }}>
              <div className="w-7 h-7 rounded-full bg-red-100 flex items-center justify-center">
                <Bug size={14} className="text-semantic-red" />
              </div>
              <div className="flex-1">
                <p className="text-[13px] font-semibold text-txt-primary">Report a Bug</p>
                <p className="text-[10px] text-txt-muted">Tell us what went wrong. We&apos;ll see it right away.</p>
              </div>
              <button
                onClick={close}
                disabled={submitting}
                className="p-1 rounded-[8px] text-txt-muted hover:text-txt-primary hover:bg-surface-secondary transition-colors disabled:opacity-40"
              >
                <X size={14} />
              </button>
            </div>

            {/* Body */}
            {done ? (
              <div className="p-6 text-center">
                <div className="w-12 h-12 rounded-full bg-green-100 mx-auto flex items-center justify-center mb-2">
                  <Check size={20} className="text-semantic-green" />
                </div>
                <p className="text-[13px] font-semibold text-txt-primary">Sent!</p>
                <p className="text-[11px] text-txt-muted">Thanks — your admin will see this on the Bugs page.</p>
              </div>
            ) : (
              <div className="p-4 space-y-3 overflow-y-auto">
                {/* Description */}
                <div>
                  <label className="text-[11px] font-semibold text-txt-secondary block mb-1">
                    What went wrong?
                  </label>
                  <textarea
                    value={description}
                    onChange={e => setDescription(e.target.value)}
                    placeholder="Example: When I click a call row, nothing happens."
                    rows={4}
                    maxLength={5000}
                    disabled={submitting}
                    className="w-full text-[12px] text-txt-primary bg-white border-[0.5px] rounded-[10px] px-3 py-2 focus:outline-none focus:ring-2 focus:ring-semantic-blue/30 placeholder:text-txt-muted resize-none"
                    style={{ borderColor: 'var(--border-medium)' }}
                  />
                  <p className="text-[9px] text-txt-muted mt-1">
                    Be specific — what did you click, what did you expect, what happened instead?
                  </p>
                </div>

                {/* Screenshot */}
                <div>
                  <label className="text-[11px] font-semibold text-txt-secondary block mb-1">
                    Screenshot (optional)
                  </label>
                  {screenshot ? (
                    <div className="relative inline-block w-full">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={screenshot}
                        alt="Screenshot preview"
                        className="w-full max-h-[180px] object-contain bg-surface-secondary rounded-[10px] border-[0.5px]"
                        style={{ borderColor: 'var(--border-medium)' }}
                      />
                      <button
                        type="button"
                        onClick={() => setScreenshot(null)}
                        disabled={submitting}
                        className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-white/95 border-[0.5px] flex items-center justify-center text-txt-secondary hover:text-semantic-red hover:bg-white transition-colors disabled:opacity-40"
                        style={{ borderColor: 'var(--border-medium)' }}
                        title="Remove screenshot"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={submitting}
                      className="w-full flex items-center justify-center gap-1.5 text-[12px] font-medium px-3 py-2 rounded-[10px] bg-surface-secondary text-txt-secondary hover:bg-surface-tertiary transition-colors disabled:opacity-40 border-[0.5px] border-dashed"
                      style={{ borderColor: 'var(--border-medium)' }}
                    >
                      <ImagePlus size={12} />
                      Attach image or paste from clipboard
                    </button>
                  )}
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept={ACCEPTED_TYPES.join(',')}
                    onChange={onFilePick}
                    className="hidden"
                  />
                  <p className="text-[9px] text-txt-muted mt-1">
                    Tip: take a screenshot, then press Cmd+V (or Ctrl+V) here to attach it. Max 5MB.
                  </p>
                </div>

                {/* Severity */}
                <div>
                  <label className="text-[11px] font-semibold text-txt-secondary block mb-1.5">
                    How bad is it?
                  </label>
                  <div className="grid grid-cols-2 gap-1.5">
                    {SEVERITY_OPTIONS.map(opt => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setSeverity(opt.value)}
                        disabled={submitting}
                        className={`text-left px-2.5 py-1.5 rounded-[10px] border-[1px] transition-colors ${
                          severity === opt.value
                            ? opt.color
                            : 'bg-white border-transparent hover:bg-surface-secondary'
                        }`}
                        style={severity === opt.value ? undefined : { borderColor: 'var(--border-light)' }}
                      >
                        <p className="text-[11px] font-semibold">{opt.label}</p>
                        <p className="text-[9px] opacity-80">{opt.hint}</p>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Auto-captured preview */}
                <div className="bg-surface-secondary rounded-[10px] px-3 py-2">
                  <p className="text-[9px] font-semibold text-txt-muted uppercase mb-1">Auto-sent with your report</p>
                  <p className="text-[10px] text-txt-muted truncate">Page: {pathname}</p>
                  <p className="text-[10px] text-txt-muted">Your name and when you sent this</p>
                </div>

                {/* Error */}
                {error && (
                  <div className="bg-red-50 border border-red-200 rounded-[10px] px-3 py-2 flex items-start gap-2">
                    <AlertTriangle size={12} className="text-red-600 shrink-0 mt-0.5" />
                    <p className="text-[11px] text-red-600">{error}</p>
                  </div>
                )}

                {/* Actions */}
                <div className="flex items-center gap-2 pt-1">
                  <button
                    onClick={close}
                    disabled={submitting}
                    className="flex-1 text-[12px] font-medium px-3 py-2 rounded-[10px] bg-surface-secondary text-txt-secondary hover:bg-surface-tertiary transition-colors disabled:opacity-40"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={submit}
                    disabled={submitting || description.trim().length < 3}
                    className="flex-1 text-[12px] font-semibold px-3 py-2 rounded-[10px] bg-semantic-red text-white hover:opacity-90 transition-opacity disabled:opacity-40 flex items-center justify-center gap-1.5"
                  >
                    {submitting ? <><Loader2 size={12} className="animate-spin" /> Sending…</> : 'Send Report'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </>
  )
}
