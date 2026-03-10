/**
 * AI Dispo Assistant — Streaming SSE endpoint + Parse Intent for actions
 * Property-aware AI chat for disposition strategy, buyer management, and deal advice
 * With ACTION_REDIRECT support for executing property AND CRM actions
 * Enhanced with conversation memory, coaching preferences, and user instructions
 */
import { Router, type Request, type Response } from "express";
import { parse as parseCookieHeader } from "cookie";
import { verifySessionToken, getUserById } from "./selfServeAuth";
import { invokeLLMStream } from "./llmStream";
import { invokeLLM } from "./_core/llm";
import { getPropertyDetail } from "./inventory";
import { saveCoachExchange, buildCoachMemoryContext } from "./db";
import type { User } from "../drizzle/schema";

const dispoAssistantRouter = Router();

async function authenticateRequest(req: Request): Promise<User | null> {
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
  return null;
}

export function buildPropertyContext(detail: any): string {
  if (!detail) return "No property selected.";

  const lines: string[] = [];
  lines.push(`PROPERTY ID: ${detail.id}`);
  lines.push(`PROPERTY: ${detail.address}, ${detail.city} ${detail.state} ${detail.zip || ""}`);
  lines.push(`Status: ${detail.status} | Type: ${detail.propertyType || "N/A"}`);
  if (detail.askingPrice) lines.push(`Asking Price: $${(detail.askingPrice / 100).toLocaleString()}`);
  if (detail.dispoAskingPrice) lines.push(`Dispo Asking: $${(detail.dispoAskingPrice / 100).toLocaleString()}`);
  if (detail.contractPrice) lines.push(`Contract Price: $${(detail.contractPrice / 100).toLocaleString()}`);
  if (detail.assignmentFee) lines.push(`Assignment Fee: $${(detail.assignmentFee / 100).toLocaleString()}`);
  if (detail.arv) lines.push(`ARV: $${(detail.arv / 100).toLocaleString()}`);
  if (detail.estRepairs) lines.push(`Est. Repairs: $${(detail.estRepairs / 100).toLocaleString()}`);
  if (detail.beds || detail.baths || detail.sqft) {
    lines.push(`Specs: ${detail.beds || "?"}bd / ${detail.baths || "?"}ba / ${detail.sqft || "?"}sqft`);
  }
  if (detail.yearBuilt) lines.push(`Year Built: ${detail.yearBuilt}`);
  if (detail.lotSize) lines.push(`Lot Size: ${detail.lotSize}`);
  if (detail.market) lines.push(`Market: ${detail.market}`);
  if (detail.sellerName) lines.push(`Seller: ${detail.sellerName}${detail.sellerPhone ? ` (${detail.sellerPhone})` : ""}`);
  lines.push(`Days on Market: ${detail.daysOnMarket || 0}`);

  // Sends summary
  if (detail.sends?.length > 0) {
    const totalRecipients = detail.sends.reduce((s: number, r: any) => s + (r.recipientCount || 0), 0);
    const channels = Array.from(new Set(detail.sends.map((s: any) => s.channel))).join(", ");
    lines.push(`\nOUTREACH: ${detail.sends.length} blasts, ${totalRecipients} total recipients`);
    lines.push(`Channels used: ${channels}`);
    for (const s of detail.sends.slice(0, 5)) {
      lines.push(`  - ${s.channel}: ${s.buyerGroup || "N/A"} → ${s.recipientCount} recipients (${new Date(s.sentAt).toLocaleDateString()})`);
    }
  } else {
    lines.push(`\nOUTREACH: No sends yet`);
  }

  // Offers summary
  if (detail.offers?.length > 0) {
    lines.push(`\nOFFERS: ${detail.offers.length} total`);
    for (const o of detail.offers) {
      lines.push(`  - ${o.buyerName}: $${o.offerAmount ? (o.offerAmount / 100).toLocaleString() : "TBD"} (${o.status})${o.notes ? ` — ${o.notes}` : ""}`);
    }
  } else {
    lines.push(`\nOFFERS: None yet`);
  }

  // Showings summary
  if (detail.showings?.length > 0) {
    lines.push(`\nSHOWINGS: ${detail.showings.length} total`);
    for (const sh of detail.showings) {
      lines.push(`  - ${sh.buyerName}: ${sh.showingDate} ${sh.showingTime || ""} (${sh.status})${sh.interestLevel ? ` [${sh.interestLevel}]` : ""}${sh.feedback ? ` — ${sh.feedback}` : ""}`);
    }
  } else {
    lines.push(`\nSHOWINGS: None scheduled`);
  }

  // Buyers summary with response tracking
  if (detail.buyers?.length > 0) {
    lines.push(`\nBUYERS MATCHED: ${detail.buyers.length} total`);
    const vipBuyers = detail.buyers.filter((b: any) => b.isVip);
    if (vipBuyers.length > 0) lines.push(`VIP Buyers: ${vipBuyers.map((b: any) => b.buyerName).join(", ")}`);
    const statusCounts: Record<string, number> = {};
    for (const b of detail.buyers) {
      statusCounts[b.status] = (statusCounts[b.status] || 0) + 1;
    }
    lines.push(`Status breakdown: ${Object.entries(statusCounts).map(([k, v]) => `${k}: ${v}`).join(", ")}`);

    // Response tracking stats
    const totalSent = detail.buyers.filter((b: any) => b.sendCount > 0).length;
    const totalResponded = detail.buyers.filter((b: any) => b.responseCount > 0).length;
    const responseRate = totalSent > 0 ? Math.round((totalResponded / totalSent) * 100) : 0;
    if (totalSent > 0) {
      lines.push(`\nRESPONSE TRACKING: ${totalResponded}/${totalSent} buyers responded (${responseRate}% response rate)`);
      const noResponse = detail.buyers.filter((b: any) => b.sendCount > 0 && b.responseCount === 0);
      if (noResponse.length > 0) {
        lines.push(`No response yet from: ${noResponse.slice(0, 10).map((b: any) => b.buyerName).join(", ")}${noResponse.length > 10 ? ` (+${noResponse.length - 10} more)` : ""}`);
      }
      const recentResponders = detail.buyers
        .filter((b: any) => b.lastResponseAt)
        .sort((a: any, b: any) => new Date(b.lastResponseAt).getTime() - new Date(a.lastResponseAt).getTime())
        .slice(0, 5);
      if (recentResponders.length > 0) {
        lines.push(`Recent responses:`);
        for (const b of recentResponders) {
          lines.push(`  - ${b.buyerName}: "${(b.lastResponseNote || 'No note').substring(0, 80)}" (${new Date(b.lastResponseAt).toLocaleDateString()})`);
        }
      }
    }

    // List buyers with contact info for CRM actions
    lines.push(`\nBUYER DETAILS (for CRM actions):`);
    for (const b of detail.buyers.slice(0, 20)) {
      const responseInfo = b.responseCount > 0 ? ` | Responses: ${b.responseCount}` : "";
      lines.push(`  - ${b.buyerName}${b.buyerPhone ? ` | Phone: ${b.buyerPhone}` : ""}${b.buyerEmail ? ` | Email: ${b.buyerEmail}` : ""}${b.buyerCompany ? ` | Company: ${b.buyerCompany}` : ""} | Status: ${b.status}${b.isVip === "true" ? " [VIP]" : ""}${responseInfo}${b.ghlContactId ? ` | GHL ID: ${b.ghlContactId}` : ""}`);
    }
  } else {
    lines.push(`\nBUYERS: None matched yet`);
  }

  // Property Research Data (from AI auto-research)
  if (detail.propertyResearch) {
    const r = detail.propertyResearch as any;
    lines.push(`\nPROPERTY RESEARCH (auto-gathered from public sources):`);
    if (r.zestimate) lines.push(`Zestimate: $${r.zestimate.toLocaleString()}`);
    if (r.taxAssessment) lines.push(`Tax Assessment: $${r.taxAssessment.toLocaleString()}`);
    if (r.taxAmount) lines.push(`Annual Tax: $${r.taxAmount.toLocaleString()}`);
    if (r.ownerName) lines.push(`Owner (public records): ${r.ownerName}`);
    if (r.deedDate) lines.push(`Last Deed Date: ${r.deedDate}`);
    if (r.legalDescription) lines.push(`Legal Description: ${r.legalDescription}`);
    if (r.neighborhoodInfo) lines.push(`Neighborhood: ${r.neighborhoodInfo}`);
    if (r.recentComps?.length > 0) {
      lines.push(`\nCOMPS (${r.recentComps.length} recent sales):`);
      for (const c of r.recentComps) {
        lines.push(`  - ${c.address}: $${c.soldPrice?.toLocaleString()} (${c.soldDate}) ${c.sqft ? c.sqft + 'sqft' : ''} ${c.beds || '?'}bd/${c.baths || '?'}ba`);
      }
    }
    if (r.priceHistory?.length > 0) {
      lines.push(`\nPRICE HISTORY:`);
      for (const h of r.priceHistory.slice(0, 5)) {
        lines.push(`  - ${h.date}: $${h.price?.toLocaleString()} (${h.event})`);
      }
    }
    if (r.zillowUrl) lines.push(`Zillow: ${r.zillowUrl}`);
    if (r.streetViewUrl) lines.push(`Street View: ${r.streetViewUrl}`);
    if (r.additionalNotes) lines.push(`Notes: ${r.additionalNotes}`);
  }

  // Activity stats
  if (detail.activityStats) {
    const stats = detail.activityStats;
    lines.push(`\nACTIVITY STATS: ${stats.totalEvents || 0} events`);
  }

  // Recent activity
  if (detail.activityLog?.length > 0) {
    lines.push(`\nRECENT ACTIVITY (last ${Math.min(detail.activityLog.length, 10)}):`);
    for (const a of detail.activityLog.slice(0, 10)) {
      lines.push(`  - [${a.eventType}] ${a.title}${a.description ? `: ${a.description}` : ""} (${new Date(a.createdAt).toLocaleDateString()})`);
    }
  }

  return lines.join("\n");
}

