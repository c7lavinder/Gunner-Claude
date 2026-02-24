import { invokeLLM } from "./_core/llm";
import { getDb } from "./db";
import { calls, callGrades, teamMembers, teamTrainingItems, trainingMaterials } from "../drizzle/schema";
import { eq, desc, gte, and, isNotNull } from "drizzle-orm";

interface CallWithGrade {
  id: number;
  teamMemberName: string | null;
  teamMemberId: number | null;
  callType: string | null;
  transcript: string | null;
  createdAt: Date;
  grade: {
    overallScore: number | null;
    overallGrade: string | null;
    strengths: string | null;
    improvements: string | null;
    coachingTips: string | null;
    redFlags: string | null;
    criteriaScores: unknown;
  } | null;
}

interface GeneratedInsight {
  itemType: "skill" | "issue" | "win" | "agenda";
  title: string;
  description: string;
  targetBehavior?: string;
  priority: "low" | "medium" | "high" | "urgent";
  teamMemberName?: string;
  teamMemberId?: number;
  teamRole?: "lead_manager" | "acquisition_manager" | "lead_generator";
  sourceCallIds?: number[];
}

interface InsightsResult {
  skills: GeneratedInsight[];
  issues: GeneratedInsight[];
  wins: GeneratedInsight[];
  agenda: GeneratedInsight[];
}

/**
 * Get recent calls with grades for analysis - filtered by tenant
 */
async function getRecentCallsWithGrades(daysBack: number = 7, tenantId?: number): Promise<CallWithGrade[]> {
  const db = await getDb();
  if (!db) return [];

  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysBack);

  const conditions = [
    gte(calls.createdAt, cutoffDate),
    eq(calls.status, "completed"),
    eq(calls.isArchived, "false"), // Exclude archived calls
    isNotNull(calls.transcript)
  ];

  // CRITICAL: Filter by tenant for multi-tenant isolation
  if (tenantId) {
    conditions.push(eq(calls.tenantId, tenantId));
  }

  const recentCalls = await db
    .select({
      id: calls.id,
      teamMemberName: calls.teamMemberName,
      teamMemberId: calls.teamMemberId,
      callType: calls.callType,
      transcript: calls.transcript,
      createdAt: calls.createdAt,
    })
    .from(calls)
    .where(and(...conditions))
    .orderBy(desc(calls.createdAt))
    .limit(50);

  // Get grades for these calls
  const callsWithGrades: CallWithGrade[] = [];
  for (const call of recentCalls) {
    const grades = await db
      .select()
      .from(callGrades)
      .where(eq(callGrades.callId, call.id))
      .limit(1);

    callsWithGrades.push({
      ...call,
      grade: grades[0] ? {
        overallScore: grades[0].overallScore ? parseFloat(grades[0].overallScore) : null,
        overallGrade: grades[0].overallGrade,
        strengths: grades[0].strengths as string | null,
        improvements: grades[0].improvements as string | null,
        coachingTips: grades[0].coachingTips as string | null,
        redFlags: grades[0].redFlags as string | null,
        criteriaScores: grades[0].criteriaScores,
      } : null,
    });
  }

  return callsWithGrades;
}

/**
 * Generate AI insights from recent calls - filtered by tenant
 */
