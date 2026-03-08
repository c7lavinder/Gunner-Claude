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
import { buildCoachIndustryContext } from "./playbooks";
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
    const isLeadGenerator = currentUserTeamMember?.teamRole === 'lead_generator' || (user as any).teamRole === 'lead_generator';
    const isDispoManager = currentUserTeamMember?.teamRole === 'dispo_manager' || (user as any).teamRole === 'dispo_manager';
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

    // Load tenant playbook context for dynamic prompts
    const industryCtx = tenantId ? await buildCoachIndustryContext(tenantId) : null;

    // Determine data window
    const isPerformanceQuestion = /how.*doing|performance|score|grade|average|stats|improv|progress|trend/i.test(question);
    const callLimit = mentionedMember ? 20 : isPerformanceQuestion ? 50 : 25;

    // Get recent calls
    const recentCalls = await getCallsWithGrades({
      tenantId,
      limit: callLimit,
      teamMembers: mentionedMember ? [String(mentionedMember.id)] : undefined,
    });

    // Build team context with dynamic role labels
    const teamContext = teamMembersList.map(m => {
      const roleLabel = industryCtx?.roleDescriptions?.[m.teamRole || ''] 
        ? `${m.teamRole}` 
        : (m.teamRole || 'member');
      return `- ${m.name} (${roleLabel}) | ID: ${m.id}`;
    }).join('\n');

    // Format call outcomes using tenant terminology (dynamic labels)
    const formatOutcome = (outcome: string): string => {
      // Use tenant-specific outcome labels if available, fall back to defaults
      const dynamicLabels = industryCtx?.outcomeLabels || {};
      const defaultLabels: Record<string, string> = {
        appointment_set: 'Appointment Set',
        offer_made: 'Offer Made',
        offer_rejected: 'Offer Rejected',
        callback_scheduled: 'Callback Scheduled',
        callback_requested: 'Callback Requested',
        interested: 'Interested',
        left_vm: 'Left Voicemail',
        no_answer: 'No Answer',
        not_interested: 'Not Interested',
        dead: 'Dead Lead',
        none: 'No Outcome',
        follow_up: 'Follow Up',
      };
      return dynamicLabels[outcome] || defaultLabels[outcome] || outcome.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    };

    // Build recent calls summary
    const callsToShow = Math.min(recentCalls.items.length, mentionedMember ? 20 : isPerformanceQuestion ? 30 : 15);
    let recentCallsSummary = `\nRECENT CALLS (${callsToShow} most recent):\n`;
    for (const call of recentCalls.items.slice(0, callsToShow)) {
      recentCallsSummary += `- ${call.contactName || 'Unknown'} | ${call.teamMemberName || 'Unassigned'}`;
      if (call.propertyAddress) recentCallsSummary += ` | ${call.propertyAddress}`;
      if (call.callOutcome) recentCallsSummary += ` | Outcome: ${formatOutcome(call.callOutcome)}`;
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
          memberCallContext += `Outcomes: ${Object.entries(outcomes).map(([o, c]) => `${formatOutcome(o)}: ${c}`).join(', ')}\n`;
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

    // User's explicit persistent instructions
    let userInstructionContext = "";
    try {
      const { buildInstructionContext } = await import("./userInstructions");
      userInstructionContext = await buildInstructionContext(user.id);
    } catch { /* instructions are optional */ }

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

    // Load dispo inventory context if user is dispo manager
    let dispoInventoryContext = "";
    if (isDispoManager && tenantId) {
      try {
        const { getDb } = await import("./db");
        const { dispoProperties, dispoPropertyOffers, dispoPropertyShowings, dispoPropertySends } = await import("../drizzle/schema");
        const { eq, and, desc, sql } = await import("drizzle-orm");
        const db = await getDb();
        if (db) {
          const properties = await db.select().from(dispoProperties).where(and(eq(dispoProperties.tenantId, tenantId), sql`${dispoProperties.status} != 'sold'`)).orderBy(desc(dispoProperties.createdAt)).limit(20);
          if (properties.length > 0) {
            dispoInventoryContext = `\nACTIVE DISPO INVENTORY (${properties.length} properties):\n`;
            for (const p of properties) {
              dispoInventoryContext += `- ${p.address}, ${p.city} ${p.state} ${p.zip || ''} | Status: ${p.status} | Ask: $${p.askingPrice ? (p.askingPrice / 100).toLocaleString() : 'TBD'} | Type: ${p.propertyType || 'N/A'}`;
              // Get send count
              const [sendData] = await db.select({ count: sql<number>`count(*)`, totalRecipients: sql<number>`COALESCE(SUM(recipientCount), 0)` }).from(dispoPropertySends).where(eq(dispoPropertySends.propertyId, p.id));
              if (sendData) dispoInventoryContext += ` | Blasts: ${sendData.count}, Reached: ${sendData.totalRecipients}`;
              // Get offer count
              const [offerData] = await db.select({ count: sql<number>`count(*)` }).from(dispoPropertyOffers).where(eq(dispoPropertyOffers.propertyId, p.id));
              if (offerData) dispoInventoryContext += ` | Offers: ${offerData.count}`;
              // Get showing count
              const [showingData] = await db.select({ count: sql<number>`count(*)` }).from(dispoPropertyShowings).where(eq(dispoPropertyShowings.propertyId, p.id));
              if (showingData) dispoInventoryContext += ` | Showings: ${showingData.count}`;
              dispoInventoryContext += '\n';
            }
          }
        }
      } catch { /* best effort */ }
    }

    const systemPrompt = `${isDispoManager ? `You are a data-driven disposition coach for a real estate wholesaling team. Your focus is on DISPOSITION — helping the Dispo Manager market properties to buyers, manage showings, negotiate offers, and close assignments.

Your coaching should focus on:
- Property marketing strategy (which buyer groups to target, pricing strategy, channels)
- Buyer relationship management and follow-up cadence
- Showing scheduling and preparation tips
- Offer negotiation tactics and counter-offer strategy
- Assignment fee optimization and deal structuring
- Managing multiple properties and prioritizing based on aging and interest level
- Facebook marketplace posting best practices for wholesale deals
- Investor base outreach and networking strategies
- Tracking buyer feedback and interest levels after showings
- Closing deals efficiently and coordinating with title companies

The Dispo Manager's workflow: receive properties under contract from AM, market to buyer lists via SMS/email/Facebook, schedule showings, collect offers, negotiate best price, assign contract, coordinate closing. They are the revenue engine — every property they move generates the assignment fee.
${dispoInventoryContext}` : isLeadGenerator ? (industryCtx?.leadGenFocus || `You are a data-driven cold calling coach for a lead generator on a real estate wholesaling team. Your focus is on LEAD GENERATION — helping this caller gauge seller interest, gather key details, and let interested sellers know their manager will follow up.

Your coaching should focus on:
- Opening lines and hooks for cold calls
- Quickly identifying seller motivation (distress, life events, timeline)
- Handling initial objections ("not interested", "how did you get my number", "stop calling")
- Recognizing when a seller is interested and wrapping up the call professionally ("I'll pass your info along to my manager and they'll reach out")
- Adding notes about seller interest level and key details for the manager
- Efficient call pacing and volume strategies
- NOT on full qualification, offers, walkthroughs, or closing — that's the Lead Manager and Acquisition Manager's job

The Lead Generator's workflow is simple: call, gauge interest, tell the seller their manager will follow up, then add notes so the manager has context. They do NOT do formal handoffs or transfers — they just let the seller know someone will be in touch.`) : (industryCtx?.coachIntro || 'You are a data-driven sales coach for a real estate wholesaling team.')} You have access to REAL call data and team performance metrics below. Your job is to give answers grounded in this actual data.

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
${userInstructionContext}
CRM ACTION CAPABILITIES:
You have FULL access to ${industryCtx?.crmContext || "the team's GoHighLevel CRM"}. You CAN directly perform these actions:
- Add notes to contacts
- Change pipeline stages (move deals)
- Send SMS messages to contacts
- Create follow-up tasks
- Update existing tasks (change due dates, mark complete)
- Add or remove tags on contacts
- Update custom fields on contacts
- Add or remove contacts from workflows/automations
- Create, reschedule, or cancel calendar appointments

You can also execute PROPERTY/DISPO actions:
- Update property pricing (asking price, dispo asking price, assignment fee, contract price)
- Change property pipeline status
- Record offers from buyers
- Schedule property showings
- Record outreach sends (SMS blasts, email blasts, etc.)
- Add activity notes to properties

IMPORTANT: If the user asks you to perform ANY of these actions (CRM or property), you MUST start your response with the EXACT text "[ACTION_REDIRECT]" on its own line, followed by a brief acknowledgment like "On it — creating that for you now." This special tag tells the system to automatically route the request to the action handler. Do NOT tell the user to retype their request. Do NOT say "type your request as a command". Just use [ACTION_REDIRECT] and the system handles the rest.

CONVERSATIONAL FEEDBACK vs CRM ACTIONS:
Do NOT use [ACTION_REDIRECT] for these types of messages — they are CONVERSATIONS, not CRM actions:
- Complaints or feedback about a previous action (e.g., "That was not sent from my number", "That note was wrong", "That went to the wrong person")
- Questions about how something worked (e.g., "Why did it send from Chris's number?", "Which number did that go from?")
- Confirmations or acknowledgments (e.g., "Thanks", "Got it", "OK")
- General conversation or follow-up about a previous interaction
- COACHING/ADVICE QUESTIONS — when the user is asking for HELP on what to say, how to respond, or what to do. These are NOT action requests:
  - "What do I say to this text?" → COACHING (asking for advice, NOT requesting to send a text)
  - "How should I respond to this?" → COACHING
  - "What should I text back?" → COACHING (asking what to write, NOT asking you to send it)
  - "How do I handle this objection?" → COACHING
  - "What's the best way to follow up?" → COACHING
  - "What would you say to a seller who says..." → COACHING
  - "How do I negotiate this?" → COACHING
  - "What's a good response to..." → COACHING
  - "Help me with what to say" → COACHING
  - "What should I tell them?" → COACHING
  - "How do I close this deal?" → COACHING
  - "What's the play here?" → COACHING
  KEY DISTINCTION: "What do I say to this text" = asking for ADVICE (coaching). "Send a text to John saying..." = requesting an ACTION. "Text John and ask if..." = requesting an ACTION. The difference is whether the user is asking YOU to draft/advise vs asking YOU to execute/send. If the user is asking WHAT to say, HOW to respond, or for HELP with a message — that is coaching. If the user is telling you TO send, TO text, TO add, TO create — that is an action.
For these, respond conversationally. Acknowledge the issue, explain what you know, and offer to help fix it.

CRITICAL RULES:
1. ALWAYS ground your answers in the REAL DATA above. Reference specific calls, scores, outcomes, contacts, and property addresses when relevant.
2. If the user asks a question that requires data you don't have, say "Based on the data I can see..." and be honest about what's missing.
3. If asked about a person NOT in the team members list, say "I don't see [name] on your team. Your current team members are: ${teamMemberNames.join(', ')}." Then ask if they meant one of those people.
4. NEVER make up or hallucinate information. No fake names, scores, or details.
5. When asked strategic questions, look at the actual call outcomes and pipeline data to give a data-backed recommendation.
6. Keep responses to 2-4 sentences. Be direct and specific. Do NOT pad responses with generic coaching advice or motivational filler.
7. Only mention training materials if the user SPECIFICALLY asks about training, scripts, or talk tracks. Do NOT volunteer training material references just to fill space.
8. Do NOT give generic advice that could apply to any team. Make it specific to THIS team's actual data.
9. ACCESS CONTROL: If you see "ACCESS RESTRICTED" for a team member, politely tell the user they don't have permission to view that person's individual performance.
10. When answering general coaching questions, freely reference examples from ALL team calls.
11. When COMPUTED STATS are provided above, use those EXACT numbers. Do NOT estimate or calculate differently.
12. When the user references something from CONVERSATION MEMORY, acknowledge the continuity naturally.
13. NEVER say "I can't directly add notes", "I don't have access to your CRM", "I can't interact with your CRM controls", "I can't update property prices", or anything similar. You DO have full CRM access AND property management access.
14. If the user's message looks like a CRM action request, start your response with [ACTION_REDIRECT] on its own line. NEVER tell the user to retype or rephrase their request as a command.
15. If the user is giving feedback about a PREVIOUS action (like "that was wrong" or "not from my number"), respond conversationally — do NOT use [ACTION_REDIRECT]. Acknowledge the issue and offer to help.
16. Use clean English for all data values. Never output raw snake_case identifiers like "callback_scheduled" — always say "Callback Scheduled" etc.
17. Do NOT end responses with generic paragraphs about persistence, strategy alignment, or training philosophy. If you've answered the question, stop.`;

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