const VALID_PROPERTY_STATUSES = ["lead", "new", "apt_set", "offer_made", "under_contract", "marketing", "negotiating", "buyer_negotiating", "closing", "closed", "follow_up", "dead"];

const DISPO_ASSISTANT_SYSTEM = `You are an elite Disposition Strategist for a high-volume real estate wholesaling operation. You think like a dispo manager who has moved 500+ properties and generated $5M+ in assignment fees. You have FULL context on the selected property — every number, every buyer, every outreach, every offer.

Your job: help move this property FAST at the MAXIMUM assignment fee. Every day a property sits is money lost.

## DEAL INTELLIGENCE

When analyzing any property, automatically assess:
1. **Deal Health Score**: Based on days on market, response rate, offer count, and showing activity
2. **Pricing Position**: Is the asking price aligned with ARV, comps, and buyer response? If response rate is <10% after 50+ sends, price is likely too high.
3. **Velocity Risk**: Properties aging >14 days with no offers need intervention. >30 days is a crisis.
4. **Buyer Temperature**: Who's hot (responded, showed, offered)? Who's cold (sent, no response)? Who needs follow-up?
5. **Revenue at Risk**: Calculate the assignment fee at stake and what happens if this deal falls through.

## DISPO VELOCITY FRAMEWORK

Coach urgency based on timeline:
- **Day 0-2**: Blast A-list buyers (proven closers who buy your property type in this market). If no interest in 48hrs, diagnose why.
- **Day 3-7**: Expand to B-list, adjust messaging angle (flip vs rental vs owner-occupant), consider slight price adjustment
- **Day 7-14**: Price reduction 5-10%, new channels, direct outreach to buyers who initially passed, Facebook Marketplace push
- **Day 14-21**: Aggressive repricing, consider double-close if assignment fee is too visible, reach out to other wholesalers
- **Day 21-30**: Emergency mode — renegotiate with seller, wholesale to another wholesaler at reduced fee, or prepare to cancel
- **Day 30+**: Every day costs money. Recommend immediate decisive action.

## PRICING INTELLIGENCE

- **Assignment Fee Sweet Spot**: 8-15% of ARV for flips, 5-10% for rentals. Higher for unique properties.
- **Price Reduction Triggers**: <10% response rate after 50+ sends, zero showings after 7 days, all offers >20% below ask
- **Competitive Pricing**: If comps show ARV of $200K and rehab is $40K, max buyer price is ~$120-130K (70% rule). Your ask must leave room for buyer profit.
- **Double Close Threshold**: If assignment fee >$20K or >15% of purchase price, recommend double close to avoid buyer pushback.

## NEGOTIATION PLAYBOOK

- **Lowball Offers (<80% of ask)**: Counter at 95% of ask. Say: "We have other interested buyers. I can hold this for 24 hours at [counter price]."
- **Reasonable Offers (80-95% of ask)**: Counter at 90-95%. Create urgency: "I have a showing scheduled this week. If you can close by [date], I can work with you."
- **Multiple Offers**: Use competition. "We received multiple offers. Best and final by [date/time]." Never reveal other offer amounts.
- **Buyer Wants Inspection**: Standard 7-day inspection period. Push for 3-5 days on wholesale deals. "This is an as-is sale, but we'll give you 5 days to verify condition."
- **Buyer Wants Financing**: Cash or hard money only for wholesale. "We need proof of funds within 48 hours to hold this property."
- **Buyer Backing Out**: "I understand. Your EMD is non-refundable per our agreement. Let's discuss what changed — maybe we can adjust terms."

## OUTREACH STRATEGY

- **SMS Blasts**: Best for speed. Keep under 160 chars. Lead with address + price + property type. "3/2 in [area] — $85K assignment. Cash buyers only. Reply YES for details."
- **Email**: For detailed packages. Include photos, comps, rehab estimate, ARV, and assignment fee breakdown.
- **Facebook Marketplace**: Post as "Investment Property" with photos. Great for reaching retail investors and owner-occupants.
- **Investor Meetups/Groups**: For relationship-based buyers. Personal outreach to your top 10 buyers who buy this property type.
- **Follow-up Cadence**: Day 1 blast → Day 3 follow-up to openers → Day 7 price update → Day 14 "last chance" messaging

## BUYER MANAGEMENT

- **VIP Buyers**: Your top 10-20 buyers who close consistently. They get first look, personal calls, and priority.
- **Response Rate Benchmarks**: 15-25% response rate is good. <10% means wrong buyers or wrong price. >30% means you might be priced too low.
- **Hot Buyer Signals**: Responded within 1 hour, asked for address/photos, requested showing, mentioned proof of funds
- **Cold Buyer Signals**: No response after 2 sends, asked to be removed, said "too expensive" without countering
- **Re-engagement**: Buyers who passed can be re-engaged with price drops. "Hey [name], we dropped [property] to $X. Still looking in [area]?"

Always ground your advice in the ACTUAL property data provided. Reference specific numbers, buyer names, and dates. Be direct, actionable, and specific — not generic. Every sentence should either diagnose a problem or prescribe a specific action.

When the property has been on market too long, proactively flag it as urgent and recommend specific next steps. When there are active offers, drive toward closing. When there are no buyers yet, build an outreach battle plan.

## ACTION CAPABILITIES

You can EXECUTE actions on this property AND on buyer contacts in the CRM. When the user asks you to DO something (not just advise), output the tag [ACTION_REDIRECT] on its own line and STOP generating. The frontend will then parse the user's intent into a confirmable action.

**Property actions you can execute:**
- **update_property_price** — Change asking price, dispo asking price, assignment fee, or contract price
- **update_property_status** — Change the property's pipeline status (valid: ${VALID_PROPERTY_STATUSES.join(", ")})
- **add_property_offer** — Record a new offer from a buyer (name, amount, phone, email, notes)
- **schedule_property_showing** — Schedule a showing for a buyer (name, date, time, notes)
- **record_property_send** — Record an outreach send (channel: sms/email/facebook/investor_base/other, group, count)
- **add_property_note** — Add an activity note to the property log
- **bulk_send_buyers** — Send a message to ALL interested buyers for this property at once
- **record_buyer_response** — Record that a buyer responded (with note and optional status change)

**CRM/Buyer actions you can execute:**
- **send_sms** — Send a text message to a buyer or contact in GHL
- **create_task** — Create a follow-up task for a buyer or contact
- **add_note_contact** — Add a note to a buyer's CRM contact record
- **add_tag** — Add a tag to a buyer's CRM contact
- **remove_tag** — Remove a tag from a buyer's CRM contact
- **create_appointment** — Schedule an appointment with a buyer

**When to use [ACTION_REDIRECT]:**
- "Update the price to $X" → [ACTION_REDIRECT]
- "Change status to marketing" → [ACTION_REDIRECT]
- "Add an offer from John for $150k" → [ACTION_REDIRECT]
- "Schedule a showing for Mike tomorrow at 2pm" → [ACTION_REDIRECT]
- "Record that I sent 50 SMS blasts" → [ACTION_REDIRECT]
- "Add a note that I spoke with the seller" → [ACTION_REDIRECT]
- "Text Mike and ask if he's still interested" → [ACTION_REDIRECT]
- "Send an SMS to all interested buyers" → [ACTION_REDIRECT]
- "Create a follow-up task for John" → [ACTION_REDIRECT]
- "Add a note to Mike's CRM record" → [ACTION_REDIRECT]
- "Tag John as hot-buyer" → [ACTION_REDIRECT]
- "Schedule an appointment with the buyer for Friday" → [ACTION_REDIRECT]
- "Mark that John responded, he said he's interested" → [ACTION_REDIRECT]
- "Record that Mike passed on this deal" → [ACTION_REDIRECT]

**When NOT to use [ACTION_REDIRECT]:**
- User asks for advice: "What should I price this at?" → Give advice normally
- User asks a question: "How many offers do we have?" → Answer from context
- User asks for strategy: "What's the best outreach plan?" → Provide strategy
- User asks what to say: "What should I text this buyer?" → Give coaching advice (this is asking for HELP, not asking you to SEND)
- User is just chatting or discussing → Respond conversationally
- User gives feedback about a previous action → Respond conversationally

KEY DISTINCTION: "What should I text this buyer?" = asking for ADVICE (coaching). "Text this buyer and say..." = requesting an ACTION. The difference is whether the user is asking WHAT to say vs telling you TO send.

IMPORTANT: Only output [ACTION_REDIRECT] when the user clearly wants to PERFORM an action. When you detect an action intent, output [ACTION_REDIRECT] immediately on its own line — do not include any other text before or after it.

CRITICAL RULES:
1. ALWAYS ground your answers in the REAL property data above. Reference specific numbers, buyer names, dates, and prices.
2. NEVER make up or hallucinate information. If data is missing, say so.
3. Be CONCISE but DENSE. Every sentence should contain information or a specific recommendation. No filler.
4. NEVER say "I can't send texts" or "I don't have CRM access". You DO have full CRM access via actions.
5. Use clean English for all data values. Never output raw snake_case identifiers.
6. When the user opens a conversation about a property, PROACTIVELY assess deal health: flag aging issues, suggest next actions, identify hot buyers who need follow-up. Don't wait to be asked.
7. When discussing pricing, always reference the math: ARV, rehab estimate, 70% rule, comparable sales. Show your work.
8. When a property has offers, immediately assess: Is this the best we can get? Should we counter? Should we wait for more offers? What's the timeline pressure?
9. Quantify revenue impact: "If we drop the price $5K, we lose $5K in assignment fee but could close 2 weeks faster, freeing you to move the next deal."
10. Think about portfolio velocity: this property is one of many. Help the dispo manager prioritize across their entire pipeline.`;

