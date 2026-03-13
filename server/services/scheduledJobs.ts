import { db } from "../_core/db";
import { sendEmail } from "../_core/email";
import { chatCompletion } from "../_core/llm";
import {
  tenants,
  teamMembers,
  users,
  calls,
  callGrades,
  performanceMetrics,
  dispoProperties,
  coachMessages,
  userPlaybooks,
  userEvents,
  aiSuggestions,
  syncActivityLog,
} from "../../drizzle/schema";
import { eq, and, gte, lte, sql, desc } from "drizzle-orm";
import { createCrmAdapter } from "../crm";
import { ingestCallsForTenant } from "./callIngestion";

import { ENV } from "../_core/env";

const APP_URL = ENV.appUrl;

// ─── Weekly Digest ───────────────────────────────────────

export async function sendWeeklyDigest(tenantId: number): Promise<number> {
  const [tenant] = await db.select().from(tenants).where(eq(tenants.id, tenantId));
  if (!tenant) return 0;

  const members = await db
    .select({ userId: teamMembers.userId, email: users.email, name: users.name })
    .from(teamMembers)
    .leftJoin(users, eq(users.id, teamMembers.userId))
    .where(and(eq(teamMembers.tenantId, tenantId), eq(teamMembers.isActive, "true")));

  const emails = members.map((m) => m.email).filter((e): e is string => Boolean(e));
  if (emails.length === 0) return 0;

  const weekStart = new Date();
  weekStart.setDate(weekStart.getDate() - 7);
  weekStart.setHours(0, 0, 0, 0);
  const weekEnd = new Date();
  weekEnd.setHours(23, 59, 59, 999);

  const gradedCalls = await db
    .select({ call: calls, grade: callGrades })
    .from(calls)
    .innerJoin(callGrades, eq(callGrades.callId, calls.id))
    .where(
      and(
        eq(calls.tenantId, tenantId),
        eq(calls.status, "graded"),
        gte(callGrades.createdAt, weekStart),
        lte(callGrades.createdAt, weekEnd)
      )
    )
    .orderBy(desc(callGrades.overallScore));

  const count = gradedCalls.length;
  const avgScore = count > 0
    ? gradedCalls.reduce((s, r) => s + parseFloat(String(r.grade.overallScore ?? 0)), 0) / count
    : 0;

  const gradeDistribution = { A: 0, B: 0, C: 0, D: 0, F: 0 };
  for (const r of gradedCalls) {
    const s = parseFloat(String(r.grade.overallScore ?? 0));
    if (s >= 90) gradeDistribution.A++;
    else if (s >= 80) gradeDistribution.B++;
    else if (s >= 70) gradeDistribution.C++;
    else if (s >= 60) gradeDistribution.D++;
    else gradeDistribution.F++;
  }

  const top3 = gradedCalls.slice(0, 3);
  const topCallsHtml = top3
    .map(
      (r) =>
        `<li>${r.call.contactName || "Unknown"} — ${r.grade.overallScore}%</li>`
    )
    .join("");

  const html = `
<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="font-family:system-ui,sans-serif;max-width:600px;margin:0 auto;padding:24px;color:#1a1a1a;line-height:1.5">
  <h2 style="margin:0 0 16px">Weekly Gunner Report — ${tenant.name}</h2>
  <p>Here's your team's performance this week.</p>
  <div style="background:#f5f5f5;border-radius:8px;padding:16px;margin:16px 0">
    <p style="margin:0"><strong>${count}</strong> calls graded this week</p>
    <p style="margin:8px 0 0"><strong>Avg score:</strong> ${avgScore.toFixed(1)}%</p>
    <p style="margin:8px 0 0"><strong>Grades:</strong> ${gradeDistribution.A}A · ${gradeDistribution.B}B · ${gradeDistribution.C}C · ${gradeDistribution.D}D · ${gradeDistribution.F}F</p>
  </div>
  ${top3.length > 0 ? `<p><strong>Top calls:</strong></p><ol>${topCallsHtml}</ol>` : ""}
  <p style="margin-top:24px"><a href="${APP_URL}/leaderboard" style="color:#2563eb;text-decoration:none">View leaderboard →</a></p>
</body></html>`;

  await sendEmail({ to: emails, subject: `Weekly Gunner Report — ${tenant.name}`, html });
  return emails.length;
}

