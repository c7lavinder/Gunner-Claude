/**
 * Gamification Service
 * Handles badges, streaks, XP, and leveling
 */

import { getDb } from "./db";
import { 
  badges, userBadges, badgeProgress, userStreaks, userXp, xpTransactions, 
  rewardViews, deals, calls, callGrades, teamMembers 
} from "../drizzle/schema";
import { eq, and, desc, gte, sql, inArray } from "drizzle-orm";

// ============ BADGE DEFINITIONS ============

export interface BadgeCriteria {
  type: "consecutive_grade" | "criteria_score" | "call_outcome" | "weekly_volume" | "consistency_days" | "improvement" | "deals";
  minGrade?: string;
  criteriaName?: string;
  minScore?: number;
  maxScore?: number;
  count: number;
  weeklyCount?: number;
}

export interface BadgeDefinition {
  code: string;
  name: string;
  description: string;
  icon: string;
  category: "universal" | "lead_manager" | "acquisition_manager" | "lead_generator";
  tiers: {
    bronze: { count: number };
    silver: { count: number };
    gold: { count: number };
  };
  criteria: Omit<BadgeCriteria, "count">;
}

// Universal Badges (Both Roles)
export const UNIVERSAL_BADGES: BadgeDefinition[] = [
  {
    code: "on_fire",
    name: "On Fire",
    description: "Consecutive calls graded C or better",
    icon: "🔥",
    category: "universal",
    tiers: { bronze: { count: 5 }, silver: { count: 10 }, gold: { count: 20 } },
    criteria: { type: "consecutive_grade", minGrade: "C" },
  },
  {
    code: "comeback_kid",
    name: "Comeback Kid",
    description: "Improved grade by 2+ letters from previous call",
    icon: "💪",
    category: "universal",
    tiers: { bronze: { count: 1 }, silver: { count: 5 }, gold: { count: 15 } },
    criteria: { type: "improvement" },
  },
  {
    code: "consistency_king",
    name: "Consistency King",
    description: "Consecutive days with at least one graded call",
    icon: "📅",
    category: "universal",
    tiers: { bronze: { count: 20 }, silver: { count: 60 }, gold: { count: 180 } },
    criteria: { type: "consistency_days" },
  },
];

// Lead Manager Badges
export const LEAD_MANAGER_BADGES: BadgeDefinition[] = [
  {
    code: "script_starter",
    name: "Script Starter",
    description: "Score 16+/20 on Introduction & Rapport + Setting Expectations",
    icon: "📋",
    category: "lead_manager",
    tiers: { bronze: { count: 25 }, silver: { count: 100 }, gold: { count: 500 } },
    criteria: { type: "criteria_score", criteriaName: "intro_combined", minScore: 16 },
  },
  {
    code: "motivation_miner",
    name: "Motivation Miner",
    description: "Score 15+/20 on Motivation Extraction",
    icon: "⛏️",
    category: "lead_manager",
    tiers: { bronze: { count: 25 }, silver: { count: 100 }, gold: { count: 500 } },
    criteria: { type: "criteria_score", criteriaName: "Motivation Extraction", minScore: 15 },
  },
  {
    code: "price_anchor_pro",
    name: "Price Anchor Pro",
    description: "Score 12+/15 on Price Discussion",
    icon: "⚓",
    category: "lead_manager",
    tiers: { bronze: { count: 25 }, silver: { count: 100 }, gold: { count: 500 } },
    criteria: { type: "criteria_score", criteriaName: "Price Discussion", minScore: 12 },
  },
  {
    code: "appointment_machine",
    name: "Appointment Machine",
    description: "Appointments set",
    icon: "📅",
    category: "lead_manager",
    tiers: { bronze: { count: 50 }, silver: { count: 250 }, gold: { count: 1500 } },
    criteria: { type: "call_outcome", criteriaName: "appointment_set" },
  },
  {
    code: "tone_master",
    name: "Tone Master",
    description: "Score 9+/10 on Tonality & Empathy",
    icon: "🎭",
    category: "lead_manager",
    tiers: { bronze: { count: 50 }, silver: { count: 200 }, gold: { count: 1000 } },
    criteria: { type: "criteria_score", criteriaName: "Tonality & Empathy", minScore: 9 },
  },
  {
    code: "volume_dialer",
    name: "Volume Dialer",
    description: "Weeks with 100+ graded calls",
    icon: "📞",
    category: "lead_manager",
    tiers: { bronze: { count: 10 }, silver: { count: 25 }, gold: { count: 50 } },
    criteria: { type: "weekly_volume", weeklyCount: 100 },
  },
];

// Acquisition Manager Badges
export const ACQUISITION_MANAGER_BADGES: BadgeDefinition[] = [
  {
    code: "offer_architect",
    name: "Offer Architect",
    description: "Score 12+/15 on Offer Setup",
    icon: "🏗️",
    category: "acquisition_manager",
    tiers: { bronze: { count: 25 }, silver: { count: 100 }, gold: { count: 500 } },
    criteria: { type: "criteria_score", criteriaName: "Offer Setup", minScore: 12 },
  },
  {
    code: "price_confidence",
    name: "Price Confidence",
    description: "Score 12+/15 on Price Delivery",
    icon: "💰",
    category: "acquisition_manager",
    tiers: { bronze: { count: 25 }, silver: { count: 100 }, gold: { count: 500 } },
    criteria: { type: "criteria_score", criteriaName: "Price Delivery", minScore: 12 },
  },
  {
    code: "negotiator",
    name: "Negotiator",
    description: "Score 4+/5 on Closing Technique",
    icon: "🤝",
    category: "acquisition_manager",
    tiers: { bronze: { count: 50 }, silver: { count: 200 }, gold: { count: 1000 } },
    criteria: { type: "criteria_score", criteriaName: "Closing Technique", minScore: 4 },
  },
  {
    code: "clear_answer",
    name: "Clear Answer",
    description: "Perfect 5/5 on Closing Technique",
    icon: "✅",
    category: "acquisition_manager",
    tiers: { bronze: { count: 25 }, silver: { count: 100 }, gold: { count: 750 } },
    criteria: { type: "criteria_score", criteriaName: "Closing Technique", minScore: 5, maxScore: 5 },
  },
  {
    code: "closer",
    name: "Closer",
    description: "Deals closed from GHL pipeline",
    icon: "🎯",
    category: "acquisition_manager",
    tiers: { bronze: { count: 25 }, silver: { count: 75 }, gold: { count: 200 } },
    criteria: { type: "deals" },
  },
];

