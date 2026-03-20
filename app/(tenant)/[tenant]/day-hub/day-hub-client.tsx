'use client'
// app/(tenant)/[tenant]/day-hub/day-hub-client.tsx
// Day Hub — morning planner with overdue alerts, categorized tasks, XP motivation

import { useState } from 'react'
import Link from 'next/link'
import { Sun, AlertTriangle, CheckCircle2, Circle, Clock, ChevronRight, Zap, Calendar } from 'lucide-react'

interface TaskEntry {
  id: string; title: string; description: string | null
  category: string | null; status: string; priority: string
  dueAt: string | null
  property: { id: string; address: string } | null
}

export function DayHubClient({
  tenantSlug, userName, todayTasks, tomorrowTasks, overdueTasks,
  categories, completedToday, xp,
}: {
  tenantSlug: string
  userName: string
  todayTasks: TaskEntry[]
  tomorrowTasks: TaskEntry[]
  overdueTasks: TaskEntry[]
  categories: string[]
  completedToday: number
  xp: { level: number; weeklyXp: number } | null
}) {
  const [completing, setCompleting] = useState<string | null>(null)
  const firstName = userName.split(' ')[0]
  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
  const totalToday = todayTasks.length + overdueTasks.length

  async function completeTask(taskId: string) {
    setCompleting(taskId)
    try {
      await fetch(`/api/tasks/${taskId}/complete`, { method: 'POST' })
      window.location.reload()
    } catch {
      setCompleting(null)
    }
  }

  // Group today's tasks by category
  const grouped = new Map<string, TaskEntry[]>()
  for (const cat of categories) grouped.set(cat, [])
  grouped.set('Other', [])

  for (const task of todayTasks) {
    const cat = task.category && categories.includes(task.category) ? task.category : 'Other'
    grouped.get(cat)!.push(task)
  }

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold text-white flex items-center gap-2">
            <Sun size={20} className="text-yellow-400" />
            {greeting}, {firstName}
          </h1>
          <p className="text-sm text-gray-400 mt-1">
            {totalToday === 0 && completedToday === 0
              ? 'No tasks scheduled today. Time to prospect.'
              : `${completedToday} done today · ${totalToday} remaining`}
          </p>
        </div>
        {xp && (
          <div className="text-right">
            <p className="text-sm font-semibold text-orange-400">Lv.{xp.level}</p>
            <p className="text-xs text-gray-600">+{xp.weeklyXp} XP this week</p>
          </div>
        )}
      </div>

      {/* Overdue alert */}
      {overdueTasks.length > 0 && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle size={14} className="text-red-400" />
            <h2 className="text-sm font-medium text-red-400">Overdue ({overdueTasks.length})</h2>
          </div>
          <div className="space-y-1.5">
            {overdueTasks.map(task => (
              <TaskRow key={task.id} task={task} tenantSlug={tenantSlug} onComplete={completeTask} completing={completing} isOverdue />
            ))}
          </div>
        </div>
      )}

      {/* Today's tasks by category */}
      {todayTasks.length > 0 ? (
        <div className="space-y-4">
          {Array.from(grouped.entries())
            .filter(([, tasks]) => tasks.length > 0)
            .map(([category, tasks]) => (
              <div key={category} className="bg-[#1a1d27] border border-white/10 rounded-2xl p-5">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-sm font-medium text-white">{category}</h2>
                  <span className="text-xs text-gray-600">{tasks.length}</span>
                </div>
                <div className="space-y-1.5">
                  {tasks.map(task => (
                    <TaskRow key={task.id} task={task} tenantSlug={tenantSlug} onComplete={completeTask} completing={completing} />
                  ))}
                </div>
              </div>
            ))}
        </div>
      ) : overdueTasks.length === 0 ? (
        <div className="bg-[#1a1d27] border border-white/10 rounded-2xl p-8 text-center">
          <CheckCircle2 size={24} className="text-green-400 mx-auto mb-3" />
          <p className="text-sm text-white font-medium">All clear for today</p>
          <p className="text-xs text-gray-500 mt-1">No pending tasks. Check your calls or prospect new leads.</p>
          <div className="flex gap-3 justify-center mt-4">
            <Link href={`/${tenantSlug}/calls`} className="text-xs text-orange-400 hover:text-orange-300 flex items-center gap-1">
              View calls <ChevronRight size={10} />
            </Link>
            <Link href={`/${tenantSlug}/inventory`} className="text-xs text-orange-400 hover:text-orange-300 flex items-center gap-1">
              View inventory <ChevronRight size={10} />
            </Link>
          </div>
        </div>
      ) : null}

      {/* Tomorrow preview */}
      {tomorrowTasks.length > 0 && (
        <div className="bg-[#1a1d27] border border-white/10 rounded-2xl p-5 opacity-70">
          <div className="flex items-center gap-2 mb-3">
            <Calendar size={14} className="text-gray-500" />
            <h2 className="text-sm font-medium text-gray-400">Tomorrow ({tomorrowTasks.length})</h2>
          </div>
          <div className="space-y-1.5">
            {tomorrowTasks.slice(0, 5).map(task => (
              <div key={task.id} className="flex items-center gap-3 px-3 py-2 rounded-lg">
                <Circle size={14} className="text-gray-600 shrink-0" />
                <span className="text-sm text-gray-500 flex-1 truncate">{task.title}</span>
                {task.category && <span className="text-xs text-gray-600">{task.category}</span>}
              </div>
            ))}
            {tomorrowTasks.length > 5 && (
              <p className="text-xs text-gray-600 pl-8">+{tomorrowTasks.length - 5} more</p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function TaskRow({
  task, tenantSlug, onComplete, completing, isOverdue,
}: {
  task: TaskEntry; tenantSlug: string
  onComplete: (id: string) => void; completing: string | null
  isOverdue?: boolean
}) {
  const priorityColors: Record<string, string> = {
    URGENT: 'bg-red-500/20 text-red-400',
    HIGH: 'bg-orange-500/20 text-orange-400',
    MEDIUM: 'bg-yellow-500/20 text-yellow-400',
    LOW: 'bg-gray-500/20 text-gray-400',
  }

  const dueTime = task.dueAt ? new Date(task.dueAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : null

  return (
    <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-white/5 transition-colors group">
      <button
        onClick={() => onComplete(task.id)}
        disabled={completing === task.id}
        className="shrink-0"
      >
        {completing === task.id ? (
          <CheckCircle2 size={16} className="text-green-400 animate-pulse" />
        ) : (
          <Circle size={16} className={`${isOverdue ? 'text-red-400' : 'text-gray-600'} group-hover:text-orange-400 transition-colors`} />
        )}
      </button>
      <div className="flex-1 min-w-0">
        <p className={`text-sm truncate ${isOverdue ? 'text-red-300' : 'text-white'}`}>{task.title}</p>
        {task.property && (
          <Link href={`/${tenantSlug}/inventory/${task.property.id}`} className="text-xs text-gray-600 hover:text-gray-400 truncate block">
            {task.property.address}
          </Link>
        )}
      </div>
      {dueTime && (
        <span className="text-xs text-gray-600 flex items-center gap-1 shrink-0">
          <Clock size={10} /> {dueTime}
        </span>
      )}
      <span className={`text-xs px-2 py-0.5 rounded-full shrink-0 ${priorityColors[task.priority] ?? priorityColors.MEDIUM}`}>
        {task.priority.toLowerCase()}
      </span>
    </div>
  )
}
