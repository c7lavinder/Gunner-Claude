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

  const tenantSlug = (session?.user as { tenantSlug?: string })?.tenantSlug

  // Pick up step from query param (e.g. after GHL OAuth redirect)
  useEffect(() => {
    const urlStep = params.get('step')
    const success = params.get('success')
    if (urlStep) setStep(Number(urlStep))
    if (success === 'ghl_connected') setGhlConnected(true)
  }, [params])

  // Load pipelines once GHL is connected
  useEffect(() => {
    if (step === 2 && ghlConnected) {
      fetch('/api/ghl/pipelines')
        .then((r) => r.json())
        .then((d) => setPipelines(d.pipelines ?? []))
        .catch(console.error)
    }
  }, [step, ghlConnected])

  function buildGHLOAuthUrl() {
    const base = 'https://marketplace.gohighlevel.com/oauth/chooselocation'
    const params = new URLSearchParams({
      response_type: 'code',
      redirect_uri: `${window.location.origin}/api/auth/crm/callback`,
      client_id: process.env.NEXT_PUBLIC_GHL_CLIENT_ID ?? '',
      scope: 'contacts.readonly contacts.write opportunities.readonly opportunities.write conversations.readonly conversations.write calendars.readonly calendars/events.readonly locations.readonly users.readonly',
    })
    return `${base}?${params}`
  }

  async function savePipelineTrigger() {
    setSaving(true)
    await fetch('/api/tenants/config', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ propertyPipelineId: selectedPipeline, propertyTriggerStage: selectedStage, onboardingStep: 3 }),
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
    router.push(`/${tenantSlug}/dashboard`)
  }

  const selectedPipelineObj = pipelines.find((p) => p.id === selectedPipeline)

  return (
    <div className="min-h-screen bg-[#0f1117] flex">
      {/* Left sidebar — step tracker */}
      <div className="w-72 border-r border-white/10 p-8 flex flex-col">
        <div className="flex items-center gap-2 mb-10">
          <div className="w-7 h-7 rounded-lg bg-orange-500 flex items-center justify-center">
            <span className="text-white font-bold text-xs">G</span>
          </div>
          <span className="text-white font-semibold">Gunner AI</span>
        </div>

        <div className="space-y-1 flex-1">
          {STEPS.map((s) => {
            const done = step > s.id
            const active = step === s.id
            return (
              <div key={s.id} className={`flex items-start gap-3 p-3 rounded-lg transition-colors ${active ? 'bg-white/5' : ''}`}>
                <div className="mt-0.5 shrink-0">
                  {done ? (
                    <CheckCircle size={18} className="text-orange-500" />
                  ) : (
                    <Circle size={18} className={active ? 'text-orange-500' : 'text-gray-600'} />
                  )}
                </div>
                <div>
                  <p className={`text-sm font-medium ${active ? 'text-white' : done ? 'text-gray-400' : 'text-gray-600'}`}>
                    {s.title}
                  </p>
                  <p className="text-xs text-gray-600 mt-0.5">{s.description}</p>
                </div>
              </div>
            )
          })}
        </div>

        <p className="text-xs text-gray-600 mt-6">Step {step} of {STEPS.length}</p>
      </div>

      {/* Main content */}
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-xl">

          {/* Step 1: Connect GHL */}
          {step === 1 && (
            <div className="space-y-6">
              <div>
                <h1 className="text-2xl font-semibold text-white">Connect Go High Level</h1>
                <p className="text-gray-400 mt-2 text-sm">
                  Gunner AI connects to your GHL sub-account to sync calls, contacts, tasks, and appointments.
                </p>
              </div>

              {ghlConnected ? (
                <div className="bg-green-500/10 border border-green-500/30 rounded-xl p-5 flex items-center gap-3">
                  <CheckCircle size={20} className="text-green-400 shrink-0" />
                  <div>
                    <p className="text-green-400 font-medium text-sm">GHL connected successfully</p>
                    <p className="text-gray-400 text-xs mt-0.5">Webhooks registered and ready</p>
                  </div>
                </div>
              ) : (
                <div className="bg-[#1a1d27] border border-white/10 rounded-xl p-6 space-y-4">
                  <div className="space-y-2">
                    {['Sync calls for automatic grading', 'Pull contacts and pipeline data', 'Receive real-time updates', 'Send SMS, add notes, create tasks'].map((item) => (
                      <div key={item} className="flex items-center gap-2 text-sm text-gray-300">
                        <CheckCircle size={14} className="text-orange-500 shrink-0" />
                        {item}
                      </div>
                    ))}
                  </div>

                  <a
                    href={typeof window !== 'undefined' ? buildGHLOAuthUrl() : '#'}
                    className="w-full flex items-center justify-center gap-2 bg-orange-500 hover:bg-orange-600 text-white font-medium rounded-lg py-3 text-sm transition-colors"
                  >
                    Connect Go High Level
                    <ExternalLink size={14} />
                  </a>
                </div>
              )}

              {ghlConnected && (
                <button
                  onClick={() => setStep(2)}
                  className="flex items-center gap-2 bg-orange-500 hover:bg-orange-600 text-white font-medium rounded-lg px-6 py-3 text-sm transition-colors"
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
                <h1 className="text-2xl font-semibold text-white">Set property trigger</h1>
                <p className="text-gray-400 mt-2 text-sm">
                  When a contact enters this pipeline stage, Gunner AI will automatically create a property in your inventory.
                </p>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm text-gray-300 mb-1.5">Pipeline</label>
                  <select
                    value={selectedPipeline}
                    onChange={(e) => { setSelectedPipeline(e.target.value); setSelectedStage('') }}
                    className="w-full bg-[#0f1117] border border-white/10 rounded-lg px-4 py-2.5 text-white text-sm focus:outline-none focus:border-orange-500"
                  >
                    <option value="">Select a pipeline…</option>
                    {pipelines.map((p) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </div>

                {selectedPipeline && selectedPipelineObj && (
                  <div>
                    <label className="block text-sm text-gray-300 mb-1.5">Trigger stage</label>
                    <select
                      value={selectedStage}
                      onChange={(e) => setSelectedStage(e.target.value)}
                      className="w-full bg-[#0f1117] border border-white/10 rounded-lg px-4 py-2.5 text-white text-sm focus:outline-none focus:border-orange-500"
                    >
                      <option value="">Select a stage…</option>
                      {selectedPipelineObj.stages.map((s) => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </select>
                  </div>
                )}

                {selectedStage && (
                  <div className="bg-orange-500/10 border border-orange-500/20 rounded-lg p-4 text-sm text-orange-300">
                    When a contact enters <strong>{selectedPipelineObj?.stages.find(s => s.id === selectedStage)?.name}</strong>, a property will be created automatically.
                  </div>
                )}
              </div>

              <button
                onClick={savePipelineTrigger}
                disabled={!selectedStage || saving}
                className="flex items-center gap-2 bg-orange-500 hover:bg-orange-600 disabled:opacity-40 text-white font-medium rounded-lg px-6 py-3 text-sm transition-colors"
              >
                {saving ? 'Saving…' : 'Save and continue'} <ArrowRight size={14} />
              </button>
            </div>
          )}

          {/* Step 3: Call config */}
          {step === 3 && (
            <div className="space-y-6">
              <div>
                <h1 className="text-2xl font-semibold text-white">Call types & scoring</h1>
                <p className="text-gray-400 mt-2 text-sm">
                  We have set up sensible defaults for wholesalers. You can customize these anytime in Settings.
                </p>
              </div>

              <div className="space-y-4">
                <div className="bg-[#1a1d27] border border-white/10 rounded-xl p-5">
                  <p className="text-sm font-medium text-gray-300 mb-3">Default call types</p>
                  <div className="flex flex-wrap gap-2">
                    {['Inbound lead', 'Outbound cold call', 'Follow-up', 'Appointment confirmation'].map((t) => (
                      <span key={t} className="bg-white/5 border border-white/10 rounded-full px-3 py-1 text-xs text-gray-300">{t}</span>
                    ))}
                  </div>
                </div>

                <div className="bg-[#1a1d27] border border-white/10 rounded-xl p-5">
                  <p className="text-sm font-medium text-gray-300 mb-3">Default scoring rubric</p>
                  <div className="space-y-2">
                    {[
                      { label: 'Opening & rapport', pts: 20 },
                      { label: 'Qualifying questions', pts: 25 },
                      { label: 'Listening & discovery', pts: 20 },
                      { label: 'Objection handling', pts: 20 },
                      { label: 'Clear next step', pts: 15 },
                    ].map((r) => (
                      <div key={r.label} className="flex items-center justify-between text-sm">
                        <span className="text-gray-400">{r.label}</span>
                        <span className="text-orange-400 font-medium">{r.pts} pts</span>
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-gray-600 mt-3">Customize per role in Settings → Call Rubrics</p>
                </div>
              </div>

              <button
                onClick={saveCallConfig}
                disabled={saving}
                className="flex items-center gap-2 bg-orange-500 hover:bg-orange-600 disabled:opacity-40 text-white font-medium rounded-lg px-6 py-3 text-sm transition-colors"
              >
                {saving ? 'Saving…' : 'Looks good, continue'} <ArrowRight size={14} />
              </button>
            </div>
          )}

          {/* Step 4: Invite team */}
          {step === 4 && (
            <div className="space-y-6">
              <div>
                <h1 className="text-2xl font-semibold text-white">Invite your team</h1>
                <p className="text-gray-400 mt-2 text-sm">
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
                    className="flex-1 bg-[#0f1117] border border-white/10 rounded-lg px-4 py-2.5 text-white placeholder-gray-500 text-sm focus:outline-none focus:border-orange-500"
                  />
                  <select
                    value={inviteRole}
                    onChange={(e) => setInviteRole(e.target.value)}
                    className="bg-[#0f1117] border border-white/10 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-orange-500"
                  >
                    <option value="LEAD_MANAGER">Lead Manager</option>
                    <option value="ACQUISITION_MANAGER">Acquisition</option>
                    <option value="DISPOSITION_MANAGER">Disposition</option>
                    <option value="TEAM_LEAD">Team Lead</option>
                    <option value="ADMIN">Admin</option>
                  </select>
                  <button
                    onClick={addInvite}
                    className="bg-white/10 hover:bg-white/20 text-white rounded-lg px-4 py-2.5 text-sm transition-colors"
                  >
                    Add
                  </button>
                </div>

                {invites.length > 0 && (
                  <div className="bg-[#1a1d27] border border-white/10 rounded-xl divide-y divide-white/5">
                    {invites.map((inv, i) => (
                      <div key={i} className="flex items-center justify-between px-4 py-3">
                        <span className="text-sm text-white">{inv.email}</span>
                        <span className="text-xs text-gray-400 bg-white/5 px-2 py-0.5 rounded-full">{inv.role.replace('_', ' ')}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => { setStep(5); fetch('/api/tenants/config', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ onboardingCompleted: true }) }) }}
                  className="text-sm text-gray-400 hover:text-white transition-colors px-4 py-3"
                >
                  Skip for now
                </button>
                <button
                  onClick={sendInvites}
                  disabled={invites.length === 0 || saving}
                  className="flex items-center gap-2 bg-orange-500 hover:bg-orange-600 disabled:opacity-40 text-white font-medium rounded-lg px-6 py-3 text-sm transition-colors"
                >
                  {saving ? 'Sending…' : 'Send invites'} <ArrowRight size={14} />
                </button>
              </div>
            </div>
          )}

          {/* Step 5: Done */}
          {step === 5 && (
            <div className="text-center space-y-6">
              <div className="w-16 h-16 rounded-2xl bg-orange-500/20 flex items-center justify-center mx-auto">
                <CheckCircle size={32} className="text-orange-500" />
              </div>
              <div>
                <h1 className="text-2xl font-semibold text-white">You are all set!</h1>
                <p className="text-gray-400 mt-2 text-sm">
                  Gunner AI is connected and ready. Calls will be graded automatically, properties will sync from GHL, and your team can start tracking KPIs.
                </p>
              </div>
              <button
                onClick={goToDashboard}
                className="inline-flex items-center gap-2 bg-orange-500 hover:bg-orange-600 text-white font-medium rounded-lg px-8 py-3 text-sm transition-colors"
              >
                Open my dashboard <ArrowRight size={14} />
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