// Lead Generator Badges
export const LEAD_GENERATOR_BADGES: BadgeDefinition[] = [
  {
    code: "conversation_starter",
    name: "Conversation Starter",
    description: "Successful cold calls where seller interest was generated (graded C or better)",
    icon: "💬",
    category: "lead_generator",
    tiers: { bronze: { count: 50 }, silver: { count: 200 }, gold: { count: 1000 } },
    criteria: { type: "consecutive_grade", minGrade: "C" },
  },
  {
    code: "warm_handoff_pro",
    name: "Warm Handoff Pro",
    description: "Calls where seller expressed interest and was successfully set up for Lead Manager follow-up",
    icon: "🤝",
    category: "lead_generator",
    tiers: { bronze: { count: 25 }, silver: { count: 100 }, gold: { count: 500 } },
    criteria: { type: "call_outcome", criteriaName: "follow_up" },
  },
  {
    code: "objection_handler",
    name: "Objection Handler",
    description: "Score 12+/15 on Objection Handling",
    icon: "🛡️",
    category: "lead_generator",
    tiers: { bronze: { count: 25 }, silver: { count: 100 }, gold: { count: 500 } },
    criteria: { type: "criteria_score", criteriaName: "Objection Handling", minScore: 12 },
  },
  {
    code: "interest_generator",
    name: "Interest Generator",
    description: "Score 20+/25 on Interest Discovery — consistently getting sellers to express interest in selling",
    icon: "🎯",
    category: "lead_generator",
    tiers: { bronze: { count: 25 }, silver: { count: 100 }, gold: { count: 500 } },
    criteria: { type: "criteria_score", criteriaName: "Interest Discovery", minScore: 20 },
  },
  {
    code: "cold_call_warrior",
    name: "Cold Call Warrior",
    description: "Weeks with 200+ graded cold calls generating seller interest",
    icon: "⚔️",
    category: "lead_generator",
    tiers: { bronze: { count: 5 }, silver: { count: 15 }, gold: { count: 30 } },
    criteria: { type: "weekly_volume", weeklyCount: 200 },
  },
];

export const ALL_BADGES = [...UNIVERSAL_BADGES, ...LEAD_MANAGER_BADGES, ...ACQUISITION_MANAGER_BADGES, ...LEAD_GENERATOR_BADGES];

// ============ XP SYSTEM ============

export const XP_REWARDS = {
  GRADED_CALL: 10,
  GRADE_A: 50,
  GRADE_B: 30,
  GRADE_C: 15,
  GRADE_D: 5,
  GRADE_F: 0,
  IMPROVEMENT: 20,
  BADGE_EARNED: 25,
};

export const LEVEL_THRESHOLDS = [
  { level: 1, minXp: 0, title: "Rookie" },
  { level: 2, minXp: 500, title: "Rookie" },
  { level: 3, minXp: 1000, title: "Rookie" },
  { level: 4, minXp: 1750, title: "Rookie" },
  { level: 5, minXp: 2500, title: "Rookie" },
  { level: 6, minXp: 4000, title: "Closer" },
  { level: 7, minXp: 6000, title: "Closer" },
  { level: 8, minXp: 9000, title: "Closer" },
  { level: 9, minXp: 12000, title: "Closer" },
  { level: 10, minXp: 15000, title: "Closer" },
  { level: 11, minXp: 20000, title: "Veteran" },
  { level: 12, minXp: 27000, title: "Veteran" },
  { level: 13, minXp: 35000, title: "Veteran" },
  { level: 14, minXp: 42000, title: "Veteran" },
  { level: 15, minXp: 50000, title: "Veteran" },
  { level: 16, minXp: 62500, title: "Elite" },
  { level: 17, minXp: 77500, title: "Elite" },
  { level: 18, minXp: 95000, title: "Elite" },
  { level: 19, minXp: 110000, title: "Elite" },
  { level: 20, minXp: 125000, title: "Elite" },
  { level: 21, minXp: 150000, title: "Legend" },
  { level: 22, minXp: 180000, title: "Legend" },
  { level: 23, minXp: 220000, title: "Legend" },
  { level: 24, minXp: 270000, title: "Legend" },
  { level: 25, minXp: 350000, title: "Legend" },
];

export function getLevelFromXp(totalXp: number): { level: number; title: string; nextLevelXp: number; progress: number } {
  let currentLevel = LEVEL_THRESHOLDS[0];
  let nextLevel = LEVEL_THRESHOLDS[1];
  
  for (let i = 0; i < LEVEL_THRESHOLDS.length; i++) {
    if (totalXp >= LEVEL_THRESHOLDS[i].minXp) {
      currentLevel = LEVEL_THRESHOLDS[i];
      nextLevel = LEVEL_THRESHOLDS[i + 1] || LEVEL_THRESHOLDS[i];
    }
  }
  
  const xpInCurrentLevel = totalXp - currentLevel.minXp;
  const xpNeededForNextLevel = nextLevel.minXp - currentLevel.minXp;
  const progress = xpNeededForNextLevel > 0 ? Math.min(100, (xpInCurrentLevel / xpNeededForNextLevel) * 100) : 100;
  
  return {
    level: currentLevel.level,
    title: currentLevel.title,
    nextLevelXp: nextLevel.minXp,
    progress,
  };
}

