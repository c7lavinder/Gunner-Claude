/**
 * Deal Distribution Service
 * 
 * AI-generates SMS, Email, and PDF content per buyer tier for property deal blasts.
 * Learns from user edits over time to improve future generations.
 * 
 * Buyer Tiers:
 * - Priority: First look, exclusive/urgent language
 * - Qualified: Strong buyers, confident professional tone
 * - JV Partner: Partnership angle, shared upside framing
 * - Unqualified: Basic info, straightforward
 * - Halted: Skip (no content generated)
 */

import { invokeLLM } from "./_core/llm";
import { getDb } from "./db";
import { dealDistributions, dealContentEdits, type DealDistribution, type InsertDealDistribution } from "../drizzle/schema";
import { eq, and, desc } from "drizzle-orm";

// ─── Types ───

export type BuyerTier = "priority" | "qualified" | "jv_partner" | "unqualified";

export interface PropertyData {
  address: string;
  city: string;
  state: string;
  zip: string;
  propertyType: string;
  beds: number | null;
  baths: string | null;
  sqft: number | null;
  yearBuilt: number | null;
  lotSize: string | null;
  // Financials (in cents)
  contractPrice: number | null;
  askingPrice: number | null;
  dispoAskingPrice: number | null;
  assignmentFee: number | null;
  arv: number | null;
  estRepairs: number | null;
  // Status
  occupancyStatus: string | null;
  description: string | null;
  notes: string | null;
  mediaLink: string | null;
  photos: string | null; // JSON array
  projectType: string | null;
  market: string | null;
  lockboxCode: string | null;
  // Research
  propertyResearch?: {
    zestimate?: number;
    taxAssessment?: number;
    recentComps?: Array<{ address: string; soldPrice: number; soldDate: string }>;
  } | null;
}

export interface BrandData {
  companyName: string | null;
  brandVoice: string | null;
  tagline: string | null;
  websiteUrl: string | null;
  logoUrl: string | null;
}

export interface GeneratedContent {
  smsContent: string;
  emailSubject: string;
  emailBody: string;
}

// ─── Tier Descriptions (for LLM prompt) ───

const TIER_DESCRIPTIONS: Record<BuyerTier, string> = {
  priority: `PRIORITY BUYER — This is a top-tier, repeat buyer who gets FIRST LOOK at deals before anyone else. 
Tone: Exclusive, urgent, VIP treatment. Make them feel like an insider.
Style: "Hey [name], got one for you before it hits the list..." / "Exclusive first look — this won't last."
Keep it short and punchy for SMS. They know the game, don't over-explain.`,

  qualified: `QUALIFIED BUYER — This is a vetted, active buyer who has purchased before or is ready to buy.
Tone: Professional, confident, data-driven. Respect their time.
Style: Lead with the numbers (ARV, asking, spread). Include key details they need to make a decision.
Straightforward and efficient — they want the facts.`,

  jv_partner: `JV PARTNER — This is a joint venture partner who co-invests or brings capital/resources.
Tone: Collaborative, opportunity-focused, partnership language.
Style: Frame it as "we've got a deal that could work for us" not "here's a deal for sale."
Emphasize the upside, the numbers, and why this is a good partnership opportunity.
Include ROI potential and deal structure flexibility.`,

  unqualified: `UNQUALIFIED BUYER — This is a newer or unvetted buyer on the general list.
Tone: Professional but standard. No exclusivity language.
Style: Present the deal clearly with all relevant details. Include a call to action.
More detail than Priority (they may need context). Standard marketing blast format.`,
};

// ─── Helper: Format cents to dollars ───

function centsToDollars(cents: number | null): string {
  if (!cents) return "N/A";
  return "$" + (cents / 100).toLocaleString("en-US", { maximumFractionDigits: 0 });
}

// ─── Helper: Build property summary for LLM ───