export async function generateTeamInsights(tenantId?: number): Promise<InsightsResult> {
  const recentCalls = await getRecentCallsWithGrades(7, tenantId);

  if (recentCalls.length === 0) {
    return { skills: [], issues: [], wins: [], agenda: [] };
  }

  // Prepare call summaries for AI analysis
  const callSummaries = recentCalls.map((call) => ({
    id: call.id,
    teamMember: call.teamMemberName || "Unknown",
    callType: call.callType || "qualification",
    score: call.grade?.overallScore || null,
    grade: call.grade?.overallGrade || null,
    strengths: call.grade?.strengths || null,
    improvements: call.grade?.improvements || null,
    redFlags: call.grade?.redFlags || null,
    coachingTips: call.grade?.coachingTips || null,
  }));

  // Group by team member for individual analysis
  const byTeamMember: Record<string, typeof callSummaries> = {};
  for (const call of callSummaries) {
    if (!byTeamMember[call.teamMember]) {
      byTeamMember[call.teamMember] = [];
    }
    byTeamMember[call.teamMember].push(call);
  }

  // Group by call type (role) for role-based analysis
  const byCallType: Record<string, typeof callSummaries> = {};
  for (const call of callSummaries) {
    const ct = call.callType || "qualification";
    if (!byCallType[ct]) byCallType[ct] = [];
    byCallType[ct].push(call);
  }

  // Map call types to team roles
  const callTypeToRole: Record<string, string> = {
    "cold_call": "lead_generator",
    "qualification": "lead_manager",
    "follow_up": "lead_manager",
    "offer": "acquisition_manager",
    "seller_callback": "lead_manager",
    "admin_callback": "lead_manager",
    "callback": "lead_manager", // Legacy
    // Legacy mappings
    "lead_generation": "lead_generator",
    "acquisition": "acquisition_manager",
    "negotiation": "acquisition_manager",
  };

  // Get team member roles from the database
  const db = await getDb();
  const memberRoles: Record<string, string> = {};
  if (db) {
    const allMembers = tenantId 
      ? await db.select().from(teamMembers).where(eq(teamMembers.tenantId, tenantId))
      : await db.select().from(teamMembers);
    for (const m of allMembers) {
      memberRoles[m.name] = m.teamRole;
    }
  }

  // Get training materials for context
  let trainingContext = "";
  if (db) {
    const conditions = tenantId 
      ? [eq(trainingMaterials.tenantId, tenantId), eq(trainingMaterials.isActive, "true")] 
      : [eq(trainingMaterials.isActive, "true")];
    const materials = await db
      .select({ title: trainingMaterials.title, content: trainingMaterials.content, category: trainingMaterials.category })
      .from(trainingMaterials)
      .where(and(...conditions))
      .limit(30);
    if (materials.length > 0) {
      trainingContext = `\n## Training Standards & SOPs\nThe team has ${materials.length} training materials that define expected behaviors:\n` +
        materials.map(m => `- **${m.title}** (${m.category || "other"}): ${(m.content || "").substring(0, 500)}`).join("\n");
    }
  }

  // Build role summary for the prompt
  const roleGroups: Record<string, { members: string[], callCount: number, avgScore: number }> = {};
  for (const [member, memberCalls] of Object.entries(byTeamMember)) {
    const role = memberRoles[member] || "lead_manager";
    if (!roleGroups[role]) roleGroups[role] = { members: [], callCount: 0, avgScore: 0 };
    roleGroups[role].members.push(member);
    roleGroups[role].callCount += memberCalls.length;
    const scores = memberCalls.filter(c => c.score).map(c => c.score!);
    roleGroups[role].avgScore = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
  }

  // Calculate team stats
  const teamStats = {
    totalCalls: callSummaries.length,
    averageScore: callSummaries.filter(c => c.score).reduce((sum, c) => sum + (c.score || 0), 0) / 
                  callSummaries.filter(c => c.score).length || 0,
    gradeDistribution: {
      A: callSummaries.filter(c => c.grade === "A").length,
      B: callSummaries.filter(c => c.grade === "B").length,
      C: callSummaries.filter(c => c.grade === "C").length,
      D: callSummaries.filter(c => c.grade === "D").length,
      F: callSummaries.filter(c => c.grade === "F").length,
    },
  };

  // Build role-specific performance summary
  const rolePerformanceSummary = Object.entries(roleGroups).map(([role, data]) => {
    const roleName = role === 'lead_manager' ? 'Lead Manager' : role === 'acquisition_manager' ? 'Acquisition Manager' : 'Lead Generator';
    return `### ${roleName} Team (${data.members.join(', ')})
- Total Calls: ${data.callCount}
- Average Score: ${data.avgScore.toFixed(1)}%`;
  }).join('\n\n');

  // Determine which roles have calls
  const activeRoles = Object.keys(roleGroups).filter(r => roleGroups[r].callCount > 0);

  const prompt = `You are an AI sales coach analyzing call performance data for a real estate wholesaling team. Based on the following call data from the past week, generate actionable insights ORGANIZED BY TEAM ROLE.
${trainingContext}

## Team Performance Summary
- Total Calls Analyzed: ${teamStats.totalCalls}
- Average Score: ${teamStats.averageScore.toFixed(1)}%
- Grade Distribution: A: ${teamStats.gradeDistribution.A}, B: ${teamStats.gradeDistribution.B}, C: ${teamStats.gradeDistribution.C}, D: ${teamStats.gradeDistribution.D}, F: ${teamStats.gradeDistribution.F}

## Performance By Role
${rolePerformanceSummary}

## Individual Team Member Performance
${Object.entries(byTeamMember).map(([name, memberCalls]) => {
  const avgScore = memberCalls.filter(c => c.score).reduce((sum, c) => sum + (c.score || 0), 0) / 
                   memberCalls.filter(c => c.score).length || 0;
  const role = memberRoles[name] || 'lead_manager';
  const roleName = role === 'lead_manager' ? 'Lead Manager' : role === 'acquisition_manager' ? 'Acquisition Manager' : 'Lead Generator';
  return `
### ${name} (${roleName})
- Calls: ${memberCalls.length}
- Average Score: ${avgScore.toFixed(1)}%
- Common Strengths: ${Array.from(new Set(memberCalls.map(c => c.strengths).filter(Boolean))).slice(0, 3).join("; ")}
- Common Improvements Needed: ${Array.from(new Set(memberCalls.map(c => c.improvements).filter(Boolean))).slice(0, 3).join("; ")}
- Red Flags: ${Array.from(new Set(memberCalls.map(c => c.redFlags).filter(Boolean))).slice(0, 3).join("; ")}
`;
}).join("\n")}

## CRITICAL INSTRUCTIONS
You MUST generate insights FOR EACH ROLE that has calls. The active roles with calls are: ${activeRoles.map(r => r === 'lead_manager' ? 'Lead Manager (lead_manager)' : r === 'acquisition_manager' ? 'Acquisition Manager (acquisition_manager)' : 'Lead Generator (lead_generator)').join(', ')}.

For EACH active role, generate EXACTLY:
- 2-3 ISSUES (the most critical/impactful ones only) specific to that role's performance
- 2-3 WINS (the most noteworthy ones only) specific to that role's members
- 2-3 SKILLS (long-term development areas) specific to that role
- 2-3 AGENDA items for that role's team meeting

CRITICAL LIMITS:
- Do NOT generate more than 3 items per category per role. MAXIMUM 3.
- Quality over quantity — pick only the TOP issues, wins, and skills that matter most this week.
- If there are many issues, consolidate related ones into a single high-impact item.
- For SKILLS: focus on the 2-3 most important long-term development areas, not every possible skill gap. Consolidate overlapping skills into one.

Every item MUST include a "teamRole" field set to one of: "lead_manager", "acquisition_manager", or "lead_generator".
Every item MUST include a "teamMemberName" field (set to a specific team member name, or null for role-wide items).

TITLE FORMAT RULE: All titles MUST be 6 words or fewer. Be direct and punchy. Examples:
- GOOD: "Weak Price Anchoring" (3 words)
- GOOD: "No Follow-Up After Offer" (5 words)
- GOOD: "Kyle Crushed Callback Conversion" (4 words)
- BAD: "Inconsistent Expectation Setting and Price Anchoring by Lead Managers" (too long, wordy)
- BAD: "Team Members Are Not Consistently Following Up With Motivated Sellers" (way too long)

Respond with a JSON object in this exact format:
{
  "issues": [
    {
      "title": "Max 6 words",
      "description": "Detailed description of the issue",
      "priority": "urgent" | "high" | "medium" | "low",
      "teamRole": "lead_manager" | "acquisition_manager" | "lead_generator",
      "teamMemberName": "Name if specific to one person, or null for role-wide",
      "sourceCallIds": [list of relevant call IDs]
    }
  ],
  "wins": [
    {
      "title": "Brief title",
      "description": "What happened and why it's worth celebrating",
      "priority": "medium",
      "teamRole": "lead_manager" | "acquisition_manager" | "lead_generator",
      "teamMemberName": "Name of person to celebrate, or null for role-wide"
    }
  ],
  "skills": [
    {
      "title": "Skill name",
      "description": "Why this skill matters",
      "targetBehavior": "What success looks like",
      "priority": "high" | "medium",
      "teamRole": "lead_manager" | "acquisition_manager" | "lead_generator"
    }
  ],
  "agenda": [
    {
      "title": "Agenda item",
      "description": "What to cover and why",
      "priority": "high" | "medium" | "low",
      "teamRole": "lead_manager" | "acquisition_manager" | "lead_generator"
    }
  ]
}`;

  try {
    const response = await invokeLLM({
      messages: [
        { role: "system", content: "You are an expert sales coach. Respond only with valid JSON." },
        { role: "user", content: prompt },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "team_insights",
          strict: true,
          schema: {
            type: "object",
            properties: {
              issues: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    title: { type: "string" },
                    description: { type: "string" },
                    priority: { type: "string", enum: ["low", "medium", "high", "urgent"] },
                    teamRole: { type: "string", enum: ["lead_manager", "acquisition_manager", "lead_generator"] },
                    teamMemberName: { type: ["string", "null"] },
                    sourceCallIds: { type: "array", items: { type: "number" } },
                  },
                  required: ["title", "description", "priority", "teamRole"],
                  additionalProperties: false,
                },
              },
              wins: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    title: { type: "string" },
                    description: { type: "string" },
                    priority: { type: "string", enum: ["low", "medium", "high", "urgent"] },
                    teamRole: { type: "string", enum: ["lead_manager", "acquisition_manager", "lead_generator"] },
                    teamMemberName: { type: ["string", "null"] },
                  },
                  required: ["title", "description", "priority", "teamRole"],
                  additionalProperties: false,
                },
              },
              skills: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    title: { type: "string" },
                    description: { type: "string" },
                    targetBehavior: { type: "string" },
                    priority: { type: "string", enum: ["low", "medium", "high", "urgent"] },
                    teamRole: { type: "string", enum: ["lead_manager", "acquisition_manager", "lead_generator"] },
                  },
                  required: ["title", "description", "targetBehavior", "priority", "teamRole"],
                  additionalProperties: false,
                },
              },
              agenda: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    title: { type: "string" },
                    description: { type: "string" },
                    priority: { type: "string", enum: ["low", "medium", "high", "urgent"] },
                    teamRole: { type: "string", enum: ["lead_manager", "acquisition_manager", "lead_generator"] },
                  },
                  required: ["title", "description", "priority", "teamRole"],
                  additionalProperties: false,
                },
              },
            },
            required: ["issues", "wins", "skills", "agenda"],
            additionalProperties: false,
          },
        },
      },
    });

    const content = response.choices[0]?.message?.content;
    if (!content || typeof content !== "string") {
      return { skills: [], issues: [], wins: [], agenda: [] };
    }

    const insights = JSON.parse(content);

    // Helper to enforce max items per role (keep top N by priority)
    const MAX_PER_ROLE = 3;
    const priorityWeight: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3 };
    const limitPerRole = <T extends { teamRole?: string; priority?: string }>(items: T[]): T[] => {
      const byRole: Record<string, T[]> = {};
      for (const item of items) {
        const role = item.teamRole || 'unknown';
        if (!byRole[role]) byRole[role] = [];
        byRole[role].push(item);
      }
      const limited: T[] = [];
      for (const [, roleItems] of Object.entries(byRole)) {
        roleItems.sort((a, b) => (priorityWeight[a.priority || 'medium'] || 2) - (priorityWeight[b.priority || 'medium'] || 2));
        limited.push(...roleItems.slice(0, MAX_PER_ROLE));
      }
      return limited;
    }

    // Transform to GeneratedInsight format and enforce per-role limits
    const rawIssues = insights.issues.map((i: any) => ({
      itemType: "issue" as const,
      title: i.title,
      description: i.description,
      priority: i.priority || "medium",
      teamRole: i.teamRole || undefined,
      teamMemberName: i.teamMemberName || undefined,
      sourceCallIds: i.sourceCallIds || [],
    }));
    const rawWins = insights.wins.map((w: any) => ({
      itemType: "win" as const,
      title: w.title,
      description: w.description,
      priority: w.priority || "medium",
      teamRole: w.teamRole || undefined,
      teamMemberName: w.teamMemberName || undefined,
    }));
    const rawSkills = insights.skills.map((s: any) => ({
      itemType: "skill" as const,
      title: s.title,
      description: s.description,
      targetBehavior: s.targetBehavior,
      priority: s.priority || "high",
      teamRole: s.teamRole || undefined,
    }));
    const rawAgenda = insights.agenda.map((a: any, index: number) => ({
      itemType: "agenda" as const,
      title: a.title,
      description: a.description,
      priority: a.priority || "medium",
      teamRole: a.teamRole || undefined,
    }));

    const result: InsightsResult = {
      issues: limitPerRole(rawIssues),
      wins: limitPerRole(rawWins),
      skills: limitPerRole(rawSkills),
      agenda: limitPerRole(rawAgenda),
    };

    console.log(`[Insights] Generated: ${result.issues.length} issues, ${result.wins.length} wins, ${result.skills.length} skills, ${result.agenda.length} agenda (max ${MAX_PER_ROLE} per role)`);

    return result;
  } catch (error) {
    console.error("Error generating team insights:", error);
    return { skills: [], issues: [], wins: [], agenda: [] };
  }
}

