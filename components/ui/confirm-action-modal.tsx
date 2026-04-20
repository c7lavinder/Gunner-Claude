'use client'
// components/ui/confirm-action-modal.tsx
// Shared confirmation modal for high-stakes user-triggered actions.
// Used by call-detail next-steps push (send_sms, change_stage) and the AI
// Assistant mirror (Blocker #2 / Prompt 4). Keep agnostic of action specifics —
// callers supply a preview object; component does no lookups.
//
// Behavior:
//   - Backdrop click cancels (unless isProcessing)
//   - ESC key cancels (unless isProcessing)
//   - Focus lands on Cancel on open (safer default than Confirm)
//   - Tab/Shift+Tab cycles between Cancel and Confirm (focus trap)
//   - Focus returns to the trigger element on close
//   - Body scroll locked while open
//   - isProcessing disables both buttons + spins the Confirm button label

import { useEffect, useRef } from 'react'
import { Loader2, X } from 'lucide-react'

export interface ConfirmActionModalProps {
  open: boolean
  onConfirm: () => void | Promise<void>
  onCancel: () => void
  actionType: string                 // 'send_sms' | 'change_stage' | etc. — used only for aria ids
  preview: {
    title: string                    // e.g. "Send SMS to John Doe"
    recipientLabel?: string          // e.g. "To: John Doe (+1-555-...)"
    bodyPreview?: string             // for send_sms: full body, whitespace preserved
    beforeAfter?: {                  // for change_stage
      label: string                  // e.g. "Pipeline stage"
      before: string                 // e.g. "Qualifying"
      after: string                  // e.g. "Under Contract"
    }
  }
  confirmLabel?: string              // default "Confirm and push"
  danger?: boolean                   // default false; true → red Confirm button
  isProcessing?: boolean             // disables buttons + shows spinner
}

export function ConfirmActionModal({
  open,
  onConfirm,
  onCancel,
  actionType,
  preview,
  confirmLabel = 'Confirm and push',
  danger = false,
  isProcessing = false,
}: ConfirmActionModalProps) {
  const cancelRef = useRef<HTMLButtonElement>(null)
  const confirmRef = useRef<HTMLButtonElement>(null)
  const titleId = `confirm-modal-title-${actionType}`
  const descId = `confirm-modal-desc-${actionType}`

  // Scroll lock + focus save/restore in a single cleanup-driven effect.
  // Runs when `open` transitions false → true. The returned cleanup runs on
  // BOTH unmount-while-open AND open → false transition, so focus is always
  // returned to the trigger and body scroll is always unlocked. Closure
  // captures `trigger` and `prevOverflow` at open time — no ref needed.
  useEffect(() => {
    if (!open) return
    const trigger = document.activeElement
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    // Focus Cancel on open — safer default than Confirm (prevents Enter-confirm).
    const f = requestAnimationFrame(() => cancelRef.current?.focus())
    return () => {
      cancelAnimationFrame(f)
      document.body.style.overflow = prevOverflow
      if (trigger instanceof HTMLElement) trigger.focus()
    }
  }, [open])

  // ESC key = cancel (unless processing). Separate effect because its deps
  // (isProcessing, onCancel) differ from the scroll/focus effect — merging
  // would re-run the body-scroll setup on every onCancel identity change.
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isProcessing) onCancel()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open, isProcessing, onCancel])

  // Focus trap — Tab / Shift+Tab cycle between Cancel and Confirm buttons
  function handleTabTrap(e: React.KeyboardEvent) {
    if (e.key !== 'Tab') return
    const cancel = cancelRef.current
    const confirm = confirmRef.current
    if (!cancel || !confirm) return
    const active = document.activeElement
    if (e.shiftKey) {
      if (active === cancel) { e.preventDefault(); confirm.focus() }
    } else {
      if (active === confirm) { e.preventDefault(); cancel.focus() }
    }
  }

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 animate-in fade-in"
      onClick={() => { if (!isProcessing) onCancel() }}
      onKeyDown={handleTabTrap}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descId}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md bg-white rounded-[20px] border border-[rgba(0,0,0,0.08)] shadow-[0_4px_24px_rgba(0,0,0,0.12)] animate-in zoom-in-95"
      >
        {/* Header */}
        <div className="flex items-start justify-between px-6 pt-5 pb-4 border-b border-[rgba(0,0,0,0.08)]">
          <h2 id={titleId} className="text-[20px] font-semibold text-txt-primary leading-tight pr-4">
            {preview.title}
          </h2>
          <button
            onClick={onCancel}
            disabled={isProcessing}
            aria-label="Close"
            className="text-txt-muted hover:text-txt-primary disabled:opacity-40 transition-colors -mt-1 -mr-1 p-1 rounded-[6px]"
          >
            <X size={16} />
          </button>
        </div>

        {/* Preview block */}
        <div id={descId} className="px-6 py-4 space-y-3">
          {preview.recipientLabel && (
            <p className="text-[13px] text-txt-secondary">{preview.recipientLabel}</p>
          )}

          {preview.beforeAfter && (
            <div className="space-y-1.5">
              <div className="text-[11px] font-medium text-txt-muted uppercase tracking-wider">
                {preview.beforeAfter.label}
              </div>
              <div className="flex items-center gap-2 text-[14px]">
                <span className="text-txt-secondary">{preview.beforeAfter.before}</span>
                <span className="text-txt-muted">→</span>
                <span className="text-txt-primary font-semibold">{preview.beforeAfter.after}</span>
              </div>
            </div>
          )}

          {preview.bodyPreview && (
            <div className="space-y-1.5">
              <div className="text-[11px] font-medium text-txt-muted uppercase tracking-wider">
                Message
              </div>
              <div className="bg-surface-secondary border-[0.5px] border-[rgba(0,0,0,0.08)] rounded-[10px] px-3 py-2.5 text-[13px] text-txt-primary whitespace-pre-wrap max-h-48 overflow-y-auto">
                {preview.bodyPreview}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-[rgba(0,0,0,0.08)]">
          <button
            ref={cancelRef}
            onClick={onCancel}
            disabled={isProcessing}
            className="text-[13px] font-medium text-txt-secondary hover:text-txt-primary disabled:opacity-40 px-3 py-2 rounded-[10px] transition-colors"
          >
            Cancel
          </button>
          <button
            ref={confirmRef}
            onClick={() => { void onConfirm() }}
            disabled={isProcessing}
            className={
              'flex items-center gap-2 text-[13px] font-semibold text-white px-4 py-2 rounded-[10px] disabled:opacity-60 transition-opacity ' +
              (danger
                ? 'bg-gunner-red hover:bg-gunner-red-dark'
                : 'bg-semantic-blue hover:opacity-90')
            }
          >
            {isProcessing && <Loader2 size={12} className="animate-spin" />}
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
