import { db } from "../_core/db";
import { SOFTWARE_PLAYBOOK } from "./playbooks";
import {
  userXp,
  xpTransactions,
  userStreaks,
  userBadges,
  badges,
  callGrades,
  calls,
  teamMembers,
  dispoProperties,
} from "../../drizzle/schema";
import { eq, and, sql, or, isNull, ne, gte } from "drizzle-orm";
import { createNotification } from "../routers/notifications";

function scoreToGrade(score: number): string {
  if (score >= 90) return "A";
  if (score >= 80) return "B";
  if (score >= 70) return "C";
  if (score >= 60) return "D";
  return "F";
}

export async function processCallGamification(
  callId: number,
  tenantId: number
): Promise<{
  xpAwarded: number;
  newBadges: string[];
  streak: { hot: number; consistency: number };
}> {
  const [call] = await db.select().from(calls).where(and(eq(calls.id, callId), eq(calls.tenantId, tenantId)));
  const [grade] = await db.select().from(callGrades).where(and(eq(callGrades.callId, callId), eq(callGrades.tenantId, tenantId)));
  if (!call || !grade || !call.teamMemberId) return { xpAwarded: 0, newBadges: [], streak: { hot: 0, consistency: 0 } };
  const teamMemberId = call.teamMemberId;
  const [member] = await db.select().from(teamMembers).where(and(eq(teamMembers.id, teamMemberId), eq(teamMembers.tenantId, tenantId)));
  if (!member) return { xpAwarded: 0, newBadges: [], streak: { hot: 0, consistency: 0 } };

  const score = Number(grade.overallScore ?? 0);
  const gradeLetter = scoreToGrade(score);
  const r = SOFTWARE_PLAYBOOK.xpRewards;
  const bonusXp = { A: r.gradeA, B: r.gradeB, C: r.gradeC, D: r.gradeD, F: r.gradeF }[gradeLetter] ?? r.gradeF;
  const totalXp = r.callBase + bonusXp;

  const [existingXp] = await db.select().from(userXp).where(and(eq(userXp.teamMemberId, teamMemberId), eq(userXp.tenantId, tenantId)));
  if (existingXp) {
    await db.update(userXp).set({ totalXp: sql`${userXp.totalXp} + ${totalXp}`, updatedAt: new Date() }).where(eq(userXp.id, existingXp.id));
  } else {
    await db.insert(userXp).values({ tenantId, teamMemberId, totalXp });
  }
  await db.insert(xpTransactions).values({ tenantId, teamMemberId, amount: totalXp, reason: `Call graded: ${gradeLetter}`, callId });

  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 864e5).toISOString().slice(0, 10);

  // Streak update in a transaction for atomicity
  const { hotCurrent, hotBest: hotBestFinal, consistencyCurrent, consistencyBest: consistencyBestFinal } = await db.transaction(async (tx) => {
    const [streakRow] = await tx.select().from(userStreaks).where(and(eq(userStreaks.teamMemberId, teamMemberId), eq(userStreaks.tenantId, tenantId)));
    const hot = score >= 70 ? (streakRow?.hotStreakCurrent ?? 0) + 1 : 0;
    const hotB = Math.max(streakRow?.hotStreakBest ?? 0, hot);
    const consistencyLastDate = streakRow?.consistencyLastDate ?? null;
    const consistency =
      consistencyLastDate !== today
        ? consistencyLastDate === yesterday
          ? (streakRow?.consistencyStreakCurrent ?? 0) + 1
          : 1
        : streakRow?.consistencyStreakCurrent ?? 0;
    const consistencyB = Math.max(streakRow?.consistencyStreakBest ?? 0, consistency);

    if (streakRow) {
      await tx.update(userStreaks).set({
        hotStreakCurrent: hot,
        hotStreakBest: hotB,
        hotStreakLastCallId: callId,
        consistencyStreakCurrent: consistency,
        consistencyStreakBest: consistencyB,
        consistencyLastDate: today,
        updatedAt: new Date(),
      }).where(eq(userStreaks.id, streakRow.id));
    } else {
      await tx.insert(userStreaks).values({
        tenantId,
        teamMemberId,
        hotStreakCurrent: hot,
        hotStreakBest: hotB,
        hotStreakLastCallId: callId,
        consistencyStreakCurrent: consistency,
        consistencyStreakBest: consistencyB,
        consistencyLastDate: today,
      });
    }
    return { hotCurrent: hot, hotBest: hotB, consistencyCurrent: consistency, consistencyBest: consistencyB };
  });

  const earnedSet = new Set(
    (await db.select({ badgeCode: userBadges.badgeCode }).from(userBadges).where(and(eq(userBadges.teamMemberId, teamMemberId), eq(userBadges.tenantId, tenantId)))).map((b) => b.badgeCode)
  );
  const [{ count: totalCalls }] = await db.select({ count: sql<number>`count(*)::int` }).from(calls).where(and(eq(calls.teamMemberId, teamMemberId), eq(calls.tenantId, tenantId), eq(calls.status, "graded")));
  const [{ count: calls90Plus }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(callGrades)
    .innerJoin(calls, and(eq(calls.id, callGrades.callId), eq(calls.tenantId, tenantId)))
    .where(and(eq(calls.teamMemberId, teamMemberId), sql`cast(${callGrades.overallScore} as numeric) >= 90`));

  // Weekly call volume (Sun-Sat)
  const weekStart = new Date();
  weekStart.setDate(weekStart.getDate() - weekStart.getDay());
  weekStart.setHours(0, 0, 0, 0);
  const [{ count: weekCalls }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(calls)
    .where(and(eq(calls.teamMemberId, teamMemberId), eq(calls.tenantId, tenantId), eq(calls.status, "graded"), gte(sql`COALESCE(${calls.callTimestamp}, ${calls.createdAt})`, weekStart)));

  // Previous average score (all calls excluding current one)
  const prevGrades = await db
    .select({ score: callGrades.overallScore })
    .from(callGrades)
    .innerJoin(calls, and(eq(calls.id, callGrades.callId), eq(calls.tenantId, tenantId)))
    .where(and(eq(calls.teamMemberId, teamMemberId), ne(callGrades.callId, callId)));
  const prevAvg = prevGrades.length > 0
    ? prevGrades.reduce((sum, g) => sum + Number(g.score ?? 0), 0) / prevGrades.length
    : 0;
  const improved = prevAvg > 0 && score > prevAvg;

  // Award improvement XP if score beats previous average by 5+ points
  if (improved && score - prevAvg >= 5) {
    const xpBonus = score - prevAvg >= 15
      ? SOFTWARE_PLAYBOOK.xpRewards.improvement * 2
      : SOFTWARE_PLAYBOOK.xpRewards.improvement;
    await db.update(userXp).set({ totalXp: sql`${userXp.totalXp} + ${xpBonus}`, updatedAt: new Date() }).where(and(eq(userXp.teamMemberId, teamMemberId), eq(userXp.tenantId, tenantId)));
    await db.insert(xpTransactions).values({ tenantId, teamMemberId, amount: xpBonus, reason: `Improvement: +${(score - prevAvg).toFixed(0)}pts above avg`, callId });
  }

  const checks: Array<[string, boolean]> = [
    ["first_call", totalCalls >= 1],
    ["first_90", score >= 90 && calls90Plus === 1],
    ["perfect_100", score === 100],
    ["hot_streak_3", hotCurrent >= 3],
    ["hot_streak_5", hotCurrent >= 5],
    ["hot_streak_10", hotCurrent >= 10],
    ["hot_streak_25", hotCurrent >= 25],
    ["consistency_3", consistencyCurrent >= 3],
    ["consistency_7", consistencyCurrent >= 7],
    ["consistency_14", consistencyCurrent >= 14],
    ["consistency_30", consistencyCurrent >= 30],
    ["calls_10", totalCalls >= 10],
    ["calls_25", totalCalls >= 25],
    ["calls_50", totalCalls >= 50],
    ["calls_100", totalCalls >= 100],
    ["calls_250", totalCalls >= 250],
    ["calls_500", totalCalls >= 500],
    // Weekly volume badges: number of calls graded this week
    ["volume_dialer_10", weekCalls >= 10],
    ["volume_warrior_25", weekCalls >= 25],
    ["volume_machine_50", weekCalls >= 50],
    // Improvement badge: score beats previous average by 5+ points
    ["improvement", improved && score - prevAvg >= 5],
  ];
  const newBadges: string[] = [];
  for (const [code, met] of checks) {
    if (!met || earnedSet.has(code)) continue;
    const [badge] = await db.select().from(badges).where(and(eq(badges.code, code), or(eq(badges.tenantId, tenantId), isNull(badges.tenantId))));
    const badgeId = badge?.id ?? (await db.insert(badges).values({ tenantId: null, code, name: code.replace(/_/g, " "), description: "", category: "achievement", tier: "bronze", target: 1, criteriaType: "manual" }).returning({ id: badges.id }))[0]!.id;
    await db.insert(userBadges).values({ tenantId, teamMemberId, badgeId, badgeCode: code, triggerCallId: callId });
    newBadges.push(code);
    earnedSet.add(code);
    // Notify user if they have a linked user account
    if (member.userId) {
      const badgeName = badge?.name ?? code.replace(/_/g, " ");
      await createNotification({
        tenantId,
        userId: member.userId,
        type: "badge_earned",
        title: `Badge Earned: ${badgeName}`,
        body: `You unlocked the "${badgeName}" badge!`,
        entityType: "badge",
        entityId: code,
      }).catch(() => {/* non-fatal */});
    }
  }
  return { xpAwarded: totalXp, newBadges, streak: { hot: hotCurrent, consistency: consistencyCurrent } };
}

export function getLevel(xp: number): { level: number; title: string; xp: number; nextLevelXp: number | null } {
  const thresholds = SOFTWARE_PLAYBOOK.levelThresholds;
  const titles = SOFTWARE_PLAYBOOK.levelTitles;
  let level = 1;
  for (let i = thresholds.length - 1; i >= 0; i--) {
    if (xp >= thresholds[i]) {
      level = i + 1;
      break;
    }
  }
  return { level, title: titles[level - 1] ?? "Rookie", xp, nextLevelXp: level < thresholds.length ? thresholds[level] : null };
}

/**
 * Award XP + badges when a deal closes. Called by opportunity stage change handlers.
 */
export async function processDealClosedGamification(
  tenantId: number,
  teamMemberId: number,
  propertyId: number
): Promise<{ xpAwarded: number; newBadges: string[] }> {
  const xpAmount = 100; // Closing a deal is a major achievement
  const newBadges: string[] = [];

  const [existingXp] = await db.select().from(userXp).where(and(eq(userXp.teamMemberId, teamMemberId), eq(userXp.tenantId, tenantId)));
  if (existingXp) {
    await db.update(userXp).set({ totalXp: sql`${userXp.totalXp} + ${xpAmount}`, updatedAt: new Date() }).where(eq(userXp.id, existingXp.id));
  } else {
    await db.insert(userXp).values({ tenantId, teamMemberId, totalXp: xpAmount });
  }
  await db.insert(xpTransactions).values({ tenantId, teamMemberId, amount: xpAmount, reason: `Deal closed (property #${propertyId})` });

  const earnedSet = new Set(
    (await db.select({ badgeCode: userBadges.badgeCode }).from(userBadges).where(and(eq(userBadges.teamMemberId, teamMemberId), eq(userBadges.tenantId, tenantId)))).map((b) => b.badgeCode)
  );

  // dispoProperties.assignedToUserId references users.id, not teamMembers.id
  const [dealMemberLookup] = await db.select({ userId: teamMembers.userId }).from(teamMembers).where(and(eq(teamMembers.id, teamMemberId), eq(teamMembers.tenantId, tenantId)));
  const closerUserId = dealMemberLookup?.userId;
  const [{ count: closedDeals }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(dispoProperties)
    .where(and(eq(dispoProperties.tenantId, tenantId), closerUserId ? eq(dispoProperties.assignedToUserId, closerUserId) : sql`false`, eq(dispoProperties.status, "closed")));

  const closerChecks: Array<[string, boolean]> = [
    ["first_close", closedDeals >= 1],
    ["closer_5", closedDeals >= 5],
    ["closer_10", closedDeals >= 10],
    ["closer_25", closedDeals >= 25],
    ["closer_50", closedDeals >= 50],
    ["closer_100", closedDeals >= 100],
  ];

  // Fetch team member to get linked userId for notifications
  const [dealMember] = await db.select().from(teamMembers).where(and(eq(teamMembers.id, teamMemberId), eq(teamMembers.tenantId, tenantId)));

  for (const [code, met] of closerChecks) {
    if (!met || earnedSet.has(code)) continue;
    const [badge] = await db.select().from(badges).where(and(eq(badges.code, code), or(eq(badges.tenantId, tenantId), isNull(badges.tenantId))));
    const badgeId = badge?.id ?? (await db.insert(badges).values({
      tenantId: null,
      code,
      name: code.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase()),
      description: `Close ${code.split("_")[1] ?? 1} deal(s)`,
      icon: "🏆",
      category: "closer",
      tier: closedDeals >= 50 ? "gold" : closedDeals >= 10 ? "silver" : "bronze",
      target: closedDeals,
      criteriaType: "deals_closed",
    }).returning({ id: badges.id }))[0]!.id;
    await db.insert(userBadges).values({ tenantId, teamMemberId, badgeId, badgeCode: code });
    newBadges.push(code);
    earnedSet.add(code);
    // Notify user if they have a linked user account
    if (dealMember?.userId) {
      const badgeName = badge?.name ?? code.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());
      await createNotification({
        tenantId,
        userId: dealMember.userId,
        type: "badge_earned",
        title: `Badge Earned: ${badgeName}`,
        body: `You unlocked the "${badgeName}" badge!`,
        entityType: "badge",
        entityId: code,
      }).catch(() => {/* non-fatal */});
    }
  }

  // Award badge XP
  if (newBadges.length > 0) {
    const badgeXp = newBadges.length * SOFTWARE_PLAYBOOK.xpRewards.badgeEarned;
    await db.update(userXp).set({ totalXp: sql`${userXp.totalXp} + ${badgeXp}`, updatedAt: new Date() }).where(and(eq(userXp.teamMemberId, teamMemberId), eq(userXp.tenantId, tenantId)));
    await db.insert(xpTransactions).values({ tenantId, teamMemberId, amount: badgeXp, reason: `Badge(s) earned: ${newBadges.join(", ")}` });
  }

  return { xpAwarded: xpAmount + (newBadges.length * SOFTWARE_PLAYBOOK.xpRewards.badgeEarned), newBadges };
}