/**
 * Save generated insights to database - with tenant support
 */
export async function saveGeneratedInsights(insights: InsightsResult, tenantId?: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  if (!tenantId) {
    console.error('[Insights] Cannot save insights without tenantId');
    return;
  }

  // Get team member IDs for matching names (filtered by tenant)
  const conditions = [];
  if (tenantId) {
    conditions.push(eq(teamMembers.tenantId, tenantId));
  }
  
  const members = conditions.length > 0 
    ? await db.select().from(teamMembers).where(and(...conditions))
    : await db.select().from(teamMembers);
  const memberMap = new Map(members.map(m => [m.name, m.id]));

  const allInsights = [
    ...insights.issues,
    ...insights.wins,
    ...insights.skills,
    ...insights.agenda,
  ];

  for (const insight of allInsights) {
    const teamMemberId = insight.teamMemberName ? memberMap.get(insight.teamMemberName) : null;

    // Enforce max 50 char title to prevent UI truncation
    const truncatedTitle = insight.title.length > 50 ? insight.title.substring(0, 47) + '...' : insight.title;
    await db.insert(teamTrainingItems).values({
      tenantId: tenantId!, // CRITICAL: Set tenantId for multi-tenant isolation (NOT NULL enforced)
      itemType: insight.itemType,
      title: truncatedTitle,
      description: insight.description,
      targetBehavior: insight.targetBehavior || null,
      priority: insight.priority,
      teamMemberName: insight.teamMemberName || null,
      teamMemberId: teamMemberId || null,
      teamRole: insight.teamRole || null,
      status: "active",
      isAiGenerated: "true",
      sourceCallIds: insight.sourceCallIds ? JSON.stringify(insight.sourceCallIds) : null,
    });
  }
}

/**
 * Clear old AI-generated insights before regenerating - filtered by tenant
 */
export async function clearAiGeneratedInsights(tenantId?: number): Promise<void> {
  const db = await getDb();
  if (!db) return;

  const conditions = [eq(teamTrainingItems.isAiGenerated, "true")];
  
  // CRITICAL: Only clear insights for this tenant
  if (tenantId) {
    conditions.push(eq(teamTrainingItems.tenantId, tenantId));
  }

  await db
    .delete(teamTrainingItems)
    .where(and(...conditions));
}