function buildPropertySummary(property: PropertyData): string {
  const lines: string[] = [];
  lines.push(`Address: ${property.address}, ${property.city}, ${property.state} ${property.zip}`);
  if (property.market) lines.push(`Market: ${property.market}`);
  if (property.propertyType) lines.push(`Property Type: ${property.propertyType}`);
  
  const details: string[] = [];
  if (property.beds) details.push(`${property.beds} bed`);
  if (property.baths) details.push(`${property.baths} bath`);
  if (property.sqft) details.push(`${property.sqft.toLocaleString()} sqft`);
  if (property.yearBuilt) details.push(`Built ${property.yearBuilt}`);
  if (property.lotSize) details.push(`Lot: ${property.lotSize}`);
  if (details.length > 0) lines.push(`Details: ${details.join(" | ")}`);
  
  lines.push(`Occupancy: ${property.occupancyStatus || "Unknown"}`);
  
  // Financials
  const askingPrice = property.dispoAskingPrice || property.askingPrice;
  lines.push(`Asking Price: ${centsToDollars(askingPrice)}`);
  if (property.arv) lines.push(`ARV: ${centsToDollars(property.arv)}`);
  if (property.estRepairs) lines.push(`Est. Repairs: ${centsToDollars(property.estRepairs)}`);
  if (askingPrice && property.arv) {
    const spread = property.arv - askingPrice;
    const spreadPct = ((spread / property.arv) * 100).toFixed(0);
    lines.push(`Spread: ${centsToDollars(spread)} (${spreadPct}% of ARV)`);
  }
  if (property.contractPrice) lines.push(`Contract Price: ${centsToDollars(property.contractPrice)}`);
  if (property.assignmentFee) lines.push(`Assignment Fee: ${centsToDollars(property.assignmentFee)}`);
  
  if (property.projectType) lines.push(`Project Type: ${property.projectType}`);
  if (property.description) lines.push(`Description: ${property.description}`);
  if (property.mediaLink) lines.push(`Photos/Media: ${property.mediaLink}`);
  
  // Research data
  if (property.propertyResearch) {
    const r = property.propertyResearch;
    if (r.zestimate) lines.push(`Zestimate: ${centsToDollars(r.zestimate)}`);
    if (r.recentComps && r.recentComps.length > 0) {
      lines.push(`Recent Comps:`);
      r.recentComps.slice(0, 3).forEach(c => {
        lines.push(`  - ${c.address}: ${centsToDollars(c.soldPrice)} (${c.soldDate})`);
      });
    }
  }
  
  return lines.join("\n");
}

// ─── Fetch past edits for learning ───

async function getRecentEdits(tenantId: number, buyerTier: BuyerTier, contentType: "sms" | "email_subject" | "email_body", limit = 5): Promise<Array<{ original: string; edited: string }>> {
  const db = await getDb();
  if (!db) return [];
  
  const edits = await db.select({
    original: dealContentEdits.originalContent,
    edited: dealContentEdits.editedContent,
  })
    .from(dealContentEdits)
    .where(and(
      eq(dealContentEdits.tenantId, tenantId),
      eq(dealContentEdits.buyerTier, buyerTier),
      eq(dealContentEdits.contentType, contentType),
    ))
    .orderBy(desc(dealContentEdits.createdAt))
    .limit(limit);
  
  return edits.map(e => ({ original: e.original, edited: e.edited }));
}

// ─── Build learning context from past edits ───

function buildLearningContext(edits: Array<{ original: string; edited: string }>): string {
  if (edits.length === 0) return "";
  
  let context = `\n\nIMPORTANT — LEARN FROM PAST EDITS:
The user has previously edited AI-generated content. Study these changes carefully and apply the same patterns to your output. Match their voice, tone, length preferences, and formatting choices.

Past edit examples (Original → User's Version):`;
  
  edits.forEach((edit, i) => {
    context += `\n\nEdit ${i + 1}:
ORIGINAL: "${edit.original.substring(0, 500)}"
USER CHANGED TO: "${edit.edited.substring(0, 500)}"`;
  });
  
  context += `\n\nApply the patterns you see above. Match the user's preferred tone, length, word choices, and formatting.`;
  
  return context;
}

// ─── Generate SMS Content ───

export async function generateSmsContent(
  property: PropertyData,
  tier: BuyerTier,
  brand: BrandData,
  tenantId: number,
): Promise<string> {
  const pastEdits = await getRecentEdits(tenantId, tier, "sms");
  const learningContext = buildLearningContext(pastEdits);
  
  const prompt = `You are a real estate wholesaling dispo manager writing an SMS to blast out a deal to buyers.

COMPANY: ${brand.companyName || "Our Company"}
${brand.brandVoice ? `BRAND VOICE: ${brand.brandVoice}` : ""}

BUYER TIER:
${TIER_DESCRIPTIONS[tier]}

PROPERTY:
${buildPropertySummary(property)}
${learningContext}

Write a SHORT SMS message (under 160 characters if possible, max 320 characters) to send to this buyer tier about this deal.

Rules:
- No emojis unless the user's past edits use them
- Include the address and key financial number (asking price or ARV)
- Match the tone for this buyer tier
- Include a brief call to action
- Do NOT include any greeting like "Hi" or the buyer's name (this is a blast)
- Do NOT include the company name in the SMS
- Write ONLY the SMS text, nothing else`;

  const response = await invokeLLM({
    messages: [
      { role: "system", content: "You are an expert real estate wholesaling copywriter. Write concise, compelling deal blast messages." },
      { role: "user", content: prompt },
    ],
  });

  const rawContent = response.choices[0]?.message?.content;
  return (typeof rawContent === "string" ? rawContent : "").trim();
}

