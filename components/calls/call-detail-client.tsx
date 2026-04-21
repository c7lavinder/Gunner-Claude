'use client'
// components/calls/call-detail-client.tsx
// Call detail — matches getgunner.ai design
// Layout: [Header + pills] → [Grade+Strengths (33%) | 4 Tabs (67%)]

import { useState, useEffect, useRef, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft, Phone, Clock, Star, Lightbulb, FileText, Zap, Search, Mic,
  CheckCircle, Send, ChevronRight, ShieldCheck, CalendarCheck, DollarSign,
  Heart, AlertTriangle, Target, RotateCcw, Tag, MessageSquare, X, Loader2,
  User, MapPin, Clipboard, PhoneOutgoing, PhoneIncoming, Plus, RefreshCw,
  Play, Pause, SkipBack, SkipForward, Volume2, ChevronDown, Home, Sparkles, Info,
} from 'lucide-react'
import { format } from 'date-fns'
import { useToast } from '@/components/ui/toaster'
import { ConfirmActionModal } from '@/components/ui/confirm-action-modal'
import { CALL_TYPES, RESULT_NAMES } from '@/lib/call-types'
import { formatFieldLabel } from '@/lib/format'

// ─── Types ──────────────────────────────────────────────────────────────────

interface RubricScore { score: number; maxScore: number; notes: string }
interface KeyMoment { timestamp: string; type: string; description: string }
interface Objection { objection: string; response: string; handled: boolean }

interface CoachingData {
  strengths: string[]
  redFlags: string[]
  improvements: Array<{ what_went_wrong: string; call_example: string; coaching_tip: string }>
  objectionReplies: Array<{ objection_label: string; call_quote: string; suggested_responses: string[] }>
}

interface CallDetail {
  id: string; score: number | null; gradingStatus: string
  callType: string | null; callOutcome: string | null; direction: string
  durationSeconds: number | null; calledAt: string
  recordingUrl: string | null; transcript: string | null
  aiSummary: string | null; aiFeedback: string | null
  coachingData: CoachingData
  sentiment: number | null; sellerMotivation: number | null
  talkRatio: number | null; nextBestAction: string | null
  keyMoments: KeyMoment[]; objections: Objection[]
  rubricScores: Record<string, RubricScore>; coachingTips: string[]
  contactName: string | null; contactPhone: string | null
  assignedTo: { id: string; name: string; role: string } | null
  property: { id: string; address: string; city: string; state: string; status: string; ghlPipelineStage: string | null; sellerName: string | null } | null
  relatedProperties: Array<{ id: string; address: string; city: string; state: string; status: string }>
  aiNextSteps: Array<{ type: string; label: string; reasoning: string; status: string; pushedAt: string | null }> | null
  isCalibration: boolean
  calibrationNotes: string | null
}

type Tab = 'coaching' | 'transcript' | 'next-steps' | 'property'

interface NextStep {
  type: string; label: string; reasoning: string
  originalLabel?: string // AI's original output, for learning feedback loop
  status: 'pending' | 'pushed' | 'skipped'
  pushedAt?: string
  // Edit-panel fields persisted on Save and sent on Push (defect #1 fix).
  // All optional; server falls back to defaults when absent.
  description?: string
  dueDate?: string      // ISO date or YYYY-MM-DD
  assignedTo?: string
  stageId?: string
  pipelineId?: string
  smsBody?: string
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function gradeInfo(score: number | null): { letter: string; color: string; glow: string; bg: string } {
  if (score === null) return { letter: '\u2014', color: 'bg-[#9B9A94]', glow: '', bg: 'bg-surface-tertiary' }
  if (score >= 90) return { letter: 'A', color: 'bg-[#22c55e]', glow: 'shadow-[0_0_20px_rgba(34,197,94,0.3)]', bg: 'bg-[#22c55e]/5' }
  if (score >= 80) return { letter: 'B', color: 'bg-semantic-blue', glow: 'shadow-[0_0_20px_rgba(24,95,165,0.3)]', bg: 'bg-semantic-blue/5' }
  if (score >= 70) return { letter: 'C', color: 'bg-semantic-amber', glow: 'shadow-[0_0_20px_rgba(186,117,23,0.3)]', bg: 'bg-semantic-amber/5' }
  return { letter: score >= 60 ? 'D' : 'F', color: 'bg-semantic-red', glow: 'shadow-[0_0_20px_rgba(163,45,45,0.3)]', bg: 'bg-semantic-red/5' }
}

function fmtDuration(s: number | null): string {
  if (!s) return '\u2014'
  const m = Math.floor(s / 60)
  const sec = s % 60
  return `${m}:${sec.toString().padStart(2, '0')}`
}

function parseTimestamp(ts: string): number {
  const parts = ts.split(':').map(Number)
  if (parts.length === 2) return (parts[0] * 60) + parts[1]
  if (parts.length === 3) return (parts[0] * 3600) + (parts[1] * 60) + parts[2]
  return 0
}

const MOMENT_ICONS: Record<string, typeof Star> = {
  objection_handled: ShieldCheck, objection: ShieldCheck,
  appointment_set: CalendarCheck, price_discussion: DollarSign,
  rapport_building: Heart, red_flag: AlertTriangle,
  closing_attempt: Target, motivation_revealed: Lightbulb,
}

const STEP_ICONS: Record<string, { icon: typeof CheckCircle; color: string; bg: string; cardBg: string; label: string }> = {
  add_note:              { icon: FileText,      color: 'text-amber-700',   bg: 'bg-amber-100',    cardBg: 'bg-amber-50',     label: 'Add Note' },
  create_task:           { icon: CheckCircle,   color: 'text-blue-700',    bg: 'bg-blue-100',     cardBg: 'bg-blue-50',      label: 'Create Task' },
  check_off_task:        { icon: CheckCircle,   color: 'text-green-700',   bg: 'bg-green-100',    cardBg: 'bg-green-50',     label: 'Check Off Task' },
  update_task:           { icon: RefreshCw,     color: 'text-sky-700',     bg: 'bg-sky-100',      cardBg: 'bg-sky-50',       label: 'Update Task' },
  change_stage:          { icon: RefreshCw,     color: 'text-orange-700',  bg: 'bg-orange-100',   cardBg: 'bg-orange-50',    label: 'Change Pipeline Stage' },
  create_appointment:    { icon: CalendarCheck, color: 'text-purple-700',  bg: 'bg-purple-100',   cardBg: 'bg-purple-50',    label: 'Create Appointment' },
  send_sms:              { icon: Send,          color: 'text-teal-700',    bg: 'bg-teal-100',     cardBg: 'bg-teal-50',      label: 'Send SMS' },
  schedule_sms:          { icon: Clock,         color: 'text-teal-700',    bg: 'bg-teal-100',     cardBg: 'bg-teal-50',      label: 'Schedule SMS' },
  add_to_workflow:       { icon: Zap,           color: 'text-gray-700',    bg: 'bg-gray-100',     cardBg: 'bg-gray-50',      label: 'Add to Workflow' },
  remove_from_workflow:  { icon: X,             color: 'text-gray-700',    bg: 'bg-gray-100',     cardBg: 'bg-gray-50',      label: 'Remove from Workflow' },
}

const ALL_ACTION_TYPES = Object.keys(STEP_ICONS)

// ─── High-stakes confirm-modal helpers ──────────────────────────────────────

// Which action types route through the confirmation modal before executing.
// Low/medium stakes stay single-click (add_note, create_task, create_appointment,
// check_off_task, schedule_sms, add_to_workflow, remove_from_workflow).
const HIGH_STAKES_TYPES = new Set(['send_sms', 'change_stage'])

type PipelineList = Array<{ id: string; name: string; stages: Array<{ id: string; name: string }> }>

function lookupStageName(stageId: string | undefined, pipelines: PipelineList): string | null {
  if (!stageId || !pipelines || pipelines.length === 0) return null
  for (const p of pipelines) {
    const stage = p.stages?.find(s => s.id === stageId)
    if (stage) return stage.name
  }
  return null
}

// Build the preview object the confirm modal renders. Pure function — no DB
// calls, no lookups beyond the already-loaded `pipelines` state. Safe to call
// inline during render.
function buildPreview(
  step: NextStep,
  call: CallDetail,
  pipelines: PipelineList,
): {
  title: string
  recipientLabel?: string
  bodyPreview?: string
  beforeAfter?: { label: string; before: string; after: string }
} {
  if (step.type === 'send_sms') {
    return {
      title: `Send SMS to ${call.contactName ?? 'contact'}`,
      recipientLabel: call.contactPhone
        ? `To: ${call.contactName ?? ''} (${call.contactPhone})`
        : undefined,
      bodyPreview: step.smsBody || step.label,
    }
  }
  if (step.type === 'change_stage') {
    const before = call.property?.ghlPipelineStage?.trim() || 'unknown'
    const after = lookupStageName(step.stageId, pipelines) || step.stageId || 'unknown'
    return {
      title: 'Change pipeline stage',
      beforeAfter: { label: 'Pipeline stage', before, after },
    }
  }
  // Fallback — shouldn't be hit (modal only opens for HIGH_STAKES_TYPES).
  return { title: step.label || step.type }
}

// ─── Main component ─────────────────────────────────────────────────────────

export function CallDetailClient({ call, tenantSlug, isOwn }: {
  call: CallDetail; tenantSlug: string; isOwn: boolean
}) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const { toast } = useToast()

  const [tab, setTab] = useState<Tab>('coaching')
  const [searchQuery, setSearchQuery] = useState('')
  const [playbackRate, setPlaybackRate] = useState(1)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [expandedMoment, setExpandedMoment] = useState<number | null>(null)
  const [showFeedback, setShowFeedback] = useState(false)
  const [reclassifying, setReclassifying] = useState(false)
  const [reclassifyType, setReclassifyType] = useState<string>(call.callType ?? '')
  const [reclassifyOutcome, setReclassifyOutcome] = useState<string>(call.callOutcome ?? '')
  const [reclassifySaving, setReclassifySaving] = useState(false)
  const [propertiesExpanded, setPropertiesExpanded] = useState(false)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  // High-stakes confirm modal — null = closed, step index = open for that step
  const [confirmModalStep, setConfirmModalStep] = useState<number | null>(null)
  const [isPushing, setIsPushing] = useState(false)
  const [generatedSteps, setGeneratedSteps] = useState<NextStep[]>(() => {
    if (call.aiNextSteps && call.aiNextSteps.length > 0) {
      // Dedup: same type + similar label → keep only the first
      const seen = new Map<string, boolean>()
      return call.aiNextSteps
        .map(s => ({
          type: s.type,
          label: s.label,
          reasoning: s.reasoning,
          status: s.status as 'pending' | 'pushed' | 'skipped',
          pushedAt: s.pushedAt ?? undefined,
        }))
        .filter(s => {
          const key = `${s.type}::${s.label.toLowerCase().replace(/\s+/g, ' ').trim()}`
          if (seen.has(key)) return false
          seen.set(key, true)
          return true
        })
    }
    return []
  })
  const [generatingSteps, setGeneratingSteps] = useState(false)
  const [expandedReasons, setExpandedReasons] = useState<Set<number>>(new Set())
  const [showAddAction, setShowAddAction] = useState(false)
  const [addActionType, setAddActionType] = useState('')
  const [addActionSummary, setAddActionSummary] = useState('')
  const [addingAction, setAddingAction] = useState(false)
  const [editingStep, setEditingStep] = useState<number | null>(null)
  const [editFields, setEditFields] = useState<Record<string, string>>({})
  const [propertyPendingCount, setPropertyPendingCount] = useState(0)
  const [isCalibration, setIsCalibration] = useState(call.isCalibration)
  const audioRef = useRef<HTMLAudioElement>(null)

  // Data for next steps edit forms
  const [teamMembers, setTeamMembers] = useState<Array<{ name: string; phone: string | null; userId: string }>>([])
  const [pipelines, setPipelines] = useState<Array<{ id: string; name: string; stages: Array<{ id: string; name: string }> }>>([])
  const [workflows, setWorkflows] = useState<Array<{ id: string; name: string }>>([])
  const [calendars, setCalendars] = useState<Array<{ id: string; name: string }>>([])