export function isWeekend(date: Date): boolean {
  const day = date.getDay();
  return day === 0 || day === 6;
}

// ============ DATABASE OPERATIONS ============

/**
 * Get or create user XP record
 */
export async function getUserXp(teamMemberId: number): Promise<{ totalXp: number; level: number; title: string; nextLevelXp: number; progress: number }> {
  const db = await getDb();
  if (!db) return { totalXp: 0, ...getLevelFromXp(0) };
  const [existing] = await db.select().from(userXp).where(eq(userXp.teamMemberId, teamMemberId));
  
  if (!existing) {
    await db.insert(userXp).values({ teamMemberId, totalXp: 0 });
    return { totalXp: 0, ...getLevelFromXp(0) };
  }
  
  return { totalXp: existing.totalXp, ...getLevelFromXp(existing.totalXp) };
}

/**
 * Add XP to a user
 */
export async function addXp(teamMemberId: number, amount: number, reason: string, callId?: number): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  
  // Add transaction record
  await db.insert(xpTransactions).values({
    teamMemberId,
    amount,
    reason,
    callId: callId || null,
  });
  
  // Update total XP
  const [existing] = await db.select().from(userXp).where(eq(userXp.teamMemberId, teamMemberId));
  
  if (existing) {
    const newTotal = existing.totalXp + amount;
    await db.update(userXp).set({ totalXp: newTotal }).where(eq(userXp.teamMemberId, teamMemberId));
    return newTotal;
  } else {
    await db.insert(userXp).values({ teamMemberId, totalXp: amount });
    return amount;
  }
}

/**
 * Get or create user streaks record
 */
export async function getUserStreaks(teamMemberId: number): Promise<{
  hotStreakCurrent: number;
  hotStreakBest: number;
  consistencyStreakCurrent: number;
  consistencyStreakBest: number;
}> {
  const db = await getDb();
  if (!db) return { hotStreakCurrent: 0, hotStreakBest: 0, consistencyStreakCurrent: 0, consistencyStreakBest: 0 };
  const [existing] = await db.select().from(userStreaks).where(eq(userStreaks.teamMemberId, teamMemberId));
  
  if (!existing) {
    await db.insert(userStreaks).values({ teamMemberId });
    return { hotStreakCurrent: 0, hotStreakBest: 0, consistencyStreakCurrent: 0, consistencyStreakBest: 0 };
  }
  
  return {
    hotStreakCurrent: existing.hotStreakCurrent,
    hotStreakBest: existing.hotStreakBest,
    consistencyStreakCurrent: existing.consistencyStreakCurrent,
    consistencyStreakBest: existing.consistencyStreakBest,
  };
}

/**
 * Get CST date string (YYYY-MM-DD) for a given date
 */
function getCSTDateString(date: Date): string {
  // CST is UTC-6
  const cstOffset = -6 * 60 * 60 * 1000;
  const cstDate = new Date(date.getTime() + cstOffset);
  return cstDate.toISOString().split('T')[0];
}

/**
 * Check if a date is a weekend in CST
 */
function isWeekendCST(date: Date): boolean {
  const cstOffset = -6 * 60 * 60 * 1000;
  const cstDate = new Date(date.getTime() + cstOffset);
  const day = cstDate.getDay();
  return day === 0 || day === 6;
}

/**
 * Update streaks after a call is graded
 */
export async function updateStreaks(teamMemberId: number, grade: string, callId: number, callDate: Date): Promise<{
  hotStreakUpdated: boolean;
  consistencyUpdated: boolean;
  streakBroken: boolean;
}> {
  const db = await getDb();
  if (!db) return { hotStreakUpdated: false, consistencyUpdated: false, streakBroken: false };
  
  // Skip weekend days for streak calculations
  if (isWeekendCST(callDate)) {
    return { hotStreakUpdated: false, consistencyUpdated: false, streakBroken: false };
  }
  
  const result = { hotStreakUpdated: false, consistencyUpdated: false, streakBroken: false };
  const gradeValue: Record<string, number> = { A: 5, B: 4, C: 3, D: 2, F: 1 };
  const isPassingGrade = gradeValue[grade] >= 3; // C or better
  
  const [existing] = await db.select().from(userStreaks).where(eq(userStreaks.teamMemberId, teamMemberId));
  
  if (!existing) {
    // Create new streak record
    await db.insert(userStreaks).values({
      teamMemberId,
      hotStreakCurrent: isPassingGrade ? 1 : 0,
      hotStreakBest: isPassingGrade ? 1 : 0,
      hotStreakLastCallId: callId,
      consistencyStreakCurrent: 1,
      consistencyStreakBest: 1,
      consistencyLastDate: getCSTDateString(callDate),
    });
    result.hotStreakUpdated = isPassingGrade;
    result.consistencyUpdated = true;
    return result;
  }
  
  // Update hot streak
  let newHotStreak = existing.hotStreakCurrent;
  if (isPassingGrade) {
    newHotStreak = existing.hotStreakCurrent + 1;
    result.hotStreakUpdated = true;
  } else {
    if (existing.hotStreakCurrent > 0) {
      result.streakBroken = true;
    }
    newHotStreak = 0;
  }
  
  // Update consistency streak
  const todayCST = getCSTDateString(callDate);
  let newConsistencyStreak = existing.consistencyStreakCurrent;
  
  if (existing.consistencyLastDate) {
    const lastDate = new Date(existing.consistencyLastDate + 'T12:00:00Z');
    
    if (todayCST === existing.consistencyLastDate) {
      // Same day, no change to consistency streak
    } else {
      // Check if this is the next weekday
      const nextDay = new Date(lastDate);
      do {
        nextDay.setDate(nextDay.getDate() + 1);
      } while (isWeekendCST(nextDay));
      
      const expectedDateCST = getCSTDateString(nextDay);
      if (todayCST === expectedDateCST) {
        newConsistencyStreak = existing.consistencyStreakCurrent + 1;
        result.consistencyUpdated = true;
      } else {
        // Streak broken (missed a weekday)
        newConsistencyStreak = 1;
        result.consistencyUpdated = true;
      }
    }
  } else {
    newConsistencyStreak = 1;
    result.consistencyUpdated = true;
  }
  
  // Update database
  await db.update(userStreaks).set({
    hotStreakCurrent: newHotStreak,
    hotStreakBest: Math.max(existing.hotStreakBest, newHotStreak),
    hotStreakLastCallId: callId,
    consistencyStreakCurrent: newConsistencyStreak,
    consistencyStreakBest: Math.max(existing.consistencyStreakBest, newConsistencyStreak),
    consistencyLastDate: todayCST,
  }).where(eq(userStreaks.teamMemberId, teamMemberId));
  
  return result;
}

