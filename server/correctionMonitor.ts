/**
 * Correction Pattern Monitor
 * 
 * Analyzes AI feedback/corrections from team members to detect recurring patterns.
 * When a pattern is detected (multiple corrections with similar themes), it:
 * 1. Categorizes the pattern (DQ grading, prior context, rubric disagreement, etc.)
 * 2. Notifies the owner with actionable insights
 * 3. Suggests whether the grading system needs adjustment
 * 
 * Runs daily as a scheduled job.
 */

import { invokeLLM } from "./_core/llm";
import { notifyOwner } from "./_core/notification";
import { getDb } from "./db";
import { aiFeedback, users, calls, teamMembers } from "../drizzle/schema";
import { eq, and, gte, desc, sql, count } from "drizzle-orm";

// ============ PATTERN CATEGORIES ============

export const CORRECTION_CATEGORIES = [
  {
    id: "dq_grading",
    name: "DQ / Short Call Grading",
    description: "Corrections about calls being graded too harshly when the lead was clearly not viable (not in buybox, no motivation, not in area, going to list)",
    keywords: ["buybox", "not in buybox", "disqualif", "dq", "manufactured", "going to list", "not interested", "no motivation", "not in area", "not near", "dead lead", "waste of time", "short call"],
  },
  {
    id: "prior_context",
    name: "Prior Context / Already Known Info",
    description: "Corrections about being penalized for not gathering info that was already known from previous conversations, texts, or CRM notes",
    keywords: ["already had", "already knew", "previous conversation", "texting lead", "text lead", "notes from", "prior", "already know", "came in with", "pre-filled", "crm"],
  },
  {
    id: "setting_expectations",
    name: "Setting Expectations Style",
    description: "Corrections about the rubric being too rigid about how expectations are set (scripted vs conversational)",
    keywords: ["set expectations", "setting expectations", "good fit", "couple of questions", "same thing", "different wording", "same expectation", "conversational"],
  },
  {
    id: "rubric_too_strict",
    name: "Rubric Too Strict / Unfair Score",
    description: "General corrections about scores being too low or rubric criteria being applied too rigidly",
    keywords: ["too low", "unfair", "too strict", "harsh", "should be higher", "not fair", "score too low"],
  },
  {
    id: "missed_context",
    name: "Missed Call Context",
    description: "Corrections about the AI missing important context from the call (e.g., seller's tone, implied meaning, cultural context)",
    keywords: ["missed", "didn't notice", "context", "tone", "implied", "actually meant", "misunderstood"],
  },
  {
    id: "wrong_call_type",
    name: "Wrong Call Type Classification",
    description: "Corrections about the call being classified as the wrong type (e.g., graded as qualification when it was a follow-up)",
    keywords: ["wrong type", "not a qualification", "follow up", "follow-up", "admin call", "callback", "wrong classification"],
  },
  {
    id: "other",
    name: "Other / Uncategorized",
    description: "Corrections that don't fit into the above categories",
    keywords: [],
  },
] as const;

export type CorrectionCategory = typeof CORRECTION_CATEGORIES[number]["id"];

// ============ PATTERN DETECTION ============

export interface CorrectionPattern {
  category: CorrectionCategory;
  categoryName: string;
  count: number;
  corrections: Array<{
    id: number;
    explanation: string;
    userName: string;
    createdAt: Date;
  }>;
  suggestedAction: string;
}

/**
 * Categorize a single correction based on keyword matching
 */
export function categorizeCorrectionByKeywords(explanation: string): CorrectionCategory {
  const lower = explanation.toLowerCase();
  
  for (const category of CORRECTION_CATEGORIES) {
    if (category.id === "other") continue; // Skip "other" — it's the fallback
    if (category.keywords.some(kw => lower.includes(kw))) {
      return category.id;
    }
  }
  
  return "other";
}

/**
 * Analyze recent corrections and detect patterns.
 * Returns patterns that have 2+ corrections in the given time window.
 */