  useEffect(() => {
    // Fetch team members
    fetch(`/api/${tenantSlug}/dayhub/team-numbers`).then(r => r.json())
      .then(d => setTeamMembers(d.numbers ?? []))
      .catch(() => {})
    // Fetch pipelines + stages
    fetch(`/api/ghl/pipelines`).then(r => r.json())
      .then(d => setPipelines(d.pipelines ?? []))
      .catch(() => {})
    // Fetch workflows
    fetch(`/api/workflows`).then(r => r.json())
      .then(d => setWorkflows((d.definitions ?? d.workflows ?? []).map((w: { id: string; name: string }) => ({ id: w.id, name: w.name }))))
      .catch(() => {})
    // Fetch calendars
    fetch(`/api/ghl/calendars`).then(r => r.json())
      .then(d => setCalendars((d.calendars ?? []).map((c: { id: string; name: string }) => ({ id: c.id, name: c.name }))))
      .catch(() => {})
  }, [tenantSlug])

  const grade = gradeInfo(call.score)
  const outcome = call.callOutcome ?? call.property?.status ?? null

  const { strengths, redFlags, improvements, objectionReplies } = call.coachingData

  const tabs: Array<{ id: Tab; label: string; icon: React.ReactNode; badge?: number }> = [
    { id: 'coaching', label: 'Coaching', icon: <Lightbulb size={14} /> },
    { id: 'transcript', label: 'Transcript', icon: <FileText size={14} /> },
    { id: 'next-steps', label: 'Next Steps', icon: <Zap size={14} />, badge: generatedSteps.filter(s => s.status === 'pending').length || undefined },
    { id: 'property', label: 'Property', icon: <Home size={14} />, badge: propertyPendingCount || undefined },
  ]

  function seekTo(timestamp: string) {
    if (audioRef.current) {
      audioRef.current.currentTime = parseTimestamp(timestamp)
      audioRef.current.play()
      setIsPlaying(true)
    }
  }

  function togglePlay() {
    if (!audioRef.current) return
    if (isPlaying) { audioRef.current.pause(); setIsPlaying(false) }
    else { audioRef.current.play(); setIsPlaying(true) }
  }

  function changeSpeed() {
    const speeds = [0.5, 1, 1.5, 2]
    const next = speeds[(speeds.indexOf(playbackRate) + 1) % speeds.length]
    setPlaybackRate(next)
    if (audioRef.current) audioRef.current.playbackRate = next
  }

  async function reprocess() {
    if (!window.confirm('Re-process this call? It will be re-graded.')) return
    setActionLoading('reprocess')
    try {
      const res = await fetch(`/api/${tenantSlug}/calls/${call.id}/reprocess`, { method: 'POST' })
      if (res.ok) { toast('Call queued for re-grading', 'success'); startTransition(() => router.refresh()) }
      else toast('Failed to reprocess', 'error')
    } catch { toast('Failed to reprocess', 'error') }
    setActionLoading(null)
  }