// ─── Data Reconciliation ────────────────────────────────

export async function reconcileTenant(tenantId: number): Promise<{ callsMissing: number; opportunitiesUpdated: number }> {
  const [tenant] = await db.select().from(tenants).where(eq(tenants.id, tenantId));
  if (!tenant?.crmConfig || tenant.crmType === "none") return { callsMissing: 0, opportunitiesUpdated: 0 };

  const config: Record<string, string> = {};
  const raw = JSON.parse(tenant.crmConfig) as Record<string, unknown>;
  for (const [k, v] of Object.entries(raw)) {
    if (typeof v === "string") config[k] = v;
    else if (v != null) config[k] = String(v);
  }
  if (config.ghlApiKey && !config.apiKey) config.apiKey = config.ghlApiKey;
  if (config.ghlLocationId && !config.locationId) config.locationId = config.ghlLocationId;

  const adapter = createCrmAdapter(tenant.crmType ?? "ghl", config);

  // Check for missing calls in the last 48 hours
  const since = new Date(Date.now() - 48 * 60 * 60 * 1000);
  let callsMissing = 0;
  try {
    const recordings = await adapter.getCallRecordings(since);
    for (const rec of recordings) {
      const [existing] = await db
        .select({ id: calls.id })
        .from(calls)
        .where(and(eq(calls.tenantId, tenantId), eq(calls.ghlCallId, rec.id)))
        .limit(1);
      if (!existing) callsMissing++;
    }
  } catch (e) {
    console.error(`[reconcile] Tenant ${tenantId} call check failed:`, e);
  }

  // Verify opportunity stages are current
  let opportunitiesUpdated = 0;
  try {
    const opportunities = await adapter.getOpportunities();
    for (const opp of opportunities) {
      const [prop] = await db
        .select({ id: dispoProperties.id, ghlPipelineStageId: dispoProperties.ghlPipelineStageId })
        .from(dispoProperties)
        .where(and(eq(dispoProperties.tenantId, tenantId), eq(dispoProperties.ghlOpportunityId, opp.id)))
        .limit(1);
      if (prop && prop.ghlPipelineStageId !== opp.stageId) {
        await db.update(dispoProperties).set({
          ghlPipelineStageId: opp.stageId,
          stageChangedAt: new Date(),
          updatedAt: new Date(),
        }).where(eq(dispoProperties.id, prop.id));
        opportunitiesUpdated++;
      }
    }
  } catch (e) {
    console.error(`[reconcile] Tenant ${tenantId} opp check failed:`, e);
  }

  // Re-ingest missing calls instead of just counting them
  if (callsMissing > 0) {
    console.log(`[reconcile] Tenant ${tenantId}: ${callsMissing} calls missing — re-ingesting`);
    try {
      const result = await ingestCallsForTenant(tenantId);
      console.log(`[reconcile] Tenant ${tenantId}: re-ingested ${result.processed} calls`);
      await db.insert(syncActivityLog).values({
        tenantId,
        layer: "reconciliation",
        eventType: "call_recovery",
        status: result.errors > 0 ? "error" : "success",
        details: JSON.stringify({ callsMissing, recovered: result.processed, errors: result.errors }),
      });
    } catch (e) {
      console.error(`[reconcile] Tenant ${tenantId} re-ingest failed:`, e);
      await db.insert(syncActivityLog).values({
        tenantId,
        layer: "reconciliation",
        eventType: "call_recovery",
        status: "error",
        details: JSON.stringify({ callsMissing, error: e instanceof Error ? e.message : String(e) }),
      });
    }
  }

  if (opportunitiesUpdated > 0) {
    console.log(`[reconcile] Tenant ${tenantId}: ${opportunitiesUpdated} opps updated`);
    await db.insert(syncActivityLog).values({
      tenantId,
      layer: "reconciliation",
      eventType: "opportunity_sync",
      status: "success",
      details: JSON.stringify({ opportunitiesUpdated }),
    });
  }

  return { callsMissing, opportunitiesUpdated };
}

// ─── User Profile Aggregation ───────────────────────────