/**
 * Award improvement XP when a user's grade trend shifts upward.
 */
export async function processImprovementXp(
  tenantId: number,
  teamMemberId: number,
  currentScore: number,
  previousAvg: number
): Promise<number> {
  if (currentScore <= previousAvg || previousAvg === 0) return 0;

  const improvementDelta = currentScore - previousAvg;
  const xpBonus = improvementDelta >= 15
    ? SOFTWARE_PLAYBOOK.xpRewards.improvement * 2
    : SOFTWARE_PLAYBOOK.xpRewards.improvement;

  const [existingXp] = await db.select().from(userXp).where(and(eq(userXp.teamMemberId, teamMemberId), eq(userXp.tenantId, tenantId)));
  if (existingXp) {
    await db.update(userXp).set({ totalXp: sql`${userXp.totalXp} + ${xpBonus}`, updatedAt: new Date() }).where(eq(userXp.id, existingXp.id));
  } else {
    await db.insert(userXp).values({ tenantId, teamMemberId, totalXp: xpBonus });
  }
  await db.insert(xpTransactions).values({ tenantId, teamMemberId, amount: xpBonus, reason: `Improvement: +${improvementDelta.toFixed(0)}% above avg` });

  return xpBonus;
}

/**
 * Default badge definitions. Seeded at startup or via playbook config.
 */
