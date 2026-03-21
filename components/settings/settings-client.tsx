// components/settings/settings-client.tsx
// Client component for the /{tenant}/settings page
// Contains 4 tabs: Team, Integrations, Pipeline, Call Config
// Rule 3: All settings live here — no gear icons on individual pages

'use client'

import { useState, useCallback, useEffect } from 'react'
import { Users, Phone, Zap, GitBranch, CheckCircle, XCircle, Copy, Check, Loader2, Link2, Workflow, Plus, Trash2, Power } from 'lucide-react'
import { ROLE_LABELS, type UserRole } from '@/types/roles'
import { RubricEditor } from '@/components/settings/rubric-editor'
import { GHLDropdown } from '@/components/ui/ghl-dropdown'
import { CALL_TYPES } from '@/lib/call-types'

interface TenantInfo {
  id: string; name: string; slug: string; ghlConnected: boolean
  callTypes: string[]; callResults: string[]
  // WRITES TO: tenants.property_pipeline_id (String?)
  // READ BY: lib/ghl/webhooks.ts → handleOpportunityStageChanged()
  propertyPipelineId: string
  // WRITES TO: tenants.property_trigger_stage (String?)
  // READ BY: lib/ghl/webhooks.ts → handleOpportunityStageChanged()
  propertyTriggerStage: string
}
interface TeamMember {
  id: string; name: string; email: string; phone: string | null; role: string
  reportsTo: string | null; ghlUserId: string | null; createdAt: string
}
interface GHLUserOption {
  id: string; name: string; email: string
}
interface Rubric {
  id: string; name: string; role: string; callType: string | null; isDefault: boolean
}

type Tab = 'team' | 'integrations' | 'pipeline' | 'calls' | 'workflows'

