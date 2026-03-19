'use client'
// components/settings/settings-client.tsx

import { useState } from 'react'
import { Users, Phone, Zap, CheckCircle, XCircle, Copy, Check } from 'lucide-react'
import { ROLE_LABELS, type UserRole } from '@/types/roles'
import { RubricEditor } from '@/components/settings/rubric-editor'

interface TenantInfo {
  id: string; name: string; slug: string; ghlConnected: boolean
  callTypes: string[]; callResults: string[]
}
interface TeamMember {
  id: string; name: string; email: string; role: string
  reportsTo: string | null; createdAt: string
}
interface Rubric {
  id: string; name: string; role: string; callType: string | null; isDefault: boolean
}

type Tab = 'team' | 'ghl' | 'calls'

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

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'team', label: 'Team', icon: <Users size={14} /> },
    { id: 'ghl', label: 'GHL connection', icon: <Zap size={14} /> },
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

      {/* Team tab */}
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

      {/* GHL tab */}
      {tab === 'ghl' && (
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

            {!tenant.ghlConnected && (
              <a
                href={`https://marketplace.gohighlevel.com/oauth/chooselocation?response_type=code&redirect_uri=${encodeURIComponent(window.location.origin + '/api/auth/crm/callback')}&client_id=${process.env.NEXT_PUBLIC_GHL_CLIENT_ID ?? ''}&scope=contacts.readonly+contacts.write+opportunities.readonly+opportunities.write+conversations.readonly+conversations.write+calls.readonly+tasks.readonly+tasks.write+calendars.readonly`}
                className="inline-flex items-center gap-2 bg-orange-500 hover:bg-orange-600 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
              >
                <Zap size={14} /> Connect Go High Level
              </a>
            )}
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

      {/* Call config tab */}
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
