import { db } from "../_core/db";
import { sendEmail } from "../_core/email";
import { calls, callGrades, teamMembers, users, tenants } from "../../drizzle/schema";
import { eq, and, gte, lte, desc } from "drizzle-orm";

import { ENV } from "../_core/env";

const APP_URL = ENV.appUrl;

export async function sendDailyDigest(tenantId: number): Promise<number> {
  const [tenant] = await db.select().from(tenants).where(eq(tenants.id, tenantId));
  if (!tenant) return 0;

  const members = await db
    .select({ userId: teamMembers.userId, email: users.email })
    .from(teamMembers)
    .leftJoin(users, eq(users.id, teamMembers.userId))
    .where(and(eq(teamMembers.tenantId, tenantId), eq(teamMembers.isActive, "true")));

  const emails = members.map((m) => m.email).filter((e): e is string => Boolean(e));
  if (emails.length === 0) return 0;

  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  yesterday.setHours(0, 0, 0, 0);
  const yesterdayEnd = new Date(yesterday);
  yesterdayEnd.setHours(23, 59, 59, 999);

  const gradedCalls = await db
    .select({ call: calls, grade: callGrades })
    .from(calls)
    .innerJoin(callGrades, eq(callGrades.callId, calls.id))
    .where(
      and(
        eq(calls.tenantId, tenantId),
        eq(calls.status, "graded"),
        gte(callGrades.createdAt, yesterday),
        lte(callGrades.createdAt, yesterdayEnd)
      )
    )
    .orderBy(desc(callGrades.overallScore));

  const count = gradedCalls.length;
  const avgScore = count > 0
    ? gradedCalls.reduce((s, r) => s + parseFloat(String(r.grade.overallScore ?? 0)), 0) / count
    : 0;
  const best = gradedCalls[0];
  const worst = gradedCalls[gradedCalls.length - 1];

  const html = `
<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="font-family:system-ui,sans-serif;max-width:600px;margin:0 auto;padding:24px;color:#1a1a1a;line-height:1.5">
  <h2 style="margin:0 0 16px">Your Daily Gunner Report</h2>
  <p>Hi! Here's your call coaching summary for ${tenant.name}.</p>
  <div style="background:#f5f5f5;border-radius:8px;padding:16px;margin:16px 0">
    <p style="margin:0"><strong>${count}</strong> calls graded yesterday</p>
    <p style="margin:8px 0 0"><strong>Avg score:</strong> ${avgScore.toFixed(1)}%</p>
  </div>
  ${best ? `<p><strong>Top call:</strong> ${best.call.contactName || "Unknown"} — ${best.grade.overallScore}%</p>` : ""}
  ${worst && worst !== best ? `<p><strong>Needs attention:</strong> ${worst.call.contactName || "Unknown"} — ${worst.grade.overallScore}%</p>` : ""}
  <p style="margin-top:24px"><a href="${APP_URL}/today" style="color:#2563eb;text-decoration:none">Log in to review →</a></p>
</body></html>`;

  await sendEmail({ to: emails, subject: "Your Daily Gunner Report", html });
  return emails.length;
}

export async function sendGradeAlert(callId: number, tenantId: number): Promise<void> {
  const [call] = await db.select().from(calls).where(and(eq(calls.id, callId), eq(calls.tenantId, tenantId)));
  if (!call) return;

  const [grade] = await db.select().from(callGrades).where(and(eq(callGrades.callId, callId), eq(callGrades.tenantId, tenantId)));
  if (!grade) return;

  const score = parseFloat(String(grade.overallScore ?? 0));
  const gradeLetter = grade.overallGrade ?? (score >= 90 ? "A" : score >= 80 ? "B" : score >= 70 ? "C" : score >= 60 ? "D" : "F");
  if (score >= 60 && gradeLetter !== "D" && gradeLetter !== "F") return;

  const admins = await db
    .select({ email: users.email })
    .from(users)
    .where(and(eq(users.tenantId, tenantId), eq(users.isTenantAdmin, "true")));

  const recipients = admins.map((a) => a.email).filter((e): e is string => Boolean(e));
  if (recipients.length === 0) return;

  const contactName = call.contactName || "Unknown";
  const summary = grade.summary || "No summary available.";
  const html = `
<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="font-family:system-ui,sans-serif;max-width:600px;margin:0 auto;padding:24px;color:#1a1a1a;line-height:1.5">
  <h2 style="margin:0 0 16px;color:#dc2626">Low Grade Alert — ${contactName}</h2>
  <p><strong>Score:</strong> ${score}% (${gradeLetter})</p>
  <p>${summary}</p>
  <p style="margin-top:24px"><a href="${APP_URL}/calls?call=${callId}" style="color:#2563eb;text-decoration:none">Review call →</a></p>
</body></html>`;

  await sendEmail({ to: recipients, subject: `Low Grade Alert — ${contactName}`, html });
}

export function startDailyDigestJob(): void {
  const run = async () => {
    const now = new Date();
    if (now.getHours() !== 8 || now.getMinutes() > 0) return;
    const all = await db.select().from(tenants).where(eq(tenants.onboardingCompleted, "true"));
    for (const t of all) {
      try {
        const sent = await sendDailyDigest(t.id);
        if (sent > 0) console.log(`[digest] Tenant ${t.id}: sent to ${sent} recipients`);
      } catch (e) {
        console.error(`[digest] Tenant ${t.id} failed:`, e);
      }
    }
  };
  run();
  setInterval(run, 60 * 60 * 1000);
}