/**
 * Get user's earned badges
 */
export async function getUserBadges(teamMemberId: number): Promise<Array<{
  code: string;
  name: string;
  icon: string;
  tier: string;
  earnedAt: Date;
}>> {
  const db = await getDb();
  if (!db) return [];
  const earned = await db
    .select({
      badgeId: userBadges.badgeId,
      earnedAt: userBadges.earnedAt,
      code: badges.code,
      name: badges.name,
      icon: badges.icon,
      tier: badges.tier,
    })
    .from(userBadges)
    .innerJoin(badges, eq(userBadges.badgeId, badges.id))
    .where(eq(userBadges.teamMemberId, teamMemberId))
    .orderBy(desc(userBadges.earnedAt));
  
  return earned.map(b => ({
    code: b.code,
    name: b.name,
    icon: b.icon || "🏆",
    tier: b.tier,
    earnedAt: b.earnedAt,
  }));
}

/**
 * Get badge progress for a user
 */
export async function getBadgeProgress(teamMemberId: number): Promise<Record<string, number>> {
  const db = await getDb();
  if (!db) return {};
  const progress = await db.select().from(badgeProgress).where(eq(badgeProgress.teamMemberId, teamMemberId));
  
  const result: Record<string, number> = {};
  for (const p of progress) {
    result[p.badgeCode] = p.currentCount ?? 0;
  }
  return result;
}

/**
 * Update badge progress
 */
export async function updateBadgeProgress(teamMemberId: number, badgeCode: string, increment: number = 1): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  const [existing] = await db
    .select()
    .from(badgeProgress)
    .where(and(eq(badgeProgress.teamMemberId, teamMemberId), eq(badgeProgress.badgeCode, badgeCode)));
  
  if (existing) {
    const newCount = (existing.currentCount ?? 0) + increment;
    await db.update(badgeProgress)
      .set({ currentCount: newCount })
      .where(eq(badgeProgress.id, existing.id));
    return newCount;
  } else {
    await db.insert(badgeProgress).values({ teamMemberId, badgeCode, currentCount: increment });
    return increment;
  }
}

/**
 * Reset badge progress to 0 (used when a streak is broken)
 */
export async function resetBadgeProgress(teamMemberId: number, badgeCode: string): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const [existing] = await db
    .select()
    .from(badgeProgress)
    .where(and(eq(badgeProgress.teamMemberId, teamMemberId), eq(badgeProgress.badgeCode, badgeCode)));
  
  if (existing) {
    await db.update(badgeProgress)
      .set({ currentCount: 0 })
      .where(eq(badgeProgress.id, existing.id));
  }
}

/**
 * Award a badge to a user
 */
export async function awardBadge(teamMemberId: number, badgeCode: string, tier: string, triggerCallId?: number): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  
  // Find the badge
  const [badge] = await db
    .select()
    .from(badges)
    .where(and(eq(badges.code, badgeCode), eq(badges.tier, tier as "bronze" | "silver" | "gold")));
  
  if (!badge) {
    console.log(`[Gamification] Badge not found: ${badgeCode} ${tier}`);
    return false;
  }
  
  // Check if already earned
  const [existing] = await db
    .select()
    .from(userBadges)
    .where(and(eq(userBadges.teamMemberId, teamMemberId), eq(userBadges.badgeId, badge.id)));
  
  if (existing) {
    return false; // Already earned
  }
  
  // Get current progress count for this badge
  const progressResult = await getBadgeProgress(teamMemberId);
  const currentProgress = progressResult[badgeCode] || 0;
  
  // Award the badge - include all required fields
  try {
    await db.insert(userBadges).values({ 
      teamMemberId, 
      badgeId: badge.id, 
      badgeCode,
      progress: currentProgress,
      triggerCallId: triggerCallId || null,
    });
  } catch (err) {
    console.error(`[Gamification] Failed to insert badge ${badgeCode} (${tier}) for member ${teamMemberId}:`, err);
    return false;
  }
  
  // Award XP for earning a badge
  await addXp(teamMemberId, XP_REWARDS.BADGE_EARNED, `Earned ${badge.name} (${tier})`);
  
  console.log(`[Gamification] Successfully awarded ${badge.name} (${tier}) to team member ${teamMemberId}`);
  return true;
}

/**
 * Check if a call has already been viewed for rewards
 */
export async function hasViewedForRewards(teamMemberId: number, callId: number): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  const [existing] = await db
    .select()
    .from(rewardViews)
    .where(and(eq(rewardViews.teamMemberId, teamMemberId), eq(rewardViews.callId, callId)));
  
  return !!existing;
}

/**
 * Process rewards when viewing a graded call for the first time
 */