  async function toggleCalibration() {
    const newValue = !isCalibration
    setIsCalibration(newValue)
    try {
      const res = await fetch(`/api/${tenantSlug}/calls/${call.id}/calibration`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isCalibration: newValue }),
      })
      if (res.ok) toast(newValue ? 'Marked as calibration example' : 'Removed calibration flag', 'success')
      else { setIsCalibration(!newValue); toast('Failed to update', 'error') }
    } catch { setIsCalibration(!newValue); toast('Failed to update', 'error') }
  }

  async function saveReclassify() {
    const typeChanged = reclassifyType && reclassifyType !== call.callType
    const outcomeChanged = reclassifyOutcome && reclassifyOutcome !== call.callOutcome
    if (!typeChanged && !outcomeChanged) {
      setReclassifying(false)
      return
    }
    setReclassifySaving(true)
    try {
      const res = await fetch(`/api/${tenantSlug}/calls/${call.id}/reclassify`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...(typeChanged ? { callType: reclassifyType } : {}),
          ...(outcomeChanged ? { callOutcome: reclassifyOutcome } : {}),
        }),
      })
      if (res.ok) {
        toast('Reclassified', 'success')
        setReclassifying(false)
        startTransition(() => router.refresh())
      } else {
        toast('Failed to reclassify', 'error')
      }
    } catch { toast('Failed to reclassify', 'error') }
    setReclassifySaving(false)
  }

  // Outcomes available for the selected reclassify type — falls back to full
  // tenant-wide union when no type is selected yet.
  const outcomeChoices = (() => {
    const def = CALL_TYPES.find(ct => ct.id === reclassifyType)
    if (def) return def.results
    return CALL_TYPES.flatMap(ct => ct.results)
      .filter((r, i, arr) => arr.findIndex(x => x.id === r.id) === i)
  })()

  async function generateNextSteps() {
    setGeneratingSteps(true)
    try {
      const res = await fetch(`/api/${tenantSlug}/calls/${call.id}/generate-next-steps`, { method: 'POST' })
      if (res.ok) {
        const data = await res.json()
        if (data.steps) {
          const seen = new Map<string, boolean>()
          const newSteps = data.steps
            .map((s: { type: string; label: string; reasoning: string }) => ({ ...s, originalLabel: s.label, status: 'pending' as const }))
            .filter((s: { type: string; label: string }) => {
              const key = `${s.type}::${s.label.toLowerCase().replace(/\s+/g, ' ').trim()}`
              if (seen.has(key)) return false
              seen.set(key, true)
              return true
            })
          setGeneratedSteps(newSteps)
          toast('Next steps generated', 'success')
        }
      } else toast('Failed to generate next steps', 'error')
    } catch { toast('Failed to generate next steps', 'error') }
    setGeneratingSteps(false)
  }

  async function pushStep(index: number) {
    const step = generatedSteps[index]
    if (!step) return
    setActionLoading(`step-${index}`)
    try {
      const res = await fetch(`/api/${tenantSlug}/calls/${call.id}/actions`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: step.type,
          label: step.label,
          description: step.description,
          dueDate: step.dueDate,
          assignedTo: step.assignedTo,
          stageId: step.stageId,
          pipelineId: step.pipelineId,
          smsBody: step.smsBody,
        }),
      })
      if (res.ok) {
        const updatedSteps = generatedSteps.map((s, i) => i === index ? { ...s, status: 'pushed' as const, pushedAt: new Date().toISOString() } : s)
        setGeneratedSteps(updatedSteps)
        // Persist step status to DB
        fetch(`/api/${tenantSlug}/calls/${call.id}/actions`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ aiNextSteps: updatedSteps }),
        }).catch(() => {})

        // AI Learning: if user edited the label before pushing, log the correction
        if (step.originalLabel && step.label !== step.originalLabel) {
          fetch(`/api/${tenantSlug}/calls/${call.id}/feedback`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              type: 'nextstep_correction',
              details: JSON.stringify({
                actionType: step.type,
                aiOriginal: step.originalLabel,
                userEdited: step.label,
                contactName: call.contactName,
              }),
            }),
          }).catch(() => {})
        }

        const data = await res.json().catch(() => ({} as { assignedToResolution?: string }))
        if (data.assignedToResolution) {
          toast(`Pushed to CRM. Assignee skipped: ${data.assignedToResolution}`, 'warning')
        } else {
          toast('Action pushed to CRM', 'success')
        }
      } else toast('Failed to push action', 'error')
    } catch { toast('Failed to push action', 'error') }
    setActionLoading(null)
  }

  function skipStep(index: number) {
    const updatedSteps = generatedSteps.map((s, i) => i === index ? { ...s, status: 'skipped' as const } : s)
    setGeneratedSteps(updatedSteps)
    // Persist step status to DB
    fetch(`/api/${tenantSlug}/calls/${call.id}/actions`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ aiNextSteps: updatedSteps }),
    }).catch(() => {})
  }

  async function addAction() {
    if (!addActionType) return
    setAddingAction(true)
    try {
      const res = await fetch(`/api/${tenantSlug}/calls/${call.id}/generate-next-steps`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actionType: addActionType, summary: addActionSummary }),
      })
      if (res.ok) {
        const data = await res.json()
        if (data.steps && data.steps.length > 0) {
          const newStep = { ...data.steps[0], status: 'pending' as const }
          setGeneratedSteps(prev => [...prev, newStep])
          toast('Action added', 'success')
          setShowAddAction(false)
          setAddActionType('')
          setAddActionSummary('')
        }
      } else toast('Failed to generate action', 'error')
    } catch { toast('Failed to generate action', 'error') }
    setAddingAction(false)
  }

  function toggleReason(index: number) {
    setExpandedReasons(prev => {
      const next = new Set(prev)
      if (next.has(index)) next.delete(index)
      else next.add(index)
      return next
    })
  }

  return (
    <div className="space-y-5 -mx-4 md:-mx-8 -my-4 md:-my-6 px-4 md:px-8 py-4 md:py-6">
      {/* ── HEADER ────────────────────────────────────────────────── */}
      <div className="flex items-center gap-4 flex-wrap">
        <Link
          href={`/${tenantSlug}/calls`}
          className="flex items-center gap-1.5 px-3 py-2 rounded-[10px] border-[0.5px] text-[13px] font-medium text-txt-secondary hover:text-txt-primary hover:bg-surface-secondary transition-all"
          style={{ borderColor: 'var(--border-medium)' }}
        >
          <ArrowLeft size={14} /> Back
        </Link>

        <h1 className="text-[24px] font-semibold text-txt-primary">
          {call.contactName ?? 'Unknown Contact'}
        </h1>

        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => setShowFeedback(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-[10px] border-[0.5px] text-[13px] font-medium text-txt-secondary hover:text-txt-primary transition-all"
            style={{ borderColor: 'var(--border-medium)' }}
          >
            <MessageSquare size={13} /> Feedback
          </button>
          <div className="relative">
            <button
              onClick={() => {
                if (!reclassifying) {
                  setReclassifyType(call.callType ?? '')
                  setReclassifyOutcome(call.callOutcome ?? '')
                }
                setReclassifying(!reclassifying)
              }}
              className="flex items-center gap-1.5 px-3 py-2 rounded-[10px] border-[0.5px] text-[13px] font-medium text-txt-secondary hover:text-txt-primary transition-all"
              style={{ borderColor: 'var(--border-medium)' }}
            >
              Reclassify
            </button>
            {reclassifying && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => !reclassifySaving && setReclassifying(false)} />
                <div className="absolute top-full right-0 mt-1 bg-surface-primary border rounded-[14px] p-4 z-50 w-72 shadow-ds-float space-y-3" style={{ borderColor: 'var(--border-medium)' }}>
                  <div>
                    <label className="block text-[10px] font-medium tracking-[0.08em] text-txt-muted uppercase mb-1">Call type</label>
                    <select
                      value={reclassifyType}
                      onChange={e => {
                        setReclassifyType(e.target.value)
                        // Reset outcome when type changes and the current outcome isn't valid for the new type
                        const newType = CALL_TYPES.find(ct => ct.id === e.target.value)
                        if (newType && reclassifyOutcome && !newType.results.some(r => r.id === reclassifyOutcome)) {
                          setReclassifyOutcome('')
                        }
                      }}
                      className="w-full bg-surface-secondary border-[0.5px] rounded-[10px] px-3 py-2 text-[13px] text-txt-primary focus:outline-none"
                      style={{ borderColor: 'var(--border-medium)' }}
                    >
                      <option value="">—</option>
                      {CALL_TYPES.map(ct => <option key={ct.id} value={ct.id}>{ct.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-medium tracking-[0.08em] text-txt-muted uppercase mb-1">Outcome</label>
                    <select
                      value={reclassifyOutcome}
                      onChange={e => setReclassifyOutcome(e.target.value)}
                      className="w-full bg-surface-secondary border-[0.5px] rounded-[10px] px-3 py-2 text-[13px] text-txt-primary focus:outline-none"
                      style={{ borderColor: 'var(--border-medium)' }}
                    >
                      <option value="">—</option>
                      {outcomeChoices.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                    </select>
                  </div>
                  <div className="flex items-center justify-end gap-2 pt-1">
                    <button
                      onClick={() => !reclassifySaving && setReclassifying(false)}
                      className="text-[12px] text-txt-secondary hover:text-txt-primary px-2 py-1"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={saveReclassify}
                      disabled={reclassifySaving}
                      className="flex items-center gap-1.5 text-[12px] font-medium bg-gunner-red text-white hover:bg-gunner-red-dark px-3 py-1.5 rounded-[8px] disabled:opacity-50"
                    >
                      {reclassifySaving && <Loader2 size={11} className="animate-spin" />}
                      Save
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
          <button
            onClick={toggleCalibration}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-[10px] border-[0.5px] text-[13px] font-medium transition-all ${
              isCalibration
                ? 'text-semantic-purple bg-semantic-purple-bg border-semantic-purple/30'
                : 'text-txt-secondary hover:text-txt-primary'
            }`}
            style={!isCalibration ? { borderColor: 'var(--border-medium)' } : undefined}
            title={isCalibration ? 'Remove calibration flag' : 'Flag as calibration example (good/bad reference for AI grading)'}
          >
            <Star size={13} fill={isCalibration ? 'currentColor' : 'none'} />
            {isCalibration ? 'Calibration' : 'Flag'}
          </button>
        </div>
      </div>

      {/* Tag row — metadata pills */}
      <div className="flex items-center gap-2 flex-wrap">
        {call.assignedTo && (
          <Pill icon={<User size={9} />}>{call.assignedTo.name}</Pill>
        )}
        <Pill icon={<Clock size={9} />}>{fmtDuration(call.durationSeconds)}</Pill>
        <Pill icon={call.direction === 'OUTBOUND' ? <PhoneOutgoing size={9} /> : <PhoneIncoming size={9} />}
          color={call.direction === 'OUTBOUND' ? 'border-semantic-green text-semantic-green' : 'border-semantic-blue text-semantic-blue'}>
          {call.direction === 'OUTBOUND' ? 'Outbound' : 'Inbound'}
        </Pill>
        {call.callType && (
          <Pill color="border-semantic-purple text-semantic-purple">
            {CALL_TYPES.find(ct => ct.id === call.callType)?.name ?? call.callType.replace(/_/g, ' ')}
          </Pill>
        )}
        {outcome && (
          <Pill color={outcome === 'follow_up_scheduled' ? 'border-semantic-amber text-semantic-amber' : 'border-semantic-green text-semantic-green'}
            icon={outcome === 'follow_up_scheduled' ? <Clock size={9} /> : undefined}>
            {RESULT_NAMES[outcome] ?? outcome.replace(/_/g, ' ')}
          </Pill>
        )}
        {(() => {
          // Show up to 3 related properties, plus a "+X more" toggle that expands the rest inline.
          const props = call.relatedProperties.length > 0
            ? call.relatedProperties
            : (call.property ? [{ id: call.property.id, address: call.property.address, city: call.property.city, state: call.property.state, status: call.property.status }] : [])
          if (props.length === 0) return null
          const visible = propertiesExpanded ? props : props.slice(0, 3)
          const hiddenCount = props.length - visible.length
          return (
            <>
              {visible.map(p => (
                <Link
                  key={p.id}
                  href={`/${tenantSlug}/inventory/${p.id}`}
                  target="_blank"
                  className="inline-flex items-center gap-1 text-[11px] font-medium px-2.5 py-1 rounded-full border-[0.5px] border-[rgba(0,0,0,0.14)] text-txt-secondary hover:text-gunner-red hover:border-gunner-red/30 transition-colors"
                >
                  <MapPin size={9} /> {p.address}, {p.city}, {p.state}
                </Link>
              ))}
              {hiddenCount > 0 && (
                <button
                  onClick={() => setPropertiesExpanded(true)}
                  className="inline-flex items-center gap-1 text-[11px] font-medium px-2.5 py-1 rounded-full border-[0.5px] border-[rgba(0,0,0,0.14)] text-txt-muted hover:text-txt-primary hover:border-gunner-red/30 transition-colors"
                >
                  +{hiddenCount} more
                </button>
              )}
              {propertiesExpanded && props.length > 3 && (
                <button
                  onClick={() => setPropertiesExpanded(false)}
                  className="inline-flex items-center gap-1 text-[11px] font-medium px-2.5 py-1 rounded-full border-[0.5px] border-[rgba(0,0,0,0.14)] text-txt-muted hover:text-txt-primary transition-colors"
                >
                  Collapse
                </button>
              )}
            </>
          )
        })()}
      </div>

      {/* Date/time */}
      <p className="text-[13px] text-txt-muted">
        {format(new Date(call.calledAt), "EEEE, MMM d, yyyy 'at' h:mm a")}
      </p>

      {/* ── TWO-COLUMN BODY ───────────────────────────────────────── */}
      <div className="grid md:grid-cols-3 gap-6">
        {/* LEFT COLUMN (1/3) */}
        <div className="space-y-4">
          {/* OVERALL GRADE card */}
          <div className="bg-surface-primary border-[0.5px] rounded-[14px] p-6 text-center" style={{ borderColor: 'var(--border-light)' }}>
            <p className="text-[10px] font-medium tracking-[0.08em] text-txt-muted uppercase mb-4">Overall Grade</p>

            {/* Grade square with glow */}
            <div className={`w-16 h-16 rounded-[14px] flex items-center justify-center mx-auto ${grade.color} ${grade.glow}`}>
              <span className="text-[28px] font-semibold text-white">{grade.letter}</span>
            </div>

            <p className="text-[24px] font-semibold text-txt-primary mt-3">
              {call.score !== null ? `${Math.round(call.score)}%` : '\u2014'}
            </p>

            <button onClick={() => setShowFeedback(true)} className="text-[11px] text-semantic-red hover:underline mt-2">
              Flag a scoring issue
            </button>
          </div>

          {/* STRENGTHS card — only visible on Coaching tab */}
          {tab === 'coaching' && strengths.length > 0 && (
            <div className="bg-surface-primary border-[0.5px] rounded-[14px] p-4" style={{ borderColor: 'var(--border-light)' }}>
              <h3 className="text-[12px] font-semibold text-semantic-green flex items-center gap-2 mb-2">
                <CheckCircle size={12} /> STRENGTHS
              </h3>
              <ul className="space-y-1.5">
                {strengths.map((s, i) => (
                  <li key={i} className="text-[11px] text-txt-secondary leading-relaxed flex items-start gap-2">
                    <span className="text-semantic-green mt-0.5 shrink-0">•</span>
                    {s}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* RED FLAGS card — only visible on Coaching tab */}
          {tab === 'coaching' && redFlags.length > 0 && (
            <div className="bg-surface-primary border-[0.5px] rounded-[14px] p-4" style={{ borderColor: 'var(--border-light)' }}>
              <h3 className="text-[12px] font-semibold text-semantic-amber flex items-center gap-2 mb-2">
                <AlertTriangle size={12} /> RED FLAGS
              </h3>
              <ul className="space-y-1.5">
                {redFlags.map((flag, i) => (
                  <li key={i} className="text-[11px] text-txt-secondary leading-relaxed flex items-start gap-2">
                    <span className="text-semantic-amber mt-0.5 shrink-0">•</span>
                    {flag}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* RIGHT COLUMN (2/3) */}
        <div className="md:col-span-2 space-y-4">
          {/* Tab bar */}
          <div className="flex gap-1 bg-surface-tertiary rounded-[14px] p-1 w-fit overflow-x-auto">
            {tabs.map(t => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-[10px] text-[13px] font-medium transition-all whitespace-nowrap ${
                  tab === t.id
                    ? 'bg-surface-primary text-txt-primary shadow-ds-float'
                    : 'text-txt-secondary hover:text-txt-primary'
                }`}
              >
                {t.icon} {t.label}
                {t.badge !== undefined && t.badge > 0 && (
                  <span className="bg-gunner-red text-white text-[10px] w-4 h-4 rounded-full flex items-center justify-center">{t.badge}</span>
                )}
              </button>
            ))}
          </div>

          {/* ── COACHING TAB ─────────────────────────────────────── */}
          {tab === 'coaching' && (
            <div className="space-y-3">
              {/* Summary */}
              {call.aiSummary && (
                <div className="bg-surface-primary border-[0.5px] rounded-[14px] p-4" style={{ borderColor: 'var(--border-light)' }}>
                  <h3 className="text-[10px] font-medium tracking-[0.08em] text-txt-muted uppercase flex items-center gap-2 mb-2">
                    <FileText size={11} /> Summary
                  </h3>
                  <p className="text-[11px] text-txt-secondary leading-relaxed">{call.aiSummary}</p>
                </div>
              )}

              {/* Areas for Improvement — each item is its own card */}
              {improvements.length > 0 && (
                <div>
                  <h3 className="text-[10px] font-medium tracking-[0.08em] text-semantic-amber uppercase flex items-center gap-2 mb-2 px-1">
                    <Target size={11} /> Areas for Improvement
                  </h3>
                  <div className="space-y-2">
                    {improvements.map((item, i) => (
                      <div key={i} className="bg-surface-primary border-[0.5px] rounded-[14px] p-4" style={{ borderColor: 'var(--border-light)' }}>
                        {/* What went wrong */}
                        <p className="text-[11px] text-txt-primary leading-relaxed mb-2">{item.what_went_wrong}</p>

                        {/* Call example — blockquote style */}
                        {item.call_example && (
                          <div className="flex gap-2 mb-2 pl-1">
                            <span className="text-[16px] text-txt-muted leading-none shrink-0 -mt-0.5">&ldquo;</span>
                            <p className="text-[10px] text-txt-muted italic leading-relaxed">{item.call_example}</p>
                          </div>
                        )}

                        {/* Coaching tip — accent border card */}
                        {item.coaching_tip && (
                          <div className="border-l-[3px] border-semantic-blue bg-semantic-blue/5 rounded-r-[10px] px-3 py-2">
                            <p className="text-[9px] font-medium tracking-[0.08em] text-semantic-blue uppercase mb-1">
                              <Lightbulb size={9} className="inline -mt-0.5 mr-1" />Script Suggestion
                            </p>
                            <p className="text-[11px] text-txt-secondary leading-relaxed">{item.coaching_tip}</p>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Potential Replies to Objections */}
              {objectionReplies.length > 0 && (
                <div>
                  <h3 className="text-[10px] font-medium tracking-[0.08em] text-semantic-purple uppercase flex items-center gap-2 mb-1 px-1">
                    <ShieldCheck size={11} /> Potential Replies to Objections
                  </h3>
                  <p className="text-[10px] text-txt-muted mb-2 px-1">Objections identified in this call with suggested responses</p>
                  <div className="space-y-2">
                    {objectionReplies.map((obj, i) => (
                      <div key={i} className="bg-surface-primary border-[0.5px] rounded-[14px] p-4" style={{ borderColor: 'var(--border-light)' }}>
                        {/* Objection label chip */}
                        <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-semantic-purple-bg text-semantic-purple mb-2 inline-block">
                          {obj.objection_label}
                        </span>

                        {/* Call quote — blockquote style */}
                        {obj.call_quote && (
                          <div className="flex gap-2 mb-2 pl-1 mt-1.5">
                            <span className="text-[16px] text-txt-muted leading-none shrink-0 -mt-0.5">&ldquo;</span>
                            <p className="text-[10px] text-txt-muted italic leading-relaxed">{obj.call_quote}</p>
                          </div>
                        )}

                        {/* Suggested responses */}
                        {obj.suggested_responses.length > 0 && (
                          <div className="mt-2">
                            <p className="text-[9px] font-medium tracking-[0.1em] text-txt-muted uppercase mb-1.5">Suggested Responses</p>
                            <div className="space-y-1.5">
                              {obj.suggested_responses.map((resp, ri) => (
                                <div key={ri} className="border-l-[3px] border-semantic-blue bg-semantic-blue/5 rounded-r-[10px] px-3 py-2">
                                  <p className="text-[11px] text-txt-secondary leading-relaxed">{resp}</p>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Criteria breakdown — folded in from the old Criteria tab */}
              {Object.keys(call.rubricScores).length > 0 && (
                <div>
                  <h3 className="text-[10px] font-medium tracking-[0.08em] text-semantic-blue uppercase flex items-center gap-2 mb-2 px-1">
                    <Target size={11} /> Criteria Breakdown
                  </h3>
                  <div className="grid grid-cols-2 gap-3">
                    {Object.entries(call.rubricScores).map(([cat, data]) => {
                      const pct = data.maxScore > 0 ? Math.round((data.score / data.maxScore) * 100) : 0
                      const barColor = pct >= 80 ? 'bg-semantic-green' : pct >= 60 ? 'bg-yellow-500' : pct >= 40 ? 'bg-semantic-blue' : 'bg-semantic-red'
                      const textColor = pct >= 80 ? 'text-semantic-green' : pct >= 60 ? 'text-yellow-600' : pct >= 40 ? 'text-semantic-blue' : 'text-semantic-red'
                      return (
                        <div key={cat} className="bg-surface-primary border-[0.5px] rounded-[14px] p-4" style={{ borderColor: 'var(--border-light)' }}>
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-[14px] font-medium text-txt-primary">{formatFieldLabel(cat)}</span>
                            <span className={`text-[14px] font-semibold ${textColor}`}>
                              {data.score}/{data.maxScore}
                            </span>
                          </div>
                          <div className="h-2 bg-surface-tertiary rounded-full overflow-hidden mb-3">
                            <div className={`h-full rounded-full ${barColor} transition-all duration-700`} style={{ width: `${pct}%` }} />
                          </div>
                          {data.notes && (
                            <p className="text-[12px] text-txt-secondary leading-relaxed">{data.notes}</p>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {!call.aiSummary && improvements.length === 0 && objectionReplies.length === 0 && Object.keys(call.rubricScores).length === 0 && (
                <EmptyState icon={<Lightbulb size={24} />} message="No coaching data available yet" />
              )}
            </div>
          )}

          {/* ── TRANSCRIPT TAB ───────────────────────────────────── */}
          {tab === 'transcript' && (
            <div className="space-y-4">
              {/* Audio player */}
              {call.recordingUrl && (
                <div className="bg-surface-primary border-[0.5px] rounded-[14px] p-5" style={{ borderColor: 'var(--border-light)' }}>
                  <h3 className="text-[10px] font-medium tracking-[0.08em] text-txt-muted uppercase flex items-center gap-2 mb-4">
                    <Play size={12} /> Call Recording
                  </h3>

                  {/* Waveform — larger, cleaner */}
                  <div className="h-24 bg-surface-secondary rounded-[12px] flex items-center justify-center mb-4 overflow-hidden relative cursor-pointer"
                    onClick={(e) => {
                      if (!audioRef.current || !call.durationSeconds) return
                      const rect = e.currentTarget.getBoundingClientRect()
                      const pct = (e.clientX - rect.left) / rect.width
                      audioRef.current.currentTime = pct * call.durationSeconds
                    }}
                  >
                    <div className="flex items-end gap-[3px] h-20 px-4 w-full">
                      {Array.from({ length: 80 }).map((_, i) => {
                        const h = 15 + Math.abs(Math.sin(i * 0.35) * 45) + Math.abs(Math.sin(i * 0.85) * 35) + (i % 4 === 0 ? 12 : 0)
                        const progress = call.durationSeconds ? currentTime / call.durationSeconds : 0
                        const barProgress = i / 80
                        const isPast = barProgress < progress
                        return (
                          <div
                            key={i}
                            className={`flex-1 rounded-full transition-colors ${isPast ? 'bg-gunner-red' : 'bg-gunner-red/20'}`}
                            style={{ height: `${Math.min(h, 100)}%` }}
                          />
                        )
                      })}
                    </div>
                  </div>

                  {/* Controls — cleaner layout */}
                  <div className="flex items-center gap-4">
                    <button onClick={() => { if (audioRef.current) { audioRef.current.currentTime = Math.max(0, audioRef.current.currentTime - 15) } }} className="p-1.5 text-txt-muted hover:text-txt-primary" title="Back 15s">
                      <SkipBack size={16} />
                    </button>
                    <button onClick={togglePlay} className="w-11 h-11 rounded-full bg-gunner-red text-white flex items-center justify-center hover:bg-gunner-red-dark shadow-md">
                      {isPlaying ? <Pause size={16} /> : <Play size={16} className="ml-0.5" />}
                    </button>
                    <button onClick={() => { if (audioRef.current) { audioRef.current.currentTime = Math.min(audioRef.current.duration, audioRef.current.currentTime + 15) } }} className="p-1.5 text-txt-muted hover:text-txt-primary" title="Forward 15s">
                      <SkipForward size={16} />
                    </button>
                    <span className="text-[13px] font-medium text-txt-primary tabular-nums">
                      {fmtDuration(Math.round(currentTime))}
                    </span>
                    <span className="text-[13px] text-txt-muted">/</span>
                    <span className="text-[13px] text-txt-muted tabular-nums">
                      {fmtDuration(call.durationSeconds)}
                    </span>
                    <div className="ml-auto flex items-center gap-3">
                      <button onClick={changeSpeed} className="text-[12px] font-semibold text-txt-secondary bg-surface-secondary px-3 py-1.5 rounded-[8px] hover:text-txt-primary">
                        {playbackRate}x
                      </button>
                      <Volume2 size={14} className="text-txt-muted" />
                    </div>
                  </div>

                  <audio
                    ref={audioRef}
                    src={call.recordingUrl}
                    onTimeUpdate={e => setCurrentTime((e.target as HTMLAudioElement).currentTime)}
                    onEnded={() => setIsPlaying(false)}
                    className="hidden"
                  />
                </div>
              )}

              {/* Key Moments */}
              <div className="bg-surface-primary border-[0.5px] rounded-[14px] p-5" style={{ borderColor: 'var(--border-light)' }}>
                <h3 className="text-[10px] font-medium tracking-[0.08em] text-semantic-purple uppercase flex items-center gap-2 mb-2">
                  &#x2726; Key Moments
                </h3>
                <p className="text-[12px] text-txt-muted mb-3">AI-identified highlights from this call — objections, appointments, price discussions, and more.</p>
                {call.keyMoments.length > 0 ? (
                  <div className="space-y-1.5">
                    {call.keyMoments.map((m, i) => {
                      const Icon = MOMENT_ICONS[m.type] ?? Zap
                      const isExpM = expandedMoment === i
                      // Short summary: first sentence or first 80 chars
                      const shortDesc = m.description.includes('.')
                        ? m.description.split('.')[0] + '.'
                        : m.description.length > 80 ? m.description.slice(0, 80).replace(/\s+\S*$/, '') + '...' : m.description
                      const hasMore = m.description.length > shortDesc.length || (m as { quote?: string }).quote
                      return (
                        <div key={i} className="rounded-[10px] bg-surface-secondary overflow-hidden">
                          <button
                            onClick={() => hasMore ? setExpandedMoment(isExpM ? null : i) : seekTo(m.timestamp)}
                            className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-surface-tertiary transition-colors"
                          >
                            <Icon size={12} className="text-semantic-purple shrink-0" />
                            <span className="text-[11px] text-semantic-purple font-medium shrink-0">{m.timestamp}</span>
                            <span className="text-[13px] text-txt-secondary flex-1">{shortDesc}</span>
                            {hasMore && <ChevronDown size={12} className={`text-txt-muted transition-transform ${isExpM ? 'rotate-180' : ''}`} />}
                          </button>
                          {isExpM && (
                            <div className="px-3 pb-3 pt-0.5 border-t" style={{ borderColor: 'var(--border-light)' }}>
                              <p className="text-[12px] text-txt-secondary leading-relaxed mb-2">{m.description}</p>
                              {(m as { quote?: string }).quote && (
                                <div className="flex gap-2 pl-1">
                                  <span className="text-[16px] text-txt-muted leading-none shrink-0">&ldquo;</span>
                                  <p className="text-[11px] text-txt-muted italic leading-relaxed">{(m as { quote?: string }).quote}</p>
                                </div>
                              )}
                              <button onClick={() => seekTo(m.timestamp)} className="text-[11px] text-semantic-purple hover:underline mt-2 flex items-center gap-1">
                                <Play size={9} /> Jump to {m.timestamp}
                              </button>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <p className="text-[12px] text-txt-muted">No key moments identified in this call.</p>
                )}
              </div>

              {/* Transcript */}
              {call.transcript ? (
                <div className="bg-surface-primary border-[0.5px] rounded-[14px] p-5" style={{ borderColor: 'var(--border-light)' }}>
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-[10px] font-medium tracking-[0.08em] text-txt-muted uppercase">Call Transcript</h3>
                    <span className="text-[11px] text-txt-muted">Full transcription of the call</span>
                  </div>
                  <div className="relative mb-3">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-txt-muted" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={e => setSearchQuery(e.target.value)}
                      placeholder="Search transcript..."
                      className="w-full bg-surface-secondary border-[0.5px] rounded-[10px] pl-9 pr-4 py-2 text-[13px] text-txt-primary placeholder:text-txt-muted focus:outline-none focus:ring-1 focus:ring-gunner-red"
                      style={{ borderColor: 'var(--border-medium)' }}
                    />
                  </div>
                  <div className="max-h-[400px] overflow-y-auto">
                    <TranscriptView transcript={call.transcript} searchQuery={searchQuery}
                      repName={call.assignedTo?.name ?? 'Rep'} contactName={call.contactName ?? 'Seller'}
                      direction={call.direction} />
                  </div>
                </div>
              ) : call.recordingUrl ? (
                <EmptyState icon={<Mic size={24} />} message="Recording found but not transcribed yet" sub="Use Reprocess to trigger transcription." />
              ) : (
                <EmptyState icon={<Mic size={24} />} message="No recording URL — graded from metadata only" />
              )}
            </div>
          )}

          {/* ── NEXT STEPS TAB ───────────────────────────────────── */}
          {tab === 'next-steps' && (
            <div className="space-y-4">
              {/* Header */}
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[14px] font-medium text-txt-primary">
                    {generatedSteps.filter(s => s.status === 'pending').length} pending step{generatedSteps.filter(s => s.status === 'pending').length !== 1 ? 's' : ''}
                  </p>
                  <p className="text-[12px] text-txt-muted">Review, edit, and push each action to CRM</p>
                </div>
                <button
                  onClick={() => setShowAddAction(v => !v)}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-[10px] border-[0.5px] text-[13px] font-medium text-txt-secondary hover:text-txt-primary"
                  style={{ borderColor: 'var(--border-medium)' }}
                >
                  <Plus size={13} /> Add Action
                </button>
              </div>

              {/* Add Action inline form */}
              {showAddAction && (
                <div className="bg-surface-primary border-[0.5px] rounded-[14px] p-4 space-y-3" style={{ borderColor: 'var(--border-light)' }}>
                  <p className="text-[12px] font-medium text-txt-primary">New Action</p>
                  <select
                    value={addActionType}
                    onChange={e => setAddActionType(e.target.value)}
                    className="w-full bg-surface-secondary border-[0.5px] rounded-[10px] px-3 py-2 text-[13px] text-txt-primary focus:outline-none"
                    style={{ borderColor: 'var(--border-medium)' }}
                  >
                    <option value="">Select Action Type...</option>
                    {ALL_ACTION_TYPES.map(t => (
                      <option key={t} value={t}>{STEP_ICONS[t]?.label ?? t}</option>
                    ))}
                  </select>
                  <input
                    type="text"
                    value={addActionSummary}
                    onChange={e => setAddActionSummary(e.target.value)}
                    placeholder="Briefly describe what you want to do..."
                    className="w-full bg-surface-secondary border-[0.5px] rounded-[10px] px-3 py-2 text-[13px] text-txt-primary placeholder:text-txt-muted focus:outline-none"
                    style={{ borderColor: 'var(--border-medium)' }}
                    onKeyDown={e => { if (e.key === 'Enter') addAction() }}
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={addAction}
                      disabled={!addActionType || addingAction}
                      className="flex items-center gap-1.5 bg-gunner-red hover:bg-gunner-red-dark disabled:opacity-40 text-white text-[12px] font-semibold px-3 py-1.5 rounded-[10px] transition-colors"
                    >
                      {addingAction ? <Loader2 size={10} className="animate-spin" /> : <Sparkles size={10} />}
                      {addingAction ? 'Generating...' : 'Add'}
                    </button>
                    <button onClick={() => { setShowAddAction(false); setAddActionType(''); setAddActionSummary('') }}
                      className="text-[12px] text-txt-secondary hover:text-txt-primary px-3 py-1.5">Cancel</button>
                  </div>
                </div>
              )}

              {/* Generate button */}
              {generatedSteps.length === 0 && !showAddAction && (
                <button
                  onClick={generateNextSteps}
                  disabled={generatingSteps}
                  className="w-full bg-semantic-purple hover:opacity-90 text-white text-[13px] font-semibold py-3 rounded-[10px] transition-colors flex items-center justify-center gap-2"
                >
                  {generatingSteps ? <><Loader2 size={14} className="animate-spin" /> Generating...</> : <>&#x2726; Generate AI Next Steps</>}
                </button>
              )}

              {/* Pending actions */}
              {generatedSteps.filter(s => s.status === 'pending').length > 0 && (
                <div className="space-y-3">
                  {generatedSteps.map((step, i) => {
                    if (step.status !== 'pending') return null
                    const stepDef = STEP_ICONS[step.type] ?? STEP_ICONS.add_note
                    const StepIcon = stepDef.icon
                    const isEditing = editingStep === i
                    return (
                      <div key={i} className={`${stepDef.cardBg} border-[0.5px] rounded-[14px] p-4`} style={{ borderColor: 'var(--border-light)' }}>
                        <div className="flex items-center gap-2 mb-2">
                          <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${stepDef.bg} ${stepDef.color}`}>
                            <StepIcon size={10} className="inline mr-1" />
                            {stepDef.label}
                          </span>
                          <span className="text-[11px] font-medium text-semantic-purple bg-semantic-purple-bg px-2 py-0.5 rounded-full">&#x2726; AI</span>
                        </div>
                        <p className="text-[13px] text-txt-primary font-medium mb-1">{step.label}</p>
                        <button onClick={() => toggleReason(i)} className="text-[11px] text-semantic-purple hover:underline mb-3 flex items-center gap-1">
                          &#x2726; Why this action? <ChevronDown size={10} className={expandedReasons.has(i) ? 'rotate-180' : ''} />
                        </button>
                        {expandedReasons.has(i) && (
                          <p className="text-[12px] text-txt-muted italic mb-3">{step.reasoning}</p>
                        )}

                        {/* Edit panel — per-action-type fields + AI change box */}
                        {isEditing && (
                          <div className="border-t pt-3 mb-3 space-y-2.5" style={{ borderColor: 'var(--border-light)' }}>
                            {/* ── ADD NOTE ── */}
                            {step.type === 'add_note' && (
                              <div>
                                <label className="text-[9px] font-semibold text-txt-muted uppercase tracking-wider block mb-1">Note to Push</label>
                                <textarea value={editFields.label ?? step.label}
                                  onChange={e => setEditFields(prev => ({ ...prev, label: e.target.value }))}
                                  rows={4}
                                  className="w-full bg-white border-[0.5px] rounded-[8px] px-3 py-2 text-[11px] text-txt-primary focus:outline-none resize-none"
                                  style={{ borderColor: 'var(--border-medium)' }} />
                              </div>
                            )}

                            {/* ── CREATE TASK ── */}
                            {step.type === 'create_task' && (
                              <>
                                <div>
                                  <label className="text-[9px] font-semibold text-txt-muted uppercase tracking-wider block mb-1">Task Title</label>
                                  <input value={editFields.label ?? step.label}
                                    onChange={e => setEditFields(prev => ({ ...prev, label: e.target.value }))}
                                    className="w-full bg-white border-[0.5px] rounded-[8px] px-3 py-1.5 text-[11px] text-txt-primary focus:outline-none"
                                    style={{ borderColor: 'var(--border-medium)' }} />
                                </div>
                                <div>
                                  <label className="text-[9px] font-semibold text-txt-muted uppercase tracking-wider block mb-1">Description</label>
                                  <textarea value={editFields.description ?? ''}
                                    onChange={e => setEditFields(prev => ({ ...prev, description: e.target.value }))}
                                    rows={2}
                                    className="w-full bg-white border-[0.5px] rounded-[8px] px-3 py-1.5 text-[11px] text-txt-primary focus:outline-none resize-none"
                                    style={{ borderColor: 'var(--border-medium)' }} />
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                  <div>
                                    <label className="text-[9px] font-semibold text-txt-muted uppercase tracking-wider block mb-1">Due Date</label>
                                    <input type="date" value={editFields.dueDate ?? ''}
                                      onChange={e => setEditFields(prev => ({ ...prev, dueDate: e.target.value }))}
                                      className="w-full bg-white border-[0.5px] rounded-[8px] px-3 py-1.5 text-[11px] text-txt-primary focus:outline-none"
                                      style={{ borderColor: 'var(--border-medium)' }} />
                                  </div>
                                  <div>
                                    <label className="text-[9px] font-semibold text-txt-muted uppercase tracking-wider block mb-1">Assigned To</label>
                                    <select value={editFields.assignedTo ?? call.assignedTo?.id ?? ''}
                                      onChange={e => setEditFields(prev => ({ ...prev, assignedTo: e.target.value }))}
                                      className="w-full bg-white border-[0.5px] rounded-[8px] px-3 py-1.5 text-[11px] text-txt-primary focus:outline-none"
                                      style={{ borderColor: 'var(--border-medium)' }}>
                                      <option value="">Select team member...</option>
                                      {teamMembers.map(m => <option key={m.userId} value={m.userId}>{m.name}</option>)}
                                    </select>
                                  </div>
                                </div>
                              </>
                            )}

                            {/* ── CHECK OFF TASK ── */}
                            {step.type === 'check_off_task' && (
                              <>
                                <div>
                                  <label className="text-[9px] font-semibold text-txt-muted uppercase tracking-wider block mb-1">Task Title</label>
                                  <input value={editFields.label ?? step.label}
                                    onChange={e => setEditFields(prev => ({ ...prev, label: e.target.value }))}
                                    className="w-full bg-white border-[0.5px] rounded-[8px] px-3 py-1.5 text-[11px] text-txt-primary focus:outline-none"
                                    style={{ borderColor: 'var(--border-medium)' }} />
                                </div>
                                <div>
                                  <label className="text-[9px] font-semibold text-txt-muted uppercase tracking-wider block mb-1">Description</label>
                                  <textarea value={editFields.description ?? ''}
                                    onChange={e => setEditFields(prev => ({ ...prev, description: e.target.value }))}
                                    rows={2}
                                    className="w-full bg-white border-[0.5px] rounded-[8px] px-3 py-1.5 text-[11px] text-txt-primary focus:outline-none resize-none"
                                    style={{ borderColor: 'var(--border-medium)' }} />
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                  <div>
                                    <label className="text-[9px] font-semibold text-txt-muted uppercase tracking-wider block mb-1">Due Date</label>
                                    <input type="date" value={editFields.dueDate ?? ''}
                                      onChange={e => setEditFields(prev => ({ ...prev, dueDate: e.target.value }))}
                                      className="w-full bg-white border-[0.5px] rounded-[8px] px-3 py-1.5 text-[11px] text-txt-primary focus:outline-none"
                                      style={{ borderColor: 'var(--border-medium)' }} />
                                  </div>
                                  <div>
                                    <label className="text-[9px] font-semibold text-txt-muted uppercase tracking-wider block mb-1">Assigned To</label>
                                    <select value={editFields.assignedTo ?? call.assignedTo?.id ?? ''}
                                      onChange={e => setEditFields(prev => ({ ...prev, assignedTo: e.target.value }))}
                                      className="w-full bg-white border-[0.5px] rounded-[8px] px-3 py-1.5 text-[11px] text-txt-primary focus:outline-none"
                                      style={{ borderColor: 'var(--border-medium)' }}>
                                      <option value="">Select team member...</option>
                                      {teamMembers.map(m => <option key={m.userId} value={m.userId}>{m.name}</option>)}
                                    </select>
                                  </div>
                                </div>
                              </>
                            )}

                            {/* ── CHANGE STAGE ── */}
                            {step.type === 'change_stage' && (
                              <>
                                <div>
                                  <label className="text-[9px] font-semibold text-txt-muted uppercase tracking-wider block mb-1">Action</label>
                                  <input value={editFields.label ?? step.label}
                                    onChange={e => setEditFields(prev => ({ ...prev, label: e.target.value }))}
                                    className="w-full bg-white border-[0.5px] rounded-[8px] px-3 py-1.5 text-[11px] text-txt-primary focus:outline-none"
                                    style={{ borderColor: 'var(--border-medium)' }} />
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                  <div>
                                    <label className="text-[9px] font-semibold text-txt-muted uppercase tracking-wider block mb-1">Pipeline</label>
                                    <select value={editFields.pipelineId ?? ''}
                                      onChange={e => setEditFields(prev => ({ ...prev, pipelineId: e.target.value, stageId: '' }))}
                                      className="w-full bg-white border-[0.5px] rounded-[8px] px-3 py-1.5 text-[11px] text-txt-primary focus:outline-none"
                                      style={{ borderColor: 'var(--border-medium)' }}>
                                      <option value="">Select pipeline...</option>
                                      {pipelines.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                                    </select>
                                  </div>
                                  <div>
                                    <label className="text-[9px] font-semibold text-txt-muted uppercase tracking-wider block mb-1">Move to Stage</label>
                                    <select value={editFields.stageId ?? ''}
                                      onChange={e => setEditFields(prev => ({ ...prev, stageId: e.target.value }))}
                                      className="w-full bg-white border-[0.5px] rounded-[8px] px-3 py-1.5 text-[11px] text-txt-primary focus:outline-none"
                                      style={{ borderColor: 'var(--border-medium)' }}>
                                      <option value="">Select stage...</option>
                                      {(pipelines.find(p => p.id === editFields.pipelineId)?.stages ?? []).map(s => (
                                        <option key={s.id} value={s.id}>{s.name}</option>
                                      ))}
                                    </select>
                                  </div>
                                </div>
                              </>
                            )}

                            {/* ── SEND SMS ── */}
                            {step.type === 'send_sms' && (
                              <>
                                <div>
                                  <label className="text-[9px] font-semibold text-txt-muted uppercase tracking-wider block mb-1">Message</label>
                                  <textarea value={editFields.label ?? step.label}
                                    onChange={e => setEditFields(prev => ({ ...prev, label: e.target.value }))}
                                    rows={3}
                                    className="w-full bg-white border-[0.5px] rounded-[8px] px-3 py-2 text-[11px] text-txt-primary focus:outline-none resize-none"
                                    style={{ borderColor: 'var(--border-medium)' }} />
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                  <div>
                                    <label className="text-[9px] font-semibold text-txt-muted uppercase tracking-wider block mb-1">To</label>
                                    <p className="text-[11px] text-txt-primary bg-surface-secondary rounded-[6px] px-2.5 py-1.5">
                                      {call.contactName ?? 'Unknown'} {call.contactPhone ? `(${call.contactPhone})` : ''}
                                    </p>
                                  </div>
                                  <div>
                                    <label className="text-[9px] font-semibold text-txt-muted uppercase tracking-wider block mb-1">Send From</label>
                                    <select value={editFields.fromUser ?? call.assignedTo?.id ?? ''}
                                      onChange={e => setEditFields(prev => ({ ...prev, fromUser: e.target.value }))}
                                      className="w-full bg-white border-[0.5px] rounded-[8px] px-3 py-1.5 text-[11px] text-txt-primary focus:outline-none"
                                      style={{ borderColor: 'var(--border-medium)' }}>
                                      <option value="">Select sender...</option>
                                      {teamMembers.map(m => <option key={m.userId} value={m.userId}>{m.name}{m.phone ? ` (${m.phone})` : ''}</option>)}
                                    </select>
                                  </div>
                                </div>
                              </>
                            )}

                            {/* ── SCHEDULE SMS ── */}
                            {step.type === 'schedule_sms' && (
                              <>
                                <div>
                                  <label className="text-[9px] font-semibold text-txt-muted uppercase tracking-wider block mb-1">Message</label>
                                  <textarea value={editFields.label ?? step.label}
                                    onChange={e => setEditFields(prev => ({ ...prev, label: e.target.value }))}
                                    rows={3}
                                    className="w-full bg-white border-[0.5px] rounded-[8px] px-3 py-2 text-[11px] text-txt-primary focus:outline-none resize-none"
                                    style={{ borderColor: 'var(--border-medium)' }} />
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                  <div>
                                    <label className="text-[9px] font-semibold text-txt-muted uppercase tracking-wider block mb-1">To</label>
                                    <p className="text-[11px] text-txt-primary bg-surface-secondary rounded-[6px] px-2.5 py-1.5">
                                      {call.contactName ?? 'Unknown'} {call.contactPhone ? `(${call.contactPhone})` : ''}
                                    </p>
                                  </div>
                                  <div>
                                    <label className="text-[9px] font-semibold text-txt-muted uppercase tracking-wider block mb-1">Send From</label>
                                    <select value={editFields.fromUser ?? call.assignedTo?.id ?? ''}
                                      onChange={e => setEditFields(prev => ({ ...prev, fromUser: e.target.value }))}
                                      className="w-full bg-white border-[0.5px] rounded-[8px] px-3 py-1.5 text-[11px] text-txt-primary focus:outline-none"
                                      style={{ borderColor: 'var(--border-medium)' }}>
                                      <option value="">Select sender...</option>
                                      {teamMembers.map(m => <option key={m.userId} value={m.userId}>{m.name}{m.phone ? ` (${m.phone})` : ''}</option>)}
                                    </select>
                                  </div>
                                </div>
                                <div>
                                  <label className="text-[9px] font-semibold text-txt-muted uppercase tracking-wider block mb-1">Send At</label>
                                  <input type="datetime-local" value={editFields.sendAt ?? ''}
                                    onChange={e => setEditFields(prev => ({ ...prev, sendAt: e.target.value }))}
                                    className="w-full bg-white border-[0.5px] rounded-[8px] px-3 py-1.5 text-[11px] text-txt-primary focus:outline-none"
                                    style={{ borderColor: 'var(--border-medium)' }} />
                                </div>
                              </>
                            )}

                            {/* ── ADD TO WORKFLOW ── */}
                            {step.type === 'add_to_workflow' && (
                              <>
                                <div>
                                  <label className="text-[9px] font-semibold text-txt-muted uppercase tracking-wider block mb-1">Action</label>
                                  <input value={editFields.label ?? step.label}
                                    onChange={e => setEditFields(prev => ({ ...prev, label: e.target.value }))}
                                    className="w-full bg-white border-[0.5px] rounded-[8px] px-3 py-1.5 text-[11px] text-txt-primary focus:outline-none"
                                    style={{ borderColor: 'var(--border-medium)' }} />
                                </div>
                                <div>
                                  <label className="text-[9px] font-semibold text-txt-muted uppercase tracking-wider block mb-1">Workflow</label>
                                  <select value={editFields.workflowId ?? ''}
                                    onChange={e => setEditFields(prev => ({ ...prev, workflowId: e.target.value }))}
                                    className="w-full bg-white border-[0.5px] rounded-[8px] px-3 py-1.5 text-[11px] text-txt-primary focus:outline-none"
                                    style={{ borderColor: 'var(--border-medium)' }}>
                                    <option value="">Select workflow...</option>
                                    {workflows.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                                  </select>
                                </div>
                              </>
                            )}

                            {/* ── REMOVE FROM WORKFLOW ── */}
                            {step.type === 'remove_from_workflow' && (
                              <>
                                <div>
                                  <label className="text-[9px] font-semibold text-txt-muted uppercase tracking-wider block mb-1">Action</label>
                                  <input value={editFields.label ?? step.label}
                                    onChange={e => setEditFields(prev => ({ ...prev, label: e.target.value }))}
                                    className="w-full bg-white border-[0.5px] rounded-[8px] px-3 py-1.5 text-[11px] text-txt-primary focus:outline-none"
                                    style={{ borderColor: 'var(--border-medium)' }} />
                                </div>
                                <div>
                                  <label className="text-[9px] font-semibold text-txt-muted uppercase tracking-wider block mb-1">Workflow</label>
                                  <select value={editFields.workflowId ?? ''}
                                    onChange={e => setEditFields(prev => ({ ...prev, workflowId: e.target.value }))}
                                    className="w-full bg-white border-[0.5px] rounded-[8px] px-3 py-1.5 text-[11px] text-txt-primary focus:outline-none"
                                    style={{ borderColor: 'var(--border-medium)' }}>
                                    <option value="">Select workflow...</option>
                                    {workflows.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                                  </select>
                                </div>
                              </>
                            )}

                            {/* ── CREATE APPOINTMENT ── */}
                            {step.type === 'create_appointment' && (
                              <>
                                <div>
                                  <label className="text-[9px] font-semibold text-txt-muted uppercase tracking-wider block mb-1">Appointment Title</label>
                                  <input value={editFields.label ?? step.label}
                                    onChange={e => setEditFields(prev => ({ ...prev, label: e.target.value }))}
                                    className="w-full bg-white border-[0.5px] rounded-[8px] px-3 py-1.5 text-[11px] text-txt-primary focus:outline-none"
                                    style={{ borderColor: 'var(--border-medium)' }} />
                                </div>
                                <div>
                                  <label className="text-[9px] font-semibold text-txt-muted uppercase tracking-wider block mb-1">Calendar</label>
                                  <select value={editFields.calendarId ?? ''}
                                    onChange={e => setEditFields(prev => ({ ...prev, calendarId: e.target.value }))}
                                    className="w-full bg-white border-[0.5px] rounded-[8px] px-3 py-1.5 text-[11px] text-txt-primary focus:outline-none"
                                    style={{ borderColor: 'var(--border-medium)' }}>
                                    <option value="">Select calendar...</option>
                                    {calendars.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                  </select>
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                  <div>
                                    <label className="text-[9px] font-semibold text-txt-muted uppercase tracking-wider block mb-1">Date & Time (CT)</label>
                                    <input type="datetime-local" value={editFields.appointmentTime ?? ''}
                                      onChange={e => setEditFields(prev => ({ ...prev, appointmentTime: e.target.value }))}
                                      className="w-full bg-white border-[0.5px] rounded-[8px] px-3 py-1.5 text-[11px] text-txt-primary focus:outline-none"
                                      style={{ borderColor: 'var(--border-medium)' }} />
                                  </div>
                                  <div>
                                    <label className="text-[9px] font-semibold text-txt-muted uppercase tracking-wider block mb-1">Assigned To</label>
                                    <select value={editFields.assignedTo ?? call.assignedTo?.id ?? ''}
                                      onChange={e => setEditFields(prev => ({ ...prev, assignedTo: e.target.value }))}
                                      className="w-full bg-white border-[0.5px] rounded-[8px] px-3 py-1.5 text-[11px] text-txt-primary focus:outline-none"
                                      style={{ borderColor: 'var(--border-medium)' }}>
                                      <option value="">Select team member...</option>
                                      {teamMembers.map(m => <option key={m.userId} value={m.userId}>{m.name}</option>)}
                                    </select>
                                  </div>
                                </div>
                                <p className="text-[9px] text-txt-muted">All times in Central Time (America/Chicago)</p>
                              </>
                            )}

                            {/* ── GENERIC (update_task, etc.) ── */}
                            {!['add_note', 'create_task', 'check_off_task', 'change_stage', 'send_sms', 'schedule_sms', 'add_to_workflow', 'remove_from_workflow', 'create_appointment'].includes(step.type) && (
                              <div>
                                <label className="text-[9px] font-semibold text-txt-muted uppercase tracking-wider block mb-1">Action</label>
                                <input value={editFields.label ?? step.label}
                                  onChange={e => setEditFields(prev => ({ ...prev, label: e.target.value }))}
                                  className="w-full bg-white border-[0.5px] rounded-[8px] px-3 py-1.5 text-[11px] text-txt-primary focus:outline-none"
                                  style={{ borderColor: 'var(--border-medium)' }} />
                              </div>
                            )}

                            {/* AI Change Box — for all action types */}
                            <div>
                              <label className="text-[9px] font-semibold text-semantic-purple uppercase tracking-wider block mb-1">&#x2726; Tell AI what to change</label>
                              <div className="flex gap-1.5">
                                <input value={editFields.aiInstruction ?? ''}
                                  onChange={e => setEditFields(prev => ({ ...prev, aiInstruction: e.target.value }))}
                                  placeholder="e.g. Make it more urgent, change to next Tuesday..."
                                  className="flex-1 bg-white border-[0.5px] rounded-[8px] px-3 py-1.5 text-[11px] text-txt-primary focus:outline-none"
                                  style={{ borderColor: 'var(--border-medium)' }} />
                                <button
                                  onClick={async () => {
                                    if (!editFields.aiInstruction?.trim()) return
                                    try {
                                      const res = await fetch(`/api/${tenantSlug}/calls/${call.id}/ai-edit`, {
                                        method: 'POST', headers: { 'Content-Type': 'application/json' },
                                        body: JSON.stringify({ stepIndex: i, instruction: editFields.aiInstruction, currentLabel: editFields.label ?? step.label }),
                                      })
                                      if (res.ok) {
                                        const data = await res.json()
                                        if (data.newLabel) setEditFields(prev => ({ ...prev, label: data.newLabel, aiInstruction: '' }))
                                      }
                                    } catch {}
                                  }}
                                  className="text-[10px] font-semibold text-white bg-semantic-purple hover:bg-semantic-purple/80 px-3 py-1.5 rounded-[8px] shrink-0 transition-colors">
                                  Apply
                                </button>
                              </div>
                            </div>

                            <div className="flex gap-2 pt-1">
                              <button
                                onClick={() => {
                                  // Persist ALL edit-panel fields, not just label — defect #1 fix.
                                  // Fall back to existing step values when editFields didn't set a key.
                                  const updatedSteps = generatedSteps.map((s, si) => si === i ? {
                                    ...s,
                                    label: editFields.label ?? s.label,
                                    description: editFields.description ?? s.description,
                                    dueDate: editFields.dueDate ?? s.dueDate,
                                    assignedTo: editFields.assignedTo ?? s.assignedTo,
                                    stageId: editFields.stageId ?? s.stageId,
                                    pipelineId: editFields.pipelineId ?? s.pipelineId,
                                    smsBody: (s.type === 'send_sms' ? (editFields.label ?? s.smsBody) : s.smsBody),
                                  } : s)
                                  setGeneratedSteps(updatedSteps)
                                  fetch(`/api/${tenantSlug}/calls/${call.id}/actions`, {
                                    method: 'PATCH', headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ aiNextSteps: updatedSteps }),
                                  }).catch(() => {})
                                  setEditingStep(null)
                                  setEditFields({})
                                }}
                                className="text-[10px] font-semibold text-white bg-gunner-red px-3 py-1.5 rounded-[8px]"
                              >Save Changes</button>
                              <button onClick={() => { setEditingStep(null); setEditFields({}) }}
                                className="text-[10px] text-txt-secondary px-3 py-1">Cancel</button>
                            </div>
                          </div>
                        )}

                        <div className="flex items-center gap-3">
                          <button
                            onClick={() => {
                              // High-stakes (send_sms, change_stage) route through the
                              // confirmation modal; everything else stays single-click.
                              if (HIGH_STAKES_TYPES.has(step.type)) {
                                setConfirmModalStep(i)
                              } else {
                                pushStep(i)
                              }
                            }}
                            disabled={actionLoading === `step-${i}`}
                            className="flex items-center gap-1.5 bg-gunner-red hover:bg-gunner-red-dark text-white text-[12px] font-semibold px-3 py-1.5 rounded-[10px] transition-colors"
                          >
                            {actionLoading === `step-${i}` ? <Loader2 size={10} className="animate-spin" /> : <Send size={10} />}
                            Push to CRM
                          </button>
                          <button onClick={() => {
                            if (isEditing) { setEditingStep(null); setEditFields({}); return }
                            // Pre-populate fields based on action type
                            const fields: Record<string, string> = { label: step.label }
                            if (step.type === 'create_task' || step.type === 'check_off_task') {
                              fields.assignedTo = call.assignedTo?.id ?? ''
                              fields.description = step.reasoning ?? ''
                              // Default due date: tomorrow
                              const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1)
                              fields.dueDate = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, '0')}-${String(tomorrow.getDate()).padStart(2, '0')}`
                            }
                            if (step.type === 'send_sms' || step.type === 'schedule_sms') {
                              fields.fromUser = call.assignedTo?.id ?? ''
                            }
                            setEditingStep(i)
                            setEditFields(fields)
                          }}
                            className="text-[12px] text-txt-secondary hover:text-txt-primary">
                            {isEditing ? 'Close' : 'Edit'}
                          </button>
                          <button onClick={() => skipStep(i)} className="text-[12px] text-txt-secondary hover:text-txt-primary">Skip</button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}

              {/* Pushed actions — dimmed, at bottom */}
              {generatedSteps.filter(s => s.status === 'pushed').length > 0 && (
                <div>
                  <p className="text-[10px] font-medium tracking-[0.08em] text-txt-muted uppercase mb-2 flex items-center gap-1">
                    <Clock size={10} /> Actions Taken ({generatedSteps.filter(s => s.status === 'pushed').length} pushed)
                  </p>
                  <div className="space-y-2 opacity-60">
                    {generatedSteps.map((step, i) => {
                      if (step.status !== 'pushed') return null
                      const stepDef = STEP_ICONS[step.type] ?? STEP_ICONS.add_note
                      const StepIcon = stepDef.icon
                      return (
                        <div key={i} className="bg-surface-tertiary border-[0.5px] rounded-[14px] p-4" style={{ borderColor: 'var(--border-light)' }}>
                          <div className="flex items-center gap-2 mb-1">
                            <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${stepDef.bg} ${stepDef.color}`}>
                              <StepIcon size={10} className="inline mr-1" />
                              {stepDef.label}
                            </span>
                            <span className="text-[11px] font-medium text-semantic-green bg-semantic-green-bg px-2 py-0.5 rounded-full">&#x2713; Pushed</span>
                          </div>
                          <p className="text-[13px] text-txt-secondary">{step.label}</p>
                          {step.pushedAt && (
                            <p className="text-[11px] text-txt-muted mt-1">Pushed {format(new Date(step.pushedAt), "MMM d 'at' h:mm a")}</p>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* AI recommended action (from grading) */}
              {call.nextBestAction && generatedSteps.length === 0 && !showAddAction && (
                <div className="bg-semantic-purple-bg/30 border-[0.5px] rounded-[14px] p-5" style={{ borderColor: 'var(--border-light)', borderLeft: '3px solid var(--purple)' }}>
                  <h3 className="text-[14px] font-semibold text-semantic-purple flex items-center gap-2 mb-2">
                    <Zap size={14} /> AI Recommended Action
                    <span className="text-[11px] font-medium bg-semantic-purple-bg px-2 py-0.5 rounded-full">&#x2726; AI</span>
                  </h3>
                  <p className="text-[13px] text-txt-secondary">{call.nextBestAction}</p>
                </div>
              )}
            </div>
          )}

          {/* ── PROPERTY TAB ───────────────────────────────────────── */}
          {tab === 'property' && (
            <PropertyDataTab call={call} tenantSlug={tenantSlug} onPendingCount={setPropertyPendingCount} />
          )}
        </div>
      </div>

      {/* Feedback modal */}
      {showFeedback && <FeedbackModal callId={call.id} tenantSlug={tenantSlug} onClose={() => setShowFeedback(false)} />}

      {/* High-stakes action confirm modal — single instance for the whole page */}
      {confirmModalStep !== null && (() => {
        const step = generatedSteps[confirmModalStep]
        if (!step) return null
        return (
          <ConfirmActionModal
            open
            onCancel={() => { if (!isPushing) setConfirmModalStep(null) }}
            onConfirm={async () => {
              setIsPushing(true)
              try {
                await pushStep(confirmModalStep)
              } finally {
                setIsPushing(false)
                setConfirmModalStep(null)
              }
            }}
            actionType={step.type}
            preview={buildPreview(step, call, pipelines)}
            isProcessing={isPushing}
            danger
          />
        )
      })()}
    </div>
  )
}

// ─── Sub-components ─────────────────────────────────────────────────────────

function Pill({ children, icon, color }: { children: React.ReactNode; icon?: React.ReactNode; color?: string }) {
  return (
    <span className={`inline-flex items-center gap-1 text-[11px] font-medium px-2.5 py-1 rounded-full border-[0.5px] ${
      color ?? 'border-[rgba(0,0,0,0.14)] text-txt-secondary'
    }`}>
      {icon} {children}
    </span>
  )
}

function EmptyState({ icon, message, sub }: { icon: React.ReactNode; message: string; sub?: string }) {
  return (
    <div className="bg-surface-primary border-[0.5px] rounded-[14px] p-8 text-center" style={{ borderColor: 'var(--border-light)' }}>
      <div className="text-txt-muted mx-auto mb-3 flex justify-center">{icon}</div>
      <p className="text-[13px] text-txt-secondary">{message}</p>
      {sub && <p className="text-[11px] text-txt-muted mt-1">{sub}</p>}
    </div>
  )
}

function FeedbackModal({ callId, tenantSlug, onClose }: { callId: string; tenantSlug: string; onClose: () => void }) {
  const [type, setType] = useState('general_correction')
  const [details, setDetails] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  async function submit() {
    if (details.length < 10) return
    setSubmitting(true)
    await fetch(`/api/${tenantSlug}/calls/${callId}/feedback`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, details }),
    }).catch(() => {})
    setSubmitting(false)
    setSubmitted(true)
    setTimeout(onClose, 1500)
  }

  const feedbackTypes = ['score_too_high', 'score_too_low', 'wrong_criteria', 'missed_issue', 'incorrect_feedback', 'general_correction', 'praise']

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-surface-primary border-[0.5px] rounded-[20px] p-6 w-full max-w-md shadow-ds-float" style={{ borderColor: 'var(--border-light)' }} onClick={e => e.stopPropagation()}>
        {submitted ? (
          <div className="text-center py-4">
            <CheckCircle size={24} className="text-semantic-green mx-auto mb-2" />
            <p className="text-[13px] text-txt-primary">Thank you — feedback submitted</p>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-[15px] font-semibold text-txt-primary">Submit Feedback</h3>
              <button onClick={onClose} className="text-txt-muted hover:text-txt-primary"><X size={14} /></button>
            </div>
            <select value={type} onChange={e => setType(e.target.value)}
              className="w-full bg-surface-secondary border-[0.5px] rounded-[10px] px-3 py-2 text-[13px] text-txt-primary mb-3 focus:outline-none"
              style={{ borderColor: 'var(--border-medium)' }}>
              {feedbackTypes.map(t => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
            </select>
            <textarea value={details} onChange={e => setDetails(e.target.value)} rows={4}
              placeholder="Describe the issue (min 10 characters)..."
              className="w-full bg-surface-secondary border-[0.5px] rounded-[10px] px-3 py-2 text-[13px] text-txt-primary placeholder:text-txt-muted mb-3 focus:outline-none resize-none"
              style={{ borderColor: 'var(--border-medium)' }} />
            <div className="flex gap-2 justify-end">
              <button onClick={onClose} className="text-[13px] font-medium text-txt-primary bg-surface-secondary border-[0.5px] rounded-[10px] px-4 py-[9px]" style={{ borderColor: 'var(--border-medium)' }}>Cancel</button>
              <button onClick={submit} disabled={details.length < 10 || submitting}
                className="text-[13px] font-semibold bg-gunner-red hover:bg-gunner-red-dark disabled:opacity-40 text-white px-4 py-[9px] rounded-[10px]">
                {submitting ? 'Submitting...' : 'Submit Feedback'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

interface DealIntelChange {
  field: string; label: string; category: string
  currentValue: unknown; proposedValue: unknown
  confidence: 'high' | 'medium' | 'low'; evidence: string
  updateType: 'overwrite' | 'accumulate'
  decision?: 'approved' | 'edited' | 'skipped' | 'auto_approved'
  editedValue?: unknown; decidedAt?: string
}

const CATEGORY_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  seller_profile:      { bg: 'bg-blue-50',    text: 'text-blue-700',    label: 'Seller Profile' },
  decision_making:     { bg: 'bg-purple-50',  text: 'text-purple-700',  label: 'Decision Making' },
  price_negotiation:   { bg: 'bg-green-50',   text: 'text-green-700',   label: 'Price Negotiation' },
  property_condition:  { bg: 'bg-amber-50',   text: 'text-amber-700',   label: 'Property Condition' },
  legal_title:         { bg: 'bg-red-50',     text: 'text-red-700',     label: 'Legal & Title' },
  communication_intel: { bg: 'bg-teal-50',    text: 'text-teal-700',    label: 'Communication' },
  deal_status:         { bg: 'bg-orange-50',  text: 'text-orange-700',  label: 'Deal Status' },
  marketing:           { bg: 'bg-pink-50',    text: 'text-pink-700',    label: 'Marketing' },
}

// Field info tooltips — explains what each deal intel field means
const FIELD_INFO: Record<string, string> = {
  sellerMotivationLevel: 'How motivated is the seller to sell (1=low, 10=desperate)',
  sellerMotivationReason: 'The primary reason driving seller to sell',
  sellerTimeline: 'When the seller wants/needs to close',
  timelineUrgency: 'How urgent is the timeline (Urgent / Moderate / Low)',
  sellerKnowledgeLevel: 'How well does seller understand the process',
  sellerCommunicationStyle: 'How the seller prefers to communicate',
  sellerContactPreference: 'Best way to reach this seller',
  decisionMakers: 'Who needs to approve the deal',
  decisionMakersConfirmed: 'Have all decision makers been identified',
  documentReadiness: 'Are docs ready for closing',
  sellerAskingHistory: 'History of seller price expectations',
  competingOffers: 'Other offers seller has received',
  conditionNotesFromSeller: 'Property condition as described by seller',
  tenantSituation: 'Current tenant status if occupied',
  titleIssuesMentioned: 'Title problems mentioned by seller',
  liensMentioned: 'Liens or encumbrances on the property',
  whatNotToSay: 'Topics or phrases to avoid with this seller',
  rollingDealSummary: 'Current state of the deal negotiations',
  relationshipRapportLevel: 'Quality of relationship with seller',
  howTheyFoundUs: 'Marketing channel that brought this lead',
}

// Fields that should be dropdowns instead of free text
const FIELD_OPTIONS: Record<string, string[]> = {
  sellerMotivationLevel: ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10'],
  timelineUrgency: ['Urgent', 'Moderate', 'Low', 'Unknown'],
  sellerKnowledgeLevel: ['High', 'Medium', 'Low'],
  sellerCommunicationStyle: ['Direct', 'Conversational', 'Guarded', 'Emotional', 'Analytical'],
  sellerContactPreference: ['Phone', 'Text', 'Email', 'In Person'],
  decisionMakersConfirmed: ['Yes', 'No', 'Partially'],
  documentReadiness: ['Ready', 'Partial', 'Not Ready', 'Unknown'],
  relationshipRapportLevel: ['Strong', 'Good', 'Neutral', 'Weak', 'Hostile'],
  sellerPreviousInvestorContact: ['Yes', 'No', 'Unknown'],
  previousDealFellThrough: ['Yes', 'No', 'Unknown'],
}

function PropertyDataTab({ call, tenantSlug, onPendingCount }: { call: CallDetail; tenantSlug: string; onPendingCount?: (count: number) => void }) {
  const [changes, setChanges] = useState<DealIntelChange[]>([])
  const [loading, setLoading] = useState(true)
  const [acting, setActing] = useState<string | null>(null)
  const [editingField, setEditingField] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const { toast } = useToast()

  // Load deal intel changes for this call
  useEffect(() => {
    fetch(`/api/${tenantSlug}/calls/${call.id}/deal-intel`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.changes) {
          setChanges(data.changes)
          const pendingCount = (data.changes as DealIntelChange[]).filter((c: DealIntelChange) => !c.decision).length
          onPendingCount?.(pendingCount)
        }
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [tenantSlug, call.id])

  async function handleDecision(field: string, decision: 'approved' | 'edited' | 'skipped') {
    setActing(field)
    try {
      const res = await fetch(`/api/${tenantSlug}/calls/${call.id}/deal-intel`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          field,
          decision,
          editedValue: decision === 'edited' ? editValue : undefined,
        }),
      })
      if (res.ok) {
        setChanges(prev => prev.map(c => c.field === field ? {
          ...c,
          decision,
          editedValue: decision === 'edited' ? editValue : undefined,
          decidedAt: new Date().toISOString(),
        } : c))
        setEditingField(null)
        // Update pending count
        const newPending = changes.filter(c => c.field !== field && !c.decision).length
        onPendingCount?.(newPending)
        toast(decision === 'skipped' ? 'Skipped' : `Updated ${field}`, 'success')
      }
    } catch { toast('Failed', 'error') }
    setActing(null)
  }

  async function approveAll() {
    const pending = changes.filter(c => !c.decision)
    setActing('all')
    for (const c of pending) {
      await fetch(`/api/${tenantSlug}/calls/${call.id}/deal-intel`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ field: c.field, decision: 'approved' }),
      }).catch(() => {})
    }
    setChanges(prev => prev.map(c => !c.decision ? { ...c, decision: 'approved', decidedAt: new Date().toISOString() } : c))
    setActing(null)
    onPendingCount?.(0)
    toast(`Approved ${pending.length} updates`, 'success')
  }

  const pending = changes.filter(c => !c.decision)
  const decided = changes.filter(c => c.decision)

  // Group pending by category
  const grouped: Record<string, DealIntelChange[]> = {}
  for (const c of pending) {
    const cat = c.category || 'deal_status'
    if (!grouped[cat]) grouped[cat] = []
    grouped[cat].push(c)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[14px] font-medium text-txt-primary">Deal Intelligence from Call</p>
          <p className="text-[12px] text-txt-muted">AI-extracted data points — approve, edit, or skip each</p>
        </div>
        <div className="flex items-center gap-2">
          {pending.length > 0 && (
            <button onClick={approveAll} disabled={acting === 'all'}
              className="flex items-center gap-1.5 bg-gunner-red hover:bg-gunner-red-dark text-white text-[11px] font-semibold px-3 py-1.5 rounded-[10px] transition-colors">
              {acting === 'all' ? <Loader2 size={10} className="animate-spin" /> : <CheckCircle size={10} />}
              Approve All ({pending.length})
            </button>
          )}
        </div>
      </div>

      {!call.property && <EmptyState icon={<Home size={24} />} message="No property linked to this call" />}

      {loading && call.property && (
        <div className="flex items-center justify-center py-8 gap-2 text-txt-muted">
          <Loader2 size={14} className="animate-spin" /> Loading deal intelligence...
        </div>
      )}

      {!loading && changes.length === 0 && call.property && (
        <EmptyState icon={<Sparkles size={24} />} message="No deal intelligence extracted from this call" sub="This may mean the call didn't contain property-related information, or extraction is still processing." />
      )}

      {/* Pending changes grouped by category */}
      {Object.entries(grouped).map(([cat, items]) => {
        const catConfig = CATEGORY_COLORS[cat] ?? CATEGORY_COLORS.deal_status
        return (
          <div key={cat} className="bg-surface-primary border-[0.5px] rounded-[14px] overflow-hidden" style={{ borderColor: 'var(--border-light)' }}>
            {/* Category header */}
            <div className={`${catConfig.bg} px-4 py-2 border-b-[0.5px] flex items-center gap-2`} style={{ borderColor: 'var(--border-light)' }}>
              <span className={`text-[10px] font-bold uppercase tracking-wider ${catConfig.text}`}>
                {catConfig.label}
              </span>
              <span className="text-[9px] text-txt-muted bg-white/60 px-1.5 py-0.5 rounded-full">{items.length}</span>
            </div>
            <div className="divide-y" style={{ borderColor: 'var(--border-light)' }}>
              {items.map(c => {
                const isEditing = editingField === c.field
                const fieldInfo = FIELD_INFO[c.field]
                const selectOptions = FIELD_OPTIONS[c.field]
                return (
                  <div key={c.field} className="px-4 py-3">
                    {/* Title row: label + info icon + confidence */}
                    <div className="flex items-center gap-1.5 mb-1">
                      <span className={`text-[11px] font-semibold ${catConfig.text}`}>{c.label}</span>
                      {fieldInfo && (
                        <span className="group relative">
                          <Info size={10} className="text-txt-muted cursor-help" />
                          <span className="hidden group-hover:block absolute bottom-full left-1/2 -translate-x-1/2 mb-1 bg-gray-900 text-white text-[9px] px-2 py-1 rounded-[6px] whitespace-nowrap z-10 shadow-lg">
                            {fieldInfo}
                          </span>
                        </span>
                      )}
                      <span className={`ml-auto text-[8px] font-bold px-1.5 py-0.5 rounded-full ${
                        c.confidence === 'high' ? 'bg-green-100 text-green-700'
                        : c.confidence === 'medium' ? 'bg-amber-100 text-amber-700'
                        : 'bg-gray-100 text-gray-600'
                      }`}>{c.confidence}</span>
                    </div>

                    {/* Current value — muted, smaller */}
                    {c.currentValue != null && (
                      <p className="text-[9px] text-txt-muted mb-1">was: {typeof c.currentValue === 'object' ? JSON.stringify(c.currentValue) : String(c.currentValue)}</p>
                    )}

                    {/* Proposed/Edit value */}
                    {isEditing ? (
                      selectOptions ? (
                        <select value={editValue} onChange={e => setEditValue(e.target.value)}
                          className="w-full bg-white border-[0.5px] rounded-[6px] px-2.5 py-1.5 text-[11px] text-txt-primary mt-0.5 focus:outline-none"
                          style={{ borderColor: 'var(--border-medium)' }}>
                          {selectOptions.map(o => <option key={o} value={o}>{o}</option>)}
                        </select>
                      ) : (
                        <textarea value={editValue} onChange={e => setEditValue(e.target.value)} rows={2}
                          className="w-full bg-white border-[0.5px] rounded-[6px] px-2.5 py-1.5 text-[11px] text-txt-primary mt-0.5 focus:outline-none resize-none"
                          style={{ borderColor: 'var(--border-medium)' }} />
                      )
                    ) : (
                      Array.isArray(c.proposedValue) ? (
                        <div className="flex flex-wrap gap-1 mt-0.5">
                          {(c.proposedValue as string[]).map((item, idx) => (
                            <span key={idx} className={`text-[9px] font-medium px-2 py-0.5 rounded-full ${catConfig.bg} ${catConfig.text}`}>
                              {String(item)}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <p className="text-[11px] text-txt-primary font-medium leading-snug">
                          {String(c.proposedValue)}
                          {/* Add call date context for time-relative fields */}
                          {(c.field.includes('deadline') || c.field.includes('Deadline') || c.field.includes('timeline') || c.field.includes('Timeline')) && call.calledAt && (
                            <span className="text-[9px] text-txt-muted ml-1.5">(call: {format(new Date(call.calledAt), 'MMM d, yyyy')})</span>
                          )}
                        </p>
                      )
                    )}

                    {/* Evidence quote — compact */}
                    {c.evidence && !isEditing && (
                      <p className="text-[9px] text-txt-muted italic mt-1 pl-2 border-l-2 border-gray-200">{c.evidence}</p>
                    )}

                    {/* Action buttons — tighter */}
                    <div className="flex items-center gap-2 mt-2">
                      <button onClick={() => handleDecision(c.field, isEditing ? 'edited' : 'approved')}
                        disabled={acting === c.field}
                        className="flex items-center gap-1 bg-semantic-green hover:opacity-90 text-white text-[10px] font-semibold px-2 py-1 rounded-[6px]">
                        {acting === c.field ? <Loader2 size={8} className="animate-spin" /> : <CheckCircle size={8} />}
                        {isEditing ? 'Save' : 'Approve'}
                      </button>
                      <button onClick={() => {
                        if (isEditing) { setEditingField(null); return }
                        setEditingField(c.field)
                        // Arrays → comma-separated for easier editing; objects → JSON; else string
                        setEditValue(
                          Array.isArray(c.proposedValue) ? (c.proposedValue as string[]).join(', ')
                          : typeof c.proposedValue === 'object' ? JSON.stringify(c.proposedValue)
                          : String(c.proposedValue)
                        )
                      }} className="text-[10px] font-medium text-txt-secondary hover:text-txt-primary">
                        {isEditing ? 'Cancel' : 'Edit'}
                      </button>
                      <button onClick={() => handleDecision(c.field, 'skipped')}
                        className="text-[10px] text-txt-muted hover:text-txt-secondary">Skip</button>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}

      {/* Decided changes — compact list at bottom */}
      {decided.length > 0 && (
        <div>
          <p className="text-[10px] font-medium tracking-wider text-txt-muted uppercase mb-2">
            Processed ({decided.length})
          </p>
          <div className="space-y-1 opacity-60">
            {decided.map(c => (
              <div key={c.field} className="flex items-center gap-2 text-[11px] px-3 py-1.5 bg-surface-tertiary rounded-[8px]">
                <span className={c.decision === 'skipped' ? 'text-txt-muted line-through' : 'text-semantic-green'}>
                  {c.decision === 'approved' ? '✓' : c.decision === 'edited' ? '✎' : '✗'}
                </span>
                <span className="text-txt-secondary">{c.label}</span>
                <span className="text-txt-muted ml-auto">{c.decision}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function TranscriptView({ transcript, searchQuery, repName, contactName, direction }: {
  transcript: string; searchQuery: string
  repName?: string; contactName?: string; direction?: string
}) {
  // Map generic speaker labels to real names
  // For outbound calls: Speaker 0 = Rep, Speaker 1 = Contact
  // For inbound calls: Speaker 0 = Contact, Speaker 1 = Rep
  const isOutbound = direction === 'OUTBOUND'
  function mapSpeaker(raw: string): string {
    if (raw === 'Speaker 0') return isOutbound ? (repName ?? 'Rep') : (contactName ?? 'Seller')
    if (raw === 'Speaker 1') return isOutbound ? (contactName ?? 'Seller') : (repName ?? 'Rep')
    if (/^Speaker \d+$/.test(raw)) {
      const num = parseInt(raw.split(' ')[1])
      return num % 2 === 0 ? (isOutbound ? (repName ?? 'Rep') : (contactName ?? 'Seller')) : (isOutbound ? (contactName ?? 'Seller') : (repName ?? 'Rep'))
    }
    if (raw.toLowerCase() === 'rep' || raw.toLowerCase() === 'agent') return repName ?? 'Rep'
    if (raw.toLowerCase() === 'seller' || raw.toLowerCase() === 'customer') return contactName ?? 'Seller'
    return raw
  }
  // Parse transcript into speaker turns — handles both pre-formatted (line-per-turn)
  // and raw Deepgram output (single block, speaker labels inline or missing)
  const speakerPattern = /(?:^|\n)(Speaker \d+|Rep|Seller|Agent|Customer|Unknown|[A-Z][a-z]+ ?[A-Z]?[a-z]*):\s*/gi

  let turns: Array<{ speaker: string | null; text: string }> = []
  const rawLines = transcript.split('\n').filter(l => l.trim())

  if (rawLines.length > 3) {
    // Multi-line transcript — parse each line for speaker labels
    for (const line of rawLines) {
      const match = line.match(/^(Speaker \d+|Rep|Seller|Agent|Customer|Unknown|[A-Z][a-z]+ ?[A-Z]?[a-z]*):\s*/i)
      const speaker = match?.[1] ?? null
      const content = speaker ? line.substring(match![0].length).trim() : line.trim()
      if (content) turns.push({ speaker, text: content })
    }
  } else {
    // Single block or very few lines — try to split on inline speaker labels
    const fullText = rawLines.join(' ')
    const parts = fullText.split(speakerPattern).filter(Boolean)

    if (parts.length > 1) {
      // Has inline speaker labels — pair them up
      for (let i = 0; i < parts.length; i++) {
        const part = parts[i].trim()
        if (!part) continue
        const nextPart = parts[i + 1]?.trim()
        if (nextPart && /^(Speaker \d+|Rep|Seller|Agent|Customer|Unknown|[A-Z][a-z]+ ?[A-Z]?[a-z]*)$/i.test(part)) {
          turns.push({ speaker: part, text: nextPart })
          i++ // skip the content part
        } else {
          turns.push({ speaker: null, text: part })
        }
      }
    } else {
      // No speaker labels at all — break long text into ~3-sentence chunks and alternate speakers
      const sentences = fullText.match(/[^.!?]+[.!?]+/g) ?? [fullText]
      let chunk = ''
      let speakerIdx = 0
      for (let i = 0; i < sentences.length; i++) {
        chunk += sentences[i]
        if ((i + 1) % 3 === 0 || i === sentences.length - 1) {
          turns.push({ speaker: `Speaker ${speakerIdx}`, text: chunk.trim() })
          chunk = ''
          speakerIdx = speakerIdx === 0 ? 1 : 0
        }
      }
    }
  }

  // Remove empty turns
  turns = turns.filter(t => t.text.length > 0)

  const filtered = searchQuery
    ? turns.filter(t => t.text.toLowerCase().includes(searchQuery.toLowerCase()))
    : turns

  if (searchQuery && filtered.length === 0) {
    return <p className="text-[11px] text-txt-muted">No matches for &ldquo;{searchQuery}&rdquo;</p>
  }

  return (
    <div className="space-y-3">
      {searchQuery && <p className="text-[10px] text-txt-muted mb-2">{filtered.length} matches</p>}
      {filtered.map((turn, i) => {
        const displayName = turn.speaker ? mapSpeaker(turn.speaker) : null
        const isRep = displayName === (repName ?? 'Rep') || turn.speaker?.toLowerCase().includes('rep') || turn.speaker?.toLowerCase().includes('agent')

        return (
          <div key={i} className="flex gap-2">
            {displayName && (
              <div className={`shrink-0 w-[70px] text-right pt-0.5`}>
                <span className={`text-[10px] font-semibold ${isRep ? 'text-semantic-blue' : 'text-gunner-red'}`}>
                  {displayName}
                </span>
              </div>
            )}
            <div className={`flex-1 ${displayName ? 'border-l-2 pl-3' : ''} ${isRep ? 'border-semantic-blue/20' : 'border-gunner-red/20'}`}>
              <p className="text-[11px] text-txt-secondary leading-relaxed">
                {searchQuery ? highlightText(turn.text, searchQuery) : turn.text}
              </p>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function highlightText(text: string, query: string): React.ReactNode {
  const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi')
  const parts = text.split(regex)
  return parts.map((part, i) =>
    regex.test(part)
      ? <mark key={i} className="bg-semantic-amber-bg text-semantic-amber rounded px-0.5">{part}</mark>
      : part
  )
}
