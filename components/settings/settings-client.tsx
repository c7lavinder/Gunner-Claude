// components/settings/settings-client.tsx
// Client component for the /{tenant}/settings page
// Contains 5 tabs: Team, Integrations, Pipeline, Call Config, Workflows
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
  callTypes: string[]; callResults: Record<string, string[]> | string[]
  // WRITES TO: tenants.property_pipeline_id (String?)
  // READ BY: lib/ghl/webhooks.ts → handleOpportunityStageChanged()
  propertyPipelineId: string
  // WRITES TO: tenants.property_trigger_stage (String?)
  // READ BY: lib/ghl/webhooks.ts → handleOpportunityStageChanged()
  propertyTriggerStage: string
  // WRITES TO: tenants.grading_materials (String?)
  // READ BY: lib/ai/grading.ts → buildGradingSystemPrompt()
  gradingMaterials: string
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
      {/* Page header */}
      <div>
        <h1 className="text-ds-page font-semibold text-txt-primary">Settings</h1>
        <p className="text-ds-body text-txt-secondary mt-1">{tenant.name}</p>
      </div>

      {/* Tab bar — design system: bg-tertiary container, 4px padding, 14px radius */}
      <div className="flex gap-1 bg-surface-tertiary rounded-[14px] p-1 w-fit">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-[10px] text-ds-body font-medium transition-all ${
              tab === t.id
                ? 'bg-white text-txt-primary shadow-ds-float'
                : 'text-txt-secondary hover:text-txt-primary'
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
            <div className="bg-white border-[0.5px] border-[rgba(0,0,0,0.08)] rounded-[14px] p-5">
              <h2 className="text-ds-label font-medium text-txt-primary mb-3">Invite team member</h2>
              <div className="flex gap-2 flex-wrap">
                <input
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="email@company.com"
                  className="flex-1 min-w-48 bg-surface-secondary border-[0.5px] border-[rgba(0,0,0,0.08)] rounded-[10px] px-4 py-2 text-ds-body text-txt-primary placeholder-txt-muted focus:outline-none focus:border-[rgba(0,0,0,0.14)]"
                />
                <select
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value)}
                  className="bg-surface-secondary border-[0.5px] border-[rgba(0,0,0,0.08)] rounded-[10px] px-3 py-2 text-ds-body text-txt-primary focus:outline-none"
                >
                  {Object.entries(ROLE_LABELS).filter(([r]) => r !== 'OWNER').map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
                <button
                  onClick={invite}
                  disabled={!inviteEmail || inviting}
                  className="bg-gunner-red hover:bg-gunner-red-dark disabled:opacity-40 text-white text-ds-body font-semibold px-4 py-2 rounded-[10px] transition-colors"
                >
                  {inviting ? 'Sending...' : 'Send invite'}
                </button>
              </div>
              {inviteMsg && <p className="text-ds-fine text-gunner-red mt-2">{inviteMsg}</p>}
            </div>
          )}

          {/* Team list */}
          <div className="bg-white border-[0.5px] border-[rgba(0,0,0,0.08)] rounded-[14px] divide-y divide-[rgba(0,0,0,0.06)]">
            {teamMembers.map((member) => (
              <div key={member.id} className="flex items-center gap-3 px-5 py-4">
                <div className="w-8 h-8 rounded-full bg-gunner-red-light flex items-center justify-center shrink-0">
                  <span className="text-gunner-red text-ds-fine font-medium">{member.name[0]}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-ds-body text-txt-primary font-medium">{member.name}</p>
                    {member.id === currentUserId && (
                      <span className="text-ds-fine text-txt-muted bg-surface-secondary px-1.5 py-0.5 rounded-[6px]">you</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <p className="text-ds-fine text-txt-muted">{member.email}</p>
                    {member.phone && (
                      <span className="text-ds-fine text-txt-muted">
                        · <Phone size={10} className="inline mb-0.5" /> {member.phone}
                      </span>
                    )}
                  </div>
                  {/* GHL user mapping */}
                  {canManage && tenant.ghlConnected && (
                    <div className="flex items-center gap-1.5 mt-1.5">
                      <Link2 size={10} className="text-txt-muted shrink-0" />
                      {ghlUsersLoading ? (
                        <span className="text-ds-fine text-txt-muted">Loading GHL users...</span>
                      ) : ghlUsers.length > 0 ? (
                        <select
                          value={member.ghlUserId ?? ''}
                          onChange={(e) => saveGhlUserMapping(member.id, e.target.value || null)}
                          disabled={savingGhlMap === member.id}
                          className="text-ds-fine bg-transparent border-none text-txt-secondary hover:text-txt-primary focus:outline-none cursor-pointer p-0"
                        >
                          <option value="">Map to GHL user...</option>
                          {ghlUsers.map(u => (
                            <option key={u.id} value={u.id}>{u.name} ({u.email})</option>
                          ))}
                        </select>
                      ) : (
                        <span className="text-ds-fine text-txt-muted">
                          {member.ghlUserId ? `GHL: ${member.ghlUserId.slice(0, 8)}...` : 'No GHL mapping'}
                        </span>
                      )}
                    </div>
                  )}
                </div>
                <span className="text-ds-fine text-txt-secondary bg-surface-secondary px-2 py-1 rounded-full">
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
          <div className="bg-white border-[0.5px] border-[rgba(0,0,0,0.08)] rounded-[14px] p-5">
            <div className="flex items-center gap-3 mb-4">
              {tenant.ghlConnected ? (
                <CheckCircle size={18} className="text-semantic-green" />
              ) : (
                <XCircle size={18} className="text-semantic-red" />
              )}
              <div>
                <p className="text-ds-label font-medium text-txt-primary">
                  {tenant.ghlConnected ? 'GHL connected' : 'GHL not connected'}
                </p>
                <p className="text-ds-fine text-txt-secondary">
                  {tenant.ghlConnected
                    ? 'Calls, contacts, and tasks syncing automatically'
                    : 'Connect Go High Level to enable all features'}
                </p>
              </div>
            </div>

            <a
              href={`https://marketplace.gohighlevel.com/oauth/chooselocation?response_type=code&redirect_uri=${encodeURIComponent(window.location.origin + '/api/auth/crm/callback')}&client_id=${process.env.NEXT_PUBLIC_GHL_CLIENT_ID ?? ''}&scope=contacts.readonly+contacts.write+opportunities.readonly+opportunities.write+conversations.readonly+conversations.write+conversations/message.readonly+conversations/message.write+calendars.readonly+calendars/events.readonly+locations.readonly+locations/tasks.readonly+locations/tasks.write+users.readonly`}
              className="inline-flex items-center gap-2 bg-gunner-red hover:bg-gunner-red-dark text-white text-ds-body font-semibold px-4 py-2 rounded-[10px] transition-colors"
            >
              <Zap size={14} /> {tenant.ghlConnected ? 'Reconnect Go High Level' : 'Connect Go High Level'}
            </a>
          </div>

          {/* Workspace URL */}
          <div className="bg-white border-[0.5px] border-[rgba(0,0,0,0.08)] rounded-[14px] p-5">
            <h2 className="text-ds-label font-medium text-txt-primary mb-3">Your workspace URL</h2>
            <div className="flex items-center gap-2 bg-surface-secondary border-[0.5px] border-[rgba(0,0,0,0.08)] rounded-[10px] px-4 py-2.5">
              <span className="text-ds-body text-txt-secondary flex-1 truncate">
                {typeof window !== 'undefined' ? window.location.origin : ''}/{tenant.slug}
              </span>
              <button onClick={copySlug} className="text-txt-muted hover:text-txt-primary transition-colors shrink-0">
                {copied ? <Check size={14} className="text-semantic-green" /> : <Copy size={14} />}
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
          <div className="bg-white border-[0.5px] border-[rgba(0,0,0,0.08)] rounded-[14px] p-5 space-y-5">
            <div>
              <h2 className="text-ds-label font-medium text-txt-primary mb-1">Property creation trigger</h2>
              <p className="text-ds-fine text-txt-secondary mb-4">
                When a GHL contact enters the selected pipeline stage, Gunner AI automatically creates a property in your inventory.
              </p>
            </div>

            {!tenant.ghlConnected ? (
              <div className="bg-semantic-amber-bg border-[0.5px] border-[rgba(0,0,0,0.08)] rounded-[10px] p-4 text-ds-body text-semantic-amber">
                Connect GHL in the Integrations tab first to configure pipeline triggers.
              </div>
            ) : (
              <div className="space-y-4">
                {/* Pipeline dropdown — live from GHL API */}
                <div>
                  <label className="block text-ds-body text-txt-secondary mb-1.5">Pipeline</label>
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
                    <label className="block text-ds-body text-txt-secondary mb-1.5">Trigger stage</label>
                    {pipelineStages.length > 0 ? (
                      <select
                        value={selectedStage}
                        onChange={(e) => setSelectedStage(e.target.value)}
                        className="w-full bg-surface-secondary border-[0.5px] border-[rgba(0,0,0,0.08)] rounded-[10px] px-4 py-2.5 text-txt-primary text-ds-body focus:outline-none focus:border-[rgba(0,0,0,0.14)]"
                      >
                        <option value="">Select a stage...</option>
                        {pipelineStages.map((s) => (
                          <option key={s.id} value={s.id}>{s.name}</option>
                        ))}
                      </select>
                    ) : (
                      <div className="flex items-center gap-2 bg-surface-secondary border-[0.5px] border-[rgba(0,0,0,0.08)] rounded-[10px] px-4 py-2.5 text-ds-body text-txt-muted">
                        <Loader2 size={14} className="animate-spin" />
                        Loading stages...
                      </div>
                    )}
                  </div>
                )}

                {/* Preview what will happen */}
                {selectedStage && (
                  <div className="bg-gunner-red-light border-[0.5px] border-[rgba(0,0,0,0.08)] rounded-[10px] p-4 text-ds-body text-gunner-red">
                    When a contact enters stage <strong className="font-semibold">{pipelineStages.find(s => s.id === selectedStage)?.name}</strong>, a property will be created automatically.
                  </div>
                )}

                {/* Save button */}
                <button
                  onClick={savePipelineSettings}
                  disabled={savingPipeline}
                  className="flex items-center gap-2 bg-gunner-red hover:bg-gunner-red-dark disabled:opacity-40 text-white text-ds-body font-semibold px-5 py-2.5 rounded-[10px] transition-colors"
                >
                  {savingPipeline ? (
                    <><Loader2 size={14} className="animate-spin" /> Saving...</>
                  ) : (
                    'Save pipeline settings'
                  )}
                </button>

                {pipelineSaveMsg && (
                  <p className={`text-ds-fine ${pipelineSaveMsg.includes('Failed') || pipelineSaveMsg.includes('Error') ? 'text-semantic-red' : 'text-semantic-green'}`}>
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

          <CallResultsMap canManage={canManage} tenantId={tenant.id} />

          <CallTypeRubrics />

          {canManage && (
            <GradingMaterialsEditor
              initialMaterials={tenant.gradingMaterials}
            />
          )}

          <div className="bg-white border-[0.5px] border-[rgba(0,0,0,0.08)] rounded-[14px] p-5">
            <RubricEditor
              tenantId={tenant.id}
              callTypes={CALL_TYPES.map(ct => ct.name)}
              existingRubrics={rubrics}
            />
          </div>

          {canManage && <BulkRegradeButton tenantSlug={tenant.slug} />}
        </div>
      )}

      {/* ── Workflows tab ────────────────────────────────────────────── */}
      {tab === 'workflows' && <WorkflowsTab canManage={canManage} />}
    </div>
  )
}

// ─── Call Type Rubrics (read-only view of default rubrics) ──────────────────

function CallTypeRubrics() {
  const [expanded, setExpanded] = useState<string | null>(null)

  return (
    <div className="bg-white border-[0.5px] border-[rgba(0,0,0,0.08)] rounded-[14px] p-5">
      <h2 className="text-ds-label font-medium text-txt-primary mb-1">Grading rubrics by call type</h2>
      <p className="text-ds-fine text-txt-secondary mb-4">Each call type has its own scoring criteria. The AI uses these to grade calls. Expand to see the breakdown.</p>
      <div className="space-y-2">
        {CALL_TYPES.map((ct) => {
          const isExpanded = expanded === ct.id
          return (
            <div key={ct.id} className="border-[0.5px] border-[rgba(0,0,0,0.08)] rounded-[14px] overflow-hidden">
              <button
                onClick={() => setExpanded(isExpanded ? null : ct.id)}
                className="w-full flex items-center justify-between px-4 py-3 hover:bg-surface-secondary transition-colors"
              >
                <div className="flex items-center gap-3">
                  <span className="text-ds-body font-medium text-txt-primary">{ct.name}</span>
                  <span className="text-ds-fine text-txt-muted">{ct.rubric.length} criteria · 100 pts</span>
                </div>
                <span className="text-ds-fine text-txt-muted">{isExpanded ? 'Hide' : 'Show'}</span>
              </button>
              {isExpanded && (
                <div className="px-4 pb-3 space-y-1.5">
                  {ct.rubric.map((r, i) => (
                    <div key={i} className="flex items-start gap-3 bg-surface-secondary rounded-[10px] px-3 py-2">
                      <div className="flex items-center gap-2 shrink-0 w-48">
                        <span className="text-ds-fine font-medium text-txt-primary">{r.category}</span>
                        <span className="text-ds-fine text-gunner-red bg-gunner-red-light px-1.5 py-0.5 rounded-[6px]">{r.maxPoints} pts</span>
                      </div>
                      <p className="text-ds-fine text-txt-secondary leading-relaxed">{r.description}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Grading Materials Editor ───────────────────────────────────────────────

function GradingMaterialsEditor({ initialMaterials }: { initialMaterials: string }) {
  const [materials, setMaterials] = useState(initialMaterials)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const save = useCallback(async () => {
    setSaving(true)
    try {
      const res = await fetch('/api/tenants/config', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gradingMaterials: materials }),
      })
      if (!res.ok) throw new Error()
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch {
      // silent fail
    } finally {
      setSaving(false)
    }
  }, [materials])

  return (
    <div className="bg-white border-[0.5px] border-[rgba(0,0,0,0.08)] rounded-[14px] p-5">
      <h2 className="text-ds-label font-medium text-txt-primary mb-1">Company grading materials</h2>
      <p className="text-ds-fine text-txt-secondary mb-4">
        Paste your call scripts, processes, objection handling guides, or any company-specific standards here.
        The AI will use these alongside the rubric and industry knowledge when grading calls.
      </p>
      <textarea
        value={materials}
        onChange={(e) => setMaterials(e.target.value)}
        placeholder={"Example:\n\nOur cold call script:\n1. Hi [Name], this is [Rep] with New Again Houses...\n2. We buy houses as-is in the Nashville area...\n\nOur objection handling:\n- \"I'm not interested\" → \"I totally understand, most people aren't at first...\"\n\nOur qualifying checklist:\n- Timeline to sell\n- Motivation\n- Property condition\n- Decision maker on the call?"}
        rows={8}
        className="w-full bg-surface-secondary border-[0.5px] border-[rgba(0,0,0,0.08)] rounded-[10px] px-4 py-3 text-ds-body text-txt-primary placeholder-txt-muted focus:outline-none focus:border-[rgba(0,0,0,0.14)] resize-y"
      />
      <div className="flex items-center justify-between mt-3">
        <p className="text-ds-fine text-txt-muted">
          {materials.length > 0 ? `${materials.length} characters` : 'No materials added yet'}
        </p>
        <button
          onClick={save}
          disabled={saving || materials === initialMaterials}
          className="text-ds-body bg-gunner-red hover:bg-gunner-red-dark disabled:opacity-40 text-white px-4 py-2 rounded-[10px] font-semibold transition-colors"
        >
          {saving ? 'Saving...' : saved ? 'Saved' : 'Save materials'}
        </button>
      </div>
    </div>
  )
}

// ─── Call Results Map ───────────────────────────────────────────────────────

const RESULT_COLORS: Record<string, string> = {
  interested: 'border-semantic-green/40 bg-semantic-green-bg text-semantic-green',
  appointment_set: 'border-semantic-green/40 bg-semantic-green-bg text-semantic-green',
  accepted: 'border-semantic-green/40 bg-semantic-green-bg text-semantic-green',
  signed: 'border-semantic-green/40 bg-semantic-green-bg text-semantic-green',
  solved: 'border-semantic-green/40 bg-semantic-green-bg text-semantic-green',
  showing_scheduled: 'border-semantic-blue/40 bg-semantic-blue-bg text-semantic-blue',
  offer_collected: 'border-semantic-green/40 bg-semantic-green-bg text-semantic-green',
  follow_up_scheduled: 'border-semantic-amber/40 bg-semantic-amber-bg text-semantic-amber',
  not_interested: 'border-semantic-red/30 bg-semantic-red-bg text-semantic-red',
  not_qualified: 'border-[rgba(0,0,0,0.08)] bg-surface-tertiary text-txt-secondary',
  not_solved: 'border-semantic-amber/30 bg-semantic-amber-bg text-semantic-amber',
  not_signed: 'border-semantic-amber/30 bg-semantic-amber-bg text-semantic-amber',
  rejected: 'border-semantic-red/30 bg-semantic-red-bg text-semantic-red',
}

function CallResultsMap({ canManage, tenantId }: { canManage: boolean; tenantId: string }) {
  // Build initial state from CALL_TYPES defaults
  const [resultMap, setResultMap] = useState<Record<string, Set<string>>>(() => {
    const map: Record<string, Set<string>> = {}
    for (const ct of CALL_TYPES) {
      map[ct.id] = new Set(ct.results.map(r => r.id))
    }
    return map
  })
  const [saving, setSaving] = useState(false)

  const toggleResult = useCallback(async (callTypeId: string, resultId: string) => {
    if (!canManage) return

    const ct = CALL_TYPES.find(t => t.id === callTypeId)
    if (!ct) return

    const current = new Set(resultMap[callTypeId] ?? [])
    if (current.has(resultId)) {
      if (current.size <= 1) return // must keep at least 1 result
      current.delete(resultId)
    } else {
      current.add(resultId)
    }

    const next = { ...resultMap, [callTypeId]: current }
    setResultMap(next)

    // Save to DB as map format
    setSaving(true)
    try {
      const payload: Record<string, string[]> = {}
      for (const [k, v] of Object.entries(next)) {
        payload[k] = [...v]
      }
      await fetch('/api/tenants/config', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ callResults: payload }),
      })
    } catch {
      // Revert on failure
      const revert = { ...resultMap }
      setResultMap(revert)
    } finally {
      setSaving(false)
    }
  }, [resultMap, canManage])

  // All unique results across all types (for the column headers)
  const allResults = (() => {
    const seen = new Map<string, string>()
    for (const ct of CALL_TYPES) {
      for (const r of ct.results) {
        if (!seen.has(r.id)) seen.set(r.id, r.name)
      }
    }
    return [...seen.entries()].map(([id, name]) => ({ id, name }))
  })()

  return (
    <div className="bg-white border-[0.5px] border-[rgba(0,0,0,0.08)] rounded-[14px] p-5">
      <h2 className="text-ds-label font-medium text-txt-primary mb-1">Call type → Result map</h2>
      <p className="text-ds-fine text-txt-secondary mb-4">
        {canManage
          ? 'Toggle which results are available for each call type. The AI and your team will only see enabled results.'
          : 'Shows which results are available for each call type.'}
      </p>

      <div className="space-y-3">
        {CALL_TYPES.map((ct) => {
          const enabledResults = resultMap[ct.id] ?? new Set()
          return (
            <div key={ct.id} className="border-[0.5px] border-[rgba(0,0,0,0.08)] rounded-[14px] p-3">
              <p className="text-ds-fine font-medium text-txt-primary mb-2">{ct.name}</p>
              <div className="flex flex-wrap gap-1.5">
                {ct.results.map((r) => {
                  const isOn = enabledResults.has(r.id)
                  const colorClass = isOn
                    ? (RESULT_COLORS[r.id] ?? 'border-[rgba(0,0,0,0.08)] bg-surface-secondary text-txt-secondary')
                    : 'border-[rgba(0,0,0,0.06)] bg-transparent text-txt-muted line-through'
                  return (
                    <button
                      key={r.id}
                      onClick={() => canManage && toggleResult(ct.id, r.id)}
                      disabled={saving || !canManage}
                      className={`text-ds-fine border-[0.5px] rounded-full px-3 py-1.5 transition-all ${colorClass} ${canManage ? 'cursor-pointer hover:opacity-80' : ''}`}
                    >
                      {r.name}
                    </button>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
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
    <div className="bg-white border-[0.5px] border-[rgba(0,0,0,0.08)] rounded-[14px] p-5">
      <h2 className="text-ds-label font-medium text-txt-primary mb-1">Call types</h2>
      <p className="text-ds-fine text-txt-secondary mb-4">Select which call types your team uses. The AI uses these definitions to grade each call type differently.</p>
      <div className="space-y-2">
        {CALL_TYPES.map((ct) => {
          const isEnabled = enabled.has(ct.id)
          const isExpanded = expanded === ct.id
          return (
            <div key={ct.id} className={`border-[0.5px] rounded-[14px] transition-colors ${isEnabled ? 'border-gunner-red/20 bg-gunner-red-light' : 'border-[rgba(0,0,0,0.08)] bg-surface-secondary'}`}>
              <div className="flex items-center gap-3 px-4 py-3">
                {canManage && (
                  <button
                    onClick={() => toggle(ct.id)}
                    disabled={saving}
                    className={`w-9 h-5 rounded-full transition-colors flex items-center shrink-0 ${isEnabled ? 'bg-gunner-red justify-end' : 'bg-surface-tertiary justify-start'}`}
                  >
                    <span className="w-4 h-4 bg-white rounded-full mx-0.5 shadow-ds-float" />
                  </button>
                )}
                <div className="flex-1 min-w-0">
                  <p className={`text-ds-body font-medium ${isEnabled ? 'text-txt-primary' : 'text-txt-muted'}`}>{ct.name}</p>
                  <p className="text-ds-fine text-txt-secondary mt-0.5">{ct.description}</p>
                </div>
                <button
                  onClick={() => setExpanded(isExpanded ? null : ct.id)}
                  className="text-ds-fine text-txt-muted hover:text-txt-primary shrink-0"
                >
                  {isExpanded ? 'Hide' : 'AI context'}
                </button>
              </div>
              {isExpanded && (
                <div className="px-4 pb-3 pt-0">
                  <div className="bg-surface-secondary rounded-[10px] p-3 text-ds-fine text-txt-secondary leading-relaxed">
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
          <p className="text-ds-body text-txt-secondary">Automate actions when events occur</p>
          <button onClick={() => setShowCreate(!showCreate)} className="flex items-center gap-1.5 bg-gunner-red hover:bg-gunner-red-dark text-white text-ds-body font-semibold px-4 py-2 rounded-[10px] transition-colors">
            <Plus size={14} /> New workflow
          </button>
        </div>
      )}

      {/* Create form */}
      {showCreate && (
        <div className="bg-white border-[0.5px] border-gunner-red/20 rounded-[14px] p-5 space-y-4">
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label className="text-ds-fine text-txt-secondary mb-1 block">Name</label>
              <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="New lead follow-up" className="w-full bg-surface-secondary border-[0.5px] border-[rgba(0,0,0,0.08)] rounded-[10px] px-3 py-2 text-ds-body text-txt-primary placeholder-txt-muted focus:outline-none focus:border-[rgba(0,0,0,0.14)]" />
            </div>
            <div>
              <label className="text-ds-fine text-txt-secondary mb-1 block">Trigger</label>
              <select value={newTrigger} onChange={e => setNewTrigger(e.target.value)} className="w-full bg-surface-secondary border-[0.5px] border-[rgba(0,0,0,0.08)] rounded-[10px] px-3 py-2 text-ds-body text-txt-primary focus:outline-none">
                {Object.entries(TRIGGER_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="text-ds-fine text-txt-secondary mb-2 block">Steps</label>
            <div className="space-y-2">
              {newSteps.map((step, i) => (
                <div key={i} className="flex gap-2 items-start bg-surface-secondary border-[0.5px] border-[rgba(0,0,0,0.08)] rounded-[10px] p-3">
                  <span className="text-ds-fine text-txt-muted mt-2 w-5 shrink-0">{i + 1}</span>
                  <select value={step.type} onChange={e => updateStep(i, 'type', e.target.value)} className="bg-white border-[0.5px] border-[rgba(0,0,0,0.08)] rounded-[10px] px-2 py-1.5 text-ds-fine text-txt-primary focus:outline-none">
                    {Object.entries(STEP_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                  {step.type === 'wait' ? (
                    <input type="number" value={step.delay} onChange={e => updateStep(i, 'delay', parseInt(e.target.value) || 0)} placeholder="Minutes" className="w-20 bg-white border-[0.5px] border-[rgba(0,0,0,0.08)] rounded-[10px] px-2 py-1.5 text-ds-fine text-txt-primary focus:outline-none" />
                  ) : (
                    <input value={step.action || step.content} onChange={e => updateStep(i, step.type === 'create_task' ? 'action' : 'content', e.target.value)} placeholder={step.type === 'create_task' ? 'Task title...' : 'Content...'} className="flex-1 bg-white border-[0.5px] border-[rgba(0,0,0,0.08)] rounded-[10px] px-2 py-1.5 text-ds-fine text-txt-primary placeholder-txt-muted focus:outline-none" />
                  )}
                  <button onClick={() => removeStep(i)} className="text-txt-muted hover:text-semantic-red mt-1"><Trash2 size={12} /></button>
                </div>
              ))}
            </div>
            <button onClick={addStep} className="text-ds-fine text-gunner-red hover:text-gunner-red-dark mt-2 flex items-center gap-1"><Plus size={10} /> Add step</button>
          </div>

          <div className="flex gap-2">
            <button onClick={createWorkflow} disabled={!newName || saving} className="bg-gunner-red hover:bg-gunner-red-dark disabled:opacity-40 text-white text-ds-body font-semibold px-4 py-2 rounded-[10px] transition-colors">
              {saving ? 'Creating...' : 'Create workflow'}
            </button>
            <button onClick={() => setShowCreate(false)} className="text-txt-secondary hover:text-txt-primary text-ds-body px-3 py-2">Cancel</button>
          </div>
        </div>
      )}

      {/* Workflow list */}
      <div className="bg-white border-[0.5px] border-[rgba(0,0,0,0.08)] rounded-[14px] divide-y divide-[rgba(0,0,0,0.06)]">
        {loading ? (
          <div className="p-8 text-center"><Loader2 size={16} className="text-txt-muted animate-spin mx-auto" /></div>
        ) : workflows.length === 0 ? (
          <div className="p-8 text-center">
            <Workflow size={24} className="text-txt-muted mx-auto mb-3" />
            <p className="text-ds-body text-txt-secondary">No workflows yet. Create one to automate actions.</p>
          </div>
        ) : (
          workflows.map(w => (
            <div key={w.id} className="flex items-center gap-3 px-5 py-4 hover:bg-surface-secondary transition-colors">
              <button onClick={() => canManage && toggleWorkflow(w.id, !w.isActive)} className="shrink-0">
                <Power size={16} className={w.isActive ? 'text-semantic-green' : 'text-txt-muted'} />
              </button>
              <div className="flex-1 min-w-0">
                <p className="text-ds-body text-txt-primary font-medium">{w.name}</p>
                <p className="text-ds-fine text-txt-secondary">
                  {TRIGGER_LABELS[w.triggerEvent] ?? w.triggerEvent} → {w.steps.length} step{w.steps.length !== 1 ? 's' : ''} · {w.executionCount} runs
                </p>
              </div>
              <span className={`text-ds-fine font-medium px-2 py-0.5 rounded-full ${w.isActive ? 'bg-semantic-green-bg text-semantic-green' : 'bg-surface-tertiary text-txt-secondary'}`}>
                {w.isActive ? 'Active' : 'Paused'}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

// ─── Bulk Re-grade Button ──────────────────────────────────────────────────

function BulkRegradeButton({ tenantSlug }: { tenantSlug: string }) {
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<string | null>(null)
  const [confirmed, setConfirmed] = useState(false)

  const handleRegrade = useCallback(async () => {
    if (!confirmed) {
      setConfirmed(true)
      return
    }
    setLoading(true)
    setResult(null)
    try {
      const res = await fetch(`/api/${tenantSlug}/calls/bulk-regrade`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      const data = await res.json() as { message?: string; queued?: number }
      setResult(data.message ?? `${data.queued ?? 0} calls queued`)
    } catch {
      setResult('Failed to start re-grade')
    } finally {
      setLoading(false)
      setConfirmed(false)
    }
  }, [confirmed, tenantSlug])

  return (
    <div className="bg-white border-[0.5px] border-[rgba(0,0,0,0.08)] rounded-[14px] p-5">
      <h2 className="text-ds-label font-medium text-txt-primary mb-1">Bulk re-grade</h2>
      <p className="text-ds-fine text-txt-secondary mb-4">
        Re-grade all transcribed calls with updated rubrics and grading materials. This runs in the background.
      </p>
      <div className="flex items-center gap-3">
        <button
          onClick={handleRegrade}
          disabled={loading}
          className={`text-ds-body font-semibold px-4 py-2 rounded-[10px] transition-colors ${
            confirmed
              ? 'bg-semantic-red text-white hover:bg-semantic-red/90'
              : 'bg-gunner-red text-white hover:bg-gunner-red-dark'
          } disabled:opacity-40`}
        >
          {loading ? (
            <span className="flex items-center gap-1.5"><Loader2 size={14} className="animate-spin" /> Processing...</span>
          ) : confirmed ? (
            'Confirm re-grade all calls'
          ) : (
            'Re-grade all calls'
          )}
        </button>
        {confirmed && !loading && (
          <button onClick={() => setConfirmed(false)} className="text-ds-body text-txt-secondary hover:text-txt-primary">
            Cancel
          </button>
        )}
        {result && (
          <span className="text-ds-body text-semantic-green font-medium">{result}</span>
        )}
      </div>
    </div>
  )
}