export async function processCallViewRewards(teamMemberId: number, callId: number): Promise<{
  xpEarned: number;
  badgesEarned: string[];
  streakUpdated: boolean;
}> {
  const db = await getDb();
  if (!db) return { xpEarned: 0, badgesEarned: [], streakUpdated: false };
  const result = { xpEarned: 0, badgesEarned: [] as string[], streakUpdated: false };
  
  // Check if already viewed
  if (await hasViewedForRewards(teamMemberId, callId)) {
    return result;
  }
  
  // Get call and grade info
  const [call] = await db
    .select({
      id: calls.id,
      teamMemberId: calls.teamMemberId,
      callType: calls.callType,
      callOutcome: calls.callOutcome,
      createdAt: calls.createdAt,
    })
    .from(calls)
    .where(eq(calls.id, callId));
  
  if (!call || call.teamMemberId !== teamMemberId) {
    return result;
  }
  
  const [grade] = await db
    .select()
    .from(callGrades)
    .where(eq(callGrades.callId, callId));
  
  if (!grade || !grade.overallGrade) {
    return result;
  }
  
  // Calculate XP
  let xp = XP_REWARDS.GRADED_CALL;
  const gradeXp: Record<string, number> = {
    A: XP_REWARDS.GRADE_A,
    B: XP_REWARDS.GRADE_B,
    C: XP_REWARDS.GRADE_C,
    D: XP_REWARDS.GRADE_D,
    F: XP_REWARDS.GRADE_F,
  };
  const gradeStr = grade.overallGrade;
  xp += gradeXp[gradeStr] || 0;
  
  // Award XP
  await addXp(teamMemberId, xp, `Graded call: ${gradeStr}`, callId);
  result.xpEarned = xp;
  
  // Update streaks
  const streakResult = await updateStreaks(teamMemberId, gradeStr, callId, call.createdAt);
  result.streakUpdated = streakResult.hotStreakUpdated || streakResult.consistencyUpdated;
  
  // Record the view
  await db.insert(rewardViews).values({ teamMemberId, callId, xpAwarded: xp });
  
  // Note: Badge evaluation now happens at grading time (in processCall, Step 8)
  // to ensure badges are based on chronological call order, not view order.
  // The badgesEarned field is kept in the return type for backward compatibility.
  
  return result;
}

/**
 * Get gamification summary for a user
 */
export async function getGamificationSummary(teamMemberId: number): Promise<{
  xp: { totalXp: number; level: number; title: string; nextLevelXp: number; progress: number };
  streaks: { hotStreakCurrent: number; hotStreakBest: number; consistencyStreakCurrent: number; consistencyStreakBest: number };
  badges: Array<{ code: string; name: string; icon: string; tier: string; earnedAt: Date }>;
  badgeCount: number;
}> {
  const [xp, streaks, earnedBadges] = await Promise.all([
    getUserXp(teamMemberId),
    getUserStreaks(teamMemberId),
    getUserBadges(teamMemberId),
  ]);
  
  return {
    xp,
    streaks,
    badges: earnedBadges,
    badgeCount: earnedBadges.length,
  };
}

/**
 * Get leaderboard with gamification data
 */
export async function getGamificationLeaderboard(tenantId?: number): Promise<Array<{
  teamMemberId: number;
  name: string;
  teamRole: string;
  level: number;
  title: string;
  totalXp: number;
  hotStreak: number;
  consistencyStreak: number;
  badgeCount: number;
  topBadges: Array<{ code: string; name: string; icon: string; tier: string }>;
}>> {
  const db = await getDb();
  if (!db) return [];
  
  // Get all active team members (tenant-scoped)
  const memberConditions = [eq(teamMembers.isActive, "true")];
  if (tenantId) {
    memberConditions.push(eq(teamMembers.tenantId, tenantId));
  }
  const members = await db
    .select()
    .from(teamMembers)
    .where(and(...memberConditions));
  
  const leaderboard = await Promise.all(members.map(async (member) => {
    const [xpData, streakData, badgesData] = await Promise.all([
      getUserXp(member.id),
      getUserStreaks(member.id),
      getUserBadges(member.id),
    ]);
    
    return {
      teamMemberId: member.id,
      name: member.name,
      teamRole: member.teamRole,
      level: xpData.level,
      title: xpData.title,
      totalXp: xpData.totalXp,
      hotStreak: streakData.hotStreakCurrent,
      consistencyStreak: streakData.consistencyStreakCurrent,
      badgeCount: badgesData.length,
      topBadges: badgesData.slice(0, 3).map(b => ({
        code: b.code,
        name: b.name,
        icon: b.icon,
        tier: b.tier,
      })),
    };
  }));
  
  // Sort by XP descending
  return leaderboard.sort((a, b) => b.totalXp - a.totalXp);
}

/**
 * Initialize badges in database (run once on startup)
 */
export async function initializeBadges(): Promise<void> {
  const db = await getDb();
  if (!db) return;
  
  for (const badgeDef of ALL_BADGES) {
    for (const [tier, config] of Object.entries(badgeDef.tiers) as Array<[string, { count: number }]>) {
      const [existing] = await db
        .select()
        .from(badges)
        .where(and(eq(badges.code, badgeDef.code), eq(badges.tier, tier as "bronze" | "silver" | "gold")));
      
      if (!existing) {
        await db.insert(badges).values({
          code: badgeDef.code,
          name: badgeDef.name,
          description: badgeDef.description,
          icon: badgeDef.icon,
          category: badgeDef.category,
          tier: tier as "bronze" | "silver" | "gold",
          target: config.count,
          criteriaType: badgeDef.criteria.type,
          criteriaConfig: JSON.stringify(badgeDef.criteria),
        });
      }
    }
  }
  
  console.log("[Gamification] Badges initialized");
}

/**
 * Get all badge definitions with progress for a user
 */
