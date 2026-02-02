import { invokeLLM } from "./_core/llm";
import { getDb } from "./db";
import { calls, callGrades, teamMembers, teamTrainingItems } from "../drizzle/schema";
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
  sourceCallIds?: number[];
}

interface InsightsResult {
  skills: GeneratedInsight[];
  issues: GeneratedInsight[];
  wins: GeneratedInsight[];
  agenda: GeneratedInsight[];
}

/**
 * Get recent calls with grades for analysis
 */
async function getRecentCallsWithGrades(daysBack: number = 7): Promise<CallWithGrade[]> {
  const db = await getDb();
  if (!db) return [];

  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysBack);

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
    .where(
      and(
        gte(calls.createdAt, cutoffDate),
        eq(calls.status, "completed"),
        isNotNull(calls.transcript)
      )
    )
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
 * Generate AI insights from recent calls
 */
export async function generateTeamInsights(): Promise<InsightsResult> {
  const recentCalls = await getRecentCallsWithGrades(7);

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

  const prompt = `You are an AI sales coach analyzing call performance data for a real estate wholesaling team. Based on the following call data from the past week, generate actionable insights for the team.

## Team Performance Summary
- Total Calls Analyzed: ${teamStats.totalCalls}
- Average Score: ${teamStats.averageScore.toFixed(1)}%
- Grade Distribution: A: ${teamStats.gradeDistribution.A}, B: ${teamStats.gradeDistribution.B}, C: ${teamStats.gradeDistribution.C}, D: ${teamStats.gradeDistribution.D}, F: ${teamStats.gradeDistribution.F}

## Individual Team Member Performance
${Object.entries(byTeamMember).map(([name, memberCalls]) => {
  const avgScore = memberCalls.filter(c => c.score).reduce((sum, c) => sum + (c.score || 0), 0) / 
                   memberCalls.filter(c => c.score).length || 0;
  return `
### ${name}
- Calls: ${memberCalls.length}
- Average Score: ${avgScore.toFixed(1)}%
- Common Strengths: ${Array.from(new Set(memberCalls.map(c => c.strengths).filter(Boolean))).slice(0, 3).join("; ")}
- Common Improvements Needed: ${Array.from(new Set(memberCalls.map(c => c.improvements).filter(Boolean))).slice(0, 3).join("; ")}
- Red Flags: ${Array.from(new Set(memberCalls.map(c => c.redFlags).filter(Boolean))).slice(0, 3).join("; ")}
`;
}).join("\n")}

## Your Task
Generate insights in the following categories:

1. **ISSUES** (2-4 items): Urgent problems that need immediate attention. Look for:
   - Recurring mistakes across multiple calls
   - Red flags that appeared multiple times
   - Low scores in specific areas
   - Bad habits that are costing deals

2. **WINS** (2-3 items): Celebrate successes to boost morale. Look for:
   - High-scoring calls and what made them great
   - Improvement trends from individual team members
   - Excellent handling of difficult situations
   - Perfect execution of techniques

3. **SKILLS** (1-2 items): Long-term skills to develop. Look for:
   - Patterns in improvement areas across the team
   - Skills that would have the biggest impact on results
   - Techniques that top performers use but others don't

4. **AGENDA** (3-5 items): Suggested topics for the weekly team meeting. Include:
   - Review of a specific issue with call examples
   - Celebration of wins
   - Training focus area
   - Role-play scenarios based on common objections

Respond with a JSON object in this exact format:
{
  "issues": [
    {
      "title": "Brief title",
      "description": "Detailed description of the issue",
      "priority": "urgent" | "high" | "medium" | "low",
      "teamMemberName": "Name if specific to one person, or null for team-wide",
      "sourceCallIds": [list of relevant call IDs]
    }
  ],
  "wins": [
    {
      "title": "Brief title",
      "description": "What happened and why it's worth celebrating",
      "priority": "medium",
      "teamMemberName": "Name of person to celebrate"
    }
  ],
  "skills": [
    {
      "title": "Skill name",
      "description": "Why this skill matters",
      "targetBehavior": "What success looks like",
      "priority": "high" | "medium"
    }
  ],
  "agenda": [
    {
      "title": "Agenda item",
      "description": "What to cover and why",
      "priority": "high" | "medium" | "low"
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
                    teamMemberName: { type: ["string", "null"] },
                    sourceCallIds: { type: "array", items: { type: "number" } },
                  },
                  required: ["title", "description", "priority"],
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
                    teamMemberName: { type: ["string", "null"] },
                  },
                  required: ["title", "description", "priority"],
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
                  },
                  required: ["title", "description", "targetBehavior", "priority"],
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
                  },
                  required: ["title", "description", "priority"],
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

    // Transform to GeneratedInsight format
    const result: InsightsResult = {
      issues: insights.issues.map((i: any) => ({
        itemType: "issue" as const,
        title: i.title,
        description: i.description,
        priority: i.priority,
        teamMemberName: i.teamMemberName || undefined,
        sourceCallIds: i.sourceCallIds || [],
      })),
      wins: insights.wins.map((w: any) => ({
        itemType: "win" as const,
        title: w.title,
        description: w.description,
        priority: w.priority || "medium",
        teamMemberName: w.teamMemberName || undefined,
      })),
      skills: insights.skills.map((s: any) => ({
        itemType: "skill" as const,
        title: s.title,
        description: s.description,
        targetBehavior: s.targetBehavior,
        priority: s.priority || "high",
      })),
      agenda: insights.agenda.map((a: any, index: number) => ({
        itemType: "agenda" as const,
        title: a.title,
        description: a.description,
        priority: a.priority || "medium",
      })),
    };

    return result;
  } catch (error) {
    console.error("Error generating team insights:", error);
    return { skills: [], issues: [], wins: [], agenda: [] };
  }
}

/**
 * Save generated insights to database
 */
export async function saveGeneratedInsights(insights: InsightsResult): Promise<void> {
  const db = await getDb();
  if (!db) return;

  // Get team member IDs for matching names
  const members = await db.select().from(teamMembers);
  const memberMap = new Map(members.map(m => [m.name, m.id]));

  const allInsights = [
    ...insights.issues,
    ...insights.wins,
    ...insights.skills,
    ...insights.agenda,
  ];

  for (const insight of allInsights) {
    const teamMemberId = insight.teamMemberName ? memberMap.get(insight.teamMemberName) : null;

    await db.insert(teamTrainingItems).values({
      itemType: insight.itemType,
      title: insight.title,
      description: insight.description,
      targetBehavior: insight.targetBehavior || null,
      priority: insight.priority,
      teamMemberName: insight.teamMemberName || null,
      teamMemberId: teamMemberId || null,
      status: "active",
      isAiGenerated: "true",
      sourceCallIds: insight.sourceCallIds ? JSON.stringify(insight.sourceCallIds) : null,
    });
  }
}

/**
 * Clear old AI-generated insights before regenerating
 */
export async function clearAiGeneratedInsights(): Promise<void> {
  const db = await getDb();
  if (!db) return;

  await db
    .delete(teamTrainingItems)
    .where(eq(teamTrainingItems.isAiGenerated, "true"));
}