export async function detectCorrectionPatterns(options?: {
  dayWindow?: number;
  minCount?: number;
  tenantId?: number;
}): Promise<CorrectionPattern[]> {
  const db = await getDb();
  if (!db) return [];

  const dayWindow = options?.dayWindow || 7; // Default: look at last 7 days
  const minCount = options?.minCount || 2; // Default: 2+ corrections = pattern
  const cutoffDate = new Date(Date.now() - dayWindow * 24 * 60 * 60 * 1000);

  // Fetch recent corrections (all statuses except dismissed)
  const conditions = [
    gte(aiFeedback.createdAt, cutoffDate),
  ];
  if (options?.tenantId) {
    conditions.push(eq(aiFeedback.tenantId, options.tenantId));
  }

  const recentCorrections = await db
    .select({
      id: aiFeedback.id,
      explanation: aiFeedback.explanation,
      feedbackType: aiFeedback.feedbackType,
      status: aiFeedback.status,
      createdAt: aiFeedback.createdAt,
      userId: aiFeedback.userId,
      userName: users.name,
    })
    .from(aiFeedback)
    .leftJoin(users, eq(aiFeedback.userId, users.id))
    .where(and(...conditions))
    .orderBy(desc(aiFeedback.createdAt))
    .limit(200);

  // Categorize each correction
  const categorized = new Map<CorrectionCategory, Array<{
    id: number;
    explanation: string;
    userName: string;
    createdAt: Date;
  }>>();

  for (const correction of recentCorrections) {
    const category = categorizeCorrectionByKeywords(correction.explanation);
    if (!categorized.has(category)) {
      categorized.set(category, []);
    }
    categorized.get(category)!.push({
      id: correction.id,
      explanation: correction.explanation,
      userName: correction.userName || "Unknown",
      createdAt: correction.createdAt,
    });
  }

  // Build patterns that meet the minimum count threshold
  const patterns: CorrectionPattern[] = [];
  for (const [categoryId, corrections] of Array.from(categorized.entries())) {
    if (corrections.length >= minCount) {
      const categoryDef = CORRECTION_CATEGORIES.find(c => c.id === categoryId);
      patterns.push({
        category: categoryId,
        categoryName: categoryDef?.name || "Unknown",
        count: corrections.length,
        corrections,
        suggestedAction: getSuggestedAction(categoryId, corrections.length),
      });
    }
  }

  // Sort by count descending
  patterns.sort((a, b) => b.count - a.count);
  return patterns;
}

/**
 * Get a suggested action based on the pattern category and frequency
 */
function getSuggestedAction(category: CorrectionCategory, count: number): string {
  const isFrequent = count >= 4;
  
  switch (category) {
    case "dq_grading":
      return isFrequent
        ? "The DQ-aware grading system has been updated, but team members are still seeing issues. Consider re-grading recent DQ calls to apply the updated rubric, or review whether the DQ detection thresholds need further tuning."
        : "The grading system now handles DQ calls differently. These corrections may be from calls graded before the update. Consider re-grading the affected calls.";
    
    case "prior_context":
      return isFrequent
        ? "Multiple team members are reporting prior context issues. The grading system now accounts for this, but consider re-grading affected calls and checking if text lead / CRM integration is surfacing prior context to the grading system."
        : "The grading system now recognizes prior context. These corrections may be from calls graded before the update. Consider re-grading the affected calls.";
    
    case "setting_expectations":
      return isFrequent
        ? "The Setting Expectations rubric has been updated to accept conversational approaches. If corrections continue, review whether the rubric description needs further broadening for your team's specific style."
        : "The rubric now accepts both scripted and conversational expectation-setting. These corrections may be from calls graded before the update.";
    
    case "rubric_too_strict":
      return isFrequent
        ? "Multiple team members feel scores are too strict. Consider reviewing the rubric criteria weights or adding custom grading rules to better match your team's performance expectations."
        : "Review the specific criteria mentioned in these corrections. If the same criterion is flagged repeatedly, consider adjusting its weight or description.";
    
    case "missed_context":
      return "Review the specific calls mentioned. If the AI consistently misses certain types of context, consider adding a custom grading rule to address the gap.";
    
    case "wrong_call_type":
      return "Review the call classification system. If calls are consistently misclassified, the classification prompt may need adjustment for your team's call patterns.";
    
    case "other":
      return "Review these corrections individually. If a new pattern emerges, consider creating a custom grading rule to address it.";
    
    default:
      return "Review these corrections and determine if a systemic change is needed.";
  }
}

