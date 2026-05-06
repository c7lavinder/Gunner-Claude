'use client'
// 5-step onboarding wizard for new tenants

import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter, useSearchParams } from 'next/navigation'
import { CheckCircle, Circle, ArrowRight, ExternalLink } from 'lucide-react'

const STEPS = [
  { id: 1, title: 'Connect GHL', description: 'Link your Go High Level sub-account' },
  { id: 2, title: 'Set property trigger', description: 'Choose which pipeline stage creates a property' },
  { id: 3, title: 'Call types & rubric', description: 'Configure your call types and scoring' },
  { id: 4, title: 'Invite your team', description: 'Add your lead and acquisition managers' },
  { id: 5, title: 'Done', description: "You're ready to go" },
]

export default function OnboardingClient() {
  const { data: session } = useSession()
  const router = useRouter()
  const params = useSearchParams()

  const [step, setStep] = useState(1)
  const [pipelines, setPipelines] = useState<Pipeline[]>([])
  const [selectedPipeline, setSelectedPipeline] = useState('')
  const [selectedStage, setSelectedStage] = useState('')
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState('LEAD_MANAGER')
  const [invites, setInvites] = useState<InviteEntry[]>([])
  const [saving, setSaving] = useState(false)
  const [ghlConnected, setGhlConnected] = useState(false)
  const [loadingPipelines, setLoadingPipelines] = useState(false)

  const tenantSlug = (session?.user as { tenantSlug?: string })?.tenantSlug

  // Pick up step from query param (e.g. after GHL OAuth redirect)
  // Only allow skipping to step 2 if GHL was just connected, otherwise clamp to current progress
  useEffect(() => {
    const urlStep = params.get('step')
    const success = params.get('success')
    if (success === 'ghl_connected') {
      setGhlConnected(true)
      setStep(2) // GHL connected — advance to pipeline selection
    } else if (urlStep) {
      const requested = Number(urlStep)
      // Only allow going back or to step 1-2 via URL; higher steps require completing prior ones
      if (requested <= 2) setStep(requested)
    }
  }, [params])

  // Load pipelines once GHL is connected
  useEffect(() => {
    if (step === 2 && ghlConnected && pipelines.length === 0) {
      setLoadingPipelines(true)
      fetch('/api/ghl/pipelines')
        .then((r) => r.json())
        .then((d) => setPipelines(d.pipelines ?? []))
        .catch(console.error)
        .finally(() => setLoadingPipelines(false))
    }
  }, [step, ghlConnected, pipelines.length])

  function buildGHLOAuthUrl() {
    const base = 'https://marketplace.gohighlevel.com/oauth/chooselocation'
    const params = new URLSearchParams({
      response_type: 'code',
      redirect_uri: `${window.location.origin}/api/auth/crm/callback`,
      client_id: process.env.NEXT_PUBLIC_GHL_CLIENT_ID ?? '',
      scope: 'contacts.readonly contacts.write opportunities.readonly opportunities.write conversations.readonly conversations.write conversations/message.readonly conversations/message.write calendars.readonly calendars/events.readonly calendars/events.write locations.readonly locations/tasks.readonly locations/tasks.write users.readonly workflows.readonly',
    })
    return `${base}?${params}`
  }

  async function savePipelineTrigger() {
    setSaving(true)
    // Phase 1 commit 2: register the picked pipeline as the acquisition
    // track in tenant_ghl_pipelines. The "trigger stage" picker is now
    // informational only — listening is pipeline-wide, not stage-specific.
    if (selectedPipeline) {
      await fetch('/api/tenants/ghl-pipelines', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ghlPipelineId: selectedPipeline, track: 'acquisition' }),
      })
    }
    await fetch('/api/tenants/config', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ onboardingStep: 3 }),
    })
    setSaving(false)
    setStep(3)
  }

  async function saveCallConfig() {
    setSaving(true)
    await fetch('/api/tenants/config', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ onboardingStep: 4 }),
    })
    setSaving(false)
    setStep(4)
  }

  function addInvite() {
    if (!inviteEmail) return
    setInvites((prev) => [...prev, { email: inviteEmail, role: inviteRole }])
    setInviteEmail('')
  }

  async function sendInvites() {
    setSaving(true)
    await fetch('/api/tenants/invite', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ invites }),
    })
    await fetch('/api/tenants/config', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ onboardingStep: 5, onboardingCompleted: true }),
    })
    setSaving(false)
    setStep(5)
  }

  function goToDashboard() {
    const tenantSlug = (session?.user as Record<string, unknown>)?.tenantSlug as string
    router.push(tenantSlug ? `/${tenantSlug}/day-hub` : '/')
  }

  const selectedPipelineObj = pipelines.find((p) => p.id === selectedPipeline)

  return (
    <div className="min-h-screen bg-white flex">
      {/* Left sidebar — step tracker */}
      <div className="w-72 border-r border-[rgba(0,0,0,0.08)] bg-surface-secondary p-8 flex flex-col">
        <div className="flex items-center gap-2 mb-10">
          <div className="w-7 h-7 rounded-[10px] bg-gunner-red flex items-center justify-center">
            <span className="text-white font-semibold text-ds-fine">G</span>
          </div>
          <span className="text-txt-primary font-semibold text-ds-card">Gunner AI</span>
        </div>

        <div className="space-y-1 flex-1">
          {STEPS.map((s) => {
            const done = step > s.id
            const active = step === s.id
            return (
              <div key={s.id} className={`flex items-start gap-3 p-3 rounded-[10px] transition-colors ${active ? 'bg-surface-tertiary' : ''}`}>
                <div className="mt-0.5 shrink-0">
                  {done ? (
                    <CheckCircle size={18} className="text-gunner-red" />
                  ) : (
                    <Circle size={18} className={active ? 'text-gunner-red' : 'text-txt-muted'} />
                  )}
                </div>
                <div>
                  <p className={`text-ds-body font-medium ${active ? 'text-txt-primary' : done ? 'text-txt-secondary' : 'text-txt-muted'}`}>
                    {s.title}
                  </p>
                  <p className="text-ds-fine text-txt-muted mt-0.5">{s.description}</p>
                </div>
              </div>
            )
          })}
        </div>

        <p className="text-ds-fine text-txt-muted mt-6">Step {step} of {STEPS.length}</p>
      </div>

      {/* Main content */}
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-xl">

          {/* Step 1: Connect GHL */}
          {step === 1 && (
            <div className="space-y-6">
              <div>
                <h1 className="text-ds-page font-semibold text-txt-primary">Connect Go High Level</h1>
                <p className="text-txt-secondary mt-2 text-ds-body">
                  Gunner AI connects to your GHL sub-account to sync calls, contacts, tasks, and appointments.
                </p>
              </div>

              {ghlConnected ? (
                <div className="bg-semantic-green-bg border border-semantic-green/20 rounded-[14px] p-5 flex items-center gap-3">
                  <CheckCircle size={20} className="text-semantic-green shrink-0" />
                  <div>
                    <p className="text-semantic-green font-medium text-ds-body">GHL connected successfully</p>
                    <p className="text-txt-secondary text-ds-fine mt-0.5">Webhooks registered and ready</p>
                  </div>
                </div>
              ) : (
                <div className="bg-white border border-[rgba(0,0,0,0.08)] rounded-[14px] p-6 space-y-4">
                  <div className="space-y-2">
                    {['Sync calls for automatic grading', 'Pull contacts and pipeline data', 'Receive real-time updates', 'Send SMS, add notes, create tasks'].map((item) => (
                      <div key={item} className="flex items-center gap-2 text-ds-body text-txt-secondary">
                        <CheckCircle size={14} className="text-gunner-red shrink-0" />
                        {item}
                      </div>
                    ))}
                  </div>

                  <a
                    href={typeof window !== 'undefined' ? buildGHLOAuthUrl() : '#'}
                    className="w-full flex items-center justify-center gap-2 bg-gunner-red hover:bg-gunner-red-dark text-white font-semibold rounded-[10px] py-3 text-ds-body transition-colors"
                  >
                    Connect Go High Level
                    <ExternalLink size={14} />
                  </a>
                </div>
              )}

              {ghlConnected && (
                <button
                  onClick={() => setStep(2)}
                  className="flex items-center gap-2 bg-gunner-red hover:bg-gunner-red-dark text-white font-semibold rounded-[10px] px-6 py-3 text-ds-body transition-colors"
                >
                  Continue <ArrowRight size={14} />
                </button>
              )}
            </div>
          )}

          {/* Step 2: Pipeline trigger */}
          {step === 2 && (
            <div className="space-y-6">
              <div>
                <h1 className="text-ds-page font-semibold text-txt-primary">Set property trigger</h1>
                <p className="text-txt-secondary mt-2 text-ds-body">
                  When a contact enters this pipeline stage, Gunner AI will automatically create a property in your inventory.
                </p>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-ds-label text-txt-primary font-medium mb-1.5">Pipeline</label>
                  {loadingPipelines ? (
                    <div className="w-full bg-surface-secondary border border-[rgba(0,0,0,0.08)] rounded-[10px] px-4 py-2.5 text-txt-muted text-ds-body animate-pulse">
                      Loading pipelines from GHL…
                    </div>
                  ) : (
                  <select
                    value={selectedPipeline}
                    onChange={(e) => { setSelectedPipeline(e.target.value); setSelectedStage('') }}
                    className="w-full bg-surface-secondary border border-[rgba(0,0,0,0.08)] rounded-[10px] px-4 py-2.5 text-txt-primary text-ds-body focus:outline-none focus:border-[rgba(0,0,0,0.14)] transition-colors"
                  >
                    <option value="">Select a pipeline…</option>
                    {pipelines.map((p) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                  )}
                </div>

                {selectedPipeline && selectedPipelineObj && (
                  <div>
                    <label className="block text-ds-label text-txt-primary font-medium mb-1.5">Trigger stage</label>
                    <select
                      value={selectedStage}
                      onChange={(e) => setSelectedStage(e.target.value)}
                      className="w-full bg-surface-secondary border border-[rgba(0,0,0,0.08)] rounded-[10px] px-4 py-2.5 text-txt-primary text-ds-body focus:outline-none focus:border-[rgba(0,0,0,0.14)] transition-colors"
                    >
                      <option value="">Select a stage…</option>
                      {selectedPipelineObj.stages.map((s) => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </select>
                  </div>
                )}

                {selectedStage && (
                  <div className="bg-gunner-red-light border border-gunner-red/10 rounded-[10px] p-4 text-ds-body text-txt-primary">
                    When a contact enters <strong>{selectedPipelineObj?.stages.find(s => s.id === selectedStage)?.name}</strong>, a property will be created automatically.
                  </div>
                )}
              </div>

              <button
                onClick={savePipelineTrigger}
                disabled={!selectedStage || saving}
                className="flex items-center gap-2 bg-gunner-red hover:bg-gunner-red-dark disabled:opacity-40 text-white font-semibold rounded-[10px] px-6 py-3 text-ds-body transition-colors"
              >
                {saving ? 'Saving…' : 'Save and continue'} <ArrowRight size={14} />
              </button>
            </div>
          )}

          {/* Step 3: Call config */}
          {step === 3 && (
            <div className="space-y-6">
              <div>
                <h1 className="text-ds-page font-semibold text-txt-primary">Call types & scoring</h1>
                <p className="text-txt-secondary mt-2 text-ds-body">
                  We have set up sensible defaults for wholesalers. You can customize these anytime in Settings.
                </p>
              </div>

              <div className="space-y-4">
                <div className="bg-white border border-[rgba(0,0,0,0.08)] rounded-[14px] p-5">
                  <p className="text-ds-label font-medium text-txt-primary mb-3">Default call types</p>
                  <div className="flex flex-wrap gap-2">
                    {['Inbound lead', 'Outbound cold call', 'Follow-up', 'Appointment confirmation'].map((t) => (
                      <span key={t} className="bg-surface-secondary border border-[rgba(0,0,0,0.08)] rounded-[9999px] px-3 py-1 text-ds-fine text-txt-secondary">{t}</span>
                    ))}
                  </div>
                </div>

                <div className="bg-white border border-[rgba(0,0,0,0.08)] rounded-[14px] p-5">
                  <p className="text-ds-label font-medium text-txt-primary mb-3">Default scoring rubric</p>
                  <div className="space-y-2">
                    {[
                      { label: 'Opening & rapport', pts: 20 },
                      { label: 'Qualifying questions', pts: 25 },
                      { label: 'Listening & discovery', pts: 20 },
                      { label: 'Objection handling', pts: 20 },
                      { label: 'Clear next step', pts: 15 },
                    ].map((r) => (
                      <div key={r.label} className="flex items-center justify-between text-ds-body">
                        <span className="text-txt-secondary">{r.label}</span>
                        <span className="text-gunner-red font-medium">{r.pts} pts</span>
                      </div>
                    ))}
                  </div>
                  <p className="text-ds-fine text-txt-muted mt-3">Customize per role in Settings → Call Rubrics</p>
                </div>
              </div>

              <button
                onClick={saveCallConfig}
                disabled={saving}
                className="flex items-center gap-2 bg-gunner-red hover:bg-gunner-red-dark disabled:opacity-40 text-white font-semibold rounded-[10px] px-6 py-3 text-ds-body transition-colors"
              >
                {saving ? 'Saving…' : 'Looks good, continue'} <ArrowRight size={14} />
              </button>
            </div>
          )}

          {/* Step 4: Invite team */}
          {step === 4 && (
            <div className="space-y-6">
              <div>
                <h1 className="text-ds-page font-semibold text-txt-primary">Invite your team</h1>
                <p className="text-txt-secondary mt-2 text-ds-body">
                  Add team members now or skip — you can always invite from Settings.
                </p>
              </div>

              <div className="space-y-3">
                <div className="flex gap-2">
                  <input
                    type="email"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    placeholder="teammate@company.com"
                    className="flex-1 bg-surface-secondary border border-[rgba(0,0,0,0.08)] rounded-[10px] px-4 py-2.5 text-txt-primary placeholder-txt-muted text-ds-body focus:outline-none focus:border-[rgba(0,0,0,0.14)] transition-colors"
                  />
                  <select
                    value={inviteRole}
                    onChange={(e) => setInviteRole(e.target.value)}
                    className="bg-surface-secondary border border-[rgba(0,0,0,0.08)] rounded-[10px] px-3 py-2.5 text-txt-primary text-ds-body focus:outline-none focus:border-[rgba(0,0,0,0.14)] transition-colors"
                  >
                    <option value="LEAD_MANAGER">Lead Manager</option>
                    <option value="ACQUISITION_MANAGER">Acquisition</option>
                    <option value="DISPOSITION_MANAGER">Disposition</option>
                    <option value="TEAM_LEAD">Team Lead</option>
                    <option value="ADMIN">Admin</option>
                  </select>
                  <button
                    onClick={addInvite}
                    className="bg-surface-secondary hover:bg-surface-tertiary border border-[rgba(0,0,0,0.14)] text-txt-primary rounded-[10px] px-4 py-2.5 text-ds-body font-medium transition-colors"
                  >
                    Add
                  </button>
                </div>

                {invites.length > 0 && (
                  <div className="bg-white border border-[rgba(0,0,0,0.08)] rounded-[14px] divide-y divide-[rgba(0,0,0,0.06)]">
                    {invites.map((inv, i) => (
                      <div key={i} className="flex items-center justify-between px-4 py-3">
                        <span className="text-ds-body text-txt-primary">{inv.email}</span>
                        <span className="text-ds-fine text-txt-secondary bg-surface-secondary px-2 py-0.5 rounded-[9999px]">{inv.role.replace('_', ' ')}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => { setStep(5); fetch('/api/tenants/config', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ onboardingCompleted: true }) }) }}
                  className="text-ds-body text-txt-secondary hover:text-txt-primary transition-colors px-4 py-3"
                >
                  Skip for now
                </button>
                <button
                  onClick={sendInvites}
                  disabled={invites.length === 0 || saving}
                  className="flex items-center gap-2 bg-gunner-red hover:bg-gunner-red-dark disabled:opacity-40 text-white font-semibold rounded-[10px] px-6 py-3 text-ds-body transition-colors"
                >
                  {saving ? 'Sending…' : 'Send invites'} <ArrowRight size={14} />
                </button>
              </div>
            </div>
          )}

          {/* Step 5: Done */}
          {step === 5 && (
            <div className="space-y-6">
              <div className="w-16 h-16 rounded-[14px] bg-gunner-red-light flex items-center justify-center">
                <CheckCircle size={32} className="text-gunner-red" />
              </div>
              <div>
                <h1 className="text-ds-page font-semibold text-txt-primary">You are all set!</h1>
                <p className="text-txt-secondary mt-2 text-ds-body">
                  Gunner AI is connected and ready. Calls will be graded automatically, properties will sync from GHL, and your team can start tracking KPIs.
                </p>
              </div>
              <button
                onClick={goToDashboard}
                className="inline-flex items-center gap-2 bg-gunner-red hover:bg-gunner-red-dark text-white font-semibold rounded-[10px] px-8 py-3 text-ds-body transition-colors"
              >
                Open my Day Hub <ArrowRight size={14} />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

interface Pipeline {
  id: string
  name: string
  stages: Array<{ id: string; name: string }>
}

interface InviteEntry {
  email: string
  role: string
}