export async function getAllBadgesWithProgress(teamMemberId: number, teamRole: string): Promise<Array<{
  code: string;
  name: string;
  description: string;
  icon: string;
  category: string;
  tiers: {
    bronze: { target: number; earned: boolean; earnedAt?: Date };
    silver: { target: number; earned: boolean; earnedAt?: Date };
    gold: { target: number; earned: boolean; earnedAt?: Date };
  };
  currentProgress: number;
}>> {
  const db = await getDb();
  if (!db) return [];
  
  // Get relevant badges for this role
  const relevantBadges = ALL_BADGES.filter(b => 
    b.category === "universal" || 
    (teamRole === "lead_manager" && b.category === "lead_manager") ||
    (teamRole === "acquisition_manager" && b.category === "acquisition_manager") ||
    (teamRole === "lead_generator" && b.category === "lead_generator")
  );
  
  // Get earned badges
  const earnedBadges = await db
    .select({
      code: badges.code,
      tier: badges.tier,
      earnedAt: userBadges.earnedAt,
    })
    .from(userBadges)
    .innerJoin(badges, eq(userBadges.badgeId, badges.id))
    .where(eq(userBadges.teamMemberId, teamMemberId));
  
  // Get progress
  const progress = await getBadgeProgress(teamMemberId);
  
  // Build result
  return relevantBadges.map(badgeDef => {
    const earnedMap: Record<string, Date | undefined> = {};
    for (const earned of earnedBadges) {
      if (earned.code === badgeDef.code) {
        earnedMap[earned.tier] = earned.earnedAt;
      }
    }
    
    return {
      code: badgeDef.code,
      name: badgeDef.name,
      description: badgeDef.description,
      icon: badgeDef.icon,
      category: badgeDef.category,
      tiers: {
        bronze: { target: badgeDef.tiers.bronze.count, earned: !!earnedMap.bronze, earnedAt: earnedMap.bronze },
        silver: { target: badgeDef.tiers.silver.count, earned: !!earnedMap.silver, earnedAt: earnedMap.silver },
        gold: { target: badgeDef.tiers.gold.count, earned: !!earnedMap.gold, earnedAt: earnedMap.gold },
      },
      currentProgress: progress[badgeDef.code] || 0,
    };
  });
}


/**
 * Batch award XP for all unprocessed graded calls
 */
export async function batchAwardXpForCalls(): Promise<{
  processed: number;
  totalXpAwarded: number;
  memberSummary: Array<{ name: string; xpAwarded: number; callsProcessed: number; newLevel: number; newTitle: string }>;
}> {
  const db = await getDb();
  if (!db) return { processed: 0, totalXpAwarded: 0, memberSummary: [] };
  
  // Get all graded calls that haven't been rewarded yet
  const unprocessedCalls = await db
    .select({
      callId: calls.id,
      teamMemberId: calls.teamMemberId,
      teamMemberName: teamMembers.name,
      overallScore: callGrades.overallScore,
      overallGrade: callGrades.overallGrade,
    })
    .from(calls)
    .innerJoin(teamMembers, eq(calls.teamMemberId, teamMembers.id))
    .innerJoin(callGrades, eq(calls.id, callGrades.callId))
    .leftJoin(rewardViews, and(
      eq(rewardViews.callId, calls.id),
      eq(rewardViews.teamMemberId, calls.teamMemberId)
    ))
    .where(and(
      eq(calls.status, "completed"),
      eq(calls.classification, "conversation"),
      sql`${rewardViews.id} IS NULL`
    ));
  
  console.log(`[Gamification] Found ${unprocessedCalls.length} calls to process for XP rewards`);
  
  const memberTotals: Record<number, { name: string; xp: number; calls: number }> = {};
  let totalXp = 0;
  
  for (const call of unprocessedCalls) {
    // Skip if no team member ID
    if (!call.teamMemberId) continue;
    
    // Calculate XP for this call
    let xp = XP_REWARDS.GRADED_CALL;
    const grade = call.overallGrade || "F";
    const gradeXp: Record<string, number> = {
      A: XP_REWARDS.GRADE_A,
      B: XP_REWARDS.GRADE_B,
      C: XP_REWARDS.GRADE_C,
      D: XP_REWARDS.GRADE_D,
      F: XP_REWARDS.GRADE_F,
    };
    xp += gradeXp[grade] || 0;
    
    const memberId = call.teamMemberId;
    
    // Record the reward view
    await db.insert(rewardViews).values({
      teamMemberId: memberId,
      callId: call.callId,
      xpAwarded: xp,
      viewedAt: new Date(),
    });
    
    // Record XP transaction
    await db.insert(xpTransactions).values({
      teamMemberId: memberId,
      amount: xp,
      reason: `Graded call (${grade})`,
      callId: call.callId,
      createdAt: new Date(),
    });
    
    // Track totals
    if (!memberTotals[memberId]) {
      memberTotals[memberId] = { name: call.teamMemberName, xp: 0, calls: 0 };
    }
    memberTotals[memberId].xp += xp;
    memberTotals[memberId].calls++;
    totalXp += xp;
  }
  
  // Update user_xp totals for each member
  const memberSummary: Array<{ name: string; xpAwarded: number; callsProcessed: number; newLevel: number; newTitle: string }> = [];
  
  for (const [memberIdStr, data] of Object.entries(memberTotals)) {
    const memberId = parseInt(memberIdStr);
    
    // Get current XP
    const [existing] = await db
      .select()
      .from(userXp)
      .where(eq(userXp.teamMemberId, memberId));
    
    const currentXp = existing?.totalXp || 0;
    const newTotal = currentXp + data.xp;
    const levelInfo = getLevelFromXp(newTotal);
    
    // Upsert user_xp (level/title are computed from totalXp, not stored)
    if (existing) {
      await db.update(userXp)
        .set({ totalXp: newTotal, updatedAt: new Date() })
        .where(eq(userXp.teamMemberId, memberId));
    } else {
      await db.insert(userXp).values({
        teamMemberId: memberId,
        totalXp: newTotal,
        updatedAt: new Date(),
      });
    }
    
    memberSummary.push({
      name: data.name,
      xpAwarded: data.xp,
      callsProcessed: data.calls,
      newLevel: levelInfo.level,
      newTitle: levelInfo.title,
    });
    
    console.log(`[Gamification] ${data.name}: +${data.xp} XP from ${data.calls} calls → Total: ${newTotal} XP (Level ${levelInfo.level} - ${levelInfo.title})`);
  }
  
  console.log(`[Gamification] Batch XP award complete: ${unprocessedCalls.length} calls, ${totalXp} XP total`);
  
  return {
    processed: unprocessedCalls.length,
    totalXpAwarded: totalXp,
    memberSummary,
  };
}