// ============ NOTIFICATION ============

/**
 * Generate a summary notification for detected patterns
 */
export function formatPatternNotification(patterns: CorrectionPattern[], dayWindow: number): { title: string; content: string } {
  const totalCorrections = patterns.reduce((sum, p) => sum + p.count, 0);
  const uniqueMembers = Array.from(new Set(patterns.flatMap(p => p.corrections.map(c => c.userName))));
  
  const title = `📊 Correction Pattern Alert: ${totalCorrections} corrections from ${uniqueMembers.length} team member${uniqueMembers.length > 1 ? "s" : ""} (last ${dayWindow} days)`;
  
  let content = `**${totalCorrections} corrections** were submitted in the last ${dayWindow} days by ${uniqueMembers.join(", ")}.\n\n`;
  content += `**Detected Patterns:**\n\n`;
  
  for (const pattern of patterns) {
    const memberNames = Array.from(new Set(pattern.corrections.map(c => c.userName)));
    content += `**${pattern.categoryName}** (${pattern.count} corrections from ${memberNames.join(", ")})\n`;
    // Show first 2 example explanations
    const examples = pattern.corrections.slice(0, 2);
    for (const ex of examples) {
      const shortExplanation = ex.explanation.length > 150 ? ex.explanation.substring(0, 150) + "..." : ex.explanation;
      content += `  - "${shortExplanation}"\n`;
    }
    content += `  → **Action:** ${pattern.suggestedAction}\n\n`;
  }
  
  return { title, content };
}

// ============ SCHEDULED JOB ============

let correctionMonitorInterval: ReturnType<typeof setInterval> | null = null;
let lastCorrectionCheckTime: Date | null = null;

/**
 * Run the correction pattern monitor for all tenants.
 * Detects patterns and notifies the owner if any are found.
 */
export async function runCorrectionMonitor(): Promise<{
  patternsDetected: number;
  notificationSent: boolean;
  patterns: CorrectionPattern[];
}> {
  console.log("[CorrectionMonitor] Starting correction pattern analysis...");
  
  try {
    // Detect patterns across all tenants (owner sees everything)
    const patterns = await detectCorrectionPatterns({
      dayWindow: 7,
      minCount: 2,
    });

    if (patterns.length === 0) {
      console.log("[CorrectionMonitor] No correction patterns detected.");
      return { patternsDetected: 0, notificationSent: false, patterns: [] };
    }

    console.log(`[CorrectionMonitor] Detected ${patterns.length} pattern(s): ${patterns.map(p => `${p.categoryName} (${p.count})`).join(", ")}`);

    // Send notification to owner
    const { title, content } = formatPatternNotification(patterns, 7);
    const sent = await notifyOwner({ title, content });

    console.log(`[CorrectionMonitor] Notification ${sent ? "sent" : "failed to send"}.`);
    
    return {
      patternsDetected: patterns.length,
      notificationSent: sent,
      patterns,
    };
  } catch (error) {
    console.error("[CorrectionMonitor] Error:", error);
    return { patternsDetected: 0, notificationSent: false, patterns: [] };
  }
}

/**
 * Start the daily correction monitor scheduler.
 * Checks once per day for correction patterns.
 */
export function startCorrectionMonitor() {
  // Disabled — automatic notifications turned off per owner request.
  // The feedback.patterns API endpoint is still available for on-demand queries.
  console.log("[CorrectionMonitor] Automatic notifications disabled. Use feedback.patterns endpoint for on-demand analysis.");
  return;
}

/**
 * Stop the correction monitor scheduler.
 */
export function stopCorrectionMonitor() {
  if (correctionMonitorInterval) {
    clearInterval(correctionMonitorInterval);
    correctionMonitorInterval = null;
    console.log("[CorrectionMonitor] Stopped.");
  }
}

/**
 * Get the last time the correction monitor ran.
 */
export function getLastCorrectionCheckTime(): Date | null {
  return lastCorrectionCheckTime;
}