export async function updateUserProfiles(tenantId: number): Promise<number> {
  const members = await db.select().from(teamMembers).where(and(eq(teamMembers.tenantId, tenantId), eq(teamMembers.isActive, "true")));
  let updated = 0;

  for (const member of members) {
    try {
      const now = new Date();
      const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

      const [weeklyStats] = await db
        .select({
          count: sql<number>`count(*)::int`,
          avgScore: sql<number>`coalesce(avg(cast(${callGrades.overallScore} as numeric)), 0)`,
        })
        .from(calls)
        .innerJoin(callGrades, eq(callGrades.callId, calls.id))
        .where(and(eq(calls.teamMemberId, member.id), eq(calls.tenantId, tenantId), gte(callGrades.createdAt, weekAgo)));

      const [monthlyStats] = await db
        .select({
          count: sql<number>`count(*)::int`,
          avgScore: sql<number>`coalesce(avg(cast(${callGrades.overallScore} as numeric)), 0)`,
        })
        .from(calls)
        .innerJoin(callGrades, eq(callGrades.callId, calls.id))
        .where(and(eq(calls.teamMemberId, member.id), eq(calls.tenantId, tenantId), gte(callGrades.createdAt, monthAgo)));

      const [allTimeStats] = await db
        .select({
          count: sql<number>`count(*)::int`,
          avgScore: sql<number>`coalesce(avg(cast(${callGrades.overallScore} as numeric)), 0)`,
        })
        .from(calls)
        .innerJoin(callGrades, eq(callGrades.callId, calls.id))
        .where(and(eq(calls.teamMemberId, member.id), eq(calls.tenantId, tenantId)));

      const periods = [
        { type: "weekly", count: weeklyStats?.count ?? 0, avgScore: weeklyStats?.avgScore ?? 0, start: weekAgo },
        { type: "monthly", count: monthlyStats?.count ?? 0, avgScore: monthlyStats?.avgScore ?? 0, start: monthAgo },
        { type: "alltime", count: allTimeStats?.count ?? 0, avgScore: allTimeStats?.avgScore ?? 0, start: new Date(0) },
      ] as const;

      for (const p of periods) {
        const [existing] = await db.select({ id: performanceMetrics.id }).from(performanceMetrics).where(
          and(eq(performanceMetrics.tenantId, tenantId), eq(performanceMetrics.teamMemberId, member.id), eq(performanceMetrics.periodType, p.type))
        ).limit(1);

        const data = {
          totalCalls: p.count,
          averageScore: Number(p.avgScore).toFixed(2),
          updatedAt: new Date(),
        };

        if (existing) {
          await db.update(performanceMetrics).set(data).where(eq(performanceMetrics.id, existing.id));
        } else {
          await db.insert(performanceMetrics).values({
            tenantId,
            teamMemberId: member.id,
            periodType: p.type,
            periodStart: p.start,
            periodEnd: now,
            ...data,
          });
        }
      }
      updated++;
    } catch (e) {
      console.error(`[profile-update] Tenant ${tenantId} member ${member.id}:`, e);
    }
  }
  return updated;
}

// ─── Coaching Memory Distillation ───────────────────────

/**
 * Weekly job: summarizes each user's coaching conversation themes with GPT-4o
 * and updates their user_playbooks record with current strengths + growth areas.
 * This is the core of the intelligence loop — the AI coach learns over time.
 */
