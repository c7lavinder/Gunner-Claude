'use client'
// components/tasks/tasks-client.tsx
// Day Hub-style task view — category tabs, AM/PM badges, expandable details

import { useState } from 'react'
import { CheckSquare, Clock, AlertCircle, MapPin, Phone, User, ChevronDown, ChevronUp, Loader2, ExternalLink } from 'lucide-react'
import { format, differenceInDays } from 'date-fns'
import Link from 'next/link'

// ─── Types ─────────────────────────────────────────────────────────────────

export interface EnrichedTask {
  id: string
  title: string
  body: string | null
  category: 'New Lead' | 'Reschedule' | 'Admin' | 'Follow-Up'
  score: number
  dueDate: string | null
  isOverdue: boolean
  isDueToday: boolean
  contactId: string
  contactName: string | null
  contactPhone: string | null
  contactAddress: string | null
  assignedToName: string | null
  amDone: boolean
  pmDone: boolean
}

interface TaskDetails {
  notes: Array<{ id: string; body: string; dateAdded: string }>
  lastCall: { id: string; score: number | null; summary: string | null; createdAt: string } | null
  todayActivity: Array<{ type: string; direction: string; body: string; dateAdded: string }>
}

const CATEGORY_COLORS: Record<string, { badge: string; header: string }> = {
  'New Lead': { badge: 'text-orange-400 bg-orange-500/10', header: 'text-orange-400' },
  'Reschedule': { badge: 'text-yellow-400 bg-yellow-500/10', header: 'text-yellow-400' },
  'Admin': { badge: 'text-blue-400 bg-blue-500/10', header: 'text-blue-400' },
  'Follow-Up': { badge: 'text-gray-400 bg-white/5', header: 'text-gray-400' },
}

const ALL_CATEGORIES = ['New Lead', 'Reschedule', 'Follow-Up', 'Admin'] as const

// ─── Main component ────────────────────────────────────────────────────────

export function TasksClient({ tasks, isAdmin, tenantSlug, fetchError }: {
  tasks: EnrichedTask[]
  isAdmin: boolean
  tenantSlug: string
  fetchError?: boolean
}) {
  const [activeCategory, setActiveCategory] = useState<string | null>(null)
  const [assignedFilter, setAssignedFilter] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  // Filter
  let filtered = tasks
  if (activeCategory) filtered = filtered.filter(t => t.category === activeCategory)
  if (assignedFilter) filtered = filtered.filter(t => t.assignedToName === assignedFilter)

  // Group by category (preserving score order within groups)
  const grouped = ALL_CATEGORIES.reduce<Record<string, EnrichedTask[]>>((acc, cat) => {
    const items = filtered.filter(t => t.category === cat)
    if (items.length > 0) acc[cat] = items
    return acc
  }, {})

  // Unique assigned names for admin filter
  const assignedNames = [...new Set(tasks.map(t => t.assignedToName).filter(Boolean))] as string[]

  const overdueCount = tasks.filter(t => t.isOverdue).length

  return (
    <div className="space-y-5 max-w-3xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-white">Tasks</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            {tasks.length} open task{tasks.length !== 1 ? 's' : ''}
            {overdueCount > 0 && (
              <span className="ml-2 text-red-400 inline-flex items-center gap-1">
                <AlertCircle size={11} /> {overdueCount} overdue
              </span>
            )}
          </p>
        </div>
      </div>

      {/* GHL fetch error */}
      {fetchError && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl px-4 py-4 space-y-2">
          <div className="flex items-center gap-2 text-amber-400 text-sm font-medium">
            <AlertCircle size={14} />
            Could not load tasks from Go High Level
          </div>
          <p className="text-xs text-amber-300/70 leading-relaxed">
            Check Railway logs for the exact error. Most common causes: GHL token needs refresh, or the POST body format changed. Go to{' '}
            <a href={`/${tenantSlug}/settings`} className="underline hover:text-amber-300">Settings → Integrations</a>
            {' '}and reconnect GHL if the error persists.
          </p>
        </div>
      )}

      {/* Category filter tabs */}
      <div className="flex flex-wrap gap-2 items-center">
        <button
          onClick={() => setActiveCategory(null)}
          className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
            activeCategory === null
              ? 'border-orange-500 bg-orange-500/15 text-orange-400'
              : 'border-white/10 text-gray-400 hover:text-white'
          }`}
        >
          All <span className="ml-1 text-gray-600">{tasks.length}</span>
        </button>
        {ALL_CATEGORIES.map(cat => {
          const count = tasks.filter(t => t.category === cat).length
          if (count === 0) return null
          return (
            <button
              key={cat}
              onClick={() => setActiveCategory(activeCategory === cat ? null : cat)}
              className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                activeCategory === cat
                  ? 'border-orange-500 bg-orange-500/15 text-orange-400'
                  : 'border-white/10 text-gray-400 hover:text-white'
              }`}
            >
              {cat} <span className="ml-1 text-gray-600">{count}</span>
            </button>
          )
        })}

        {/* Admin: team member filter */}
        {isAdmin && assignedNames.length > 0 && (
          <select
            value={assignedFilter ?? ''}
            onChange={e => setAssignedFilter(e.target.value || null)}
            className="ml-auto bg-[#0f1117] border border-white/10 rounded-lg px-3 py-1.5 text-xs text-gray-400 focus:outline-none"
          >
            <option value="">All team members</option>
            {assignedNames.map(name => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>
        )}
      </div>

      {/* Task groups by category */}
      {Object.keys(grouped).length === 0 ? (
        <div className="bg-[#1a1d27] border border-white/10 rounded-2xl py-16 text-center">
          <CheckSquare size={28} className="text-green-500/40 mx-auto mb-3" />
          <p className="text-white font-medium text-sm">You're all caught up</p>
          <p className="text-gray-600 text-xs mt-1">No tasks to show</p>
        </div>
      ) : (
        Object.entries(grouped).map(([category, items]) => {
          const colors = CATEGORY_COLORS[category] ?? CATEGORY_COLORS['Follow-Up']
          return (
            <div key={category}>
              <div className="flex items-center gap-2 mb-2">
                <span className={`text-xs font-medium uppercase tracking-wider ${colors.header}`}>{category}</span>
                <span className="text-xs text-gray-600">{items.length}</span>
              </div>
              <div className="bg-[#1a1d27] border border-white/10 rounded-2xl divide-y divide-white/5">
                {items.map(task => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    tenantSlug={tenantSlug}
                    expanded={expandedId === task.id}
                    onToggle={() => setExpandedId(expandedId === task.id ? null : task.id)}
                  />
                ))}
              </div>
            </div>
          )
        })
      )}
    </div>
  )
}

