import { Request, Response, Router } from "express";
import { parse as parseCookieHeader } from "cookie";
import { verifySessionToken, getUserById } from "./selfServeAuth";
import { invokeLLMStream } from "./llmStream";
import {
  getCallStats,
  getTeamMembers,
  getTeamMemberByUserId,
  getCallsWithGrades,
  getViewableTeamMemberIds,
  type UserPermissionContext,
} from "./db";
import { getDispoKpiSummary, getProperties } from "./inventory";
import { SECURITY_RULES } from "./platformKnowledge";
import type { User } from "../drizzle/schema";

const analyticsStreamRouter = Router();

// Auth helper
async function authenticateRequest(req: Request): Promise<User | null> {
  try {
    const cookieHeader = req.headers.cookie;
    if (cookieHeader) {
      const parsed = parseCookieHeader(cookieHeader);
      const authToken = parsed.auth_token;
      if (authToken) {
        const decoded = verifySessionToken(authToken);
        if (decoded?.userId) {
          const user = await getUserById(decoded.userId);
          return user || null;
        }
      }
    }
  } catch {}
  return null;
}

// ─── Build comprehensive analytics context for the LLM ───
async function buildAnalyticsContext(user: User): Promise<string> {
  const tenantId = user.tenantId ?? undefined;
  const teamMember = user.id ? await getTeamMemberByUserId(user.id) : null;
  const rawRole = teamMember?.teamRole || user.teamRole || user.role;
  const normalizedRole = (rawRole === "super_admin" || rawRole === "admin") ? "admin" : rawRole;

  const permissionContext: UserPermissionContext = {
    teamMemberId: teamMember?.id,
    teamRole: (normalizedRole as any) || "lead_manager",
    userId: user.id,
    tenantId,
  };
  const viewableIds = await getViewableTeamMemberIds(permissionContext);

  // Fetch all time periods in parallel for comparison
  const [statsWeek, statsMonth, statsYtd, statsAll, teamMembers] = await Promise.all([
    getCallStats({ dateRange: "week", viewableTeamMemberIds: viewableIds, tenantId, currentTeamMemberId: teamMember?.id }),
    getCallStats({ dateRange: "month", viewableTeamMemberIds: viewableIds, tenantId, currentTeamMemberId: teamMember?.id }),
    getCallStats({ dateRange: "ytd", viewableTeamMemberIds: viewableIds, tenantId, currentTeamMemberId: teamMember?.id }),
    getCallStats({ dateRange: "all", viewableTeamMemberIds: viewableIds, tenantId, currentTeamMemberId: teamMember?.id }),
    getTeamMembers(tenantId),
  ]);

  // Fetch today's dispo KPIs if tenant exists
  let dispoKpis: any = null;
  let dispoProperties: any = null;
  if (tenantId) {
    const today = new Date().toISOString().split("T")[0];
    try {
      [dispoKpis, dispoProperties] = await Promise.all([
        getDispoKpiSummary(tenantId, today),
        getProperties(tenantId, { limit: 200 }),
      ]);
    } catch { /* best effort */ }
  }

  // Fetch recent graded calls for qualitative context
  let recentCalls: any[] = [];
  try {
    const allCalls = await getCallsWithGrades({ tenantId, limit: 50 });
    recentCalls = (allCalls.items || allCalls)
      .filter((c: any) => c.status === "completed" && c.overallScore != null)
      .sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 30);
  } catch { /* best effort */ }

  const lines: string[] = [];

  // ─── EXECUTIVE SUMMARY ───
  lines.push("═══ EXECUTIVE SUMMARY ═══");
  lines.push(`Team Size: ${teamMembers.length} members`);
  lines.push(`Team Members: ${teamMembers.map(m => `${m.name} (${m.teamRole?.replace(/_/g, " ")})`).join(", ")}`);

  // ─── MULTI-PERIOD COMPARISON ───
  lines.push("\n═══ PERFORMANCE BY PERIOD ═══");
  const periods = [
    { label: "Last 7 Days", data: statsWeek },
    { label: "Last 30 Days", data: statsMonth },
    { label: "Year to Date", data: statsYtd },
    { label: "All Time", data: statsAll },
  ];
  for (const p of periods) {
    lines.push(`\n--- ${p.label} ---`);
    lines.push(`Calls Made: ${p.data.totalCalls}`);
    lines.push(`Conversations (Graded): ${p.data.gradedCalls}`);
    lines.push(`Appointments Set: ${p.data.appointmentsSet}`);
    lines.push(`Offers Completed: ${p.data.offerCallsCompleted}`);
    lines.push(`Leads Generated: ${p.data.leadsGenerated}`);
    lines.push(`Average Score: ${Math.round(p.data.averageScore)}%`);
    lines.push(`Average Call Duration: ${Math.round(p.data.averageCallDuration)}s`);
    if (p.data.gradedCalls > 0) {
      const passingRate = p.data.gradeDistribution
        ? Math.round(((p.data.gradeDistribution.A + p.data.gradeDistribution.B) / p.data.gradedCalls) * 100)
        : 0;
      lines.push(`A+B Passing Rate: ${passingRate}%`);
      lines.push(`Grade Distribution: A=${p.data.gradeDistribution.A}, B=${p.data.gradeDistribution.B}, C=${p.data.gradeDistribution.C}, D=${p.data.gradeDistribution.D}, F=${p.data.gradeDistribution.F}`);
    }
    // Classification breakdown
    const cb = p.data.classificationBreakdown;
    const totalClassified = cb.conversation + cb.admin_call + cb.voicemail + cb.no_answer + cb.callback_request + cb.wrong_number + cb.too_short;
    if (totalClassified > 0) {
      const connectRate = p.data.totalCalls > 0 ? Math.round((cb.conversation / p.data.totalCalls) * 100) : 0;
      lines.push(`Connect Rate: ${connectRate}% (${cb.conversation} conversations out of ${p.data.totalCalls} dials)`);
      lines.push(`Voicemails: ${cb.voicemail}, No Answer: ${cb.no_answer}, Too Short: ${cb.too_short}, Wrong Number: ${cb.wrong_number}`);
    }
    // Conversion rates
    if (p.data.gradedCalls > 0) {
      const convToAppt = Math.round((p.data.appointmentsSet / p.data.gradedCalls) * 100);
      lines.push(`Conversation → Appointment Rate: ${convToAppt}%`);
    }
    if (p.data.appointmentsSet > 0) {
      const apptToOffer = Math.round((p.data.offerCallsCompleted / p.data.appointmentsSet) * 100);
      lines.push(`Appointment → Offer Rate: ${apptToOffer}%`);
    }
  }

  // ─── WEEK-OVER-WEEK TRENDS ───
  if (statsAll.weeklyTrends && statsAll.weeklyTrends.length > 0) {
    lines.push("\n═══ WEEKLY TRENDS (Last 12 Weeks) ═══");
    const recentWeeks = statsAll.weeklyTrends.slice(-12);
    for (const w of recentWeeks) {
      lines.push(`${w.weekStart}: Score=${w.averageScore}%, Calls=${w.totalCalls}, Graded=${w.gradedCalls}`);
    }
    // Calculate trend direction
    if (recentWeeks.length >= 4) {
      const first4Avg = recentWeeks.slice(0, 4).reduce((s, w) => s + w.averageScore, 0) / 4;
      const last4Avg = recentWeeks.slice(-4).reduce((s, w) => s + w.averageScore, 0) / 4;
      const trendDir = last4Avg > first4Avg ? "IMPROVING" : last4Avg < first4Avg ? "DECLINING" : "STABLE";
      lines.push(`Score Trend: ${trendDir} (early avg: ${Math.round(first4Avg)}% → recent avg: ${Math.round(last4Avg)}%)`);
    }
  }

  // ─── INDIVIDUAL TEAM MEMBER PERFORMANCE ───
  lines.push("\n═══ INDIVIDUAL PERFORMANCE (Last 30 Days) ═══");
  if (statsMonth.teamMemberScores && statsMonth.teamMemberScores.length > 0) {
    for (const m of statsMonth.teamMemberScores) {
      const member = teamMembers.find(tm => tm.id === m.memberId);
      const role = member?.teamRole?.replace(/_/g, " ") || "unknown";
      lines.push(`\n${m.memberName} (${role}):`);
      lines.push(`  Graded Calls: ${m.totalGraded} | Avg Score: ${Math.round(m.averageScore)}%`);
      lines.push(`  Grades: A=${m.gradeDistribution.A}, B=${m.gradeDistribution.B}, C=${m.gradeDistribution.C}, D=${m.gradeDistribution.D}, F=${m.gradeDistribution.F}`);
      const passing = m.totalGraded > 0 ? Math.round(((m.gradeDistribution.A + m.gradeDistribution.B) / m.totalGraded) * 100) : 0;
      lines.push(`  A+B Rate: ${passing}%`);
    }
  }

  // Individual trends
  if (statsAll.teamMemberTrends && statsAll.teamMemberTrends.length > 0) {
    lines.push("\n═══ INDIVIDUAL TREND LINES ═══");
    for (const m of statsAll.teamMemberTrends) {
      const recentScores = m.weeklyScores.slice(-8).filter(w => w.callCount > 0);
      if (recentScores.length >= 2) {
        const first = recentScores.slice(0, Math.ceil(recentScores.length / 2));
        const second = recentScores.slice(Math.ceil(recentScores.length / 2));
        const firstAvg = first.reduce((s, w) => s + w.averageScore, 0) / first.length;
        const secondAvg = second.reduce((s, w) => s + w.averageScore, 0) / second.length;
        const dir = secondAvg > firstAvg + 3 ? "↑ IMPROVING" : secondAvg < firstAvg - 3 ? "↓ DECLINING" : "→ STABLE";
        lines.push(`${m.memberName}: ${dir} (${Math.round(firstAvg)}% → ${Math.round(secondAvg)}%)`);
      }
    }
  }

  // ─── RECENT CALL OUTCOMES ───
  if (recentCalls.length > 0) {
    lines.push("\n═══ RECENT CALL OUTCOMES (Last 30 Graded) ═══");
    for (const c of recentCalls.slice(0, 20)) {
      const date = new Date(c.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" });
      const member = teamMembers.find(m => m.id === c.teamMemberId);
      const outcome = c.callOutcome ? c.callOutcome.replace(/_/g, " ") : "none";
      lines.push(`${date} | ${member?.name || "Unknown"} | Score: ${c.overallScore}% (${c.letterGrade}) | Outcome: ${outcome} | ${Math.round((c.callDuration || 0) / 60)}min`);
    }
  }

  // ─── DISPOSITION PIPELINE (if available) ───
  if (dispoKpis) {
    lines.push("\n═══ DISPOSITION PIPELINE (Today) ═══");
    lines.push(`Properties Sent: ${dispoKpis.properties_sent}`);
    lines.push(`Showings Scheduled: ${dispoKpis.showings_scheduled}`);
    lines.push(`Offers Received: ${dispoKpis.offers_received}`);
    lines.push(`Deals Assigned: ${dispoKpis.deals_assigned}`);
    lines.push(`Contracts Closed: ${dispoKpis.contracts_closed}`);
    lines.push(`Total Properties: ${dispoKpis.total_properties} (Active: ${dispoKpis.active_properties})`);
  }

  if (dispoProperties && dispoProperties.items?.length > 0) {
    lines.push("\n═══ PROPERTY PIPELINE SUMMARY ═══");
    const statusCounts: Record<string, number> = {};
    let totalAskingPrice = 0;
    let priceCount = 0;
    for (const p of dispoProperties.items) {
      statusCounts[p.status] = (statusCounts[p.status] || 0) + 1;
      if (p.dispoAskingPrice) { totalAskingPrice += p.dispoAskingPrice; priceCount++; }
    }
    lines.push(`Pipeline Status: ${Object.entries(statusCounts).map(([k, v]) => `${k.replace(/_/g, " ")}: ${v}`).join(", ")}`);
    if (priceCount > 0) {
      lines.push(`Avg Asking Price: $${Math.round(totalAskingPrice / priceCount / 100).toLocaleString()}`);
    }
    // Aging analysis
    const now = Date.now();
    const agingBuckets = { under7: 0, under14: 0, under30: 0, over30: 0 };
    for (const p of dispoProperties.items) {
      if (p.status === "sold") continue;
      const days = Math.floor((now - new Date(p.createdAt).getTime()) / 86400000);
      if (days < 7) agingBuckets.under7++;
      else if (days < 14) agingBuckets.under14++;
      else if (days < 30) agingBuckets.under30++;
      else agingBuckets.over30++;
    }
    lines.push(`Property Aging: <7d: ${agingBuckets.under7}, 7-14d: ${agingBuckets.under14}, 14-30d: ${agingBuckets.under30}, 30d+: ${agingBuckets.over30}`);
  }

  // ─── KEY METRICS CALCULATIONS ───
  lines.push("\n═══ KEY CALCULATED METRICS ═══");
  // Calls per rep per day (last 7 days)
  if (statsWeek.totalCalls > 0 && teamMembers.length > 0) {
    const callingMembers = teamMembers.filter(m => m.teamRole !== "dispo_manager").length || 1;
    const callsPerRepPerDay = Math.round((statsWeek.totalCalls / callingMembers / 7) * 10) / 10;
    lines.push(`Calls/Rep/Day (7d): ${callsPerRepPerDay}`);
  }
  // Conversation rate
  if (statsMonth.totalCalls > 0) {
    const convRate = Math.round((statsMonth.gradedCalls / statsMonth.totalCalls) * 100);
    lines.push(`Conversation Rate (30d): ${convRate}% (${statsMonth.gradedCalls} conversations / ${statsMonth.totalCalls} dials)`);
  }
  // Appointment set rate from conversations
  if (statsMonth.gradedCalls > 0) {
    const apptRate = Math.round((statsMonth.appointmentsSet / statsMonth.gradedCalls) * 100);
    lines.push(`Appointment Rate (30d): ${apptRate}% (${statsMonth.appointmentsSet} appts / ${statsMonth.gradedCalls} conversations)`);
  }

  return lines.join("\n");
}

