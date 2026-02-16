/**
 * Coach Preferences Service
 * 
 * Learns from user edits to AI-generated content. Every time a user confirms
 * an AI Coach action, we capture the AI draft (before) and the user's final
 * version (after). If they edited it, we learn from the diff. If they accepted
 * as-is, that's a positive signal.
 * 
 * Preferences are stored per-user per-category. New users with no history
 * fall back to a team-wide profile aggregated from all team members.
 */
import { getDb } from "./db";
import { coachActionEdits, aiCoachPreferences, coachActionLog } from "../drizzle/schema";
import { eq, and, desc, isNull, sql } from "drizzle-orm";
import { invokeLLM } from "./_core/llm";

type EditCategory = "sms" | "note" | "task";
type PrefCategory = "sms_style" | "note_style" | "task_style";

// ============ CATEGORY MAPPING ============

function actionTypeToEditCategory(actionType: string): EditCategory | null {
  switch (actionType) {
    case "send_sms": return "sms";
    case "add_note":
    case "add_note_contact":
    case "add_note_opportunity": return "note";
    case "create_task": return "task";
    default: return null;
  }
}

function editCategoryToPrefCategory(cat: EditCategory): PrefCategory {
  return `${cat}_style` as PrefCategory;
}

/**
 * Extract the editable content string from a payload based on action type.
 */
function extractContent(actionType: string, payload: any): string | null {
  if (!payload) return null;
  switch (actionType) {
    case "send_sms": return payload.message || null;
    case "add_note":
    case "add_note_contact":
    case "add_note_opportunity": return payload.noteBody || null;
    case "create_task":
      return [payload.title, payload.description].filter(Boolean).join(" — ") || null;
    default: return null;
  }
}

// ============ EDIT RECORDING ============

/**
 * Record a before/after edit for a confirmed action.
 * Called from the confirmAndExecute endpoint.
 */
export async function recordEdit(params: {
  tenantId: number;
  userId: number;
  actionLogId: number;
  actionType: string;
  originalPayload: any;
  finalPayload: any;
  wasEdited: boolean;
}): Promise<void> {
  const category = actionTypeToEditCategory(params.actionType);
  if (!category) return;

  const draftContent = extractContent(params.actionType, params.originalPayload);
  const finalContent = extractContent(params.actionType, params.finalPayload);
  if (!draftContent || !finalContent) return;
  if (draftContent.trim().length < 3) return;

  const db = await getDb();
  if (!db) return;

  await db.insert(coachActionEdits).values({
    tenantId: params.tenantId,
    userId: params.userId,
    actionLogId: params.actionLogId,
    category,
    draftContent,
    finalContent,
    wasEdited: params.wasEdited ? "true" : "false",
  });

  // Check if we should regenerate the user's preference profile
  const editCount = await db
    .select({ count: sql<number>`count(*)` })
    .from(coachActionEdits)
    .where(
      and(
        eq(coachActionEdits.tenantId, params.tenantId),
        eq(coachActionEdits.userId, params.userId),
        eq(coachActionEdits.category, category)
      )
    );

  const count = editCount[0]?.count || 0;
  // Regenerate after 3, 6, 10, then every 5 edits
  if (count === 3 || count === 6 || count === 10 || (count > 10 && count % 5 === 0)) {
    try {
      await regeneratePreference(params.tenantId, params.userId, category);
    } catch (error) {
      console.error("[CoachPreferences] Failed to regenerate preference:", error);
    }
  }

  // Also update team-wide profile periodically
  if (count % 10 === 0) {
    try {
      await regenerateTeamPreference(params.tenantId, category);
    } catch (error) {
      console.error("[CoachPreferences] Failed to regenerate team preference:", error);
    }
  }
}

// ============ PREFERENCE GENERATION ============

/**
 * Regenerate a user's preference profile for a specific category
 * by analyzing their edit history.
 */
async function regeneratePreference(
  tenantId: number,
  userId: number,
  editCategory: EditCategory
): Promise<void> {
  const db = await getDb();
  if (!db) return;

  // Get recent edits for this user+category
  const edits = await db
    .select()
    .from(coachActionEdits)
    .where(
      and(
        eq(coachActionEdits.tenantId, tenantId),
        eq(coachActionEdits.userId, userId),
        eq(coachActionEdits.category, editCategory)
      )
    )
    .orderBy(desc(coachActionEdits.createdAt))
    .limit(20);

  if (edits.length < 3) return;

  const prefCategory = editCategoryToPrefCategory(editCategory);
  const styleSummary = await analyzeEditsForStyle(editCategory, edits);
  const recentExamples = edits
    .slice(0, 5)
    .map(e => e.finalContent);

  // Upsert the preference
  const existing = await db
    .select()
    .from(aiCoachPreferences)
    .where(
      and(
        eq(aiCoachPreferences.tenantId, tenantId),
        eq(aiCoachPreferences.userId, userId),
        eq(aiCoachPreferences.category, prefCategory)
      )
    )
    .limit(1);

  if (existing.length > 0) {
    await db.update(aiCoachPreferences)
      .set({
        styleSummary,
        recentExamples: JSON.stringify(recentExamples),
        sampleCount: edits.length,
      })
      .where(eq(aiCoachPreferences.id, existing[0].id));
  } else {
    await db.insert(aiCoachPreferences).values({
      tenantId,
      userId,
      category: prefCategory,
      styleSummary,
      recentExamples: JSON.stringify(recentExamples),
      sampleCount: edits.length,
    });
  }
}

