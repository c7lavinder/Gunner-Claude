// components/settings/settings-client.tsx
// Client component for the /{tenant}/settings page
// Contains 4 tabs: Team, Integrations, Pipeline, Call Config
// Rule 3: All settings live here — no gear icons on individual pages

'use client'

import { useState, useCallback } from 'react'
import { Users, Phone, Zap, GitBranch, CheckCircle, XCircle, Copy, Check, Loader2 } from 'lucide-react'
import { ROLE_LABELS, type UserRole } from '@/types/roles'
import { RubricEditor } from '@/components/settings/rubric-editor'
import { GHLDropdown } from '@/components/ui/ghl-dropdown'

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
  id: string; name: string; email: string; role: string
  reportsTo: string | null; createdAt: string
}
interface Rubric {
  id: string; name: string; role: string; callType: string | null; isDefault: boolean
}

type Tab = 'team' | 'integrations' | 'pipeline' | 'calls'

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
                  <p className="text-xs text-gray-500">{member.email}</p>
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
              href={`https://marketplace.gohighlevel.com/oauth/chooselocation?response_type=code&redirect_uri=${encodeURIComponent(window.location.origin + '/api/auth/crm/callback')}&client_id=${process.env.NEXT_PUBLIC_GHL_CLIENT_ID ?? ''}&scope=contacts.readonly+contacts.write+opportunities.readonly+opportunities.write+conversations.readonly+conversations.write+calendars.readonly+calendars/events.readonly+locations.readonly+users.readonly`}
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
          <div className="bg-[#1a1d27] border border-white/10 rounded-2xl p-5">
            <h2 className="text-sm font-medium text-white mb-3">Call types</h2>
            <div className="flex flex-wrap gap-2">
              {(tenant.callTypes as string[]).map((t) => (
                <span key={t} className="text-xs bg-white/5 border border-white/10 rounded-full px-3 py-1.5 text-gray-300">{t}</span>
              ))}
            </div>
            {canManage && <p className="text-xs text-gray-600 mt-3">Contact support to customize call types</p>}
          </div>

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
              callTypes={callTypes}
              existingRubrics={rubrics}
            />
          </div>
        </div>
      )}
    </div>
  )
}