export const DEFAULT_BADGE_DEFINITIONS = [
  { code: "first_call", name: "First Call", description: "Complete your first graded call", icon: "📞", category: "milestone", tier: "bronze", target: 1, criteriaType: "calls_graded" },
  { code: "first_90", name: "Sharpshooter", description: "Score 90% or higher on a call", icon: "🎯", category: "achievement", tier: "silver", target: 1, criteriaType: "score_threshold" },
  { code: "perfect_100", name: "Perfect Call", description: "Score a perfect 100%", icon: "💯", category: "achievement", tier: "gold", target: 1, criteriaType: "score_threshold" },
  { code: "hot_streak_3", name: "On Fire", description: "3 calls in a row scoring 70%+", icon: "🔥", category: "streak", tier: "bronze", target: 3, criteriaType: "hot_streak" },
  { code: "hot_streak_5", name: "Blazing", description: "5 calls in a row scoring 70%+", icon: "🔥", category: "streak", tier: "silver", target: 5, criteriaType: "hot_streak" },
  { code: "hot_streak_10", name: "Unstoppable", description: "10 calls in a row scoring 70%+", icon: "🔥", category: "streak", tier: "gold", target: 10, criteriaType: "hot_streak" },
  { code: "hot_streak_25", name: "Legendary Streak", description: "25 calls in a row scoring 70%+", icon: "🔥", category: "streak", tier: "platinum", target: 25, criteriaType: "hot_streak" },
  { code: "consistency_7", name: "Weekly Warrior", description: "7-day consistency streak", icon: "📅", category: "streak", tier: "bronze", target: 7, criteriaType: "consistency_streak" },
  { code: "consistency_14", name: "Reliable", description: "14-day consistency streak", icon: "📅", category: "streak", tier: "silver", target: 14, criteriaType: "consistency_streak" },
  { code: "consistency_30", name: "Iron Discipline", description: "30-day consistency streak", icon: "📅", category: "streak", tier: "gold", target: 30, criteriaType: "consistency_streak" },
  { code: "calls_10", name: "Getting Started", description: "Complete 10 graded calls", icon: "📊", category: "milestone", tier: "bronze", target: 10, criteriaType: "calls_graded" },
  { code: "calls_50", name: "Experienced", description: "Complete 50 graded calls", icon: "📊", category: "milestone", tier: "silver", target: 50, criteriaType: "calls_graded" },
  { code: "calls_100", name: "Centurion", description: "Complete 100 graded calls", icon: "📊", category: "milestone", tier: "gold", target: 100, criteriaType: "calls_graded" },
  { code: "calls_500", name: "Call Legend", description: "Complete 500 graded calls", icon: "📊", category: "milestone", tier: "platinum", target: 500, criteriaType: "calls_graded" },
  { code: "first_close", name: "First Close", description: "Close your first deal", icon: "🏆", category: "closer", tier: "bronze", target: 1, criteriaType: "deals_closed" },
  { code: "closer_5", name: "Deal Maker", description: "Close 5 deals", icon: "🏆", category: "closer", tier: "silver", target: 5, criteriaType: "deals_closed" },
  { code: "closer_10", name: "Big League", description: "Close 10 deals", icon: "🏆", category: "closer", tier: "gold", target: 10, criteriaType: "deals_closed" },
  { code: "closer_25", name: "Top Producer", description: "Close 25 deals", icon: "🏆", category: "closer", tier: "platinum", target: 25, criteriaType: "deals_closed" },
  { code: "improvement", name: "Rising Star", description: "Score 5+ points above your average", icon: "📈", category: "improvement", tier: "bronze", target: 1, criteriaType: "improvement" },
  { code: "volume_dialer_10", name: "Volume Dialer", description: "Grade 10 calls in a single week", icon: "📞", category: "volume", tier: "bronze", target: 10, criteriaType: "weekly_volume" },
  { code: "volume_warrior_25", name: "Cold Call Warrior", description: "Grade 25 calls in a single week", icon: "⚡", category: "volume", tier: "silver", target: 25, criteriaType: "weekly_volume" },
  { code: "volume_machine_50", name: "Deal Machine", description: "Grade 50 calls in a single week", icon: "🏭", category: "volume", tier: "gold", target: 50, criteriaType: "weekly_volume" },
] as const;