export async function distillCoachingMemory(tenantId: number): Promise<number> {
  const members = await db
    .select({ id: teamMembers.id, userId: teamMembers.userId })
    .from(teamMembers)
    .where(and(eq(teamMembers.tenantId, tenantId), eq(teamMembers.isActive, "true")));

  let updated = 0;
  const twoWeeksAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);

  for (const member of members) {
    if (!member.userId) continue;
    try {
      // Gather recent AI coaching conversations for this user
      const messages = await db
        .select({ role: coachMessages.role, content: coachMessages.content })
        .from(coachMessages)
        .where(and(eq(coachMessages.tenantId, tenantId), eq(coachMessages.userId, member.userId), gte(coachMessages.createdAt, twoWeeksAgo)))
        .orderBy(coachMessages.createdAt)
        .limit(200);

      if (messages.length < 6) continue; // Not enough data to distill

      const transcript = messages
        .map((m) => `${m.role === "user" ? "Rep" : "Coach"}: ${m.content}`)
        .join("\n");

      // Also get recent grade trend
      const recentGrades = await db
        .select({ score: callGrades.overallScore, createdAt: callGrades.createdAt })
        .from(callGrades)
        .innerJoin(calls, and(eq(calls.id, callGrades.callId), eq(calls.tenantId, tenantId)))
        .where(and(eq(calls.teamMemberId, member.id), gte(callGrades.createdAt, twoWeeksAgo)))
        .orderBy(callGrades.createdAt);

      const grades = recentGrades.map((g) => Number(g.score ?? 0));
      const gradeTrend =
        grades.length < 2 ? "stable"
          : grades[grades.length - 1] - grades[0] > 5 ? "improving"
          : grades[0] - grades[grades.length - 1] > 5 ? "declining"
          : "stable";

      const prompt = `Analyze this sales coaching conversation history and extract coaching insights.

Conversation (last 2 weeks):
${transcript}

Grade trend: ${gradeTrend} (${grades.length} calls graded)

Return JSON only:
{
  "strengths": ["strength 1", "strength 2", "strength 3"],
  "growthAreas": ["area 1", "area 2", "area 3"],
  "gradeTrend": "improving" | "declining" | "stable",
  "communicationStyle": { "pace": "fast/normal/slow", "tone": "confident/uncertain/professional", "notes": "one sentence" }
}`;

      const raw = await chatCompletion({
        model: "gpt-4o",
        messages: [
          { role: "system", content: "You are a sales coaching analyst. Extract actionable insights from coaching conversations. Return valid JSON only." },
          { role: "user", content: prompt },
        ],
        temperature: 0.3,
        maxTokens: 512,
      });

      let insights: {
        strengths: string[];
        growthAreas: string[];
        gradeTrend: string;
        communicationStyle: Record<string, string>;
      };
      try {
        insights = JSON.parse(raw.replace(/^```json\s*|\s*```$/g, ""));
      } catch {
        console.error(`[coaching-distill] JSON parse failed for user ${member.userId}. Raw: ${raw.slice(0, 300)}`);
        continue;
      }

      // Upsert user_playbooks
      const [existing] = await db.select({ id: userPlaybooks.id }).from(userPlaybooks).where(eq(userPlaybooks.userId, member.userId));
      const data = {
        strengths: insights.strengths ?? [],
        growthAreas: insights.growthAreas ?? [],
        gradeTrend: gradeTrend,
        communicationStyle: insights.communicationStyle ?? {},
        updatedAt: new Date(),
      };
      if (existing) {
        await db.update(userPlaybooks).set(data).where(eq(userPlaybooks.id, existing.id));
      } else {
        await db.insert(userPlaybooks).values({ tenantId, userId: member.userId, ...data });
      }
      updated++;
    } catch (e) {
      console.error(`[coaching-distill] Tenant ${tenantId} member ${member.id}:`, e);
    }
  }
  return updated;
}

// ─── Action Pattern Analysis ────────────────────────────

const ALL_ACTIONS = ["sms", "note", "task", "stage_change", "call_reviewed"];

export async function analyzeActionPatterns(tenantId: number): Promise<number> {
  const members = await db
    .select({ id: teamMembers.id, userId: teamMembers.userId })
    .from(teamMembers)
    .where(and(eq(teamMembers.tenantId, tenantId), eq(teamMembers.isActive, "true")));

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  let analyzed = 0;

  for (const member of members) {
    if (!member.userId) continue;
    try {
      // Check if user_playbook exists — skip if not (coaching distill job creates it)
      const [existing] = await db
        .select({ id: userPlaybooks.id, instructions: userPlaybooks.instructions })
        .from(userPlaybooks)
        .where(eq(userPlaybooks.userId, member.userId))
        .limit(1);

      if (!existing) continue;

      // Fetch raw user events for the last 30 days
      const events = await db
        .select({ eventType: userEvents.eventType, page: userEvents.page })
        .from(userEvents)
        .where(
          and(
            eq(userEvents.userId, member.userId),
            eq(userEvents.tenantId, tenantId),
            gte(userEvents.createdAt, thirtyDaysAgo)
          )
        );

      // Count by eventType
      const eventsByType: Record<string, number> = events.reduce<Record<string, number>>((acc, e) => {
        if (e.eventType) acc[e.eventType] = (acc[e.eventType] ?? 0) + 1;
        return acc;
      }, {});

      // Count by page
      const pagesByCount: Record<string, number> = events.reduce<Record<string, number>>((acc, e) => {
        if (e.page) acc[e.page] = (acc[e.page] ?? 0) + 1;
        return acc;
      }, {});

      // Top 3 event types
      const mostUsed = Object.entries(eventsByType)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([type, count]) => ({ type, count }));

      // Top 3 pages
      const topPages = Object.entries(pagesByCount)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([page, count]) => ({ page, count }));

      // Actions they never or rarely take
      const missedActions = ALL_ACTIONS.filter((a) => !eventsByType[a] || eventsByType[a] < 2);

      const patterns = {
        mostUsed,
        missedActions,
        topPages,
        analyzedAt: new Date().toISOString(),
      };

      // Merge into existing instructions object
      const existingInstructions =
        existing.instructions && typeof existing.instructions === "object" && !Array.isArray(existing.instructions)
          ? (existing.instructions as Record<string, unknown>)
          : {};

      await db
        .update(userPlaybooks)
        .set({ instructions: { ...existingInstructions, actionPatterns: patterns }, updatedAt: new Date() })
        .where(eq(userPlaybooks.id, existing.id));

      analyzed++;
    } catch (e) {
      console.error(`[action-patterns] Tenant ${tenantId} member ${member.id}:`, e);
    }
  }
  return analyzed;
}

