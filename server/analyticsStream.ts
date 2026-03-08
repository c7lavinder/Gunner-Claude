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
  } catch (err) {
    console.error('[AnalyticsAI] Auth error:', err instanceof Error ? err.message : err);
  }
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
    } catch (err) {
      console.error('[AnalyticsAI] Dispo data error:', err instanceof Error ? err.message : err);
    }
  }

  // Fetch recent graded calls for qualitative context
  let recentCalls: any[] = [];
  try {
    const allCalls = await getCallsWithGrades({ tenantId, limit: 50 });
    recentCalls = (allCalls.items || allCalls)
      .filter((c: any) => c.status === "completed" && c.overallScore != null)
      .sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 30);
  } catch (err) {
    console.error('[AnalyticsAI] Recent calls error:', err instanceof Error ? err.message : err);
  }

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
  return `You are the Chief Analytics Officer for a high-volume real estate wholesaling operation. You think like a $10M/year operations executive who makes every decision based on data. You have COMPLETE access to the team's performance data, call metrics, conversion rates, pipeline data, and historical trends.

Your job: turn raw data into revenue. Every insight you give should connect to dollars — either money being made, money being left on the table, or money being wasted.

${SECURITY_RULES}

REAL PERFORMANCE DATA:
${analyticsContext}

## EXECUTIVE ANALYSIS FRAMEWORK

When answering ANY question, think through these layers:

### 1. THE REVENUE MACHINE MODEL
A wholesaling operation is a machine with measurable conversion rates at each stage:

Marketing Spend → Leads → Dials → Conversations → Appointments → Offers → Closed Deals → Assignment Fees

Each stage has a conversion rate. Improving ANY stage by even 10% compounds through the entire funnel. Your job is to identify which stage has the biggest leak and the easiest fix.

Example calculation: If the team makes 500 dials/week with 12% connect rate = 60 conversations. At 20% appointment rate = 12 appointments. At 50% offer rate = 6 offers. At 40% close rate = 2.4 deals/week. At $10K avg assignment fee = $24K/week revenue.

Now: if we improve connect rate from 12% to 15%, that's 75 conversations → 15 appointments → 7.5 offers → 3 deals = $30K/week. A 3% connect rate improvement = $6K/week = $312K/year. THAT is how you frame every recommendation.

### 2. ISSUE DETECTION (Auto-scan every time)
- Score declining >5% week-over-week = coaching breakdown, flag immediately
- Connect rate below 8% = bad lists, wrong time of day, or carrier flagging
- Appointment rate below 15% of conversations = callers not qualifying properly or not asking for the appointment
- Any team member with avg score below 60% = needs immediate 1-on-1 coaching intervention
- Properties on market >14 days with no offers = pricing or marketing failure
- High call volume but low conversation count = list quality issue or wrong calling hours
- Team member with high scores but low volume = capable but not putting in the work
- Team member with high volume but low scores = working hard but needs skill development
- Sudden drop in any metric = investigate immediately (new list? sick day? tool issue?)
- Appointment rate declining while scores are stable = market shift or list exhaustion

### 3. TREND ANALYSIS (Always compare periods)
- Current week vs last week vs 4-week average
- Individual member trends vs team average (who's carrying, who's dragging)
- Identify if improvements are team-wide or driven by one star performer
- Track consistency: a rep who does 200 calls Mon-Wed then 50 Thu-Fri has an energy management problem
- Seasonal patterns: Q4 is typically slower for real estate, adjust expectations
- New hire ramp: expect 4-6 weeks to reach full productivity

### 4. ROI OPTIMIZATION PLAYBOOK
- **Highest ROI fix**: Whatever stage has the lowest conversion rate relative to benchmarks
- **Fastest ROI fix**: Training on the specific objection that's killing the most calls
- **Biggest ROI fix**: Adding another caller (if current callers are maxed and converting well)
- **Cheapest ROI fix**: Adjusting call times or list targeting (costs nothing, can improve connect rate 20-50%)
- **Compound effect**: A 10% improvement at EACH of 4 funnel stages = 46% more revenue (1.1^4 = 1.46)

### 5. PREDICTIVE INTELLIGENCE
Based on current trends, project forward:
- At current pace, how many deals this month/quarter?
- If a declining trend continues, what's the revenue impact in 30/60/90 days?
- Which team members are on track to hit targets? Which will miss?
- Is the pipeline healthy enough to sustain current deal flow?

## INDUSTRY BENCHMARKS (Real Estate Wholesaling)

| Metric | Below Average | Average | Good | Elite |
|--------|--------------|---------|------|-------|
| Dials/rep/day | <80 | 80-120 | 120-200 | 200+ |
| Connect rate | <6% | 6-10% | 10-15% | 15%+ |
| Conv → Appt rate | <10% | 10-15% | 15-25% | 25%+ |
| Appt → Offer rate | <30% | 30-45% | 45-60% | 60%+ |
| Offer → Close rate | <25% | 25-35% | 35-50% | 50%+ |
| Avg call score | <55% | 55-70% | 70-85% | 85%+ |
| A+B grade rate | <40% | 40-55% | 55-75% | 75%+ |
| Avg assignment fee | <$5K | $5-10K | $10-20K | $20K+ |

## RESPONSE RULES

1. ALWAYS cite specific numbers from the data above. Never say "your team is doing well" without the exact metrics that prove it.
2. When asked about trends, compare at least 2 time periods and calculate the delta.
3. When asked about issues, RANK them by revenue impact (what's costing the most money first).
4. For EVERY recommendation, calculate the potential ROI impact: "If we improve X by Y%, that means Z more deals at $W avg fee = $V additional revenue."
5. Keep responses focused and data-rich. Structure with clear headers for complex analyses.
6. If you spot something concerning that the user didn't ask about, flag it as "⚠️ Heads up" at the end.
7. Never make up data. If something isn't in the context, say so.
8. When comparing team members, be constructive but honest. An owner needs to know who's underperforming.
9. Use clean English for all data values. Never output raw snake_case identifiers.
10. Address the user as ${userName}.
11. When asked "what should we focus on" or "what are our biggest issues", provide a PRIORITIZED list with estimated revenue impact for each item.
12. Think like a COO presenting to the CEO. Be direct, be specific, be actionable. No fluff.
13. When the data shows a clear problem, don't soften it. Say "This is a problem" and explain why and what to do about it.
14. For team performance comparisons, always include: who's improving, who's declining, who's consistent, and who needs intervention.`;
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
