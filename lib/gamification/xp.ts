// lib/gamification/xp.ts
// XP award system — points, levels, badge checks
// Called after: call graded, task completed, property status changed

import { db } from '@/lib/db/client'

// ─── XP Values ─────────────────────────────────────────────────────────────

export const XP_VALUES = {
  CALL_GRADED:          10,   // any graded call
  CALL_SCORE_OVER_70:   50,   // call scored 70+
  CALL_SCORE_OVER_90:  100,   // call scored 90+
  TASK_COMPLETED:       20,   // any task completed
  APPOINTMENT_SET:      75,   // appointment scheduled
  PROPERTY_CONTRACTED: 200,   // property → Under Contract
  PROPERTY_SOLD:       500,   // property → Sold
} as const

// ─── Level Thresholds ──────────────────────────────────────────────────────

const LEVEL_THRESHOLDS = [
  0, 100, 300, 600, 1000, 1500, 2200, 3000, 4000, 5200,       // 1-10
  6500, 8000, 10000, 12500, 15000, 18000, 21500, 25500, 30000, 35000, // 11-20
  40000, 46000, 53000, 61000, 70000, 80000, 91000, 103000, 116000, 130000, // 21-30
]

function calculateLevel(totalXp: number): number {
  for (let i = LEVEL_THRESHOLDS.length - 1; i >= 0; i--) {
    if (totalXp >= LEVEL_THRESHOLDS[i]) return i + 1
  }
  return 1
}

// ─── Award XP ──────────────────────────────────────────────────────────────

export async function awardXP({
  tenantId,
  userId,
  eventType,
  xp,
  relatedId,
}: {
  tenantId: string
  userId: string
  eventType: string
  xp: number
  relatedId?: string
}): Promise<{ totalXp: number; level: number; leveledUp: boolean }> {
  // Record the XP event
  await db.xpEvent.create({
    data: {
      tenantId,
      userId,
      eventType,
      xpAwarded: xp,
      relatedId: relatedId ?? null,
    },
  })

  // Upsert user XP totals
  const existing = await db.userXp.findUnique({
    where: { tenantId_userId: { tenantId, userId } },
  })

  const prevLevel = existing?.level ?? 1
  const newTotalXp = (existing?.totalXp ?? 0) + xp
  const newWeeklyXp = (existing?.weeklyXp ?? 0) + xp
  const newLevel = calculateLevel(newTotalXp)

  await db.userXp.upsert({
    where: { tenantId_userId: { tenantId, userId } },
    create: {
      tenantId,
      userId,
      totalXp: xp,
      weeklyXp: xp,
      level: newLevel,
    },
    update: {
      totalXp: newTotalXp,
      weeklyXp: newWeeklyXp,
      level: newLevel,
    },
  })

  return {
    totalXp: newTotalXp,
    level: newLevel,
    leveledUp: newLevel > prevLevel,
  }
}

// ─── Award XP for a graded call ────────────────────────────────────────────

export async function awardCallXP(
  tenantId: string,
  userId: string,
  callId: string,
  score: number,
): Promise<void> {
  // Base XP for any graded call
  await awardXP({ tenantId, userId, eventType: 'call_graded', xp: XP_VALUES.CALL_GRADED, relatedId: callId })

  // Bonus for high scores
  if (score >= 90) {
    await awardXP({ tenantId, userId, eventType: 'call_score_over_90', xp: XP_VALUES.CALL_SCORE_OVER_90, relatedId: callId })
  } else if (score >= 70) {
    await awardXP({ tenantId, userId, eventType: 'call_score_over_70', xp: XP_VALUES.CALL_SCORE_OVER_70, relatedId: callId })
  }

  // Check for badges after XP award
  await checkAndAwardBadges(tenantId, userId)
}

// ─── Award XP for task completion ──────────────────────────────────────────

export async function awardTaskXP(
  tenantId: string,
  userId: string,
  taskId: string,
  category?: string,
): Promise<void> {
  await awardXP({ tenantId, userId, eventType: 'task_completed', xp: XP_VALUES.TASK_COMPLETED, relatedId: taskId })

  if (category?.toLowerCase().includes('appointment')) {
    await awardXP({ tenantId, userId, eventType: 'appointment_set', xp: XP_VALUES.APPOINTMENT_SET, relatedId: taskId })
  }
}

// ─── Award XP for property status changes ──────────────────────────────────

export async function awardPropertyXP(
  tenantId: string,
  userId: string,
  propertyId: string,
  newStatus: string,
): Promise<void> {
  if (newStatus === 'UNDER_CONTRACT') {
    await awardXP({ tenantId, userId, eventType: 'property_contracted', xp: XP_VALUES.PROPERTY_CONTRACTED, relatedId: propertyId })
  } else if (newStatus === 'SOLD') {
    await awardXP({ tenantId, userId, eventType: 'property_sold', xp: XP_VALUES.PROPERTY_SOLD, relatedId: propertyId })
  }

  await checkAndAwardBadges(tenantId, userId)
}

// ─── Badge Definitions ─────────────────────────────────────────────────────