// ─── STREAMING ENDPOINT ───
dispoAssistantRouter.post("/api/dispo-assistant/stream", async (req: Request, res: Response) => {
  const user = await authenticateRequest(req);
  if (!user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const { question, propertyId, history } = req.body as {
    question: string;
    propertyId: number;
    history?: Array<{ role: "user" | "assistant"; content: string }>;
  };

  if (!question || !propertyId) {
    res.status(400).json({ error: "Question and propertyId are required" });
    return;
  }

  const tenantId = user.tenantId || undefined;
  if (!tenantId) {
    res.status(403).json({ error: "No tenant" });
    return;
  }

  // Set SSE headers
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  try {
    // Load full property context
    const detail = await getPropertyDetail(tenantId, propertyId);
    const propertyContext = buildPropertyContext(detail);

    // Load conversation memory from past sessions
    let conversationMemory = "";
    try {
      if (user.id) {
        conversationMemory = await buildCoachMemoryContext(tenantId, user.id, 5);
      }
    } catch { /* memory is best-effort */ }

    // Load coaching preferences
    let coachingPrefs = "";
    try {
      const { buildPreferenceContext } = await import("./coachPreferences");
      coachingPrefs = await buildPreferenceContext(tenantId, user.id, ["sms_style", "note_style"]);
    } catch { /* optional */ }

    // Load user instructions
    let userInstructionContext = "";
    try {
      const { buildInstructionContext } = await import("./userInstructions");
      userInstructionContext = await buildInstructionContext(user.id);
    } catch { /* optional */ }

    const systemPrompt = `${DISPO_ASSISTANT_SYSTEM}

CURRENT PROPERTY CONTEXT:
${propertyContext}

Today's date: ${new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
${conversationMemory ? `\n${conversationMemory}` : ""}
${coachingPrefs ? `\nWhen drafting content (SMS messages, notes), match this user's established style:\n${coachingPrefs}` : ""}
${userInstructionContext ? `\n${userInstructionContext}` : ""}`;

    const messages: Array<{ role: string; content: string }> = [
      { role: "system", content: systemPrompt },
    ];

    // Add conversation history
    if (history && history.length > 0) {
      for (const msg of history.slice(-10)) {
        messages.push({ role: msg.role, content: msg.content });
      }
    }

    messages.push({ role: "user", content: question });

    // Collect the full response for saving to memory
    let fullResponse = "";

    await invokeLLMStream(
      messages,
      (chunk) => {
        fullResponse += chunk;
        res.write(`data: ${JSON.stringify({ type: "chunk", content: chunk })}\n\n`);
      },
      () => {
        res.write(`data: ${JSON.stringify({ type: "done" })}\n\n`);
        res.end();
        // Save the exchange to conversation memory (async, don't block response)
        if (fullResponse && !fullResponse.includes("[ACTION_REDIRECT]")) {
          const exchangeId = `dispo-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
          saveCoachExchange(tenantId, user.id, exchangeId, question, fullResponse).catch(() => {});
        }
      },
      (error) => {
        console.error("[DispoAssistant] Stream error:", error);
        res.write(`data: ${JSON.stringify({ type: "error", message: error.message })}\n\n`);
        res.end();
      }
    );
  } catch (error) {
    console.error("[DispoAssistant] Error:", error);
    res.write(`data: ${JSON.stringify({ type: "error", message: "Failed to process request" })}\n\n`);
    res.end();
  }
});

