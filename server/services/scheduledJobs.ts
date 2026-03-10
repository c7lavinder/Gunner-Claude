import { db } from "../_core/db";
import { sendEmail } from "../_core/email";
import {
  tenants,
  teamMembers,
  users,
  calls,
  callGrades,
  performanceMetrics,
  dispoProperties,
} from "../../drizzle/schema";
import { eq, and, gte, lte, sql, desc } from "drizzle-orm";
import { createCrmAdapter } from "../crm";

const APP_URL = process.env.RAILWAY_STATIC_URL || "https://gunner-app-production.up.railway.app";

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

  if (callsMissing > 0 || opportunitiesUpdated > 0) {
    console.log(`[reconcile] Tenant ${tenantId}: ${callsMissing} calls missing, ${opportunitiesUpdated} opps updated`);
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
}