// ─── Task card ─────────────────────────────────────────────────────────────

function TaskCard({ task, tenantSlug, expanded, onToggle }: {
  task: EnrichedTask
  tenantSlug: string
  expanded: boolean
  onToggle: () => void
}) {
  const daysOverdue = task.dueDate && task.isOverdue
    ? differenceInDays(new Date(), new Date(task.dueDate))
    : 0

  return (
    <div>
      <button
        onClick={onToggle}
        className={`w-full text-left px-4 py-3.5 hover:bg-white/[0.02] transition-colors ${task.isOverdue ? 'bg-red-500/[0.03]' : ''}`}
      >
        <div className="flex items-start gap-3">
          <div className="flex-1 min-w-0">
            {/* Contact name (large) */}
            <p className={`text-sm font-medium ${task.isOverdue ? 'text-red-300' : 'text-white'}`}>
              {task.contactName ?? 'Unknown contact'}
            </p>

            {/* Contact address */}
            <p className="text-xs text-gray-500 flex items-center gap-1 mt-0.5">
              <MapPin size={9} className="shrink-0" />
              {task.contactAddress || 'No address'}
            </p>

            {/* Task title */}
            <p className="text-xs text-gray-400 mt-1">{task.title}</p>

            {/* Metadata row */}
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              {/* Category badge */}
              <span className={`text-xs px-2 py-0.5 rounded-full ${CATEGORY_COLORS[task.category]?.badge ?? 'text-gray-400 bg-white/5'}`}>
                {task.category}
              </span>

              {/* Due date badge */}
              {task.isOverdue && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-red-500/15 text-red-400">
                  Overdue {daysOverdue}d
                </span>
              )}
              {task.isDueToday && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-orange-500/15 text-orange-400">
                  Due today
                </span>
              )}
              {!task.isOverdue && !task.isDueToday && task.dueDate && (
                <span className="text-xs text-gray-500 flex items-center gap-1">
                  <Clock size={9} /> Due {format(new Date(task.dueDate), 'MMM d')}
                </span>
              )}

              {/* AM/PM badges */}
              <span className={`text-xs px-1.5 py-0.5 rounded ${task.amDone ? 'bg-green-500/15 text-green-400' : 'bg-white/5 text-gray-600'}`}>
                AM {task.amDone ? '✓' : ''}
              </span>
              <span className={`text-xs px-1.5 py-0.5 rounded ${task.pmDone ? 'bg-green-500/15 text-green-400' : 'bg-white/5 text-gray-600'}`}>
                PM {task.pmDone ? '✓' : ''}
              </span>

              {/* Assigned to */}
              {task.assignedToName && (
                <span className="text-xs text-gray-600 flex items-center gap-1">
                  <User size={9} /> {task.assignedToName}
                </span>
              )}
            </div>
          </div>

          {/* Expand icon */}
          <div className="shrink-0 mt-1 text-gray-600">
            {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </div>
        </div>
      </button>

      {/* Expanded detail panel */}
      {expanded && (
        <TaskDetailPanel
          contactId={task.contactId}
          contactName={task.contactName}
          contactPhone={task.contactPhone}
          contactAddress={task.contactAddress}
          tenantSlug={tenantSlug}
        />
      )}
    </div>
  )
}