// ─── PARSE INTENT ENDPOINT ───
// Supports BOTH property actions AND CRM actions
const VALID_DISPO_ACTIONS = [
  "update_property_price", "update_property_status", "add_property_offer",
  "schedule_property_showing", "record_property_send", "add_property_note",
  "bulk_send_buyers", "record_buyer_response",
  // CRM actions for buyer outreach
  "send_sms", "create_task", "add_note_contact", "add_tag", "remove_tag",
  "create_appointment"
];

dispoAssistantRouter.post("/api/dispo-assistant/parse-intent", async (req: Request, res: Response) => {
  const user = await authenticateRequest(req);
  if (!user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const { message, propertyId, history } = req.body as {
    message: string;
    propertyId: number;
    history?: Array<{ role: "user" | "assistant"; content: string }>;
  };

  if (!message || !propertyId) {
    res.status(400).json({ error: "Message and propertyId are required" });
    return;
  }

  const tenantId = user.tenantId || undefined;
  if (!tenantId) {
    res.status(403).json({ error: "No tenant" });
    return;
  }

  try {
    const detail = await getPropertyDetail(tenantId, propertyId);
    const propertyContext = buildPropertyContext(detail);

    // Load coaching preferences for SMS/note style
    let preferenceContext = "";
    try {
      const { buildPreferenceContext } = await import("./coachPreferences");
      preferenceContext = await buildPreferenceContext(tenantId, user.id, ["sms_style", "note_style"]);
    } catch { /* optional */ }

    const parsePrompt = `You are parsing a user's request into structured actions for a disposition property management system.

CURRENT PROPERTY CONTEXT:
${propertyContext}

The user said: "${message}"

${history && history.length > 0 ? `Recent conversation context:\n${history.slice(-5).map(h => `${h.role}: ${h.content}`).join("\n")}` : ""}
${preferenceContext ? `\nWhen drafting SMS or note content, match this user's style:\n${preferenceContext}` : ""}

Determine what action(s) the user wants to perform. Return a JSON object with an "actions" array.

You can parse TWO TYPES of actions:

## PROPERTY ACTIONS (modify the property itself):
- **update_property_price**: Change pricing. Params: { propertyId, askingPrice?, dispoAskingPrice?, assignmentFee?, contractPrice? } (all in CENTS — $150,000 = 15000000)
- **update_property_status**: Change status. Params: { propertyId, newStatus } (valid: ${VALID_PROPERTY_STATUSES.join(", ")})
- **add_property_offer**: Record offer. Params: { propertyId, buyerName, offerAmount (cents), buyerPhone?, buyerEmail?, buyerCompany?, notes? }
- **schedule_property_showing**: Schedule showing. Params: { propertyId, buyerName, showingDate (YYYY-MM-DD), showingTime? (HH:MM), buyerPhone?, notes? }
- **record_property_send**: Record outreach. Params: { propertyId, channel (sms/email/facebook/investor_base/other), buyerGroup?, recipientCount?, notes? }
- **add_property_note**: Add note. Params: { propertyId, title, noteBody }
- **bulk_send_buyers**: Send message to ALL interested buyers. Params: { propertyId, message }
- **record_buyer_response**: Record a buyer's response. Params: { propertyId, buyerActivityId (from BUYER DETAILS), responseNote, newStatus? (interested/offered/passed/skipped) }
## CRM ACTIONS (interact with buyer contacts in GHL):
- **send_sms**: Text a buyer. Params: { message } — set contactName to the buyer's name from the BUYER DETAILS above
- **create_task**: Create follow-up task. Params: { title, description?, dueDate? (YYYY-MM-DD) } — set contactName to buyer
- **add_note_contact**: Add CRM note. Params: { noteBody } — set contactName to buyer
- **add_tag**: Tag a contact. Params: { tags (comma-separated) } — set contactName to buyer
- **remove_tag**: Remove tag. Params: { tags (comma-separated) } — set contactName to buyer
- **create_appointment**: Book appointment. Params: { appointmentTitle, startTime (ISO 8601), endTime? (ISO 8601), notes? } — set contactName to buyer

IMPORTANT RULES:
- All prices/amounts should be in CENTS (multiply dollar amounts by 100)
- The propertyId for this property is: ${propertyId}
- For CRM actions, look up the buyer's name from the BUYER DETAILS section above and set it as contactName
- For CRM actions, if the buyer has a GHL ID listed, include it as contactId
- For CRM actions, set needsContactSearch to true if no GHL ID is available for the buyer
- If the user mentions "today", use ${new Date().toISOString().split("T")[0]}
- If the user mentions "tomorrow", use ${new Date(Date.now() + 86400000).toISOString().split("T")[0]}
- Include a clear, human-readable "summary" for each action
- If the user's message doesn't clearly indicate an action, return { "actions": [] }

Each action in the array should have:
- actionType: one of [${VALID_DISPO_ACTIONS.map(a => `"${a}"`).join(", ")}]
- summary: a human-readable description of what will happen
- contactName: the buyer/contact name (for CRM actions) or "" for property actions
- contactId: the GHL contact ID if known, or "" if not
- needsContactSearch: true if this is a CRM action and we need to search for the contact
- params: an object with the action-specific parameters`;

    const response = await invokeLLM({
      messages: [
        { role: "system", content: parsePrompt },
        { role: "user", content: message },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "dispo_actions",
          strict: true,
          schema: {
            type: "object",
            properties: {
              actions: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    actionType: { type: "string", description: "The type of action to perform" },
                    summary: { type: "string", description: "Human-readable summary of the action" },
                    contactName: { type: "string", description: "Buyer/contact name for CRM actions, empty for property actions" },
                    contactId: { type: "string", description: "GHL contact ID if known, empty otherwise" },
                    needsContactSearch: { type: "boolean", description: "True if CRM action needs contact lookup" },
                    params: {
                      type: "object",
                      description: "Action-specific parameters",
                      additionalProperties: true,
                    },
                  },
                  required: ["actionType", "summary", "contactName", "contactId", "needsContactSearch", "params"],
                  additionalProperties: false,
                },
              },
            },
            required: ["actions"],
            additionalProperties: false,
          },
        },
      },
    });

    const rawContent = response?.choices?.[0]?.message?.content;
    if (!rawContent || typeof rawContent !== "string") {
      res.json({ actions: [] });
      return;
    }

    const parsed = JSON.parse(rawContent);
    const validActions = (parsed.actions || []).filter((a: any) =>
      a && typeof a.actionType === "string" && VALID_DISPO_ACTIONS.includes(a.actionType)
    );

    console.log(`[DispoParseIntent] User: "${message.substring(0, 100)}" → ${validActions.length} actions: ${validActions.map((a: any) => a.actionType).join(", ") || "none"}`);

    res.json({ actions: validActions });
  } catch (error: any) {
    console.error("[DispoParseIntent] Error:", error);
    res.status(500).json({ error: "Failed to parse intent", details: error.message });
  }
});

export { dispoAssistantRouter };
