'use client'
// components/ui/coach-sidebar.tsx
// Role Assistant sidebar — the AI backbone of the entire site
// Dynamic name from user role. Daily persistent context. Full knowledge.
// Can execute actions via tool use with user approval.
//
// Propose → Edit → Confirm flow (Blocker #2 / Prompt 4):
//   Mirrors call-detail's next-steps UI for the AI Assistant surface. The
//   Edit button toggles an inline edit panel; user-supplied overrides are
//   kept in `editedInputs[toolCallId]` and POSTed as `editedInput` to
//   /api/ai/assistant/execute. High-stakes types (send_sms, send_email,
//   change_pipeline_stage, create_contact, update_contact, create_opportunity)
//   route through ConfirmActionModal before execution.

import { useState, useRef, useEffect, useCallback } from 'react'
import { usePathname } from 'next/navigation'
import { Bot, Send, Sparkles, Zap, Loader2, X, CheckCircle, XCircle, Pencil } from 'lucide-react'
import { ConfirmActionModal } from '@/components/ui/confirm-action-modal'

interface AssistantMessage {
  role: 'user' | 'assistant'
  content: string
  toolCalls?: ToolCall[]
}

interface ToolCall {
  id: string
  name: string
  input: Record<string, unknown>
  status: 'pending' | 'approved' | 'rejected' | 'edited'
  result?: string
}

const ROLE_NAMES: Record<string, string> = {
  OWNER: 'Admin',
  ADMIN: 'Admin',
  TEAM_LEAD: 'Team Lead',
  LEAD_MANAGER: 'LM',
  ACQUISITION_MANAGER: 'AM',
  DISPOSITION_MANAGER: 'Dispo',
  LEAD_GENERATOR: 'LG',
}

// Which action types route through the confirmation modal before executing.
// Mirrors call-detail HIGH_STAKES_TYPES, expanded for the assistant's
// broader action surface (audit rows 1-7 of ACTION_EXECUTION_AUDIT.md).
const HIGH_STAKES_TYPES = new Set([
  'send_sms',
  'send_email',
  'change_pipeline_stage',
  'create_contact',
  'update_contact',
  'create_opportunity',
])

type PipelineList = Array<{ id: string; name: string; stages: Array<{ id: string; name: string }> }>
type TeamMember = { name: string; phone: string | null; userId: string }

function lookupStageName(stageId: string | undefined, pipelines: PipelineList): string | null {
  if (!stageId || !pipelines || pipelines.length === 0) return null
  for (const p of pipelines) {
    const stage = p.stages?.find(s => s.id === stageId)
    if (stage) return stage.name
  }
  return null
}

// Build the preview object the confirm modal renders. Pure function — no DB
// calls, no lookups beyond the already-loaded `pipelines` state.
function buildPreview(
  toolCall: ToolCall,
  merged: Record<string, unknown>,
  pipelines: PipelineList,
): {
  title: string
  recipientLabel?: string
  bodyPreview?: string
  beforeAfter?: { label: string; before: string; after: string }
} {
  if (toolCall.name === 'send_sms') {
    return {
      title: `Send SMS to ${String(merged.contactName ?? 'contact')}`,
      recipientLabel: merged.contactName ? `To: ${String(merged.contactName)}` : undefined,
      bodyPreview: String(merged.message ?? ''),
    }
  }
  if (toolCall.name === 'send_email') {
    const subject = String(merged.subject ?? '')
    const body = String(merged.body ?? '')
    return {
      title: `Send email to ${String(merged.contactName ?? 'contact')}`,
      recipientLabel: merged.contactName ? `To: ${String(merged.contactName)}` : undefined,
      bodyPreview: `Subject: ${subject}\n\n${body}`,
    }
  }
  if (toolCall.name === 'change_pipeline_stage') {
    const after = lookupStageName(merged.stageId as string | undefined, pipelines)
      || (merged.stageId ? String(merged.stageId) : 'unknown')
    return {
      title: 'Change pipeline stage',
      beforeAfter: { label: 'Pipeline stage', before: 'current stage', after },
    }
  }
  if (toolCall.name === 'create_contact') {
    const fullName = `${String(merged.firstName ?? '')} ${String(merged.lastName ?? '')}`.trim()
    const parts = [
      fullName && `Name: ${fullName}`,
      merged.phone ? `Phone: ${String(merged.phone)}` : '',
      merged.email ? `Email: ${String(merged.email)}` : '',
    ].filter(Boolean)
    return {
      title: 'Create new GHL contact',
      bodyPreview: parts.join('\n'),
    }
  }
  if (toolCall.name === 'update_contact') {
    const parts = ['firstName', 'lastName', 'phone', 'email', 'tags']
      .filter(k => merged[k] !== undefined && merged[k] !== '')
      .map(k => `${k}: ${Array.isArray(merged[k]) ? (merged[k] as unknown[]).join(', ') : String(merged[k])}`)
    return {
      title: `Update contact ${String(merged.contactName ?? '')}`.trim(),
      bodyPreview: parts.length > 0 ? parts.join('\n') : 'No changes',
    }
  }
  if (toolCall.name === 'create_opportunity') {
    const after = lookupStageName(merged.stageId as string | undefined, pipelines)
      || (merged.stageId ? String(merged.stageId) : 'unknown')
    return {
      title: `Create opportunity: ${String(merged.dealName ?? 'New Deal')}`,
      beforeAfter: { label: 'Opportunity stage', before: '(new)', after },
    }
  }
  return { title: toolCall.name.replace(/_/g, ' ') }
}

