'use client'
// components/dayhub/contact-action-modals.tsx
// In-Gunner modals for contact actions on Day Hub. Each modal calls a /api/[tenant]/ghl/*
// route which forwards to GHL via the shared client (token refresh + audit log).
// Replaces the previous deep-link buttons that opened GHL in a new tab.

import { useState, useEffect } from 'react'
import { Loader2, X, Calendar as CalendarIcon, Pencil, Play, ClipboardList } from 'lucide-react'

type Toast = (msg: string, type: 'success' | 'error') => void

interface BaseModalProps {
  open: boolean
  onClose: () => void
  tenantSlug: string
  contactId: string
  contactName?: string | null
  toast: Toast
  onSuccess?: () => void
}

// ─── Shared shell ────────────────────────────────────────────────────────────

function ModalShell({
  open, onClose, title, icon, children,
}: {
  open: boolean
  onClose: () => void
  title: string
  icon: React.ReactNode
  children: React.ReactNode
}) {
  // Lock body scroll while open
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [open])

  if (!open) return null
  return (
    <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-[440px] max-h-[85vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 px-5 py-3 border-b" style={{ borderColor: 'var(--border-light)' }}>
          <span className="text-gunner-red">{icon}</span>
          <h3 className="text-[14px] font-semibold text-txt-primary flex-1">{title}</h3>
          <button onClick={onClose} className="text-txt-muted hover:text-txt-primary">
            <X size={16} />
          </button>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto p-5">{children}</div>
      </div>
    </div>
  )
}

// ─── Note Modal ──────────────────────────────────────────────────────────────