/**
 * Evaluate and award badges for a team member after a call is graded
 * This checks all badge criteria and awards badges when thresholds are met
 */
export async function evaluateBadgesForCall(teamMemberId: number, callId: number): Promise<string[]> {
  const db = await getDb();
  if (!db) return [];
  
  const badgesAwarded: string[] = [];
  
  // Get team member info
  const [teamMember] = await db.select().from(teamMembers).where(eq(teamMembers.id, teamMemberId));
  if (!teamMember) return [];
  
  // Get the call and its grade
  const [call] = await db
    .select({
      id: calls.id,
      callOutcome: calls.callOutcome,
      createdAt: calls.createdAt,
    })
    .from(calls)
    .where(eq(calls.id, callId));
  
  if (!call) return [];
  
  const [grade] = await db
    .select()
    .from(callGrades)
    .where(eq(callGrades.callId, callId));
  
  if (!grade) return [];
  
  // Parse criteria scores
  let criteriaScores: Record<string, number> = {};
  try {
    criteriaScores = typeof grade.criteriaScores === 'string' 
      ? JSON.parse(grade.criteriaScores) 
      : (grade.criteriaScores as Record<string, number>) || {};
  } catch {
    criteriaScores = {};
  }
  
  // Get relevant badges for this role
  const relevantBadges = ALL_BADGES.filter(b => 
    b.category === "universal" || 
    (teamMember.teamRole === "lead_manager" && b.category === "lead_manager") ||
    (teamMember.teamRole === "acquisition_manager" && b.category === "acquisition_manager") ||
    (teamMember.teamRole === "lead_generator" && b.category === "lead_generator")
  );
  
  // Check each badge type
  for (const badgeDef of relevantBadges) {
    let shouldIncrement = false;
    let shouldResetStreak = false;
    
    switch (badgeDef.criteria.type) {
      case "consecutive_grade": {
        // "On Fire" / "Conversation Starter" - consecutive C+ grades
        // This is a STREAK badge: increment on C+ grade, RESET to 0 on below-C grade
        const minGrade = badgeDef.criteria.minGrade || "C";
        const gradeOrder = ["F", "D", "C", "B", "A"];
        const gradeIndex = gradeOrder.indexOf(grade.overallGrade || "F");
        const minIndex = gradeOrder.indexOf(minGrade);
        if (gradeIndex >= minIndex) {
          shouldIncrement = true;
        } else {
          // Streak broken — reset progress to 0
          shouldResetStreak = true;
        }
        break;
      }
      
      case "criteria_score": {
        // Check specific criteria score
        const criteriaName = badgeDef.criteria.criteriaName;
        const minScore = badgeDef.criteria.minScore || 0;
        const maxScore = badgeDef.criteria.maxScore;
        
        if (criteriaName) {
          // Handle combined criteria (intro_combined = Introduction & Rapport + Setting Expectations)
          let score = 0;
          if (criteriaName === "intro_combined") {
            score = (criteriaScores["Introduction & Rapport"] || 0) + (criteriaScores["Setting Expectations"] || 0);
          } else {
            score = criteriaScores[criteriaName] || 0;
          }
          
          if (score >= minScore && (maxScore === undefined || score <= maxScore)) {
            shouldIncrement = true;
          }
        }
        break;
      }
      
      case "call_outcome": {
        // Check call outcome (appointment_set, etc.)
        const targetOutcome = badgeDef.criteria.criteriaName;
        if (call.callOutcome === targetOutcome) {
          shouldIncrement = true;
        }
        break;
      }
      
      case "improvement": {
        // "Comeback Kid" - improved by 2+ letter grades
        // Get previous call's grade
        const previousCalls = await db
          .select({
            overallGrade: callGrades.overallGrade,
          })
          .from(calls)
          .innerJoin(callGrades, eq(calls.id, callGrades.callId))
          .where(and(
            eq(calls.teamMemberId, teamMemberId),
            eq(calls.status, "completed"),
            sql`${calls.id} < ${callId}`
          ))
          .orderBy(desc(calls.id))
          .limit(1);
        
        if (previousCalls.length > 0) {
          const gradeOrder = ["F", "D", "C", "B", "A"];
          const prevIndex = gradeOrder.indexOf(previousCalls[0].overallGrade || "F");
          const currIndex = gradeOrder.indexOf(grade.overallGrade || "F");
          if (currIndex - prevIndex >= 2) {
            shouldIncrement = true;
          }
        }
        break;
      }
      
      // Note: consistency_days, weekly_volume, and deals are handled by other processes
      // (updateStreaks for consistency, weekly job for volume, GHL sync for deals)
    }
    
    if (shouldResetStreak) {
      // Streak broken — reset progress to 0 (earned badges are kept)
      await resetBadgeProgress(teamMemberId, badgeDef.code);
    } else if (shouldIncrement) {
      const newCount = await updateBadgeProgress(teamMemberId, badgeDef.code, 1);
      
      // Check if any tier threshold was crossed
      for (const [tier, config] of Object.entries(badgeDef.tiers) as Array<[string, { count: number }]>) {
        if (newCount >= config.count) {
          const awarded = await awardBadge(teamMemberId, badgeDef.code, tier, callId);
          if (awarded) {
            badgesAwarded.push(`${badgeDef.name} (${tier})`);
          }
        }
      }
    }
  }
  
  return badgesAwarded;
}

