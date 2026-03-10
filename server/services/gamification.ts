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
} from "../../drizzle/schema";
import { eq, and, sql, or, isNull } from "drizzle-orm";

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
    await db.update(userXp).set({ totalXp: existingXp.totalXp + totalXp, updatedAt: new Date() }).where(eq(userXp.id, existingXp.id));
  } else {
    await db.insert(userXp).values({ tenantId, teamMemberId, totalXp });
  }
  await db.insert(xpTransactions).values({ tenantId, teamMemberId, amount: totalXp, reason: `Call graded: ${gradeLetter}`, callId });

  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 864e5).toISOString().slice(0, 10);
  const [streakRow] = await db.select().from(userStreaks).where(and(eq(userStreaks.teamMemberId, teamMemberId), eq(userStreaks.tenantId, tenantId)));
  const hotCurrent = score >= 70 ? (streakRow?.hotStreakCurrent ?? 0) + 1 : 0;
  const hotBest = Math.max(streakRow?.hotStreakBest ?? 0, hotCurrent);
  const consistencyLastDate = streakRow?.consistencyLastDate ?? null;
  const consistencyCurrent =
    consistencyLastDate !== today
      ? consistencyLastDate === yesterday
        ? (streakRow?.consistencyStreakCurrent ?? 0) + 1
        : 1
      : streakRow?.consistencyStreakCurrent ?? 0;
  const consistencyBest = Math.max(streakRow?.consistencyStreakBest ?? 0, consistencyCurrent);

  if (streakRow) {
    await db.update(userStreaks).set({
      hotStreakCurrent: hotCurrent,
      hotStreakBest: hotBest,
      hotStreakLastCallId: callId,
      consistencyStreakCurrent: consistencyCurrent,
      consistencyStreakBest: consistencyBest,
      consistencyLastDate: today,
      updatedAt: new Date(),
    }).where(eq(userStreaks.id, streakRow.id));
  } else {
    await db.insert(userStreaks).values({
      tenantId,
      teamMemberId,
      hotStreakCurrent: hotCurrent,
      hotStreakBest: hotBest,
      hotStreakLastCallId: callId,
      consistencyStreakCurrent: consistencyCurrent,
      consistencyStreakBest: consistencyBest,
      consistencyLastDate: today,
    });
  }

  const earnedSet = new Set(
    (await db.select({ badgeCode: userBadges.badgeCode }).from(userBadges).where(and(eq(userBadges.teamMemberId, teamMemberId), eq(userBadges.tenantId, tenantId)))).map((b) => b.badgeCode)
  );
  const [{ count: totalCalls }] = await db.select({ count: sql<number>`count(*)::int` }).from(calls).where(and(eq(calls.teamMemberId, teamMemberId), eq(calls.tenantId, tenantId), eq(calls.status, "graded")));
  const [{ count: calls90Plus }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(callGrades)
    .innerJoin(calls, and(eq(calls.id, callGrades.callId), eq(calls.tenantId, tenantId)))
    .where(and(eq(calls.teamMemberId, teamMemberId), sql`cast(${callGrades.overallScore} as numeric) >= 90`));

  const checks: Array<[string, boolean]> = [
    ["first_90", score >= 90 && calls90Plus === 1],
    ["hot_streak_5", hotCurrent >= 5],
    ["hot_streak_10", hotCurrent >= 10],
    ["consistency_7", consistencyCurrent >= 7],
    ["calls_50", totalCalls >= 50],
    ["calls_100", totalCalls >= 100],
  ];
  const newBadges: string[] = [];
  for (const [code, met] of checks) {
    if (!met || earnedSet.has(code)) continue;
    const [badge] = await db.select().from(badges).where(and(eq(badges.code, code), or(eq(badges.tenantId, tenantId), isNull(badges.tenantId))));
    const badgeId = badge?.id ?? (await db.insert(badges).values({ tenantId: null, code, name: code.replace(/_/g, " "), description: "", category: "achievement", tier: "bronze", target: 1, criteriaType: "manual" }).returning({ id: badges.id }))[0]!.id;
    await db.insert(userBadges).values({ tenantId, teamMemberId, badgeId, badgeCode: code, triggerCallId: callId });
    newBadges.push(code);
    earnedSet.add(code);
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