export function SettingsClient({
  tenant, teamMembers, rubrics, callTypes, currentUserId, currentUserRole, canManage,
}: {
  tenant: TenantInfo
  teamMembers: TeamMember[]
  rubrics: Rubric[]
  callTypes: string[]
  currentUserId: string
  currentUserRole: UserRole
  canManage: boolean
}) {
  const [tab, setTab] = useState<Tab>('team')
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState('LEAD_MANAGER')
  const [inviting, setInviting] = useState(false)
  const [inviteMsg, setInviteMsg] = useState('')
  const [copied, setCopied] = useState(false)

  // Pipeline settings state
  // WRITES TO: tenants.property_pipeline_id (String?)
  // API ENDPOINT: PATCH /api/tenants/config
  // READ BY: lib/ghl/webhooks.ts → handleOpportunityStageChanged()
  // READ QUERY: db.tenant.findUnique({ select: { propertyPipelineId: true } })
  // DROPDOWN SOURCE: GET /api/ghl/pipelines → pipelines[].id
  const [selectedPipeline, setSelectedPipeline] = useState(tenant.propertyPipelineId)

  // WRITES TO: tenants.property_trigger_stage (String?)
  // API ENDPOINT: PATCH /api/tenants/config
  // READ BY: lib/ghl/webhooks.ts → handleOpportunityStageChanged()
  // READ QUERY: db.tenant.findUnique({ select: { propertyTriggerStage: true } })
  // DROPDOWN SOURCE: derived from selected pipeline stages[]
  const [selectedStage, setSelectedStage] = useState(tenant.propertyTriggerStage)
  const [pipelineStages, setPipelineStages] = useState<Array<{ id: string; name: string }>>([])
  const [savingPipeline, setSavingPipeline] = useState(false)
  const [pipelineSaveMsg, setPipelineSaveMsg] = useState('')

  // GHL user mapping state
  const [ghlUsers, setGhlUsers] = useState<GHLUserOption[]>([])
  const [ghlUsersLoading, setGhlUsersLoading] = useState(false)
  const [savingGhlMap, setSavingGhlMap] = useState<string | null>(null)

  // Fetch GHL users when team tab is shown
  useEffect(() => {
    if (tab === 'team' && tenant.ghlConnected && ghlUsers.length === 0) {
      setGhlUsersLoading(true)
      fetch('/api/ghl/users')
        .then(r => r.json())
        .then(data => {
          const users = (data.users ?? []).map((u: { id: string; name: string; firstName: string; lastName: string; email: string }) => ({
            id: u.id,
            name: u.name || `${u.firstName} ${u.lastName}`.trim(),
            email: u.email,
          }))
          setGhlUsers(users)
        })
        .catch(() => setGhlUsers([]))
        .finally(() => setGhlUsersLoading(false))
    }
  }, [tab, tenant.ghlConnected, ghlUsers.length])

  async function saveGhlUserMapping(userId: string, ghlUserId: string | null) {
    setSavingGhlMap(userId)
    try {
      await fetch(`/api/users/${userId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ghlUserId }),
      })
    } catch { /* ignore */ }
    setSavingGhlMap(null)
  }

  async function invite() {
    if (!inviteEmail) return
    setInviting(true)
    const res = await fetch('/api/tenants/invite', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ invites: [{ email: inviteEmail, role: inviteRole }] }),
    })
    setInviting(false)
    setInviteMsg(res.ok ? `Invite sent to ${inviteEmail}` : 'Failed to send invite')
    if (res.ok) setInviteEmail('')
    setTimeout(() => setInviteMsg(''), 3000)
  }

  function copySlug() {
    navigator.clipboard.writeText(`${window.location.origin}/${tenant.slug}`)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  // Transform pipeline response to extract stages for the selected pipeline
  const handlePipelineChange = useCallback((pipelineId: string) => {
    setSelectedPipeline(pipelineId)
    setSelectedStage('')
    setPipelineStages([])

    if (!pipelineId) return

    // Fetch stages for the selected pipeline
    fetch('/api/ghl/pipelines')
      .then((r) => r.json())
      .then((data) => {
        const pipeline = (data.pipelines ?? []).find(
          (p: { id: string }) => p.id === pipelineId
        )
        if (pipeline?.stages) {
          setPipelineStages(pipeline.stages)
        }
      })
      .catch(() => setPipelineStages([]))
  }, [])

  async function savePipelineSettings() {
    setSavingPipeline(true)
    setPipelineSaveMsg('')
    try {
      const res = await fetch('/api/tenants/config', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          propertyPipelineId: selectedPipeline || null,
          propertyTriggerStage: selectedStage || null,
        }),
      })
      if (res.ok) {
        setPipelineSaveMsg('Pipeline settings saved')
      } else {
        setPipelineSaveMsg('Failed to save pipeline settings')
      }
    } catch {
      setPipelineSaveMsg('Error saving pipeline settings')
    }
    setSavingPipeline(false)
    setTimeout(() => setPipelineSaveMsg(''), 3000)
  }

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'team', label: 'Team', icon: <Users size={14} /> },
    { id: 'integrations', label: 'Integrations', icon: <Zap size={14} /> },
    { id: 'pipeline', label: 'Pipeline', icon: <GitBranch size={14} /> },
    { id: 'calls', label: 'Call config', icon: <Phone size={14} /> },
    { id: 'workflows', label: 'Workflows', icon: <Workflow size={14} /> },
  ]

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-white">Settings</h1>
        <p className="text-sm text-gray-400 mt-0.5">{tenant.name}</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-white/5 border border-white/10 rounded-lg p-1 w-fit">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-md text-sm transition-colors ${
              tab === t.id ? 'bg-[#1a1d27] text-white' : 'text-gray-400 hover:text-white'
            }`}
          >
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {/* ── Team tab ────────────────────────────────────────────────────── */}
      {tab === 'team' && (
        <div className="space-y-4">
          {/* Invite */}
          {canManage && (
            <div className="bg-[#1a1d27] border border-white/10 rounded-2xl p-5">
              <h2 className="text-sm font-medium text-white mb-3">Invite team member</h2>
              <div className="flex gap-2 flex-wrap">
                <input
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="email@company.com"
                  className="flex-1 min-w-48 bg-[#0f1117] border border-white/10 rounded-lg px-4 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-orange-500"
                />
                <select
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value)}
                  className="bg-[#0f1117] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none"
                >
                  {Object.entries(ROLE_LABELS).filter(([r]) => r !== 'OWNER').map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
                <button
                  onClick={invite}
                  disabled={!inviteEmail || inviting}
                  className="bg-orange-500 hover:bg-orange-600 disabled:opacity-40 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
                >
                  {inviting ? 'Sending…' : 'Send invite'}
                </button>
              </div>
              {inviteMsg && <p className="text-xs text-orange-400 mt-2">{inviteMsg}</p>}
            </div>
          )}

          {/* Team list */}
          <div className="bg-[#1a1d27] border border-white/10 rounded-2xl divide-y divide-white/5">
            {teamMembers.map((member) => (
              <div key={member.id} className="flex items-center gap-3 px-5 py-4">
                <div className="w-8 h-8 rounded-full bg-orange-500/20 flex items-center justify-center shrink-0">
                  <span className="text-orange-400 text-xs font-medium">{member.name[0]}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm text-white font-medium">{member.name}</p>
                    {member.id === currentUserId && (
                      <span className="text-xs text-gray-500 bg-white/5 px-1.5 py-0.5 rounded">you</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <p className="text-xs text-gray-500">{member.email}</p>
                    {member.phone && (
                      <span className="text-xs text-gray-500">
                        · <Phone size={10} className="inline mb-0.5" /> {member.phone}
                      </span>
                    )}
                  </div>
                  {/* GHL user mapping */}
                  {canManage && tenant.ghlConnected && (
                    <div className="flex items-center gap-1.5 mt-1.5">
                      <Link2 size={10} className="text-gray-600 shrink-0" />
                      {ghlUsersLoading ? (
                        <span className="text-xs text-gray-600">Loading GHL users...</span>
                      ) : ghlUsers.length > 0 ? (
                        <select
                          value={member.ghlUserId ?? ''}
                          onChange={(e) => saveGhlUserMapping(member.id, e.target.value || null)}
                          disabled={savingGhlMap === member.id}
                          className="text-xs bg-transparent border-none text-gray-500 hover:text-gray-300 focus:outline-none cursor-pointer p-0"
                        >
                          <option value="">Map to GHL user...</option>
                          {ghlUsers.map(u => (
                            <option key={u.id} value={u.id}>{u.name} ({u.email})</option>
                          ))}
                        </select>
                      ) : (
                        <span className="text-xs text-gray-600">
                          {member.ghlUserId ? `GHL: ${member.ghlUserId.slice(0, 8)}...` : 'No GHL mapping'}
                        </span>
                      )}
                    </div>
                  )}
                </div>
                <span className="text-xs text-gray-400 bg-white/5 px-2 py-1 rounded-full">
                  {ROLE_LABELS[member.role as UserRole] ?? member.role}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Integrations tab ───────────────────────────────────────────── */}
      {/* READS: tenants.ghl_location_id (presence = connected)
         READS: tenants.ghl_access_token (via ghlConnected boolean) */}
      {tab === 'integrations' && (
        <div className="space-y-4">
          <div className="bg-[#1a1d27] border border-white/10 rounded-2xl p-5">
            <div className="flex items-center gap-3 mb-4">
              {tenant.ghlConnected ? (
                <CheckCircle size={18} className="text-green-400" />
              ) : (
                <XCircle size={18} className="text-red-400" />
              )}
              <div>
                <p className="text-sm font-medium text-white">
                  {tenant.ghlConnected ? 'GHL connected' : 'GHL not connected'}
                </p>
                <p className="text-xs text-gray-500">
                  {tenant.ghlConnected
                    ? 'Calls, contacts, and tasks syncing automatically'
                    : 'Connect Go High Level to enable all features'}
                </p>
              </div>
            </div>

            <a
              href={`https://marketplace.gohighlevel.com/oauth/chooselocation?response_type=code&redirect_uri=${encodeURIComponent(window.location.origin + '/api/auth/crm/callback')}&client_id=${process.env.NEXT_PUBLIC_GHL_CLIENT_ID ?? ''}&scope=contacts.readonly+contacts.write+opportunities.readonly+opportunities.write+conversations.readonly+conversations.write+conversations/message.readonly+conversations/message.write+calendars.readonly+calendars/events.readonly+locations.readonly+locations/tasks.readonly+locations/tasks.write+users.readonly`}
              className="inline-flex items-center gap-2 bg-orange-500 hover:bg-orange-600 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
            >
              <Zap size={14} /> {tenant.ghlConnected ? 'Reconnect Go High Level' : 'Connect Go High Level'}
            </a>
          </div>

          {/* Workspace URL */}
          <div className="bg-[#1a1d27] border border-white/10 rounded-2xl p-5">
            <h2 className="text-sm font-medium text-white mb-3">Your workspace URL</h2>
            <div className="flex items-center gap-2 bg-[#0f1117] border border-white/10 rounded-lg px-4 py-2.5">
              <span className="text-sm text-gray-400 flex-1 truncate">
                {typeof window !== 'undefined' ? window.location.origin : ''}/{tenant.slug}
              </span>
              <button onClick={copySlug} className="text-gray-400 hover:text-white transition-colors shrink-0">
                {copied ? <Check size={14} className="text-green-400" /> : <Copy size={14} />}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Pipeline tab ───────────────────────────────────────────────── */}
      {/* WRITES TO: tenants.property_pipeline_id (String?)
         WRITES TO: tenants.property_trigger_stage (String?)
         API ENDPOINT: PATCH /api/tenants/config
         READ BY: lib/ghl/webhooks.ts → handleOpportunityStageChanged()
         DROPDOWN SOURCE: GET /api/ghl/pipelines → pipelines[].id, pipelines[].stages[].id */}
      {tab === 'pipeline' && (
        <div className="space-y-4">
          <div className="bg-[#1a1d27] border border-white/10 rounded-2xl p-5 space-y-5">
            <div>
              <h2 className="text-sm font-medium text-white mb-1">Property creation trigger</h2>
              <p className="text-xs text-gray-500 mb-4">
                When a GHL contact enters the selected pipeline stage, Gunner AI automatically creates a property in your inventory.
              </p>
            </div>

            {!tenant.ghlConnected ? (
              <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-4 text-sm text-yellow-300">
                Connect GHL in the Integrations tab first to configure pipeline triggers.
              </div>
            ) : (
              <div className="space-y-4">
                {/* Pipeline dropdown — live from GHL API */}
                <div>
                  <label className="block text-sm text-gray-300 mb-1.5">Pipeline</label>
                  <GHLDropdown
                    endpoint="/api/ghl/pipelines"
                    valueKey="id"
                    labelKey="name"
                    value={selectedPipeline}
                    onChange={handlePipelineChange}
                    placeholder="Select a pipeline..."
                  />
                </div>

                {/* Stage dropdown — derived from selected pipeline */}
                {selectedPipeline && (
                  <div>
                    <label className="block text-sm text-gray-300 mb-1.5">Trigger stage</label>
                    {pipelineStages.length > 0 ? (
                      <select
                        value={selectedStage}
                        onChange={(e) => setSelectedStage(e.target.value)}
                        className="w-full bg-[#0f1117] border border-white/10 rounded-lg px-4 py-2.5 text-white text-sm focus:outline-none focus:border-orange-500"
                      >
                        <option value="">Select a stage...</option>
                        {pipelineStages.map((s) => (
                          <option key={s.id} value={s.id}>{s.name}</option>
                        ))}
                      </select>
                    ) : (
                      <div className="flex items-center gap-2 bg-[#0f1117] border border-white/10 rounded-lg px-4 py-2.5 text-sm text-gray-500">
                        <Loader2 size={14} className="animate-spin" />
                        Loading stages...
                      </div>
                    )}
                  </div>
                )}

                {/* Preview what will happen */}
                {selectedStage && (
                  <div className="bg-orange-500/10 border border-orange-500/20 rounded-lg p-4 text-sm text-orange-300">
                    When a contact enters stage <strong>{pipelineStages.find(s => s.id === selectedStage)?.name}</strong>, a property will be created automatically.
                  </div>
                )}

                {/* Save button */}
                <button
                  onClick={savePipelineSettings}
                  disabled={savingPipeline}
                  className="flex items-center gap-2 bg-orange-500 hover:bg-orange-600 disabled:opacity-40 text-white text-sm font-medium px-5 py-2.5 rounded-lg transition-colors"
                >
                  {savingPipeline ? (
                    <><Loader2 size={14} className="animate-spin" /> Saving...</>
                  ) : (
                    'Save pipeline settings'
                  )}
                </button>

                {pipelineSaveMsg && (
                  <p className={`text-xs ${pipelineSaveMsg.includes('Failed') || pipelineSaveMsg.includes('Error') ? 'text-red-400' : 'text-green-400'}`}>
                    {pipelineSaveMsg}
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Call config tab ─────────────────────────────────────────────── */}
      {/* READS: tenants.call_types (Json)
         READS: tenants.call_results (Json)
         READS: call_rubrics table (via RubricEditor) */}
      {tab === 'calls' && (
        <div className="space-y-4">
          <CallTypesSection
            enabledTypes={tenant.callTypes as string[]}
            canManage={canManage}
            tenantId={tenant.id}
          />

          <div className="bg-[#1a1d27] border border-white/10 rounded-2xl p-5">
            <h2 className="text-sm font-medium text-white mb-3">Call results</h2>
            <div className="flex flex-wrap gap-2">
              {(tenant.callResults as string[]).map((r) => (
                <span key={r} className="text-xs bg-white/5 border border-white/10 rounded-full px-3 py-1.5 text-gray-300">{r}</span>
              ))}
            </div>
          </div>

          <div className="bg-[#1a1d27] border border-white/10 rounded-2xl p-5">
            <RubricEditor
              tenantId={tenant.id}
              callTypes={CALL_TYPES.map(ct => ct.name)}
              existingRubrics={rubrics}
            />
          </div>
        </div>
      )}

      {/* ── Workflows tab ────────────────────────────────────────────── */}
      {tab === 'workflows' && <WorkflowsTab canManage={canManage} />}
    </div>
  )
}

// ─── Call Types Section ─────────────────────────────────────────────────────

function CallTypesSection({ enabledTypes, canManage, tenantId }: {
  enabledTypes: string[]
  canManage: boolean
  tenantId: string
}) {
  const [enabled, setEnabled] = useState<Set<string>>(() => {
    // Map legacy names to IDs, or keep IDs
    const ids = new Set<string>()
    for (const t of enabledTypes) {
      const match = CALL_TYPES.find(ct => ct.id === t || ct.name.toLowerCase() === t.toLowerCase())
      if (match) ids.add(match.id)
    }
    // Default: enable all if none mapped
    if (ids.size === 0) CALL_TYPES.forEach(ct => ids.add(ct.id))
    return ids
  })
  const [saving, setSaving] = useState(false)
  const [expanded, setExpanded] = useState<string | null>(null)

  const toggle = useCallback(async (id: string) => {
    if (!canManage) return
    const next = new Set(enabled)
    if (next.has(id)) {
      if (next.size <= 1) return // must keep at least 1
      next.delete(id)
    } else {
      next.add(id)
    }
    setEnabled(next)

    // Save to DB
    setSaving(true)
    try {
      const res = await fetch('/api/tenants/config', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ callTypes: CALL_TYPES.filter(ct => next.has(ct.id)).map(ct => ct.id) }),
      })
      if (!res.ok) throw new Error()
    } catch {
      // Revert on failure
      setEnabled(enabled)
    } finally {
      setSaving(false)
    }
  }, [enabled, canManage])

  return (
    <div className="bg-[#1a1d27] border border-white/10 rounded-2xl p-5">
      <h2 className="text-sm font-medium text-white mb-1">Call types</h2>
      <p className="text-xs text-gray-500 mb-4">Select which call types your team uses. The AI uses these definitions to grade each call type differently.</p>
      <div className="space-y-2">
        {CALL_TYPES.map((ct) => {
          const isEnabled = enabled.has(ct.id)
          const isExpanded = expanded === ct.id
          return (
            <div key={ct.id} className={`border rounded-xl transition-colors ${isEnabled ? 'border-orange-500/30 bg-orange-500/5' : 'border-white/5 bg-white/[0.02]'}`}>
              <div className="flex items-center gap-3 px-4 py-3">
                {canManage && (
                  <button
                    onClick={() => toggle(ct.id)}
                    disabled={saving}
                    className={`w-9 h-5 rounded-full transition-colors flex items-center shrink-0 ${isEnabled ? 'bg-orange-500 justify-end' : 'bg-white/10 justify-start'}`}
                  >
                    <span className="w-4 h-4 bg-white rounded-full mx-0.5 shadow-sm" />
                  </button>
                )}
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-medium ${isEnabled ? 'text-white' : 'text-gray-500'}`}>{ct.name}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{ct.description}</p>
                </div>
                <button
                  onClick={() => setExpanded(isExpanded ? null : ct.id)}
                  className="text-xs text-gray-500 hover:text-gray-300 shrink-0"
                >
                  {isExpanded ? 'Hide' : 'AI context'}
                </button>
              </div>
              {isExpanded && (
                <div className="px-4 pb-3 pt-0">
                  <div className="bg-black/30 rounded-lg p-3 text-xs text-gray-400 leading-relaxed">
                    {ct.aiContext}
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Workflows Tab Component ────────────────────────────────────────────────

const TRIGGER_LABELS: Record<string, string> = {
  property_created: 'Property created',
  stage_changed: 'Stage changed',
  call_graded: 'Call graded',
  task_completed: 'Task completed',
}

const STEP_LABELS: Record<string, string> = {
  send_sms: 'Send SMS',
  create_task: 'Create task',
  update_status: 'Update status',
  notify: 'Notification',
  wait: 'Wait',
}

interface WorkflowEntry {
  id: string; name: string; triggerEvent: string
  steps: Array<{ type: string; delay?: number; action?: string; content?: string }>
  isActive: boolean; executionCount: number
}

function WorkflowsTab({ canManage }: { canManage: boolean }) {
  const [workflows, setWorkflows] = useState<WorkflowEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [newName, setNewName] = useState('')
  const [newTrigger, setNewTrigger] = useState('property_created')
  const [newSteps, setNewSteps] = useState([{ type: 'create_task', action: '', content: '', delay: 0 }])
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetch('/api/workflows').then(r => r.json()).then(data => {
      setWorkflows(data.workflows ?? [])
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  async function createWorkflow() {
    setSaving(true)
    try {
      const res = await fetch('/api/workflows', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName, triggerEvent: newTrigger, steps: newSteps }),
      })
      const data = await res.json()
      if (data.workflow) {
        setWorkflows(prev => [{ ...data.workflow, executionCount: 0, steps: newSteps }, ...prev])
        setShowCreate(false)
        setNewName('')
        setNewSteps([{ type: 'create_task', action: '', content: '', delay: 0 }])
      }
    } catch { /* ignore */ }
    setSaving(false)
  }

  async function toggleWorkflow(id: string, isActive: boolean) {
    await fetch('/api/workflows', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'toggle', id, isActive }),
    })
    setWorkflows(prev => prev.map(w => w.id === id ? { ...w, isActive } : w))
  }

  function addStep() {
    setNewSteps(prev => [...prev, { type: 'create_task', action: '', content: '', delay: 0 }])
  }

  function updateStep(index: number, field: string, value: string | number) {
    setNewSteps(prev => prev.map((s, i) => i === index ? { ...s, [field]: value } : s))
  }

  function removeStep(index: number) {
    if (newSteps.length <= 1) return
    setNewSteps(prev => prev.filter((_, i) => i !== index))
  }

  return (
    <div className="space-y-4">
      {canManage && (
        <div className="flex justify-between items-center">
          <p className="text-sm text-gray-400">Automate actions when events occur</p>
          <button onClick={() => setShowCreate(!showCreate)} className="flex items-center gap-1.5 bg-orange-500 hover:bg-orange-600 text-white text-sm font-medium px-4 py-2 rounded-lg">
            <Plus size={14} /> New workflow
          </button>
        </div>
      )}

      {/* Create form */}
      {showCreate && (
        <div className="bg-[#1a1d27] border border-orange-500/30 rounded-2xl p-5 space-y-4">
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Name</label>
              <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="New lead follow-up" className="w-full bg-[#0f1117] border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-orange-500" />
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Trigger</label>
              <select value={newTrigger} onChange={e => setNewTrigger(e.target.value)} className="w-full bg-[#0f1117] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none">
                {Object.entries(TRIGGER_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="text-xs text-gray-400 mb-2 block">Steps</label>
            <div className="space-y-2">
              {newSteps.map((step, i) => (
                <div key={i} className="flex gap-2 items-start bg-[#0f1117] border border-white/10 rounded-lg p-3">
                  <span className="text-xs text-gray-600 mt-2 w-5 shrink-0">{i + 1}</span>
                  <select value={step.type} onChange={e => updateStep(i, 'type', e.target.value)} className="bg-transparent border border-white/10 rounded px-2 py-1.5 text-xs text-white focus:outline-none">
                    {Object.entries(STEP_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                  {step.type === 'wait' ? (
                    <input type="number" value={step.delay} onChange={e => updateStep(i, 'delay', parseInt(e.target.value) || 0)} placeholder="Minutes" className="w-20 bg-transparent border border-white/10 rounded px-2 py-1.5 text-xs text-white focus:outline-none" />
                  ) : (
                    <input value={step.action || step.content} onChange={e => updateStep(i, step.type === 'create_task' ? 'action' : 'content', e.target.value)} placeholder={step.type === 'create_task' ? 'Task title...' : 'Content...'} className="flex-1 bg-transparent border border-white/10 rounded px-2 py-1.5 text-xs text-white placeholder-gray-600 focus:outline-none" />
                  )}
                  <button onClick={() => removeStep(i)} className="text-gray-600 hover:text-red-400 mt-1"><Trash2 size={12} /></button>
                </div>
              ))}
            </div>
            <button onClick={addStep} className="text-xs text-orange-400 hover:text-orange-300 mt-2 flex items-center gap-1"><Plus size={10} /> Add step</button>
          </div>

          <div className="flex gap-2">
            <button onClick={createWorkflow} disabled={!newName || saving} className="bg-orange-500 hover:bg-orange-600 disabled:opacity-40 text-white text-sm font-medium px-4 py-2 rounded-lg">
              {saving ? 'Creating...' : 'Create workflow'}
            </button>
            <button onClick={() => setShowCreate(false)} className="text-gray-400 hover:text-white text-sm px-3 py-2">Cancel</button>
          </div>
        </div>
      )}

      {/* Workflow list */}
      <div className="bg-[#1a1d27] border border-white/10 rounded-2xl divide-y divide-white/5">
        {loading ? (
          <div className="p-8 text-center"><Loader2 size={16} className="text-gray-600 animate-spin mx-auto" /></div>
        ) : workflows.length === 0 ? (
          <div className="p-8 text-center">
            <Workflow size={24} className="text-gray-600 mx-auto mb-3" />
            <p className="text-sm text-gray-400">No workflows yet. Create one to automate actions.</p>
          </div>
        ) : (
          workflows.map(w => (
            <div key={w.id} className="flex items-center gap-3 px-5 py-4">
              <button onClick={() => canManage && toggleWorkflow(w.id, !w.isActive)} className="shrink-0">
                <Power size={16} className={w.isActive ? 'text-green-400' : 'text-gray-600'} />
              </button>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-white font-medium">{w.name}</p>
                <p className="text-xs text-gray-500">
                  {TRIGGER_LABELS[w.triggerEvent] ?? w.triggerEvent} → {w.steps.length} step{w.steps.length !== 1 ? 's' : ''} · {w.executionCount} runs
                </p>
              </div>
              <span className={`text-xs px-2 py-0.5 rounded-full ${w.isActive ? 'bg-green-500/10 text-green-400' : 'bg-gray-500/10 text-gray-500'}`}>
                {w.isActive ? 'Active' : 'Paused'}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