// ─── System Prompt ───
function buildSystemPrompt(analyticsContext: string, userName: string): string {
  return `You are an expert analytics advisor for a real estate wholesaling operation. You have COMPLETE access to the team's performance data, call metrics, conversion rates, pipeline data, and historical trends.

Your role is to be the team's data-driven strategic advisor. You:
1. ANSWER any analytics question with precision — cite exact numbers, percentages, and dates
2. IDENTIFY issues proactively — spot declining trends, underperformers, bottlenecks, and missed opportunities
3. RECOGNIZE patterns — connect call quality to outcomes, identify what top performers do differently
4. PREDICT potential problems — flag early warning signs before they become crises
5. GUIDE improvement — give specific, actionable recommendations to increase ROI, not generic advice
6. UNDERSTAND the full funnel — from cold calls → conversations → appointments → offers → closed deals

${SECURITY_RULES}

REAL PERFORMANCE DATA:
${analyticsContext}

ANALYSIS FRAMEWORK — Use these when answering questions:

ISSUE DETECTION:
- Score declining >5% week-over-week = flag as concern
- Connect rate below 30% = dialing efficiency issue
- Appointment rate below 15% of conversations = qualification issue
- Any team member with avg score below 60% = needs coaching intervention
- Properties on market >14 days with no offers = pricing or marketing issue
- High call volume but low conversation count = targeting or timing issue

TREND ANALYSIS:
- Compare current period to prior period for momentum
- Look at individual member trends vs team average
- Identify if improvements are team-wide or driven by one person
- Track week-over-week consistency, not just averages

ROI OPTIMIZATION:
- More conversations per dial = better lists or timing
- Higher scores = better training adherence
- More appointments per conversation = better qualification skills
- More offers per appointment = better presentation skills
- Assignment fee optimization = better negotiation
- Each stage of the funnel is a multiplier — small improvements compound

BENCHMARKS FOR REAL ESTATE WHOLESALING:
- Good connect rate: 8-15% of dials become conversations
- Good appointment rate: 15-25% of conversations set appointments
- Good offer rate: 40-60% of appointments receive offers
- Good close rate: 30-50% of offers close
- Target calls/rep/day: 100-200 dials for cold callers
- Target avg score: 75%+ indicates strong training adherence

RESPONSE RULES:
1. ALWAYS cite specific numbers from the data above. Never say "your team is doing well" without backing it up.
2. When asked about trends, compare at least 2 time periods.
3. When asked about issues, rank them by impact (what's costing the most money).
4. When asked about improvement, calculate the potential ROI impact of the change.
5. For ROI questions, think in terms of: "If we improve X by Y%, that means Z more deals per month at $W average assignment fee = $V additional revenue."
6. Keep responses focused and data-rich. Use bullet points for multi-item answers.
7. If you spot something concerning in the data that the user didn't ask about, mention it briefly at the end as a "heads up."
8. Never make up data. If something isn't in the context above, say so.
9. When comparing team members, be constructive — frame it as "opportunities" not "failures."
10. Use clean English for all data values. Never output raw snake_case identifiers.
11. Address the user as ${userName}.
12. For complex analyses, structure your response with clear sections.
13. When the user asks "what should we focus on" or "what are our issues", provide a PRIORITIZED list ranked by revenue impact.`;
}

