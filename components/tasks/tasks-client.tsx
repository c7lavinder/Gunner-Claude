'use client'
// components/tasks/tasks-client.tsx

import { useState, useTransition } from 'react'
import { CheckSquare, Square, Plus, Clock, AlertCircle, Filter } from 'lucide-react'
import { formatDistanceToNow, format, isToday, isTomorrow, isPast } from 'date-fns'

interface Task {
  id: string
  title: string
  description: string | null
  category: string | null
  status: string
  priority: string
  dueAt: string | null
  completedAt: string | null
  ghlTaskId: string | null
  assignedTo: { id: string; name: string } | null
  property: { id: string; address: string; city: string } | null
}

const PRIORITY_ORDER = ['URGENT', 'HIGH', 'MEDIUM', 'LOW']
const PRIORITY_COLORS: Record<string, string> = {
  URGENT: 'text-red-400 bg-red-500/10 border-red-500/20',
  HIGH: 'text-orange-400 bg-orange-500/10 border-orange-500/20',
  MEDIUM: 'text-yellow-400 bg-yellow-500/10 border-yellow-500/20',
  LOW: 'text-gray-400 bg-gray-500/10 border-gray-500/20',
}

export function TasksClient({ tasks, categories, tenantSlug, canCreateForOthers }: {
  tasks: Task[]
  categories: string[]
  tenantSlug: string
  canCreateForOthers: boolean
}) {
  const [localTasks, setLocalTasks] = useState(tasks)
  const [activeCategory, setActiveCategory] = useState<string | null>(null)
  const [activePriority, setActivePriority] = useState<string | null>(null)
  const [showNew, setShowNew] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [newCategory, setNewCategory] = useState(categories[0] ?? 'Follow-up')
  const [newPriority, setNewPriority] = useState('MEDIUM')
  const [isPending, startTransition] = useTransition()

  const filtered = localTasks.filter((t) => {
    if (activeCategory && t.category !== activeCategory) return false
    if (activePriority && t.priority !== activePriority) return false
    return true
  })

  // Group by priority
  const grouped = PRIORITY_ORDER.reduce<Record<string, Task[]>>((acc, p) => {
    const items = filtered.filter((t) => t.priority === p)
    if (items.length > 0) acc[p] = items
    return acc
  }, {})

  async function completeTask(taskId: string) {
    setLocalTasks((prev) => prev.filter((t) => t.id !== taskId))
    await fetch(`/api/tasks/${taskId}/complete`, { method: 'POST' })
  }

  async function createTask() {
    if (!newTitle.trim()) return
    const res = await fetch('/api/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: newTitle, category: newCategory, priority: newPriority }),
    })
    const data = await res.json()
    if (data.task) {
      setLocalTasks((prev) => [data.task, ...prev])
      setNewTitle('')
      setShowNew(false)
    }
  }

  const overdueCount = localTasks.filter(
    (t) => t.dueAt && isPast(new Date(t.dueAt)) && t.status !== 'COMPLETED'
  ).length

  return (
    <div className="space-y-5 max-w-3xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-white">Tasks</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            {localTasks.length} open
            {overdueCount > 0 && (
              <span className="ml-2 text-red-400 flex items-center gap-1 inline-flex">
                <AlertCircle size={11} /> {overdueCount} overdue
              </span>
            )}
          </p>
        </div>
        <button
          onClick={() => setShowNew(true)}
          className="flex items-center gap-1.5 bg-orange-500 hover:bg-orange-600 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
        >
          <Plus size={14} /> New task
        </button>
      </div>

      {/* New task form */}
      {showNew && (
        <div className="bg-[#1a1d27] border border-orange-500/30 rounded-2xl p-4 space-y-3">
          <input
            autoFocus
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && createTask()}
            placeholder="Task title…"
            className="w-full bg-transparent text-sm text-white placeholder-gray-500 focus:outline-none"
          />
          <div className="flex items-center gap-2 flex-wrap">
            <select
              value={newCategory}
              onChange={(e) => setNewCategory(e.target.value)}
              className="bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none"
            >
              {categories.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <select
              value={newPriority}
              onChange={(e) => setNewPriority(e.target.value)}
              className="bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none"
            >
              {PRIORITY_ORDER.map((p) => <option key={p} value={p}>{p.toLowerCase()}</option>)}
            </select>
            <div className="flex gap-2 ml-auto">
              <button
                onClick={() => setShowNew(false)}
                className="text-xs text-gray-400 hover:text-white px-3 py-1.5 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={createTask}
                disabled={!newTitle.trim()}
                className="text-xs bg-orange-500 hover:bg-orange-600 disabled:opacity-40 text-white px-3 py-1.5 rounded-lg transition-colors"
              >
                Add task
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        {categories.map((cat) => (
          <button
            key={cat}
            onClick={() => setActiveCategory(activeCategory === cat ? null : cat)}
            className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
              activeCategory === cat
                ? 'border-orange-500 bg-orange-500/15 text-orange-400'
                : 'border-white/10 text-gray-400 hover:text-white'
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Task groups */}
      {Object.keys(grouped).length === 0 ? (
        <div className="bg-[#1a1d27] border border-white/10 rounded-2xl py-16 text-center">
          <CheckSquare size={24} className="text-gray-600 mx-auto mb-3" />
          <p className="text-gray-500 text-sm">No tasks here — you're clear</p>
        </div>
      ) : (
        Object.entries(grouped).map(([priority, items]) => (
          <div key={priority}>
            <div className="flex items-center gap-2 mb-2">
              <span className={`text-xs px-2 py-0.5 rounded-full border ${PRIORITY_COLORS[priority]}`}>
                {priority.toLowerCase()}
              </span>
              <span className="text-xs text-gray-600">{items.length}</span>
            </div>
            <div className="bg-[#1a1d27] border border-white/10 rounded-2xl divide-y divide-white/5">
              {items.map((task) => (
                <TaskRow key={task.id} task={task} onComplete={completeTask} />
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  )
}

function TaskRow({ task, onComplete }: { task: Task; onComplete: (id: string) => void }) {
  const [completing, setCompleting] = useState(false)

  async function handleComplete() {
    setCompleting(true)
    await onComplete(task.id)
  }

  const dueLabel = () => {
    if (!task.dueAt) return null
    const d = new Date(task.dueAt)
    if (isPast(d)) return { label: 'Overdue', cls: 'text-red-400' }
    if (isToday(d)) return { label: 'Due today', cls: 'text-orange-400' }
    if (isTomorrow(d)) return { label: 'Due tomorrow', cls: 'text-yellow-400' }
    return { label: format(d, 'MMM d'), cls: 'text-gray-400' }
  }

  const due = dueLabel()

  return (
    <div className={`flex items-start gap-3 px-4 py-3.5 transition-opacity ${completing ? 'opacity-40' : ''}`}>
      <button
        onClick={handleComplete}
        disabled={completing}
        className="mt-0.5 shrink-0 text-gray-500 hover:text-green-400 transition-colors"
      >
        {completing ? <CheckSquare size={16} className="text-green-400" /> : <Square size={16} />}
      </button>

      <div className="flex-1 min-w-0">
        <p className="text-sm text-white">{task.title}</p>
        <div className="flex items-center gap-3 mt-1 flex-wrap">
          {task.category && (
            <span className="text-xs text-gray-500 bg-white/5 px-2 py-0.5 rounded-full">{task.category}</span>
          )}
          {task.property && (
            <span className="text-xs text-gray-500 truncate max-w-40">{task.property.address}</span>
          )}
          {task.assignedTo && (
            <span className="text-xs text-gray-500">{task.assignedTo.name}</span>
          )}
          {due && (
            <span className={`text-xs flex items-center gap-1 ${due.cls}`}>
              <Clock size={10} /> {due.label}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