// ─── Daily AI Suggestions ───────────────────────────────

/**
 * Daily job: generates 1-2 proactive coaching suggestions for each active rep.
 * Runs at 8am per the hourly interval trigger in startScheduledJobs.
 * Skips users who already have suggestions in the last 20 hours.
 */
export async function generateDailySuggestions(): Promise<number> {
  const activeTenants = await db.select().from(tenants).where(eq(tenants.onboardingCompleted, "true"));
  let totalGenerated = 0;

  for (const tenant of activeTenants) {
    const members = await db
      .select({ id: teamMembers.id, userId: teamMembers.userId })
      .from(teamMembers)
      .where(and(eq(teamMembers.tenantId, tenant.id), eq(teamMembers.isActive, "true")));

    for (const member of members) {
      if (!member.userId) continue;
      try {
        // Skip if suggestions already generated in the last 20 hours
        const twentyHoursAgo = new Date(Date.now() - 20 * 60 * 60 * 1000);
        const [recent] = await db
          .select({ id: aiSuggestions.id })
          .from(aiSuggestions)
          .where(
            and(
              eq(aiSuggestions.userId, member.userId),
              eq(aiSuggestions.tenantId, tenant.id),
              gte(aiSuggestions.createdAt, twentyHoursAgo)
            )
          )
          .limit(1);
        if (recent) continue;

        // Read user playbook for context
        const [userPb] = await db
          .select({ strengths: userPlaybooks.strengths, growthAreas: userPlaybooks.growthAreas, gradeTrend: userPlaybooks.gradeTrend, instructions: userPlaybooks.instructions })
          .from(userPlaybooks)
          .where(eq(userPlaybooks.userId, member.userId))
          .limit(1);

        const strengths = userPb?.strengths && Array.isArray(userPb.strengths) ? (userPb.strengths as string[]).join(", ") : "not yet identified";
        const growthAreas = userPb?.growthAreas && Array.isArray(userPb.growthAreas) ? (userPb.growthAreas as string[]).join(", ") : "not yet identified";
        const gradeTrend = userPb?.gradeTrend ?? "stable";
        const actionPatterns = userPb?.instructions && typeof userPb.instructions === "object" && !Array.isArray(userPb.instructions)
          ? JSON.stringify((userPb.instructions as Record<string, unknown>).actionPatterns ?? {})
          : "{}";

        const prompt = `You are a sales coaching AI. Based on this rep's profile, generate 1-2 actionable suggestions for today. Be specific and brief.

Rep profile:
- Strengths: ${strengths}
- Growth areas: ${growthAreas}
- Grade trend: ${gradeTrend}
- Action patterns: ${actionPatterns}

Return JSON array only:
[{"suggestionType": "coaching_tip" | "action_reminder" | "practice_drill", "content": "suggestion (1-2 sentences)"}]`;

        const raw = await chatCompletion({
          model: "gpt-4o",
          messages: [
            { role: "system", content: "You are a sales coaching AI. Return valid JSON array only." },
            { role: "user", content: prompt },
          ],
          temperature: 0.4,
          maxTokens: 256,
        });

        let parsed: Array<{ suggestionType: string; content: string }>;
        try {
          parsed = JSON.parse(raw.replace(/^```json\s*|\s*```$/g, ""));
        } catch {
          console.error(`[daily-suggestions] JSON parse failed for user ${member.userId}. Raw: ${raw.slice(0, 300)}`);
          continue;
        }

        for (const s of parsed) {
          await db.insert(aiSuggestions).values({
            tenantId: tenant.id,
            userId: member.userId,
            suggestionType: s.suggestionType,
            content: s.content,
            status: "shown",
          });
          totalGenerated++;
        }
      } catch (e) {
        console.error(`[daily-suggestions] Tenant ${tenant.id} member ${member.id}:`, e);
      }
    }
  }
  return totalGenerated;
}