/**
 * Batch evaluate badges for all team members based on their call history
 * This can be run to catch up on badge progress for existing calls
 */
export async function batchEvaluateBadges(): Promise<{
  processed: number;
  badgesAwarded: number;
  memberSummary: Array<{ name: string; badgesEarned: string[] }>;
}> {
  const db = await getDb();
  if (!db) return { processed: 0, badgesAwarded: 0, memberSummary: [] };
  
  console.log("[Gamification] Starting batch badge evaluation...");
  
  // Get all team members
  const allMembers = await db.select().from(teamMembers).where(eq(teamMembers.isActive, "true"));
  
  const memberSummary: Array<{ name: string; badgesEarned: string[] }> = [];
  let totalBadges = 0;
  let totalCalls = 0;
  
  for (const member of allMembers) {
    const badgesEarned: string[] = [];
    
    // Get all graded calls for this member
    const memberCalls = await db
      .select({
        callId: calls.id,
        callOutcome: calls.callOutcome,
        overallGrade: callGrades.overallGrade,
        criteriaScores: callGrades.criteriaScores,
        createdAt: calls.createdAt,
      })
      .from(calls)
      .innerJoin(callGrades, eq(calls.id, callGrades.callId))
      .where(and(
        eq(calls.teamMemberId, member.id),
        eq(calls.status, "completed"),
        eq(calls.classification, "conversation")
      ))
      .orderBy(calls.createdAt);
    
    console.log(`[Gamification] Processing ${memberCalls.length} calls for ${member.name}`);
    
    // Get relevant badges for this role
    const relevantBadges = ALL_BADGES.filter(b => 
      b.category === "universal" || 
      (member.teamRole === "lead_manager" && b.category === "lead_manager") ||
      (member.teamRole === "acquisition_manager" && b.category === "acquisition_manager") ||
      (member.teamRole === "lead_generator" && b.category === "lead_generator")
    );
    
    // Reset progress for this member (we'll recalculate from scratch)
    await db.delete(badgeProgress).where(eq(badgeProgress.teamMemberId, member.id));
    
    // Track consecutive grades for "On Fire" badge
    let consecutiveGoodGrades = 0;
    let previousGrade: string | null = null;
    
    for (const call of memberCalls) {
      totalCalls++;
      
      // Parse criteria scores
      let criteriaScores: Record<string, number> = {};
      try {
        criteriaScores = typeof call.criteriaScores === 'string' 
          ? JSON.parse(call.criteriaScores) 
          : (call.criteriaScores as Record<string, number>) || {};
      } catch {
        criteriaScores = {};
      }
      
      // Check each badge type
      for (const badgeDef of relevantBadges) {
        let shouldIncrement = false;
        let shouldResetStreak = false;
        
        switch (badgeDef.criteria.type) {
          case "consecutive_grade": {
            const minGrade = badgeDef.criteria.minGrade || "C";
            const gradeOrder = ["F", "D", "C", "B", "A"];
            const gradeIndex = gradeOrder.indexOf(call.overallGrade || "F");
            const minIndex = gradeOrder.indexOf(minGrade);
            if (gradeIndex >= minIndex) {
              consecutiveGoodGrades++;
              shouldIncrement = true;
            } else {
              consecutiveGoodGrades = 0;
              shouldResetStreak = true;
            }
            break;
          }
          
          case "criteria_score": {
            const criteriaName = badgeDef.criteria.criteriaName;
            const minScore = badgeDef.criteria.minScore || 0;
            const maxScore = badgeDef.criteria.maxScore;
            
            if (criteriaName) {
              let score = 0;
              if (criteriaName === "intro_combined") {
                score = (criteriaScores["Introduction & Rapport"] || 0) + (criteriaScores["Setting Expectations"] || 0);
              } else {
                score = criteriaScores[criteriaName] || 0;
              }
              
              if (score >= minScore && (maxScore === undefined || score <= maxScore)) {
                shouldIncrement = true;
              }
            }
            break;
          }
          
          case "call_outcome": {
            const targetOutcome = badgeDef.criteria.criteriaName;
            if (call.callOutcome === targetOutcome) {
              shouldIncrement = true;
            }
            break;
          }
          
          case "improvement": {
            if (previousGrade) {
              const gradeOrder = ["F", "D", "C", "B", "A"];
              const prevIndex = gradeOrder.indexOf(previousGrade);
              const currIndex = gradeOrder.indexOf(call.overallGrade || "F");
              if (currIndex - prevIndex >= 2) {
                shouldIncrement = true;
              }
            }
            break;
          }
        }
        
        if (shouldResetStreak) {
          // Streak broken — reset progress to 0 (earned badges are kept)
          await resetBadgeProgress(member.id, badgeDef.code);
        } else if (shouldIncrement) {
          await updateBadgeProgress(member.id, badgeDef.code, 1);
        }
      }
      
      previousGrade = call.overallGrade;
    }
    
    // Now check badge thresholds and award badges
    const progress = await getBadgeProgress(member.id);
    
    for (const badgeDef of relevantBadges) {
      const currentProgress = progress[badgeDef.code] || 0;
      
      for (const [tier, config] of Object.entries(badgeDef.tiers) as Array<[string, { count: number }]>) {
        if (currentProgress >= config.count) {
          const awarded = await awardBadge(member.id, badgeDef.code, tier);
          if (awarded) {
            badgesEarned.push(`${badgeDef.name} (${tier})`);
            totalBadges++;
          }
        }
      }
    }
    
    if (badgesEarned.length > 0) {
      memberSummary.push({ name: member.name, badgesEarned });
      console.log(`[Gamification] ${member.name} earned: ${badgesEarned.join(", ")}`);
    }
  }
  
  console.log(`[Gamification] Batch badge evaluation complete: ${totalCalls} calls processed, ${totalBadges} badges awarded`);
  
  return {
    processed: totalCalls,
    badgesAwarded: totalBadges,
    memberSummary,
  };
}
