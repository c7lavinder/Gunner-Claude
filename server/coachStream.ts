import { Request, Response, Router } from "express";
import { parse as parseCookieHeader } from "cookie";
import { verifySessionToken, getUserById } from "./selfServeAuth";
import { sdk } from "./_core/sdk";
import { invokeLLMStream } from "./llmStream";
import {
  getTeamMembers,
  getCallsWithGrades,
  getTrainingMaterials,
  getTeamMemberByUserId,
  getTeamAssignments,
  buildCoachMemoryContext,
} from "./db";
import { SECURITY_RULES, PLATFORM_KNOWLEDGE, isSensitiveQuestion } from "./platformKnowledge";
import { detectStatsIntent, computeStats } from "./coachStats";
import type { User } from "../drizzle/schema";

const coachStreamRouter = Router();

// Auth helper — replicates context.ts logic for non-tRPC routes
async function authenticateRequest(req: Request): Promise<User | null> {
  // Try self-serve auth first
  try {
    const cookieHeader = req.headers.cookie;
    if (cookieHeader) {
      const parsed = parseCookieHeader(cookieHeader);
      const authToken = parsed.auth_token;
      if (authToken) {
        const decoded = verifySessionToken(authToken);
        if (decoded && decoded.userId) {
          const user = await getUserById(decoded.userId);
          if (user) return user;
        }
      }
    }
  } catch { /* fall through */ }

  // Try Manus OAuth
  try {
    return await sdk.authenticateRequest(req);
  } catch {
    return null;
  }
}

