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
  'New Lead': { badge: 'text-semantic-blue bg-semantic-blue-bg', header: 'text-semantic-blue' },
  'Reschedule': { badge: 'text-semantic-amber bg-semantic-amber-bg', header: 'text-semantic-amber' },
  'Admin': { badge: 'text-semantic-purple bg-semantic-purple-bg', header: 'text-semantic-purple' },
  'Follow-Up': { badge: 'text-txt-secondary bg-surface-tertiary', header: 'text-txt-secondary' },
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
    <div className="space-y-6 max-w-3xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-ds-page font-semibold text-txt-primary">Tasks</h1>
          <p className="text-ds-body text-txt-secondary mt-1">
            {tasks.length} open task{tasks.length !== 1 ? 's' : ''}
            {overdueCount > 0 && (
              <span className="ml-2 text-semantic-red inline-flex items-center gap-1">
                <AlertCircle size={11} /> {overdueCount} overdue
              </span>
            )}
          </p>
        </div>
      </div>

      {/* GHL fetch error */}
      {fetchError && (
        <div className="bg-semantic-amber-bg border-[0.5px] border-[rgba(0,0,0,0.08)] rounded-[14px] px-5 py-4 space-y-2">
          <div className="flex items-center gap-2 text-semantic-amber text-ds-body font-medium">
            <AlertCircle size={14} />
            Could not load tasks from Go High Level
          </div>
          <p className="text-ds-fine text-txt-secondary leading-relaxed">
            Check Railway logs for the exact error. Most common causes: GHL token needs refresh, or the POST body format changed. Go to{' '}
            <a href={`/${tenantSlug}/settings`} className="underline hover:text-semantic-amber">Settings &rarr; Integrations</a>
            {' '}and reconnect GHL if the error persists.
          </p>
        </div>
      )}

      {/* Category filter tabs */}
      <div className="bg-surface-tertiary rounded-[14px] p-1 flex flex-wrap gap-1 items-center">
        <button
          onClick={() => setActiveCategory(null)}
          className={`text-ds-body font-medium px-4 py-1.5 rounded-[10px] transition-all ${
            activeCategory === null
              ? 'bg-white shadow-ds-float text-txt-primary'
              : 'text-txt-secondary hover:text-txt-primary'
          }`}
        >
          All <span className="ml-1 text-txt-muted">{tasks.length}</span>
        </button>
        {ALL_CATEGORIES.map(cat => {
          const count = tasks.filter(t => t.category === cat).length
          if (count === 0) return null
          return (
            <button
              key={cat}
              onClick={() => setActiveCategory(activeCategory === cat ? null : cat)}
              className={`text-ds-body font-medium px-4 py-1.5 rounded-[10px] transition-all ${
                activeCategory === cat
                  ? 'bg-white shadow-ds-float text-txt-primary'
                  : 'text-txt-secondary hover:text-txt-primary'
              }`}
            >
              {cat} <span className="ml-1 text-txt-muted">{count}</span>
            </button>
          )
        })}

        {/* Admin: team member filter */}
        {isAdmin && assignedNames.length > 0 && (
          <select
            value={assignedFilter ?? ''}
            onChange={e => setAssignedFilter(e.target.value || null)}
            className="ml-auto bg-white border-[0.5px] border-[rgba(0,0,0,0.14)] rounded-[10px] px-3 py-1.5 text-ds-body text-txt-secondary focus:outline-none"
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
        <div className="bg-white border-[0.5px] border-[rgba(0,0,0,0.08)] rounded-[14px] py-16 text-center">
          <CheckSquare size={28} className="text-semantic-green/40 mx-auto mb-3" />
          <p className="text-txt-primary font-medium text-ds-label">You are all caught up</p>
          <p className="text-txt-muted text-ds-fine mt-1">No tasks to show</p>
        </div>
      ) : (
        Object.entries(grouped).map(([category, items]) => {
          const colors = CATEGORY_COLORS[category] ?? CATEGORY_COLORS['Follow-Up']
          return (
            <div key={category}>
              <div className="flex items-center gap-2 mb-2">
                <span className={`text-ds-fine font-medium uppercase tracking-[0.08em] ${colors.header}`}>{category}</span>
                <span className="text-ds-fine text-txt-muted">{items.length}</span>
              </div>
              <div className="bg-white border-[0.5px] border-[rgba(0,0,0,0.08)] rounded-[14px] divide-y divide-[rgba(0,0,0,0.06)]">
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
        className={`w-full text-left px-5 py-4 hover:bg-surface-secondary transition-all ${task.isOverdue ? 'bg-semantic-red-bg/40' : ''}`}
      >
        <div className="flex items-start gap-3">
          <div className="flex-1 min-w-0">
            {/* Contact name */}
            <p className={`text-ds-label font-medium ${task.isOverdue ? 'text-semantic-red' : 'text-txt-primary'}`}>
              {task.contactName ?? 'Unknown contact'}
            </p>

            {/* Contact address */}
            <p className="text-ds-fine text-txt-muted flex items-center gap-1 mt-0.5">
              <MapPin size={9} className="shrink-0" />
              {task.contactAddress || 'No address'}
            </p>

            {/* Task title */}
            <p className="text-ds-body text-txt-secondary mt-1">{task.title}</p>

            {/* Metadata row */}
            <div className="flex items-center gap-2 mt-3 flex-wrap">
              {/* Category badge */}
              <span className={`text-ds-fine font-medium px-2 py-0.5 rounded-[9999px] ${CATEGORY_COLORS[task.category]?.badge ?? 'text-txt-secondary bg-surface-tertiary'}`}>
                {task.category}
              </span>

              {/* Due date badge */}
              {task.isOverdue && (
                <span className="text-ds-fine font-medium px-2 py-0.5 rounded-[9999px] bg-semantic-red-bg text-semantic-red">
                  Overdue {daysOverdue}d
                </span>
              )}
              {task.isDueToday && (
                <span className="text-ds-fine font-medium px-2 py-0.5 rounded-[9999px] bg-semantic-amber-bg text-semantic-amber">
                  Due today
                </span>
              )}
              {!task.isOverdue && !task.isDueToday && task.dueDate && (
                <span className="text-ds-fine text-txt-muted flex items-center gap-1">
                  <Clock size={9} /> Due {format(new Date(task.dueDate), 'MMM d')}
                </span>
              )}

              {/* AM/PM badges */}
              <span className={`text-ds-fine font-medium px-2 py-0.5 rounded-[6px] ${task.amDone ? 'bg-semantic-green-bg text-semantic-green' : 'bg-surface-tertiary text-txt-muted'}`}>
                AM {task.amDone ? '\u2713' : ''}
              </span>
              <span className={`text-ds-fine font-medium px-2 py-0.5 rounded-[6px] ${task.pmDone ? 'bg-semantic-green-bg text-semantic-green' : 'bg-surface-tertiary text-txt-muted'}`}>
                PM {task.pmDone ? '\u2713' : ''}
              </span>

              {/* Assigned to */}
              {task.assignedToName && (
                <span className="text-ds-fine text-txt-muted flex items-center gap-1">
                  <User size={9} /> {task.assignedToName}
                </span>
              )}
            </div>
          </div>

          {/* Expand icon */}
          <div className="shrink-0 mt-1 text-txt-muted">
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
    <div className="px-5 pb-4 border-t border-[rgba(0,0,0,0.06)] bg-surface-secondary">
      <div className="pt-4 space-y-4">
        {/* Contact summary */}
        <div className="flex items-center gap-4 text-ds-body text-txt-secondary">
          {contactName && <span className="text-txt-primary font-medium">{contactName}</span>}
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
            className="text-ds-body font-medium text-gunner-red hover:text-gunner-red-dark flex items-center gap-1 transition-colors"
          >
            {loading ? <><Loader2 size={10} className="animate-spin" /> Loading...</> : 'Load details'}
          </button>
        )}

        {/* Details content */}
        {details && (
          <div className="space-y-4">
            {/* Last graded call */}
            {details.lastCall && (
              <div>
                <p className="text-ds-fine font-medium text-txt-muted uppercase tracking-[0.08em] mb-2">Last graded call</p>
                <Link
                  href={`/${tenantSlug}/calls/${details.lastCall.id}`}
                  className="flex items-center gap-3 text-ds-body bg-white border-[0.5px] border-[rgba(0,0,0,0.08)] rounded-[10px] px-4 py-3 hover:border-[rgba(0,0,0,0.14)] hover:shadow-ds-float transition-all"
                >
                  <span className={`font-semibold ${
                    (details.lastCall.score ?? 0) >= 90 ? 'text-semantic-green' :
                    (details.lastCall.score ?? 0) >= 80 ? 'text-semantic-amber' :
                    (details.lastCall.score ?? 0) >= 70 ? 'text-semantic-blue' : 'text-semantic-red'
                  }`}>
                    {details.lastCall.score ?? 0}
                  </span>
                  <span className="text-txt-secondary truncate flex-1">{details.lastCall.summary ?? 'Graded call'}</span>
                  <span className="text-txt-muted text-ds-fine">{format(new Date(details.lastCall.createdAt), 'MMM d')}</span>
                  <ExternalLink size={10} className="text-gunner-red" />
                </Link>
              </div>
            )}

            {/* Notes */}
            {details.notes.length > 0 && (
              <div>
                <p className="text-ds-fine font-medium text-txt-muted uppercase tracking-[0.08em] mb-2">Recent notes ({details.notes.length})</p>
                <div className="space-y-2">
                  {details.notes.slice(0, 5).map(note => (
                    <div key={note.id} className="text-ds-body bg-white border-[0.5px] border-[rgba(0,0,0,0.08)] rounded-[10px] px-4 py-3">
                      <p className="text-txt-primary">{note.body}</p>
                      <p className="text-txt-muted text-ds-fine mt-1">{format(new Date(note.dateAdded), 'MMM d, h:mm a')}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Today's activity */}
            {details.todayActivity.length > 0 && (
              <div>
                <p className="text-ds-fine font-medium text-txt-muted uppercase tracking-[0.08em] mb-2">Today's activity</p>
                <div className="space-y-2">
                  {details.todayActivity.map((msg, i) => (
                    <div key={i} className="text-ds-body bg-white border-[0.5px] border-[rgba(0,0,0,0.08)] rounded-[10px] px-4 py-3 flex items-center gap-2">
                      <span className={`shrink-0 ${msg.direction === 'inbound' ? 'text-semantic-blue' : 'text-gunner-red'}`}>
                        {msg.direction === 'inbound' ? '\u2190' : '\u2192'}
                      </span>
                      <span className="text-txt-primary truncate flex-1">{msg.body}</span>
                      <span className="text-txt-muted text-ds-fine shrink-0">{msg.dateAdded}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {!details.lastCall && details.notes.length === 0 && details.todayActivity.length === 0 && (
              <p className="text-ds-body text-txt-muted">No activity found for this contact</p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