// ─── Expandable detail panel ───────────────────────────────────────────────

function TaskDetailPanel({ contactId, contactName, contactPhone, contactAddress, tenantSlug }: {
  contactId: string
  contactName: string | null
  contactPhone: string | null
  contactAddress: string | null
  tenantSlug: string
}) {
  const [details, setDetails] = useState<TaskDetails | null>(null)
  const [loading, setLoading] = useState(false)
  const [loaded, setLoaded] = useState(false)

  async function loadDetails() {
    if (loaded) return
    setLoading(true)
    try {
      const res = await fetch(`/api/${tenantSlug}/tasks/${contactId}/details`)
      if (res.ok) {
        const data = await res.json()
        setDetails(data)
      }
    } catch {
      // ignore
    }
    setLoading(false)
    setLoaded(true)
  }

  return (
    <div className="px-4 pb-4 border-t border-white/5 bg-white/[0.01]">
      <div className="pt-3 space-y-3">
        {/* Contact summary */}
        <div className="flex items-center gap-4 text-xs text-gray-400">
          {contactName && <span className="text-white font-medium">{contactName}</span>}
          {contactPhone && (
            <span className="flex items-center gap-1"><Phone size={10} /> {contactPhone}</span>
          )}
          {contactAddress && (
            <span className="flex items-center gap-1"><MapPin size={10} /> {contactAddress}</span>
          )}
        </div>

        {/* Load details button */}
        {!loaded && (
          <button
            onClick={loadDetails}
            disabled={loading}
            className="text-xs text-orange-400 hover:text-orange-300 flex items-center gap-1 transition-colors"
          >
            {loading ? <><Loader2 size={10} className="animate-spin" /> Loading...</> : 'Load details'}
          </button>
        )}

        {/* Details content */}
        {details && (
          <div className="space-y-3">
            {/* Last graded call */}
            {details.lastCall && (
              <div>
                <p className="text-xs text-gray-500 mb-1">Last graded call</p>
                <Link
                  href={`/${tenantSlug}/calls/${details.lastCall.id}`}
                  className="flex items-center gap-2 text-xs bg-white/5 rounded-lg px-3 py-2 hover:bg-white/10 transition-colors"
                >
                  <span className={`font-semibold ${
                    (details.lastCall.score ?? 0) >= 70 ? 'text-green-400' :
                    (details.lastCall.score ?? 0) >= 50 ? 'text-yellow-400' : 'text-red-400'
                  }`}>
                    {details.lastCall.score ?? 0}
                  </span>
                  <span className="text-gray-400 truncate flex-1">{details.lastCall.summary ?? 'Graded call'}</span>
                  <span className="text-gray-600">{format(new Date(details.lastCall.createdAt), 'MMM d')}</span>
                  <ExternalLink size={10} className="text-orange-400" />
                </Link>
              </div>
            )}

            {/* Notes */}
            {details.notes.length > 0 && (
              <div>
                <p className="text-xs text-gray-500 mb-1">Recent notes ({details.notes.length})</p>
                <div className="space-y-1">
                  {details.notes.slice(0, 5).map(note => (
                    <div key={note.id} className="text-xs bg-white/5 rounded-lg px-3 py-2">
                      <p className="text-gray-300">{note.body}</p>
                      <p className="text-gray-600 mt-0.5">{format(new Date(note.dateAdded), 'MMM d, h:mm a')}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Today's activity */}
            {details.todayActivity.length > 0 && (
              <div>
                <p className="text-xs text-gray-500 mb-1">Today's activity</p>
                <div className="space-y-1">
                  {details.todayActivity.map((msg, i) => (
                    <div key={i} className="text-xs bg-white/5 rounded-lg px-3 py-2 flex items-center gap-2">
                      <span className={`shrink-0 ${msg.direction === 'inbound' ? 'text-blue-400' : 'text-orange-400'}`}>
                        {msg.direction === 'inbound' ? '←' : '→'}
                      </span>
                      <span className="text-gray-300 truncate flex-1">{msg.body}</span>
                      <span className="text-gray-600 shrink-0">{msg.dateAdded}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {!details.lastCall && details.notes.length === 0 && details.todayActivity.length === 0 && (
              <p className="text-xs text-gray-600">No activity found for this contact</p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