// ─── Generate Email Content ───

export async function generateEmailContent(
  property: PropertyData,
  tier: BuyerTier,
  brand: BrandData,
  tenantId: number,
): Promise<{ subject: string; body: string }> {
  const [subjectEdits, bodyEdits] = await Promise.all([
    getRecentEdits(tenantId, tier, "email_subject"),
    getRecentEdits(tenantId, tier, "email_body"),
  ]);
  
  const subjectLearning = buildLearningContext(subjectEdits);
  const bodyLearning = buildLearningContext(bodyEdits);
  
  const askingPrice = property.dispoAskingPrice || property.askingPrice;
  
  const prompt = `You are a real estate wholesaling dispo manager writing a deal blast email to buyers.

COMPANY: ${brand.companyName || "Our Company"}
${brand.brandVoice ? `BRAND VOICE: ${brand.brandVoice}` : ""}
${brand.websiteUrl ? `WEBSITE: ${brand.websiteUrl}` : ""}

BUYER TIER:
${TIER_DESCRIPTIONS[tier]}

PROPERTY:
${buildPropertySummary(property)}

SUBJECT LINE PREFERENCES:${subjectLearning || " (No past edits yet — use your best judgment)"}

EMAIL BODY PREFERENCES:${bodyLearning || " (No past edits yet — use your best judgment)"}

Write a deal blast email with:
1. A compelling subject line
2. A professional email body

Email body rules:
- Lead with the key numbers: address, asking price (${centsToDollars(askingPrice)}), ARV (${centsToDollars(property.arv)})
- Include property details: beds, baths, sqft, year built
- Include repair estimate if available
- Mention occupancy status
- ${property.mediaLink ? `Include the media/photos link: ${property.mediaLink}` : "Mention photos available upon request"}
- Match the tone for this buyer tier
- End with a clear call to action
- Keep it scannable — use short paragraphs or bullet points
- Do NOT use HTML formatting — write in plain text
- Do NOT include "[Your Name]" or similar placeholders

Respond in this exact format:
SUBJECT: [your subject line here]
---
[your email body here]`;

  const response = await invokeLLM({
    messages: [
      { role: "system", content: "You are an expert real estate wholesaling copywriter. Write compelling, professional deal blast emails." },
      { role: "user", content: prompt },
    ],
  });

  const rawContent = response.choices[0]?.message?.content;
  const content = (typeof rawContent === "string" ? rawContent : "").trim();
  
  // Parse subject and body
  const subjectMatch = content.match(/^SUBJECT:\s*(.+)/m);
  const subject = subjectMatch ? subjectMatch[1].trim() : `New Deal: ${property.address}`;
  
  const bodyStart = content.indexOf("---");
  const body = bodyStart !== -1 
    ? content.substring(bodyStart + 3).trim() 
    : content.replace(/^SUBJECT:.*\n?/m, "").trim();
  
  return { subject, body };
}

// ─── Generate All Content for a Tier ───

export async function generateTierContent(
  property: PropertyData,
  tier: BuyerTier,
  brand: BrandData,
  tenantId: number,
): Promise<GeneratedContent> {
  const [smsContent, emailResult] = await Promise.all([
    generateSmsContent(property, tier, brand, tenantId),
    generateEmailContent(property, tier, brand, tenantId),
  ]);
  
  return {
    smsContent,
    emailSubject: emailResult.subject,
    emailBody: emailResult.body,
  };
}

// ─── Generate Content for All Selected Tiers ───