coachStreamRouter.post("/api/coach/stream", async (req: Request, res: Response) => {
  const user = await authenticateRequest(req);
  if (!user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const { question, history } = req.body as {
    question: string;
    history?: Array<{ role: "user" | "assistant"; content: string }>;
  };

  if (!question) {
    res.status(400).json({ error: "Question is required" });
    return;
  }

  const tenantId = user.tenantId || undefined;

  // Set SSE headers
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  try {
    // Gather all the same context as the tRPC askQuestion endpoint
    const teamMembersList = await getTeamMembers(tenantId);
    const teamMemberNames = teamMembersList.map(m => m.name);

    // Detect mentioned team member
    const questionLower = question.toLowerCase();
    let mentionedMember: typeof teamMembersList[0] | null = null;
    for (const member of teamMembersList) {
      const nameParts = member.name.toLowerCase().split(" ");
      if (nameParts.some(part => part.length > 2 && questionLower.includes(part))) {
        mentionedMember = member;
        break;
      }
    }

    // Check for unknown name
    let unknownNameMentioned = false;
    if (!mentionedMember) {
      const namePatterns = question.match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?\b/g) || [];
      const commonWords = new Set(['What', 'How', 'Why', 'When', 'Where', 'Who', 'Can', 'Could', 'Would', 'Should', 'Tell', 'Show', 'Give', 'Help', 'About', 'Team', 'Call', 'Last', 'Recent', 'Best', 'Worst', 'Good', 'Bad', 'Well', 'Today', 'Yesterday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday', 'This', 'That', 'The', 'His', 'Her', 'Their', 'Score', 'Grade', 'Summary']);
      const potentialNames = namePatterns.filter(n => !commonWords.has(n) && !commonWords.has(n.split(' ')[0]));
      if (potentialNames.length > 0) unknownNameMentioned = true;
    }

    // Role-based visibility
    const currentUserTeamMember = user.id ? await getTeamMemberByUserId(user.id) : null;
    const isAdmin = user.role === 'admin' || user.role === 'super_admin';
    const visibleMemberIds = new Set<number>();
    if (isAdmin) {
      teamMembersList.forEach(m => visibleMemberIds.add(m.id));
    } else if (currentUserTeamMember) {
      visibleMemberIds.add(currentUserTeamMember.id);
      try {
        const assignments = await getTeamAssignments(tenantId);
        for (const a of assignments) {
          if (a.acquisitionManagerId === currentUserTeamMember.id) visibleMemberIds.add(a.leadManagerId);
        }
      } catch { /* best effort */ }
    }

    // Determine data window
    const isPerformanceQuestion = /how.*doing|performance|score|grade|average|stats|improv|progress|trend/i.test(question);
    const callLimit = mentionedMember ? 20 : isPerformanceQuestion ? 50 : 25;

    // Get recent calls
    const recentCalls = await getCallsWithGrades({
      tenantId,
      limit: callLimit,
      teamMembers: mentionedMember ? [String(mentionedMember.id)] : undefined,
    });

    // Build team context
    const teamContext = teamMembersList.map(m =>
      `- ${m.name} (${m.teamRole || 'member'}) | ID: ${m.id}`
    ).join('\n');

    // Build recent calls summary
    const callsToShow = Math.min(recentCalls.items.length, mentionedMember ? 20 : isPerformanceQuestion ? 30 : 15);
    let recentCallsSummary = `\nRECENT CALLS (${callsToShow} most recent):\n`;
    for (const call of recentCalls.items.slice(0, callsToShow)) {
      recentCallsSummary += `- ${call.contactName || 'Unknown'} | ${call.teamMemberName || 'Unassigned'}`;
      if (call.propertyAddress) recentCallsSummary += ` | ${call.propertyAddress}`;
      if (call.callOutcome) recentCallsSummary += ` | Outcome: ${call.callOutcome}`;
      if (call.grade?.overallGrade) recentCallsSummary += ` | Grade: ${call.grade.overallGrade}`;
      if (call.grade?.overallScore) recentCallsSummary += ` (${call.grade.overallScore}/100)`;
      if (call.grade?.strengths) recentCallsSummary += ` | Strengths: ${JSON.stringify(call.grade.strengths).substring(0, 100)}`;
      if (call.grade?.improvements) recentCallsSummary += ` | Improve: ${JSON.stringify(call.grade.improvements).substring(0, 100)}`;
      recentCallsSummary += '\n';
    }

    // Member-specific context with visibility check
    let memberCallContext = "";
    if (mentionedMember) {
      if (!visibleMemberIds.has(mentionedMember.id)) {
        memberCallContext = `\n\nACCESS RESTRICTED: The user asked about ${mentionedMember.name}, but they don't have permission to view this person's individual performance data.`;
      } else {
        const memberCalls = recentCalls.items.filter(c => c.teamMemberName === mentionedMember!.name);
        if (memberCalls.length > 0) {
          const avgScore = memberCalls.reduce((sum, c) => sum + parseFloat(c.grade?.overallScore || "0"), 0) / memberCalls.length;
          const outcomes: Record<string, number> = {};
          memberCalls.forEach(c => { if (c.callOutcome) outcomes[c.callOutcome] = (outcomes[c.callOutcome] || 0) + 1; });
          memberCallContext = `\n\nDETAILED DATA FOR ${mentionedMember.name.toUpperCase()}:\n`;
          memberCallContext += `Calls analyzed: ${memberCalls.length} | Avg Score: ${avgScore.toFixed(1)}/100\n`;
          memberCallContext += `Outcomes: ${Object.entries(outcomes).map(([o, c]) => `${o}: ${c}`).join(', ')}\n`;
          for (const call of memberCalls.slice(0, 5)) {
            memberCallContext += `  Call: ${call.contactName || 'Unknown'}`;
            if (call.grade?.overallGrade) memberCallContext += ` | ${call.grade.overallGrade} (${call.grade.overallScore}/100)`;
            if (call.grade?.coachingTips) memberCallContext += ` | Tips: ${String(call.grade.coachingTips).substring(0, 150)}`;
            memberCallContext += '\n';
          }
        }
      }
    }

    // Training materials
    const trainingMaterials = await getTrainingMaterials({ tenantId });

    // Semantic topic matching
    const topicMap: Record<string, string[]> = {
      'walkthrough': ['walkthrough', 'property', 'inspection', 'visit', 'tour', 'checklist'],
      'offer': ['offer', 'closing', 'price', 'arv', 'contract', 'deal', 'negotiate', 'counter'],
      'objection': ['objection', 'pushback', 'concern', 'hesitat', 'think about', 'spouse', 'not sure', 'too low', 'no thanks', 'brush'],
      'script': ['script', 'talk track', 'pitch', 'opening', 'intro', 'dialogue'],
      'appointment': ['appointment', 'schedule', 'set', 'booking', 'meeting', 'calendar'],
      'follow': ['follow', 'callback', 'call back', 'reach out', 'touch base', 'sms', 'text', 'message'],
      'cold call': ['cold call', 'outbound', 'prospect', 'dial', 'first call', 'initial'],
      'rapport': ['rapport', 'relationship', 'trust', 'connect', 'small talk', 'conversation'],
      'lead': ['lead', 'qualify', 'qualification', 'screening', 'criteria', 'hot lead', 'warm lead'],
      'backing_out': ['back out', 'backing out', 'cancel', 'changed mind', 'cold feet', 'back away', 'pull out', 'withdraw', 'renege', 'second thoughts', 'not sure anymore', 'family says', 'spouse says', 'another offer', 'list with agent', 'want more money', 'price too low', 'seller backing', 'seller cancel', 'under contract'],
    };
    const q = question.toLowerCase();
    const scored = trainingMaterials.map(m => {
      const title = (m.title || '').toLowerCase();
      const content = (m.content || '').toLowerCase().substring(0, 500);
      const text = title + ' ' + content;
      let score = 0;
      const keywords = q.split(/\s+/).filter(w => w.length > 3);
      for (const kw of keywords) {
        if (title.includes(kw)) score += 3;
        if (content.includes(kw)) score += 1;
      }
      for (const [, synonyms] of Object.entries(topicMap)) {
        const questionHasTopic = synonyms.some(s => q.includes(s));
        const materialHasTopic = synonyms.some(s => text.includes(s));
        if (questionHasTopic && materialHasTopic) score += 2;
      }
      return { material: m, score };
    });
    const relevantMaterials = scored.filter(s => s.score > 0).sort((a, b) => b.score - a.score);
    const trainingContext = relevantMaterials.length > 0
      ? `RELEVANT TRAINING MATERIAL (use the talk tracks and key moves below when coaching):\n${relevantMaterials.slice(0, 3).map(s => `### ${s.material.title}\n${(s.material.content || '').substring(0, 4000)}`).join('\n\n')}`
      : '';

    // Coaching preferences
    let coachingPrefs = "";
    try {
      const { buildPreferenceContext } = await import("./coachPreferences");
      coachingPrefs = await buildPreferenceContext(user.tenantId || 0, user.id);
    } catch { /* optional */ }

    // Conversation memory from past sessions
    let conversationMemory = "";
    try {
      if (user.tenantId && user.id) {
        conversationMemory = await buildCoachMemoryContext(user.tenantId, user.id, 8);
      }
    } catch { /* memory is best-effort */ }

    // Platform knowledge & security
    const questionIsPlatform = /how (do|does|to)|what (is|are)|where (do|can|is)|explain|help me|badge|xp|level|streak|gamif|leaderboard|opportunity|signal|dashboard|analytics|kpi|training/i.test(question);
    const questionIsSensitive = isSensitiveQuestion(question);

    // Computed stats
    let computedStatsContext = "";
    try {
      const statsIntent = detectStatsIntent(
        question,
        teamMembersList.map(m => ({ id: m.id, name: m.name })),
        currentUserTeamMember?.id
      );
      if (statsIntent && user.tenantId) {
        computedStatsContext = await computeStats(
          statsIntent,
          user.tenantId || 0,
          visibleMemberIds,
          isAdmin,
          currentUserTeamMember?.id
        );
      }
    } catch { /* stats are optional */ }

    const systemPrompt = `You are a data-driven sales coach for a real estate wholesaling team. You have access to REAL call data and team performance metrics below. Your job is to give answers grounded in this actual data.

${SECURITY_RULES}
${questionIsPlatform ? PLATFORM_KNOWLEDGE : ''}
${questionIsSensitive ? '\nSENSITIVE QUESTION DETECTED: The user is asking about restricted information. Follow the SECURITY RULES above strictly. Do NOT reveal any technical, infrastructure, cross-tenant, or implementation details.\n' : ''}
${computedStatsContext ? `\n${computedStatsContext}\n` : ''}
${conversationMemory ? `\n${conversationMemory}\n` : ''}
TEAM MEMBERS (this is the COMPLETE list — no one else is on the team):
${teamContext}
${recentCallsSummary}
${memberCallContext}

${unknownNameMentioned ? `IMPORTANT: The user mentioned a name that does NOT match any team member above. You MUST tell them that person is not on the team and list the actual team members they can ask about.\n` : ''}

Training materials available: ${trainingMaterials.length > 0 ? trainingMaterials.map(m => m.title).join(', ') : 'None'}

${trainingContext}
${coachingPrefs ? `\n${coachingPrefs}` : ""}

CRM ACTION CAPABILITIES:
You have FULL access to the team's GoHighLevel CRM. You CAN directly perform these actions:
- Add notes to contacts
- Change pipeline stages (move deals)
- Send SMS messages to contacts
- Create follow-up tasks
- Add or remove tags on contacts
- Update custom fields on contacts
IMPORTANT: If the user asks you to perform ANY of these CRM actions (add a note, send a text, move a stage, create a task, tag someone, update a field), you MUST start your response with the EXACT text "[ACTION_REDIRECT]" on its own line, followed by a brief acknowledgment like "On it — creating that for you now." This special tag tells the system to automatically route the request to the action handler. Do NOT tell the user to retype their request. Do NOT say "type your request as a command". Just use [ACTION_REDIRECT] and the system handles the rest.

CRITICAL RULES:
1. ALWAYS ground your answers in the REAL DATA above. Reference specific calls, scores, outcomes, contacts, and property addresses when relevant.
2. If the user asks a question that requires data you don't have, say "Based on the data I can see..." and be honest about what's missing.
3. If asked about a person NOT in the team members list, say "I don't see [name] on your team. Your current team members are: ${teamMemberNames.join(', ')}." Then ask if they meant one of those people.
4. NEVER make up or hallucinate information. No fake names, scores, or details.
5. When asked strategic questions, look at the actual call outcomes and pipeline data to give a data-backed recommendation.
6. Keep responses to 3-5 sentences. Be specific and actionable.
7. Reference training materials by name when they're relevant to the question.
8. Do NOT give generic advice that could apply to any team. Make it specific to THIS team's actual data.
9. ACCESS CONTROL: If you see "ACCESS RESTRICTED" for a team member, politely tell the user they don't have permission to view that person's individual performance.
10. When answering general coaching questions, freely reference examples from ALL team calls.
11. When COMPUTED STATS are provided above, use those EXACT numbers. Do NOT estimate or calculate differently.
12. When the user references something from CONVERSATION MEMORY, acknowledge the continuity naturally.
13. NEVER say "I can't directly add notes", "I don't have access to your CRM", "I can't interact with your CRM controls", or anything similar. You DO have full CRM access.
14. If the user's message looks like a CRM action request, start your response with [ACTION_REDIRECT] on its own line. NEVER tell the user to retype or rephrase their request as a command.`;

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

    // Stream the response
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
        res.write(`data: ${JSON.stringify({ type: "error", message: error.message })}\n\n`);
        res.end();
      }
    );
  } catch (error) {
    res.write(`data: ${JSON.stringify({ type: "error", message: "Failed to process request" })}\n\n`);
    res.end();
  }
});

export { coachStreamRouter };