// ─── Job Runner ─────────────────────────────────────────

export function startScheduledJobs(): void {
  console.log("[jobs] Scheduled jobs started");

  // Weekly digest: runs every hour, triggers on Sunday at 9am
  setInterval(async () => {
    const now = new Date();
    if (now.getDay() !== 0 || now.getHours() !== 9 || now.getMinutes() > 0) return;
    console.log("[jobs] Running weekly digest");
    const all = await db.select().from(tenants).where(eq(tenants.onboardingCompleted, "true"));
    for (const t of all) {
      try {
        const sent = await sendWeeklyDigest(t.id);
        if (sent > 0) console.log(`[weekly-digest] Tenant ${t.id}: sent to ${sent}`);
      } catch (e) {
        console.error(`[weekly-digest] Tenant ${t.id}:`, e);
      }
    }
  }, 60 * 60 * 1000);

  // Reconciliation: runs every 6 hours
  setInterval(async () => {
    console.log("[jobs] Running reconciliation");
    const all = await db.select().from(tenants).where(eq(tenants.crmConnected, "true"));
    for (const t of all) {
      try {
        await reconcileTenant(t.id);
      } catch (e) {
        console.error(`[reconcile] Tenant ${t.id}:`, e);
      }
    }
  }, 6 * 60 * 60 * 1000);

  // User profile aggregation: runs every 2 hours
  setInterval(async () => {
    console.log("[jobs] Running user profile updates");
    const all = await db.select().from(tenants).where(eq(tenants.onboardingCompleted, "true"));
    for (const t of all) {
      try {
        const count = await updateUserProfiles(t.id);
        if (count > 0) console.log(`[profile-update] Tenant ${t.id}: updated ${count} profiles`);
      } catch (e) {
        console.error(`[profile-update] Tenant ${t.id}:`, e);
      }
    }
  }, 2 * 60 * 60 * 1000);

  // Coaching memory distillation: runs every hour, triggers on Monday at 7am
  setInterval(async () => {
    const now = new Date();
    if (now.getDay() !== 1 || now.getHours() !== 7 || now.getMinutes() > 0) return;
    console.log("[jobs] Running coaching memory distillation");
    const all = await db.select().from(tenants).where(eq(tenants.onboardingCompleted, "true"));
    for (const t of all) {
      try {
        const count = await distillCoachingMemory(t.id);
        if (count > 0) console.log(`[coaching-distill] Tenant ${t.id}: updated ${count} user profiles`);
      } catch (e) {
        console.error(`[coaching-distill] Tenant ${t.id}:`, e);
      }
    }
  }, 60 * 60 * 1000);

  // Action pattern analysis: runs every 24 hours
  setInterval(async () => {
    console.log("[jobs] Running action pattern analysis");
    const all = await db.select().from(tenants).where(eq(tenants.onboardingCompleted, "true"));
    for (const t of all) {
      try {
        const count = await analyzeActionPatterns(t.id);
        if (count > 0) console.log(`[action-patterns] Tenant ${t.id}: analyzed ${count} users`);
      } catch (e) {
        console.error(`[action-patterns] Tenant ${t.id}:`, e);
      }
    }
  }, 24 * 60 * 60 * 1000);

  // Daily AI suggestions: runs every hour, triggers at 8am
  setInterval(async () => {
    const day = new Date();
    if (day.getHours() !== 8 || day.getMinutes() >= 5) return;
    console.log("[jobs] Running daily AI suggestions");
    try {
      const count = await generateDailySuggestions();
      if (count > 0) console.log(`[daily-suggestions] Generated ${count} suggestions across all tenants`);
    } catch (e) {
      console.error("[daily-suggestions]", e);
    }
  }, 60 * 60 * 1000);
}