export async function generateDealContent(
  property: PropertyData,
  propertyId: number,
  tiers: BuyerTier[],
  brand: BrandData,
  tenantId: number,
  userId: number,
): Promise<DealDistribution[]> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const results: DealDistribution[] = [];
  
  // Generate content for each tier (in parallel)
  const generations = await Promise.all(
    tiers.map(tier => generateTierContent(property, tier, brand, tenantId))
  );
  
  // Save to database
  for (let i = 0; i < tiers.length; i++) {
    const tier = tiers[i];
    const content = generations[i];
    
    const [result] = await db.insert(dealDistributions).values({
      tenantId,
      propertyId,
      buyerTier: tier,
      smsContent: content.smsContent,
      emailSubject: content.emailSubject,
      emailBody: content.emailBody,
      generatedByUserId: userId,
    }).returning({ id: dealDistributions.id });
    
    const [saved] = await db.select().from(dealDistributions)
      .where(eq(dealDistributions.id, result.id));
    
    if (saved) results.push(saved);
  }
  
  return results;
}

// ─── Save User Edits (for learning) ───

export async function saveContentEdit(
  tenantId: number,
  distributionId: number,
  contentType: "sms" | "email_subject" | "email_body",
  originalContent: string,
  editedContent: string,
  buyerTier: BuyerTier,
  userId: number,
): Promise<void> {
  const db = await getDb();
  if (!db) return;
  
  // Only save if content actually changed
  if (originalContent.trim() === editedContent.trim()) return;
  
  await db.insert(dealContentEdits).values({
    tenantId,
    distributionId,
    contentType,
    originalContent,
    editedContent,
    buyerTier,
    editedByUserId: userId,
  });
}

// ─── Update Distribution with Edited Content ───

export async function updateDistributionContent(
  tenantId: number,
  distributionId: number,
  updates: {
    editedSmsContent?: string;
    editedEmailSubject?: string;
    editedEmailBody?: string;
    status?: "draft" | "reviewed" | "sent";
  },
  userId: number,
): Promise<DealDistribution | null> {
  const db = await getDb();
  if (!db) return null;
  
  // Get the original distribution first
  const [original] = await db.select().from(dealDistributions)
    .where(and(
      eq(dealDistributions.id, distributionId),
      eq(dealDistributions.tenantId, tenantId),
    ));
  
  if (!original) return null;
  
  // Save edits for learning
  if (updates.editedSmsContent && original.smsContent) {
    await saveContentEdit(tenantId, distributionId, "sms", original.smsContent, updates.editedSmsContent, original.buyerTier as BuyerTier, userId);
  }
  if (updates.editedEmailSubject && original.emailSubject) {
    await saveContentEdit(tenantId, distributionId, "email_subject", original.emailSubject, updates.editedEmailSubject, original.buyerTier as BuyerTier, userId);
  }
  if (updates.editedEmailBody && original.emailBody) {
    await saveContentEdit(tenantId, distributionId, "email_body", original.emailBody, updates.editedEmailBody, original.buyerTier as BuyerTier, userId);
  }
  
  const updateData: Record<string, any> = {};
  if (updates.editedSmsContent !== undefined) updateData.editedSmsContent = updates.editedSmsContent;
  if (updates.editedEmailSubject !== undefined) updateData.editedEmailSubject = updates.editedEmailSubject;
  if (updates.editedEmailBody !== undefined) updateData.editedEmailBody = updates.editedEmailBody;
  if (updates.status) {
    updateData.status = updates.status;
    if (updates.status === "reviewed") {
      updateData.reviewedByUserId = userId;
      updateData.reviewedAt = new Date();
    }
    if (updates.status === "sent") {
      updateData.sentAt = new Date();
    }
  }
  
  await db.update(dealDistributions)
    .set(updateData)
    .where(eq(dealDistributions.id, distributionId));
  
  const [updated] = await db.select().from(dealDistributions)
    .where(eq(dealDistributions.id, distributionId));
  
  return updated || null;
}

// ─── Get Distributions for a Property ───

export async function getPropertyDistributions(
  tenantId: number,
  propertyId: number,
): Promise<DealDistribution[]> {
  const db = await getDb();
  if (!db) return [];
  
  return db.select().from(dealDistributions)
    .where(and(
      eq(dealDistributions.tenantId, tenantId),
      eq(dealDistributions.propertyId, propertyId),
    ))
    .orderBy(desc(dealDistributions.createdAt));
}

// ─── Get Single Distribution ───

export async function getDistributionById(
  tenantId: number,
  distributionId: number,
): Promise<DealDistribution | null> {
  const db = await getDb();
  if (!db) return null;
  
  const [dist] = await db.select().from(dealDistributions)
    .where(and(
      eq(dealDistributions.id, distributionId),
      eq(dealDistributions.tenantId, tenantId),
    ));
  
  return dist || null;
}