/**
 * Regenerate team-wide preference profile (userId=NULL) for a category.
 * Aggregates patterns from all users on the tenant.
 */
async function regenerateTeamPreference(
  tenantId: number,
  editCategory: EditCategory
): Promise<void> {
  const db = await getDb();
  if (!db) return;

  // Get recent edits from ALL users on this tenant
  const edits = await db
    .select()
    .from(coachActionEdits)
    .where(
      and(
        eq(coachActionEdits.tenantId, tenantId),
        eq(coachActionEdits.category, editCategory)
      )
    )
    .orderBy(desc(coachActionEdits.createdAt))
    .limit(30);

  if (edits.length < 5) return;

  const prefCategory = editCategoryToPrefCategory(editCategory);
  const styleSummary = await analyzeEditsForStyle(editCategory, edits);
  const recentExamples = edits
    .slice(0, 5)
    .map(e => e.finalContent);

  // Upsert team-wide preference (userId IS NULL)
  const existing = await db
    .select()
    .from(aiCoachPreferences)
    .where(
      and(
        eq(aiCoachPreferences.tenantId, tenantId),
        isNull(aiCoachPreferences.userId),
        eq(aiCoachPreferences.category, prefCategory)
      )
    )
    .limit(1);

  if (existing.length > 0) {
    await db.update(aiCoachPreferences)
      .set({
        styleSummary,
        recentExamples: JSON.stringify(recentExamples),
        sampleCount: edits.length,
      })
      .where(eq(aiCoachPreferences.id, existing[0].id));
  } else {
    await db.insert(aiCoachPreferences).values({
      tenantId,
      userId: null,
      category: prefCategory,
      styleSummary,
      recentExamples: JSON.stringify(recentExamples),
      sampleCount: edits.length,
    });
  }
}

/**
 * Use LLM to analyze edit history and produce a style summary.
 * Focuses on what the user changed (edits) and what they kept (accepts).
 */
async function analyzeEditsForStyle(
  category: EditCategory,
  edits: Array<{ draftContent: string; finalContent: string; wasEdited: string }>
): Promise<string> {
  const categoryLabels: Record<EditCategory, string> = {
    sms: "SMS text messages to real estate sellers",
    note: "CRM notes on contacts and deals",
    task: "follow-up task titles and descriptions",
  };

  const editedExamples = edits
    .filter(e => e.wasEdited === "true")
    .slice(0, 8)
    .map((e, i) => `Edit ${i + 1}:\n  AI Draft: "${e.draftContent}"\n  User Final: "${e.finalContent}"`)
    .join("\n\n");

  const acceptedExamples = edits
    .filter(e => e.wasEdited === "false")
    .slice(0, 5)
    .map((e, i) => `Accepted ${i + 1}: "${e.finalContent}"`)
    .join("\n");

  const editCount = edits.filter(e => e.wasEdited === "true").length;
  const acceptCount = edits.filter(e => e.wasEdited === "false").length;

  const response = await invokeLLM({
    messages: [
      {
        role: "system",
        content: `You analyze a user's editing patterns to build a writing style profile for ${categoryLabels[category]}.

You will see:
1. Examples where the user EDITED the AI's draft (showing what they changed)
2. Examples the user ACCEPTED as-is (showing what they liked)

From these patterns, produce a concise style guide (3-5 bullet points) that captures:
- Tone preferences (formal/casual/direct/warm)
- Length preference (shorter/longer than AI default)
- Specific changes they consistently make (removing exclamation marks, adding property addresses, etc.)
- Formatting habits (abbreviations, emojis, capitalization)
- Any phrases they add or remove

Be specific and actionable. Another AI will use this guide to draft content matching this person's style.
Return ONLY the bullet-point style guide, nothing else.`
      },
      {
        role: "user",
        content: `${editCount} edits and ${acceptCount} accepts:\n\n${editedExamples ? `EDITS (user changed the AI draft):\n${editedExamples}` : "No edits yet."}\n\n${acceptedExamples ? `ACCEPTED AS-IS (user liked these):\n${acceptedExamples}` : "No accepts yet."}`
      }
    ],
  });

  const content = response.choices?.[0]?.message?.content;
  return typeof content === "string" ? content.trim() : "Not enough data to determine style preferences.";
}