export function NoteModal({ open, onClose, tenantSlug, contactId, contactName, toast, onSuccess }: BaseModalProps) {
  const [body, setBody] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => { if (open) setBody('') }, [open])

  async function save() {
    if (!body.trim() || saving) return
    setSaving(true)
    try {
      const res = await fetch(`/api/${tenantSlug}/ghl/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contactId, body: body.trim() }),
      })
      if (res.ok) {
        toast('Note added to GHL', 'success')
        onSuccess?.()
        onClose()
      } else {
        const d = await res.json().catch(() => ({}))
        toast(d.error || 'Failed to add note', 'error')
      }
    } catch {
      toast('Failed to add note', 'error')
    }
    setSaving(false)
  }

  return (
    <ModalShell open={open} onClose={onClose} title={contactName ? `Add note · ${contactName}` : 'Add note'} icon={<Pencil size={14} />}>
      <textarea
        value={body}
        onChange={e => setBody(e.target.value)}
        placeholder="Type your note..."
        rows={6}
        autoFocus
        className="w-full bg-surface-secondary border-[0.5px] rounded-[10px] px-3 py-2 text-[12px] text-txt-primary placeholder:text-txt-muted focus:outline-none focus:ring-1 focus:ring-gunner-red"
        style={{ borderColor: 'var(--border-medium)' }}
      />
      <div className="flex gap-2 mt-3">
        <button
          onClick={save}
          disabled={!body.trim() || saving}
          className="flex-1 bg-gunner-red hover:bg-gunner-red-dark disabled:opacity-40 text-white text-[12px] font-semibold py-2 rounded-[10px] transition-colors flex items-center justify-center gap-2"
        >
          {saving && <Loader2 size={12} className="animate-spin" />} Save note
        </button>
        <button onClick={onClose} className="px-4 text-[12px] text-txt-secondary hover:text-txt-primary">Cancel</button>
      </div>
    </ModalShell>
  )
}

// ─── Appointment Modal ──────────────────────────────────────────────────────

interface CalendarOption { id: string; name: string }

export function AppointmentModal({
  open, onClose, tenantSlug, contactId, contactName, toast, onSuccess,
}: BaseModalProps) {
  const [calendars, setCalendars] = useState<CalendarOption[]>([])
  const [calendarId, setCalendarId] = useState('')
  const [title, setTitle] = useState('')
  const [date, setDate] = useState('')
  const [startTime, setStartTime] = useState('09:00')
  const [duration, setDuration] = useState(30)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    setTitle(contactName ? `Appointment with ${contactName}` : '')
    const today = new Date()
    setDate(`${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`)
    setLoading(true)
    fetch(`/api/${tenantSlug}/ghl/appointments`)
      .then(r => r.json())
      .then(d => {
        const cals: CalendarOption[] = d.calendars ?? []
        setCalendars(cals)
        if (cals.length > 0) setCalendarId(cals[0].id)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [open, tenantSlug, contactName])

  async function save() {
    if (!calendarId || !date || !startTime || saving) return
    setSaving(true)
    try {
      const start = new Date(`${date}T${startTime}:00`)
      const end = new Date(start.getTime() + duration * 60_000)
      const res = await fetch(`/api/${tenantSlug}/ghl/appointments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contactId,
          calendarId,
          startTime: start.toISOString(),
          endTime: end.toISOString(),
          title: title.trim() || undefined,
        }),
      })
      if (res.ok) {
        toast('Appointment created in GHL', 'success')
        onSuccess?.()
        onClose()
      } else {
        const d = await res.json().catch(() => ({}))
        toast(d.error || 'Failed to create appointment', 'error')
      }
    } catch {
      toast('Failed to create appointment', 'error')
    }
    setSaving(false)
  }

  return (
    <ModalShell open={open} onClose={onClose} title={contactName ? `Create appointment · ${contactName}` : 'Create appointment'} icon={<CalendarIcon size={14} />}>
      {loading ? (
        <div className="py-8 text-center"><Loader2 size={16} className="animate-spin text-txt-muted mx-auto" /></div>
      ) : calendars.length === 0 ? (
        <p className="text-[12px] text-txt-muted py-4 text-center">No GHL calendars found</p>
      ) : (
        <div className="space-y-3">
          <Field label="Calendar">
            <select
              value={calendarId}
              onChange={e => setCalendarId(e.target.value)}
              className="w-full bg-surface-secondary border-[0.5px] rounded-[10px] px-3 py-2 text-[12px] focus:outline-none"
              style={{ borderColor: 'var(--border-medium)' }}
            >
              {calendars.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
          <Field label="Title">
            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              className="w-full bg-surface-secondary border-[0.5px] rounded-[10px] px-3 py-2 text-[12px] focus:outline-none"
              style={{ borderColor: 'var(--border-medium)' }}
            />
          </Field>
          <div className="grid grid-cols-3 gap-2">
            <Field label="Date">
              <input
                type="date"
                value={date}
                onChange={e => setDate(e.target.value)}
                className="w-full bg-surface-secondary border-[0.5px] rounded-[10px] px-2 py-2 text-[12px] focus:outline-none"
                style={{ borderColor: 'var(--border-medium)' }}
              />
            </Field>
            <Field label="Start">
              <input
                type="time"
                value={startTime}
                onChange={e => setStartTime(e.target.value)}
                className="w-full bg-surface-secondary border-[0.5px] rounded-[10px] px-2 py-2 text-[12px] focus:outline-none"
                style={{ borderColor: 'var(--border-medium)' }}
              />
            </Field>
            <Field label="Min">
              <input
                type="number"
                min={5}
                max={480}
                step={5}
                value={duration}
                onChange={e => setDuration(parseInt(e.target.value) || 30)}
                className="w-full bg-surface-secondary border-[0.5px] rounded-[10px] px-2 py-2 text-[12px] focus:outline-none"
                style={{ borderColor: 'var(--border-medium)' }}
              />
            </Field>
          </div>
          <div className="flex gap-2 pt-2">
            <button
              onClick={save}
              disabled={saving || !calendarId || !date}
              className="flex-1 bg-gunner-red hover:bg-gunner-red-dark disabled:opacity-40 text-white text-[12px] font-semibold py-2 rounded-[10px] transition-colors flex items-center justify-center gap-2"
            >
              {saving && <Loader2 size={12} className="animate-spin" />} Create appointment
            </button>
            <button onClick={onClose} className="px-4 text-[12px] text-txt-secondary hover:text-txt-primary">Cancel</button>
          </div>
        </div>
      )}
    </ModalShell>
  )
}

