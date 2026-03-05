/**
 * AI Dispo Assistant — Streaming SSE endpoint
 * Property-aware AI chat for disposition strategy, buyer management, and deal advice
 */
import { Router, type Request, type Response } from "express";
import { parse as parseCookieHeader } from "cookie";
import { verifySessionToken, getUserById } from "./selfServeAuth";
import { sdk } from "./_core/sdk";
import { invokeLLMStream } from "./llmStream";
import { getPropertyDetail } from "./inventory";
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
  try {
    return await sdk.authenticateRequest(req);
  } catch {
    return null;
  }
}

export function buildPropertyContext(detail: any): string {
  if (!detail) return "No property selected.";

  const lines: string[] = [];
  lines.push(`PROPERTY: ${detail.address}, ${detail.city} ${detail.state} ${detail.zip || ""}`);
  lines.push(`Status: ${detail.status} | Type: ${detail.propertyType || "N/A"}`);
  if (detail.askingPrice) lines.push(`Asking Price: $${(detail.askingPrice / 100).toLocaleString()}`);
  if (detail.dispoAskingPrice) lines.push(`Dispo Asking: $${(detail.dispoAskingPrice / 100).toLocaleString()}`);
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

  // Buyers summary
  if (detail.buyers?.length > 0) {
    lines.push(`\nBUYERS MATCHED: ${detail.buyers.length} total`);
    const vipBuyers = detail.buyers.filter((b: any) => b.isVip);
    if (vipBuyers.length > 0) lines.push(`VIP Buyers: ${vipBuyers.map((b: any) => b.buyerName).join(", ")}`);
    const statusCounts: Record<string, number> = {};
    for (const b of detail.buyers) {
      statusCounts[b.status] = (statusCounts[b.status] || 0) + 1;
    }
    lines.push(`Status breakdown: ${Object.entries(statusCounts).map(([k, v]) => `${k}: ${v}`).join(", ")}`);
  } else {
    lines.push(`\nBUYERS: None matched yet`);
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

const DISPO_ASSISTANT_SYSTEM = `You are an expert Disposition Assistant for a real estate wholesaling team. You have full context on the selected property including its details, outreach history, buyer activity, offers, showings, and activity log.

Your expertise covers:
- **Pricing Strategy**: Advise on asking price, assignment fee optimization, and when to adjust pricing based on market response
- **Buyer Targeting**: Which buyer segments to target (flippers, landlords, builders), how to craft messaging for each
- **Outreach Strategy**: Best channels (SMS, email, Facebook, investor lists), timing, follow-up cadence
- **Negotiation Tactics**: Counter-offer strategy, creating urgency, handling lowball offers, multiple offer scenarios
- **Showing Preparation**: What to highlight, how to handle buyer objections on-site, follow-up after showings
- **Deal Structuring**: Assignment vs double close, EMD handling, inspection period strategy
- **Market Analysis**: Days on market implications, when to re-price, seasonal considerations
- **Buyer Relationship**: Follow-up cadence, VIP buyer management, building repeat buyer relationships

Always ground your advice in the ACTUAL property data provided. Reference specific numbers, buyer names, and dates when relevant. Be direct, actionable, and specific — not generic. Think like a seasoned dispo manager who has closed hundreds of wholesale deals.

When the property has been on market for a while with low interest, proactively suggest pricing adjustments or new marketing angles. When there are active offers, help with negotiation strategy. When there are no buyers yet, focus on outreach planning.`;

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

    const systemPrompt = `${DISPO_ASSISTANT_SYSTEM}

CURRENT PROPERTY CONTEXT:
${propertyContext}

Today's date: ${new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}`;

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

export { dispoAssistantRouter };