export function CoachSidebar() {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<AssistantMessage[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [userRole, setUserRole] = useState('')
  const [loadedSession, setLoadedSession] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const pathname = usePathname()

  // Edit/confirm state — keyed by toolCall.id (unique across messages).
  // editedInputs holds ONLY user-diffed fields — not a full copy of tc.input —
  // so server can detect wasEdited by Object.keys length.
  const [editingToolCallId, setEditingToolCallId] = useState<string | null>(null)
  const [editedInputs, setEditedInputs] = useState<Record<string, Record<string, unknown>>>({})
  const [confirmModalToolCallId, setConfirmModalToolCallId] = useState<string | null>(null)
  const [isPushing, setIsPushing] = useState(false)

  // Dropdown data — fetched once on first sidebar open.
  const [pipelines, setPipelines] = useState<PipelineList>([])
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([])
  const [dropdownsLoaded, setDropdownsLoaded] = useState(false)

  const roleName = ROLE_NAMES[userRole] ?? userRole?.replace(/_/g, ' ') ?? 'AI'
  const assistantName = `${roleName} Assistant`

  // Extract page context from URL
  const getPageContext = useCallback(() => {
    if (!pathname) return 'unknown'
    const parts = pathname.split('/')
    if (parts.includes('inventory') && parts.length > 3) return `property:${parts[parts.length - 1]}`
    if (parts.includes('calls') && parts.length > 3) return `call:${parts[parts.length - 1]}`
    if (parts.includes('tasks') || parts.includes('day-hub')) return 'dayhub'
    if (parts.includes('inventory')) return 'inventory'
    if (parts.includes('calls')) return 'calls'
    if (parts.includes('buyers')) return 'buyers'
    if (parts.includes('settings')) return 'settings'
    if (parts.includes('kpis')) return 'kpis'
    return 'home'
  }, [pathname])

  // Load session messages (daily persistence)
  useEffect(() => {
    if (!open || loadedSession) return
    fetch('/api/ai/assistant/session')
      .then(r => r.json())
      .then(d => {
        if (d.messages?.length > 0) {
          setMessages(d.messages.map((m: { role: string; content: string; toolCalls?: ToolCall[] }) => ({
            role: m.role as 'user' | 'assistant',
            content: m.content,
            toolCalls: m.toolCalls,
          })))
        }
        if (d.userRole) setUserRole(d.userRole)
        setLoadedSession(true)
      })
      .catch(() => setLoadedSession(true))
  }, [open, loadedSession])

  // Load dropdown data once — pipelines for change_pipeline_stage /
  // create_opportunity stage selectors; team members for assignedTo.
  // Team-numbers endpoint is tenant-scoped via the URL slug; gracefully
  // noop if we can't derive a slug (e.g. on /login).
  useEffect(() => {
    if (!open || dropdownsLoaded) return
    setDropdownsLoaded(true)
    fetch('/api/ghl/pipelines').then(r => r.json())
      .then(d => setPipelines(d.pipelines ?? []))
      .catch(() => {})
    const slugMatch = pathname?.match(/^\/([^/]+)/)
    if (slugMatch) {
      fetch(`/api/${slugMatch[1]}/dayhub/team-numbers`).then(r => r.json())
        .then(d => setTeamMembers(d.numbers ?? []))
        .catch(() => {})
    }
  }, [open, dropdownsLoaded, pathname])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function send(text?: string) {
    const content = (text ?? input).trim()
    if (!content || loading) return
    const userMsg: AssistantMessage = { role: 'user', content }
    const newMessages = [...messages, userMsg]
    setMessages(newMessages)
    setInput('')
    setLoading(true)
    try {
      const res = await fetch('/api/ai/assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: content,
          pageContext: getPageContext(),
        }),
      })
      const data = await res.json()
      if (data.reply) {
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: data.reply,
          toolCalls: data.toolCalls,
        }])
      }
      if (data.userRole) setUserRole(data.userRole)
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Sorry, I had trouble connecting. Try again.' }])
    }
    setLoading(false)
  }

  // `merged` is what the user sees in the card AND what the preview modal reads.
  // Server receives only `editedInputs[id]` (user-diffed keys) and re-merges
  // over the AI's original — kept consistent with call-detail's contract.
  function mergedFor(tc: ToolCall): Record<string, unknown> {
    return { ...tc.input, ...(editedInputs[tc.id] ?? {}) }
  }

  function patchEdit(toolId: string, patch: Record<string, unknown>) {
    setEditedInputs(prev => ({ ...prev, [toolId]: { ...(prev[toolId] ?? {}), ...patch } }))
  }

  function findToolCall(toolId: string): { msgIndex: number; toolCall: ToolCall } | null {
    for (let i = 0; i < messages.length; i++) {
      const tc = messages[i].toolCalls?.find(t => t.id === toolId)
      if (tc) return { msgIndex: i, toolCall: tc }
    }
    return null
  }

  async function executeToolCall(msgIndex: number, toolId: string) {
    const edited = editedInputs[toolId]
    const payload: Record<string, unknown> = {
      toolCallId: toolId,
      pageContext: getPageContext(),
    }
    // Only include editedInput if the user actually diffed at least one key.
    // Keeps server's wasEdited flag honest and matches call-detail's behavior
    // of omitting optional fields when the AI got it right the first time.
    if (edited && Object.keys(edited).length > 0) {
      payload.editedInput = edited
    }

    // Optimistic status flip — matches prior UX.
    setMessages(prev => prev.map((m, i) => {
      if (i !== msgIndex || !m.toolCalls) return m
      return {
        ...m,
        toolCalls: m.toolCalls.map(tc =>
          tc.id === toolId ? { ...tc, status: 'approved' } : tc
        ),
      }
    }))

    try {
      const res = await fetch('/api/ai/assistant/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      // Server returns `{ result }` on success, `{ error }` on 400/500 —
      // display whichever is present so the user always sees a reason.
      setMessages(prev => prev.map((m, i) => {
        if (i !== msgIndex || !m.toolCalls) return m
        return {
          ...m,
          toolCalls: m.toolCalls.map(tc =>
            tc.id === toolId
              ? { ...tc, status: 'approved', result: data.result ?? data.error ?? 'Done' }
              : tc,
          ),
        }
      }))
    } catch {
      setMessages(prev => prev.map((m, i) => {
        if (i !== msgIndex || !m.toolCalls) return m
        return {
          ...m,
          toolCalls: m.toolCalls.map(tc =>
            tc.id === toolId ? { ...tc, result: 'Failed to execute' } : tc,
          ),
        }
      }))
    }
    setEditingToolCallId(prev => (prev === toolId ? null : prev))
  }

  function rejectToolCall(msgIndex: number, toolId: string) {
    setMessages(prev => prev.map((m, i) => {
      if (i !== msgIndex || !m.toolCalls) return m
      return {
        ...m,
        toolCalls: m.toolCalls.map(tc =>
          tc.id === toolId ? { ...tc, status: 'rejected' } : tc,
        ),
      }
    }))
    // Fire-and-forget — rejection is a feedback signal, not a user-blocking op.
    fetch('/api/ai/assistant/execute', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ toolCallId: toolId, pageContext: getPageContext(), rejected: true }),
    }).catch(() => {})
  }

  function requestApprove(msgIndex: number, toolId: string) {
    const found = findToolCall(toolId)
    if (!found) return
    if (HIGH_STAKES_TYPES.has(found.toolCall.name)) {
      setConfirmModalToolCallId(toolId)
    } else {
      void executeToolCall(msgIndex, toolId)
    }
  }

  function toggleEdit(toolId: string) {
    setEditingToolCallId(prev => (prev === toolId ? null : toolId))
  }

  function resetConversation() {
    setMessages([])
    setLoadedSession(false)
    setEditingToolCallId(null)
    setEditedInputs({})
    setConfirmModalToolCallId(null)
  }

  const propertyIdMatch = pathname?.match(/\/inventory\/([^/]+)$/)
  const propertyId = propertyIdMatch ? propertyIdMatch[1] : null
  const callIdMatch = pathname?.match(/\/calls\/([^/]+)$/)
  const callId = callIdMatch ? callIdMatch[1] : null

  // Resolve the modal's tool call (null if modal closed or tool stale).
  const modalTarget = confirmModalToolCallId ? findToolCall(confirmModalToolCallId) : null

  return (
    <>
      {/* Toggle button */}
      {!open && (
        <button onClick={() => setOpen(true)}
          className="fixed bottom-6 right-6 z-50 hidden lg:flex items-center gap-2 bg-semantic-purple text-white px-4 py-3 rounded-full shadow-lg hover:opacity-90 transition-all">
          <Bot size={16} />
          <span className="text-[13px] font-medium">{assistantName}</span>
        </button>
      )}

      {/* Sidebar panel */}
      {open && (
        <div className="fixed right-0 top-[52px] bottom-0 w-[360px] z-40 hidden lg:flex flex-col bg-surface-primary border-l shadow-lg" style={{ borderColor: 'var(--border-light)' }}>
          {/* Header */}
          <div className="flex items-center gap-3 px-4 py-4 border-b shrink-0" style={{ borderColor: 'var(--border-light)' }}>
            <div className="w-8 h-8 rounded-[10px] bg-semantic-purple-bg flex items-center justify-center">
              <Bot size={16} className="text-semantic-purple" />
            </div>
            <div className="flex-1">
              <span className="text-[14px] font-semibold text-txt-primary">{assistantName}</span>
              <span className="text-[11px] font-medium text-semantic-purple bg-semantic-purple-bg px-2 py-0.5 rounded-full ml-2">&#x2726;</span>
            </div>
            <button onClick={resetConversation}
              className="p-1 rounded-[10px] text-txt-muted hover:text-txt-primary hover:bg-surface-secondary transition-colors text-[10px]">
              Clear
            </button>
            <button onClick={() => setOpen(false)}
              className="p-1 rounded-[10px] text-txt-muted hover:text-txt-primary hover:bg-surface-secondary transition-colors">
              <X size={14} />
            </button>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto px-4 py-4">
            {messages.length === 0 ? (
              <div className="text-center mt-6">
                <div className="w-12 h-12 rounded-full bg-semantic-purple-bg flex items-center justify-center mx-auto mb-3">
                  <Sparkles size={20} className="text-semantic-purple" />
                </div>
                <p className="text-[14px] font-semibold text-txt-primary mb-1">{assistantName}</p>
                <p className="text-[12px] text-txt-muted mb-4">Ask anything. I can see all your data and execute actions.</p>

                <div className="mt-4 text-left space-y-4">
                  <div>
                    <p className="text-[9px] font-semibold tracking-[0.08em] text-txt-muted uppercase mb-2">
                      {propertyId ? 'This Property' : callId ? 'This Call' : 'Quick Actions'}
                    </p>
                    <div className="space-y-1.5">
                      {(propertyId ? [
                        'Summarize this deal',
                        'What should my offer be?',
                        'Draft a follow-up SMS to the seller',
                        'Log an offer for this property',
                      ] : callId ? [
                        'How did this call go?',
                        'What should the next steps be?',
                        'Create a follow-up task',
                      ] : [
                        'What should I focus on today?',
                        'Send a follow-up text to my last contact',
                        'Create a task for tomorrow',
                        'How are my call scores trending?',
                      ]).map(q => (
                        <button key={q} onClick={() => send(q)}
                          className="w-full text-left px-3 py-2 rounded-[10px] border-[0.5px] text-[12px] text-txt-secondary hover:text-txt-primary hover:bg-surface-secondary transition-all flex items-center gap-2"
                          style={{ borderColor: 'var(--border-light)' }}>
                          <Zap size={10} className="text-semantic-purple shrink-0" />
                          {q}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                {messages.map((msg, i) => (
                  <div key={i}>
                    <div className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[90%] px-3 py-2 rounded-2xl text-[12px] leading-relaxed ${
                        msg.role === 'user'
                          ? 'bg-gunner-red text-white rounded-br-md'
                          : 'bg-surface-secondary text-txt-primary rounded-bl-md'
                      }`}>
                        <div className="whitespace-pre-wrap">{msg.content}</div>
                      </div>
                    </div>

                    {/* Action cards for tool calls */}
                    {msg.toolCalls && msg.toolCalls.length > 0 && (
                      <div className="mt-2 space-y-2 ml-2">
                        {msg.toolCalls.map(tc => {
                          const isEditing = editingToolCallId === tc.id
                          const merged = mergedFor(tc)
                          const isHighStakes = HIGH_STAKES_TYPES.has(tc.name)
                          const wasEdited = Boolean(editedInputs[tc.id] && Object.keys(editedInputs[tc.id]).length > 0)
                          return (
                            <div key={tc.id} className="border-[0.5px] rounded-[10px] p-3 bg-white" style={{ borderColor: 'var(--border-light)' }}>
                              <div className="flex items-center gap-2 mb-1.5">
                                <Zap size={10} className="text-semantic-purple" />
                                <span className="text-[10px] font-semibold text-txt-primary">
                                  {tc.name.replace(/_/g, ' ')}
                                </span>
                                {isHighStakes && tc.status === 'pending' && (
                                  <span className="text-[9px] font-medium text-semantic-red bg-semantic-red/10 px-1.5 py-0.5 rounded-full">High-stakes</span>
                                )}
                                {wasEdited && tc.status === 'pending' && (
                                  <span className="text-[9px] font-medium text-semantic-amber bg-semantic-amber/10 px-1.5 py-0.5 rounded-full">Edited</span>
                                )}
                                {tc.status === 'approved' && <span className="text-[9px] text-semantic-green font-medium ml-auto">Executed</span>}
                                {tc.status === 'rejected' && <span className="text-[9px] text-semantic-red font-medium ml-auto">Rejected</span>}
                              </div>

                              {/* Read-only view (collapsed) — shows merged values so edits appear live */}
                              {!isEditing && (
                                <div className="space-y-1 mb-2">
                                  {Object.entries(merged).filter(([, v]) => v != null && v !== '').map(([key, value]) => (
                                    <div key={key} className="flex items-start gap-2">
                                      <span className="text-[9px] font-medium text-txt-muted uppercase w-20 shrink-0 pt-0.5">{key.replace(/([A-Z])/g, ' $1').trim()}</span>
                                      <span className="text-[10px] text-txt-primary flex-1 break-words">
                                        {typeof value === 'object' ? JSON.stringify(value) : String(value)}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              )}

                              {/* Inline edit panel — per-action-type fields match call-detail UX */}
                              {isEditing && tc.status === 'pending' && (
                                <EditPanel
                                  toolCall={tc}
                                  merged={merged}
                                  pipelines={pipelines}
                                  teamMembers={teamMembers}
                                  onPatch={patch => patchEdit(tc.id, patch)}
                                />
                              )}

                              {tc.result && (
                                <p className="text-[10px] text-semantic-green italic mt-1">{tc.result}</p>
                              )}

                              {/* Approve / Reject / Edit buttons */}
                              {tc.status === 'pending' && (
                                <div className="flex gap-2 mt-2">
                                  <button onClick={() => requestApprove(i, tc.id)}
                                    className="flex items-center gap-1 text-[10px] font-semibold text-white bg-semantic-green hover:opacity-90 px-3 py-1.5 rounded-[8px]">
                                    <CheckCircle size={10} /> {isHighStakes ? 'Approve…' : 'Approve'}
                                  </button>
                                  <button onClick={() => rejectToolCall(i, tc.id)}
                                    className="flex items-center gap-1 text-[10px] font-medium text-txt-secondary hover:text-semantic-red px-3 py-1.5">
                                    <XCircle size={10} /> Reject
                                  </button>
                                  <button onClick={() => toggleEdit(tc.id)}
                                    className="flex items-center gap-1 text-[10px] font-medium text-txt-muted hover:text-txt-primary px-2 py-1.5">
                                    <Pencil size={9} /> {isEditing ? 'Close' : 'Edit'}
                                  </button>
                                </div>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                ))}
                {loading && (
                  <div className="flex justify-start">
                    <div className="bg-surface-secondary px-3 py-2 rounded-2xl rounded-bl-md">
                      <Loader2 size={14} className="animate-spin text-txt-muted" />
                    </div>
                  </div>
                )}
                <div ref={bottomRef} />
              </div>
            )}
          </div>

          {/* Input */}
          <div className="px-4 pb-4 pt-2 border-t shrink-0" style={{ borderColor: 'var(--border-light)' }}>
            <div className="flex items-center gap-2">
              <input type="text" value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
                placeholder={`Ask ${assistantName}...`}
                className="flex-1 bg-surface-secondary border-[0.5px] rounded-[10px] px-3 py-2 text-[12px] text-txt-primary placeholder:text-txt-muted focus:outline-none focus:ring-1 focus:ring-semantic-purple"
                style={{ borderColor: 'var(--border-medium)' }} />
              <button onClick={() => send()} disabled={loading || !input.trim()}
                className="p-2 rounded-[10px] bg-semantic-purple text-white hover:opacity-90 disabled:opacity-40 transition-all">
                <Send size={14} />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* High-stakes confirm modal — single instance for the entire sidebar.
          Mirrors call-detail's modal wiring: onConfirm awaits executeToolCall,
          clears isPushing in finally, then closes. */}
      {modalTarget && (
        <ConfirmActionModal
          open
          onCancel={() => { if (!isPushing) setConfirmModalToolCallId(null) }}
          onConfirm={async () => {
            if (!confirmModalToolCallId) return
            setIsPushing(true)
            try {
              await executeToolCall(modalTarget.msgIndex, confirmModalToolCallId)
            } finally {
              setIsPushing(false)
              setConfirmModalToolCallId(null)
            }
          }}
          actionType={modalTarget.toolCall.name}
          preview={buildPreview(modalTarget.toolCall, mergedFor(modalTarget.toolCall), pipelines)}
          isProcessing={isPushing}
          danger
        />
      )}
    </>
  )
}

// ─── Edit panel — per-action-type field layouts ────────────────────────────
// Mirrors the call-detail edit panels (components/calls/call-detail-client.tsx)
// but compacted for the 360px sidebar. DO NOT invent new UI here — users
// seeing both surfaces should see the same fields and labels.
// onPatch accumulates ONLY user-diffed keys; panel reads values from `merged`
// (AI original + diff) so AI-proposed values appear pre-populated.

function EditPanel({
  toolCall, merged, pipelines, teamMembers, onPatch,
}: {
  toolCall: ToolCall
  merged: Record<string, unknown>
  pipelines: PipelineList
  teamMembers: TeamMember[]
  onPatch: (patch: Record<string, unknown>) => void
}) {
  const labelCls = 'text-[9px] font-semibold text-txt-muted uppercase tracking-wider block mb-1'
  const inputCls = 'w-full bg-white border-[0.5px] rounded-[8px] px-2.5 py-1.5 text-[11px] text-txt-primary focus:outline-none'
  const textareaCls = inputCls + ' resize-none'
  const borderStyle = { borderColor: 'var(--border-medium)' }
  const S = (k: string) => String(merged[k] ?? '')

  return (
    <div className="border-t pt-3 mb-2 space-y-2.5" style={{ borderColor: 'var(--border-light)' }}>
      {toolCall.name === 'send_sms' && (
        <div>
          <label className={labelCls}>Message</label>
          <textarea value={S('message')} rows={3} className={textareaCls} style={borderStyle}
            onChange={e => onPatch({ message: e.target.value })} />
        </div>
      )}

      {toolCall.name === 'send_email' && (
        <>
          <div>
            <label className={labelCls}>Subject</label>
            <input value={S('subject')} className={inputCls} style={borderStyle}
              onChange={e => onPatch({ subject: e.target.value })} />
          </div>
          <div>
            <label className={labelCls}>Body</label>
            <textarea value={S('body')} rows={4} className={textareaCls} style={borderStyle}
              onChange={e => onPatch({ body: e.target.value })} />
          </div>
        </>
      )}

      {toolCall.name === 'add_note' && (
        <div>
          <label className={labelCls}>Note</label>
          <textarea value={S('note')} rows={4} className={textareaCls} style={borderStyle}
            onChange={e => onPatch({ note: e.target.value })} />
        </div>
      )}

      {(toolCall.name === 'create_task' || toolCall.name === 'update_task') && (
        <>
          <div>
            <label className={labelCls}>Title</label>
            <input value={S('title')} className={inputCls} style={borderStyle}
              onChange={e => onPatch({ title: e.target.value })} />
          </div>
          <div>
            <label className={labelCls}>Description</label>
            <textarea value={S('description')} rows={2} className={textareaCls} style={borderStyle}
              onChange={e => onPatch({ description: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className={labelCls}>Due Date</label>
              <input type="date" value={S('dueDate').slice(0, 10)} className={inputCls} style={borderStyle}
                onChange={e => onPatch({ dueDate: e.target.value })} />
            </div>
            <div>
              <label className={labelCls}>Assigned To</label>
              <select value={S('assignedTo')} className={inputCls} style={borderStyle}
                onChange={e => onPatch({ assignedTo: e.target.value })}>
                <option value="">Unassigned</option>
                {teamMembers.map(m => <option key={m.userId} value={m.userId}>{m.name}</option>)}
              </select>
            </div>
          </div>
        </>
      )}

      {toolCall.name === 'complete_task' && (
        <div className="text-[10px] text-txt-muted italic">
          Completes task ID <code className="text-txt-primary not-italic">{S('taskId') || '(none)'}</code> — no editable fields.
        </div>
      )}

      {toolCall.name === 'create_contact' && (
        <>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className={labelCls}>First Name</label>
              <input value={S('firstName')} className={inputCls} style={borderStyle}
                onChange={e => onPatch({ firstName: e.target.value })} />
            </div>
            <div>
              <label className={labelCls}>Last Name</label>
              <input value={S('lastName')} className={inputCls} style={borderStyle}
                onChange={e => onPatch({ lastName: e.target.value })} />
            </div>
          </div>
          <div>
            <label className={labelCls}>Phone</label>
            <input value={S('phone')} className={inputCls} style={borderStyle}
              onChange={e => onPatch({ phone: e.target.value })} />
          </div>
          <div>
            <label className={labelCls}>Email</label>
            <input value={S('email')} className={inputCls} style={borderStyle}
              onChange={e => onPatch({ email: e.target.value })} />
          </div>
          <div>
            <label className={labelCls}>Source</label>
            <input value={S('source')} className={inputCls} style={borderStyle}
              onChange={e => onPatch({ source: e.target.value })} />
          </div>
        </>
      )}

      {toolCall.name === 'update_contact' && (
        <>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className={labelCls}>First Name</label>
              <input value={S('firstName')} className={inputCls} style={borderStyle}
                onChange={e => onPatch({ firstName: e.target.value })} />
            </div>
            <div>
              <label className={labelCls}>Last Name</label>
              <input value={S('lastName')} className={inputCls} style={borderStyle}
                onChange={e => onPatch({ lastName: e.target.value })} />
            </div>
          </div>
          <div>
            <label className={labelCls}>Phone</label>
            <input value={S('phone')} className={inputCls} style={borderStyle}
              onChange={e => onPatch({ phone: e.target.value })} />
          </div>
          <div>
            <label className={labelCls}>Email</label>
            <input value={S('email')} className={inputCls} style={borderStyle}
              onChange={e => onPatch({ email: e.target.value })} />
          </div>
          <div>
            <label className={labelCls}>Tags (comma-separated)</label>
            <input
              value={Array.isArray(merged.tags) ? (merged.tags as unknown[]).map(String).join(', ') : S('tags')}
              className={inputCls} style={borderStyle}
              onChange={e => onPatch({ tags: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })} />
          </div>
        </>
      )}

      {toolCall.name === 'change_pipeline_stage' && (
        <>
          <div>
            <label className={labelCls}>Pipeline</label>
            <select value={S('pipelineId')} className={inputCls} style={borderStyle}
              onChange={e => onPatch({ pipelineId: e.target.value, stageId: '' })}>
              <option value="">Select pipeline...</option>
              {pipelines.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>Move to Stage</label>
            <select value={S('stageId')} className={inputCls} style={borderStyle}
              onChange={e => onPatch({ stageId: e.target.value })}>
              <option value="">Select stage...</option>
              {(pipelines.find(p => p.id === S('pipelineId'))?.stages ?? []).map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
        </>
      )}

      {toolCall.name === 'create_opportunity' && (
        <>
          <div>
            <label className={labelCls}>Deal Name</label>
            <input value={S('dealName')} className={inputCls} style={borderStyle}
              onChange={e => onPatch({ dealName: e.target.value })} />
          </div>
          <div>
            <label className={labelCls}>Pipeline</label>
            <select value={S('pipelineId')} className={inputCls} style={borderStyle}
              onChange={e => onPatch({ pipelineId: e.target.value, stageId: '' })}>
              <option value="">Select pipeline...</option>
              {pipelines.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>Starting Stage</label>
            <select value={S('stageId')} className={inputCls} style={borderStyle}
              onChange={e => onPatch({ stageId: e.target.value })}>
              <option value="">Select stage...</option>
              {(pipelines.find(p => p.id === S('pipelineId'))?.stages ?? []).map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
        </>
      )}

      {toolCall.name === 'update_opportunity_status' && (
        <div>
          <label className={labelCls}>Status</label>
          <select value={S('status')} className={inputCls} style={borderStyle}
            onChange={e => onPatch({ status: e.target.value })}>
            <option value="">Select status...</option>
            <option value="open">Open</option>
            <option value="won">Won</option>
            <option value="lost">Lost</option>
            <option value="abandoned">Abandoned</option>
          </select>
        </div>
      )}

      {toolCall.name === 'update_opportunity_value' && (
        <div>
          <label className={labelCls}>Monetary Value ($)</label>
          <input type="number" value={S('value')} className={inputCls} style={borderStyle}
            onChange={e => onPatch({ value: e.target.value })} />
        </div>
      )}

      {/* Generic fallback — any non-target action still gets an editable view
          for simple scalar fields, so nothing silently blocks the user. */}
      {![
        'send_sms', 'send_email', 'add_note',
        'create_task', 'update_task', 'complete_task',
        'create_contact', 'update_contact',
        'change_pipeline_stage', 'create_opportunity',
        'update_opportunity_status', 'update_opportunity_value',
      ].includes(toolCall.name) && (
        <div className="space-y-1.5">
          {Object.entries(merged).filter(([, v]) => typeof v === 'string' || typeof v === 'number').map(([k, v]) => (
            <div key={k}>
              <label className={labelCls}>{k.replace(/([A-Z])/g, ' $1').trim()}</label>
              <input value={String(v ?? '')} className={inputCls} style={borderStyle}
                onChange={e => onPatch({ [k]: e.target.value })} />
            </div>
          ))}
          <p className="text-[9px] text-txt-muted italic">
            Edits for {toolCall.name.replace(/_/g, ' ')} are sent as editedInput. Server falls back to the AI&apos;s original for fields not shown.
          </p>
        </div>
      )}
    </div>
  )
}