const BADGE_DEFINITIONS: Array<{
  type: string
  name: string
  description: string
  check: (ctx: BadgeContext) => boolean
}> = [
  {
    type: 'first_blood',
    name: 'First Blood',
    description: 'First call graded',
    check: (ctx) => ctx.totalCallsGraded >= 1,
  },
  {
    type: 'ten_calls',
    name: 'Dialer',
    description: '10 calls graded',
    check: (ctx) => ctx.totalCallsGraded >= 10,
  },
  {
    type: 'fifty_calls',
    name: 'Phone Warrior',
    description: '50 calls graded',
    check: (ctx) => ctx.totalCallsGraded >= 50,
  },
  {
    type: 'hot_streak',
    name: 'Hot Streak',
    description: '5 calls above 80 in a row',
    check: (ctx) => ctx.consecutiveHighScores >= 5,
  },
  {
    type: 'sharp_shooter',
    name: 'Sharp Shooter',
    description: '3 calls above 90',
    check: (ctx) => ctx.callsOver90 >= 3,
  },
  {
    type: 'closer',
    name: 'Closer',
    description: 'First property sold',
    check: (ctx) => ctx.propertiesSold >= 1,
  },
  {
    type: 'deal_maker',
    name: 'Deal Maker',
    description: '5 properties under contract',
    check: (ctx) => ctx.propertiesContracted >= 5,
  },
  {
    type: 'tcp_hunter',
    name: 'TCP Hunter',
    description: 'Found 3 Buy Signals (TCP > 0.5)',
    check: (ctx) => ctx.buySignals >= 3,
  },
  {
    type: 'level_5',
    name: 'Rising Star',
    description: 'Reached level 5',
    check: (ctx) => ctx.level >= 5,
  },
  {
    type: 'level_10',
    name: 'Veteran',
    description: 'Reached level 10',
    check: (ctx) => ctx.level >= 10,
  },
]

interface BadgeContext {
  totalCallsGraded: number
  consecutiveHighScores: number
  callsOver90: number
  propertiesSold: number
  propertiesContracted: number
  buySignals: number
  level: number
}

async function checkAndAwardBadges(tenantId: string, userId: string): Promise<void> {
  // Get existing badges
  const existingBadges = new Set(
    (await db.userBadge.findMany({
      where: { tenantId, userId },
      select: { badgeType: true },
    })).map(b => b.badgeType)
  )

  // Build context for badge checks
  const [callStats, propertyStats, xpRecord, recentCalls, buySignalCount] = await Promise.all([
    db.call.groupBy({
      by: ['gradingStatus'],
      where: { tenantId, assignedToId: userId, gradingStatus: 'COMPLETED' },
      _count: true,
    }),
    db.property.groupBy({
      by: ['status'],
      where: { tenantId, assignedToId: userId, status: { in: ['UNDER_CONTRACT', 'SOLD'] } },
      _count: true,
    }),
    db.userXp.findUnique({
      where: { tenantId_userId: { tenantId, userId } },
      select: { level: true },
    }),
    db.call.findMany({
      where: { tenantId, assignedToId: userId, gradingStatus: 'COMPLETED', score: { not: null } },
      orderBy: { gradedAt: 'desc' },
      take: 20,
      select: { score: true },
    }),
    db.property.count({
      where: { tenantId, tcpScore: { gt: 0.5 } },
    }),
  ])

  const totalCallsGraded = callStats.find(c => c.gradingStatus === 'COMPLETED')?._count ?? 0
  const callsOver90 = recentCalls.filter(c => (c.score ?? 0) >= 90).length

  // Calculate consecutive high scores from most recent
  let consecutiveHighScores = 0
  for (const call of recentCalls) {
    if ((call.score ?? 0) >= 80) {
      consecutiveHighScores++
    } else {
      break
    }
  }

  const ctx: BadgeContext = {
    totalCallsGraded,
    consecutiveHighScores,
    callsOver90,
    propertiesSold: propertyStats.find(p => p.status === 'SOLD')?._count ?? 0,
    propertiesContracted: propertyStats.find(p => p.status === 'UNDER_CONTRACT')?._count ?? 0,
    buySignals: buySignalCount,
    level: xpRecord?.level ?? 1,
  }

  // Check each badge
  for (const badge of BADGE_DEFINITIONS) {
    if (existingBadges.has(badge.type)) continue
    if (badge.check(ctx)) {
      await db.userBadge.create({
        data: { tenantId, userId, badgeType: badge.type },
      })
    }
  }
}

// ─── Get leaderboard ───────────────────────────────────────────────────────

export async function getLeaderboard(tenantId: string): Promise<LeaderboardEntry[]> {
  const entries = await db.userXp.findMany({
    where: { tenantId },
    orderBy: { totalXp: 'desc' },
    take: 20,
    include: {
      user: { select: { name: true, role: true } },
    },
  })

  return entries.map((e, i) => ({
    rank: i + 1,
    userId: e.userId,
    name: e.user.name,
    role: e.user.role,
    totalXp: e.totalXp,
    weeklyXp: e.weeklyXp,
    level: e.level,
  }))
}

export interface LeaderboardEntry {
  rank: number
  userId: string
  name: string
  role: string
  totalXp: number
  weeklyXp: number
  level: number
}

// ─── Get user badges ───────────────────────────────────────────────────────

export async function getUserBadges(tenantId: string, userId: string) {
  const earned = await db.userBadge.findMany({
    where: { tenantId, userId },
    select: { badgeType: true, earnedAt: true },
  })

  return BADGE_DEFINITIONS.map(def => ({
    type: def.type,
    name: def.name,
    description: def.description,
    earned: earned.some(e => e.badgeType === def.type),
    earnedAt: earned.find(e => e.badgeType === def.type)?.earnedAt ?? null,
  }))
}

// ─── Reset weekly XP (call from cron) ──────────────────────────────────────

export async function resetWeeklyXP(tenantId: string): Promise<number> {
  const result = await db.userXp.updateMany({
    where: { tenantId },
    data: { weeklyXp: 0 },
  })
  return result.count
}