// ============ PREFERENCE RETRIEVAL ============

/**
 * Get a user's preference for a specific category.
 * Falls back to team-wide default if user has no personal preference.
 */
export async function getPreference(
  tenantId: number,
  userId: number,
  prefCategory: PrefCategory
) {
  const db = await getDb();
  if (!db) return null;

  // Try user-specific first
  const [userPref] = await db
    .select()
    .from(aiCoachPreferences)
    .where(
      and(
        eq(aiCoachPreferences.tenantId, tenantId),
        eq(aiCoachPreferences.userId, userId),
        eq(aiCoachPreferences.category, prefCategory)
      )
    )
    .limit(1);

  if (userPref) return userPref;

  // Fall back to team-wide default
  const [teamPref] = await db
    .select()
    .from(aiCoachPreferences)
    .where(
      and(
        eq(aiCoachPreferences.tenantId, tenantId),
        isNull(aiCoachPreferences.userId),
        eq(aiCoachPreferences.category, prefCategory)
      )
    )
    .limit(1);

  return teamPref || null;
}

/**
 * Get all preferences for a user (with team fallbacks for missing categories).
 */
export async function getAllPreferences(tenantId: number, userId: number) {
  const db = await getDb();
  if (!db) return [];

  // Get user-specific preferences
  const userPrefs = await db
    .select()
    .from(aiCoachPreferences)
    .where(
      and(
        eq(aiCoachPreferences.tenantId, tenantId),
        eq(aiCoachPreferences.userId, userId)
      )
    );

  // Get team-wide defaults
  const teamPrefs = await db
    .select()
    .from(aiCoachPreferences)
    .where(
      and(
        eq(aiCoachPreferences.tenantId, tenantId),
        isNull(aiCoachPreferences.userId)
      )
    );

  // Merge: user prefs take priority, fill gaps with team prefs
  const userCategories = new Set(userPrefs.map(p => p.category));
  const merged = [
    ...userPrefs,
    ...teamPrefs.filter(tp => !userCategories.has(tp.category)),
  ];

  return merged;
}

/**
 * Build a preference context string to inject into LLM prompts.
 * Returns empty string if no preferences exist.
 */
export async function buildPreferenceContext(
  tenantId: number,
  userId: number,
  relevantCategories?: PrefCategory[]
): Promise<string> {
  const allPrefs = await getAllPreferences(tenantId, userId);
  if (allPrefs.length === 0) return "";

  const filtered = relevantCategories
    ? allPrefs.filter(p => relevantCategories.includes(p.category as PrefCategory))
    : allPrefs;

  if (filtered.length === 0) return "";

  const categoryLabels: Record<string, string> = {
    sms_style: "SMS Writing Style",
    note_style: "Note Writing Style",
    task_style: "Task Creation Style",
  };

  const sections = filtered
    .filter(p => p.sampleCount >= 3)
    .map(p => {
      let section = `${categoryLabels[p.category] || p.category}:\n${p.styleSummary}`;
      if (p.recentExamples) {
        try {
          const examples = JSON.parse(p.recentExamples) as string[];
          const recent = examples.slice(-2);
          if (recent.length > 0) {
            section += `\nRecent examples: ${recent.map(e => `"${e}"`).join(", ")}`;
          }
        } catch { /* ignore parse errors */ }
      }
      const isTeamDefault = p.userId === null;
      if (isTeamDefault) {
        section += "\n(Team default — this user has no personal history yet)";
      }
      return section;
    });

  if (sections.length === 0) return "";

  return `\n\nUSER STYLE PREFERENCES (match this style when drafting content):\n${sections.join("\n\n")}`;
}

/**
 * Get edit statistics for a user (for display purposes).
 */
export async function getEditStats(tenantId: number, userId: number) {
  const db = await getDb();
  if (!db) return { totalEdits: 0, totalAccepts: 0, categories: [] as string[] };

  const stats = await db
    .select({
      category: coachActionEdits.category,
      wasEdited: coachActionEdits.wasEdited,
      count: sql<number>`count(*)`,
    })
    .from(coachActionEdits)
    .where(
      and(
        eq(coachActionEdits.tenantId, tenantId),
        eq(coachActionEdits.userId, userId)
      )
    )
    .groupBy(coachActionEdits.category, coachActionEdits.wasEdited);

  let totalEdits = 0;
  let totalAccepts = 0;
  const categories = new Set<string>();

  for (const row of stats) {
    categories.add(row.category);
    if (row.wasEdited === "true") totalEdits += row.count;
    else totalAccepts += row.count;
  }

  return { totalEdits, totalAccepts, categories: Array.from(categories) };
}