// ─── Workflow Modal ─────────────────────────────────────────────────────────

interface WorkflowOption { id: string; name: string; status: string | null }

export function WorkflowModal({ open, onClose, tenantSlug, contactId, contactName, toast, onSuccess }: BaseModalProps) {
  const [workflows, setWorkflows] = useState<WorkflowOption[]>([])
  const [loading, setLoading] = useState(false)
  const [filter, setFilter] = useState('')
  const [adding, setAdding] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setFilter('')
    setLoading(true)
    fetch(`/api/${tenantSlug}/ghl/workflows`)
      .then(r => r.json())
      .then(d => setWorkflows(d.workflows ?? []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [open, tenantSlug])

  async function add(workflowId: string) {
    setAdding(workflowId)
    try {
      const res = await fetch(`/api/${tenantSlug}/ghl/workflows/${workflowId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contactId }),
      })
      if (res.ok) {
        toast('Contact added to workflow', 'success')
        onSuccess?.()
        onClose()
      } else {
        const d = await res.json().catch(() => ({}))
        toast(d.error || 'Failed to add to workflow', 'error')
      }
    } catch {
      toast('Failed to add to workflow', 'error')
    }
    setAdding(null)
  }

  const visible = filter
    ? workflows.filter(w => w.name.toLowerCase().includes(filter.toLowerCase()))
    : workflows

  return (
    <ModalShell open={open} onClose={onClose} title={contactName ? `Add to workflow · ${contactName}` : 'Add to workflow'} icon={<Play size={14} />}>
      <input
        type="text"
        value={filter}
        onChange={e => setFilter(e.target.value)}
        placeholder="Filter workflows..."
        className="w-full bg-surface-secondary border-[0.5px] rounded-[10px] px-3 py-2 text-[12px] mb-2 focus:outline-none"
        style={{ borderColor: 'var(--border-medium)' }}
      />
      {loading ? (
        <div className="py-6 text-center"><Loader2 size={14} className="animate-spin text-txt-muted mx-auto" /></div>
      ) : visible.length === 0 ? (
        <p className="text-[12px] text-txt-muted py-4 text-center">
          {workflows.length === 0 ? 'No workflows in this GHL location' : 'No matches'}
        </p>
      ) : (
        <div className="space-y-1">
          {visible.map(w => (
            <button
              key={w.id}
              onClick={() => add(w.id)}
              disabled={adding === w.id}
              className="w-full text-left flex items-center gap-2 px-3 py-2 rounded-[10px] hover:bg-surface-secondary transition-colors disabled:opacity-50"
            >
              <Play size={11} className="text-gunner-red shrink-0" />
              <span className="text-[12px] font-medium text-txt-primary flex-1 truncate">{w.name}</span>
              {w.status && <span className="text-[9px] text-txt-muted uppercase tracking-wider">{w.status}</span>}
              {adding === w.id && <Loader2 size={12} className="animate-spin text-txt-muted" />}
            </button>
          ))}
        </div>
      )}
    </ModalShell>
  )
}

// ─── Task Edit Modal ────────────────────────────────────────────────────────

interface TaskEditInitial {
  taskId: string
  contactId: string
  title: string
  body: string | null
  dueDate: string | null
  assignedToGhlId: string | null
  completed: boolean
}

interface TeamUserOption { ghlUserId: string; name: string }

export function TaskEditModal({
  open, onClose, tenantSlug, initial, teamUsers, toast, onSuccess,
}: {
  open: boolean
  onClose: () => void
  tenantSlug: string
  initial: TaskEditInitial | null
  teamUsers: TeamUserOption[]
  toast: Toast
  onSuccess?: () => void
}) {
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [date, setDate] = useState('')
  const [time, setTime] = useState('09:00')
  const [assignedTo, setAssignedTo] = useState('')
  const [completed, setCompleted] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open || !initial) return
    setTitle(initial.title)
    setBody(initial.body ?? '')
    setAssignedTo(initial.assignedToGhlId ?? '')
    setCompleted(initial.completed)
    if (initial.dueDate) {
      const d = new Date(initial.dueDate)
      setDate(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`)
      setTime(`${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`)
    } else {
      setDate('')
      setTime('09:00')
    }
  }, [open, initial])

  async function save() {
    if (!initial || saving) return
    setSaving(true)
    try {
      const dueDateIso = date ? new Date(`${date}T${time}:00`).toISOString() : undefined
      const res = await fetch(`/api/${tenantSlug}/ghl/tasks/${initial.taskId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contactId: initial.contactId,
          title: title.trim() || undefined,
          body: body,
          dueDate: dueDateIso,
          assignedTo: assignedTo || undefined,
          completed,
        }),
      })
      if (res.ok) {
        toast('Task updated in GHL', 'success')
        onSuccess?.()
        onClose()
      } else {
        const d = await res.json().catch(() => ({}))
        toast(d.error || 'Failed to update task', 'error')
      }
    } catch {
      toast('Failed to update task', 'error')
    }
    setSaving(false)
  }

  if (!initial) return null

  return (
    <ModalShell open={open} onClose={onClose} title="Update task" icon={<ClipboardList size={14} />}>
      <div className="space-y-3">
        <Field label="Title">
          <input
            type="text"
            value={title}
            onChange={e => setTitle(e.target.value)}
            className="w-full bg-surface-secondary border-[0.5px] rounded-[10px] px-3 py-2 text-[12px] focus:outline-none"
            style={{ borderColor: 'var(--border-medium)' }}
          />
        </Field>
        <Field label="Notes">
          <textarea
            value={body}
            onChange={e => setBody(e.target.value)}
            rows={3}
            className="w-full bg-surface-secondary border-[0.5px] rounded-[10px] px-3 py-2 text-[12px] focus:outline-none"
            style={{ borderColor: 'var(--border-medium)' }}
          />
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Due date">
            <input
              type="date"
              value={date}
              onChange={e => setDate(e.target.value)}
              className="w-full bg-surface-secondary border-[0.5px] rounded-[10px] px-2 py-2 text-[12px] focus:outline-none"
              style={{ borderColor: 'var(--border-medium)' }}
            />
          </Field>
          <Field label="Due time">
            <input
              type="time"
              value={time}
              onChange={e => setTime(e.target.value)}
              className="w-full bg-surface-secondary border-[0.5px] rounded-[10px] px-2 py-2 text-[12px] focus:outline-none"
              style={{ borderColor: 'var(--border-medium)' }}
            />
          </Field>
        </div>
        <Field label="Assigned to">
          <select
            value={assignedTo}
            onChange={e => setAssignedTo(e.target.value)}
            className="w-full bg-surface-secondary border-[0.5px] rounded-[10px] px-3 py-2 text-[12px] focus:outline-none"
            style={{ borderColor: 'var(--border-medium)' }}
          >
            <option value="">Unassigned</option>
            {teamUsers.map(u => <option key={u.ghlUserId} value={u.ghlUserId}>{u.name}</option>)}
          </select>
        </Field>
        <label className="flex items-center gap-2 text-[12px] text-txt-primary cursor-pointer">
          <input type="checkbox" checked={completed} onChange={e => setCompleted(e.target.checked)} />
          Mark as completed
        </label>
        <div className="flex gap-2 pt-1">
          <button
            onClick={save}
            disabled={saving || !title.trim()}
            className="flex-1 bg-gunner-red hover:bg-gunner-red-dark disabled:opacity-40 text-white text-[12px] font-semibold py-2 rounded-[10px] transition-colors flex items-center justify-center gap-2"
          >
            {saving && <Loader2 size={12} className="animate-spin" />} Save changes
          </button>
          <button onClick={onClose} className="px-4 text-[12px] text-txt-secondary hover:text-txt-primary">Cancel</button>
        </div>
      </div>
    </ModalShell>
  )
}

// ─── Layout helper ──────────────────────────────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-[10px] font-medium text-txt-muted uppercase tracking-wide block mb-1">{label}</label>
      {children}
    </div>
  )
}