// ─── Streaming Endpoint ───
analyticsStreamRouter.post("/api/analytics/stream", async (req: Request, res: Response) => {
  const user = await authenticateRequest(req);
  if (!user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const { question, history } = req.body;
  if (!question || typeof question !== "string") {
    res.status(400).json({ error: "Question is required" });
    return;
  }

  // Check admin/manager role
  const teamMember = await getTeamMemberByUserId(user.id);
  const rawRole = teamMember?.teamRole || user.teamRole || user.role;
  const isAdmin = rawRole === "admin" || rawRole === "super_admin";
  if (!isAdmin) {
    res.status(403).json({ error: "Analytics AI is available to admins only" });
    return;
  }

  console.log(`[AnalyticsAI] User ${user.name} asked: "${question.substring(0, 100)}"`);

  try {
    // Build comprehensive analytics context
    const analyticsContext = await buildAnalyticsContext(user);
    const systemPrompt = buildSystemPrompt(analyticsContext, user.name || "there");

    // Set up SSE
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();

    // Build messages
    const messages: Array<{ role: string; content: string }> = [
      { role: "system", content: systemPrompt },
    ];
    if (history && history.length > 0) {
      for (const msg of history.slice(-10)) {
        messages.push({ role: msg.role, content: msg.content });
      }
    }
    messages.push({ role: "user", content: question });

    await invokeLLMStream(
      messages,
      (chunk) => {
        res.write(`data: ${JSON.stringify({ type: "chunk", content: chunk })}\n\n`);
      },
      () => {
        res.write(`data: ${JSON.stringify({ type: "done" })}\n\n`);
        res.end();
      },
      (error) => {
        console.error("[AnalyticsAI] Stream error:", error);
        res.write(`data: ${JSON.stringify({ type: "error", message: error.message })}\n\n`);
        res.end();
      }
    );
  } catch (error: any) {
    console.error("[AnalyticsAI] Error:", error);
    if (!res.headersSent) {
      res.status(500).json({ error: "Failed to process analytics question" });
    } else {
      res.write(`data: ${JSON.stringify({ type: "error", message: error.message })}\n\n`);
      res.end();
    }
  }
});

export { analyticsStreamRouter, buildAnalyticsContext };
