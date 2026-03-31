// lib/tasks/scoring.ts
// Task priority scoring algorithm — Option B: LLM-designed formula, system executes.
// Category weights and time multipliers are configurable per tenant.
// Score = categoryWeight × timeMultiplier. Higher score = higher priority.
// Tiebreaker: newest task first (most recent createdAt).

import { getCentralDayBounds } from '@/lib/dates'

// ─── Default scoring config (LLM-designed) ─────────────────────────────────

export interface TaskScoringConfig {
  // Category weights — higher = more important
  categoryWeights: Record<string, number>
  // Time multiplier breakpoints (days relative to due date)
  timeMultipliers: {
    dueToday: number
    dueTomorrow: number
    dueThisWeek: number      // 2-5 days out
    overdue1to5: number      // 1-5 days overdue
    overdue6to10: number     // 6-10 days overdue
    overdue11plus: number    // 11+ days overdue
    noDueDate: number
    futureBeyondWeek: number // 6+ days out
  }
}

export const DEFAULT_SCORING_CONFIG: TaskScoringConfig = {
  categoryWeights: {
    // Weights are spaced so that a higher-category task at its LOWEST time
    // multiplier still beats a lower-category task at its HIGHEST.
    // New Lead (160) × 0.51 (7 days out) = 81.6 > Admin (40) × 2.0 today = 80
    'New Lead': 160,
    'Reschedule': 100,
    'Admin': 40,
    'Follow-Up': 30,
    'Follow Up': 30,
    '_default': 35,
  },
  timeMultipliers: {
    dueToday: 2.0,
    dueTomorrow: 1.5,
    dueThisWeek: 1.0,
    overdue1to5: 0.7,
    overdue6to10: 0.4,
    overdue11plus: 0.2,
    noDueDate: 0.5,
    futureBeyondWeek: 0.6,
  },
}

// ─── Scoring function ───────────────────────────────────────────────────────

export interface ScorableTask {
  id: string
  category: string | null
  dueAt: Date | string | null
  createdAt: Date | string
  status?: string
}

export function scoreTask(task: ScorableTask, config: TaskScoringConfig = DEFAULT_SCORING_CONFIG): number {
  const category = task.category ?? '_default'
  const weight = config.categoryWeights[category] ?? config.categoryWeights['_default'] ?? 35

  const multiplier = getTimeMultiplier(task.dueAt, config.timeMultipliers)

  return weight * multiplier
}

function getTimeMultiplier(
  dueAt: Date | string | null,
  multipliers: TaskScoringConfig['timeMultipliers'],
): number {
  if (!dueAt) return multipliers.noDueDate

  const { dayStart } = getCentralDayBounds()
  const due = new Date(dueAt)

  // Calculate days difference (in Central time day granularity)
  const msDiff = due.getTime() - dayStart.getTime()
  const daysDiff = Math.floor(msDiff / (1000 * 60 * 60 * 24))

  if (daysDiff < 0) {
    // Overdue — bucket-based decay
    const daysOverdue = Math.abs(daysDiff)
    if (daysOverdue <= 5) return multipliers.overdue1to5
    if (daysOverdue <= 10) return multipliers.overdue6to10
    return multipliers.overdue11plus
  }

  if (daysDiff === 0) return multipliers.dueToday
  if (daysDiff === 1) return multipliers.dueTomorrow

  // Future tasks: continuous decay — closer due date = higher score.
  // Due in 2 days ≈ 0.93, due in 5 days ≈ 0.70, due in 7 days ≈ 0.58
  // Due in 14 days ≈ 0.34, due in 30 days ≈ 0.18, due in 60 days ≈ 0.10
  // Formula: 1.4 / (1 + 0.25 * daysDiff) — smooth curve that drops steeply then flattens
  return Math.max(1.4 / (1 + 0.25 * daysDiff), 0.03)
}

// ─── Sort tasks by score ────────────────────────────────────────────────────

export function sortTasksByScore<T extends ScorableTask>(
  tasks: T[],
  config: TaskScoringConfig = DEFAULT_SCORING_CONFIG,
): T[] {
  return [...tasks].sort((a, b) => {
    const scoreA = scoreTask(a, config)
    const scoreB = scoreTask(b, config)
    if (scoreA !== scoreB) return scoreB - scoreA // higher score first
    // Tiebreaker: newest first
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  })
}

// ─── Overdue tier (for dot colors) ──────────────────────────────────────────

export type OverdueTier = 'none' | 'yellow' | 'orange' | 'red' | 'green'

export function getOverdueTier(dueAt: Date | string | null, status?: string): OverdueTier {
  if (status === 'COMPLETED') return 'green'
  if (!dueAt) return 'none'

  const { dayStart } = getCentralDayBounds()
  const due = new Date(dueAt)
  const msDiff = dayStart.getTime() - due.getTime()
  const daysOverdue = Math.floor(msDiff / (1000 * 60 * 60 * 24))

  if (daysOverdue <= 0) return 'none'
  if (daysOverdue <= 5) return 'yellow'
  if (daysOverdue <= 10) return 'orange'
  return 'red'
}
