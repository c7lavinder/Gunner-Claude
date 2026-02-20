/**
 * User Instructions Service
 * 
 * Manages persistent explicit preferences/instructions from users.
 * When a user tells the AI Coach something like "always use sales process pipeline",
 * "reply in bullet points", or "use professional tone", it's detected, stored,
 * and injected into every AI prompt for that user — forever.
 * 
 * Flow:
 * 1. User says "always use sales process pipeline" in AI Coach
 * 2. parseIntent detects it's a preference (not a CRM action)
 * 3. We store it in user_instructions table
 * 4. Every future AI prompt includes the user's stored instructions
 * 5. User can view/manage their instructions in settings
 */

import { getDb } from "./db";
import { userInstructions } from "../drizzle/schema";
import { eq, and, desc } from "drizzle-orm";
import { invokeLLM } from "./_core/llm";

// ============ DETECTION ============

/**
 * Detect if a user message is setting a preference/instruction.
 * Returns the parsed instruction if detected, null otherwise.
 * 
 * Examples that should match:
 * - "always use sales process pipeline"
 * - "for me always use bullet points"
 * - "use professional tone when talking to me"
 * - "default to sales process pipeline unless I say otherwise"
 * - "remember that I prefer short responses"
 * - "from now on, keep notes concise"
 * - "never use emojis in SMS"
 * - "always assign tasks to Daniel unless I say otherwise"
 */
export async function detectInstruction(message: string): Promise<{
  isInstruction: boolean;
  instruction: string;
  category: string;
  confirmation: string;
} | null> {
  const response = await invokeLLM({
    messages: [
      {
        role: "system",
        content: `You detect whether a user message is setting a personal preference or instruction for how the AI should behave going forward.

Preference-setting messages include:
- "Always use X pipeline" → pipeline preference
- "Use bullet points" / "Reply in bullet points" → format preference
- "Use professional tone" / "Be more casual" → tone preference
- "Keep responses short" / "Be more detailed" → format preference
- "Always assign tasks to [person]" → assignment preference
- "Never use emojis" → format preference
- "From now on..." / "Remember that..." / "For me always..." → any preference
- "Default to..." / "Unless I tell you otherwise..." → any preference

NOT preference-setting (these are questions or actions):
- "Move Suzanne to made offer" → CRM action
- "How is Marcus doing?" → coaching question
- "What's my team's average score?" → data question
- "Add a note to John" → CRM action
- "Ah, it moved it to buyer pipeline?" → complaint/observation (NOT a preference)

Return JSON:
{
  "isInstruction": true/false,
  "instruction": "the cleaned-up instruction text (concise, imperative form)",
  "category": "pipeline|tone|format|assignment|general",
  "confirmation": "a friendly confirmation message to show the user"
}

If NOT an instruction, return { "isInstruction": false, "instruction": "", "category": "", "confirmation": "" }`
      },
      { role: "user", content: message }
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "instruction_detection",
        strict: true,
        schema: {
          type: "object",
          properties: {
            isInstruction: { type: "boolean" },
            instruction: { type: "string" },
            category: { type: "string" },
            confirmation: { type: "string" },
          },
          required: ["isInstruction", "instruction", "category", "confirmation"],
          additionalProperties: false,
        },
      },
    },
  });

  const content = response.choices?.[0]?.message?.content;
  if (!content || typeof content !== 'string') return null;

  try {
    const parsed = JSON.parse(content);
    if (parsed.isInstruction) {
      return {
        isInstruction: true,
        instruction: parsed.instruction,
        category: parsed.category || "general",
        confirmation: parsed.confirmation,
      };
    }
  } catch { /* parse error */ }

  return null;
}

// ============ STORAGE ============

/**
 * Save a new instruction for a user.
 * If a similar instruction already exists in the same category, update it.
 */
export async function saveInstruction(
  userId: number,
  instruction: string,
  category: string = "general"
): Promise<{ id: number; isUpdate: boolean }> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Check if there's an existing active instruction in the same category
  // that we should replace (e.g., updating "use sales pipeline" to "use buyer pipeline")
  const existing = await db
    .select()
    .from(userInstructions)
    .where(
      and(
        eq(userInstructions.userId, userId),
        eq(userInstructions.category, category),
        eq(userInstructions.isActive, "true")
      )
    );

  // For pipeline/tone/format — typically only one active instruction per category
  // For "general" — allow multiple
  if (category !== "general" && existing.length > 0) {
    // Update the existing one
    await db.update(userInstructions)
      .set({ instruction, updatedAt: new Date() })
      .where(eq(userInstructions.id, existing[0].id));
    return { id: existing[0].id, isUpdate: true };
  }

  // Insert new
  const [result] = await db.insert(userInstructions).values({
    userId,
    instruction,
    category,
  });
  return { id: result.insertId, isUpdate: false };
}

/**
 * Get all active instructions for a user.
 */
export async function getInstructions(userId: number) {
  const db = await getDb();
  if (!db) return [];

  return db
    .select()
    .from(userInstructions)
    .where(
      and(
        eq(userInstructions.userId, userId),
        eq(userInstructions.isActive, "true")
      )
    )
    .orderBy(desc(userInstructions.updatedAt));
}

/**
 * Delete (deactivate) an instruction.
 */
export async function deleteInstruction(userId: number, instructionId: number) {
  const db = await getDb();
  if (!db) return false;

  const [result] = await db.update(userInstructions)
    .set({ isActive: "false" })
    .where(
      and(
        eq(userInstructions.id, instructionId),
        eq(userInstructions.userId, userId)
      )
    );
  return true;
}

/**
 * Build a context string from all active instructions for injection into AI prompts.
 * Returns empty string if no instructions exist.
 */
export async function buildInstructionContext(userId: number): Promise<string> {
  const instructions = await getInstructions(userId);
  if (instructions.length === 0) return "";

  const lines = instructions.map(i => `- ${i.instruction}`).join("\n");
  return `\nUSER'S PERSONAL INSTRUCTIONS (follow these at all times for this user):\n${lines}\n`;
}

/**
 * Get the default pipeline preference for a user, if set.
 * Returns the pipeline name string or null.
 */
export async function getDefaultPipeline(userId: number): Promise<string | null> {
  const instructions = await getInstructions(userId);
  const pipelineInstruction = instructions.find(i => i.category === "pipeline");
  if (!pipelineInstruction) return null;

  // Extract pipeline name from the instruction text
  // e.g., "Always use Sales Process pipeline" → "Sales Process"
  const match = pipelineInstruction.instruction.match(/(?:use|default to)\s+(.+?)\s*(?:pipeline|$)/i);
  if (match) return match[1].trim();

  // Fallback: return the full instruction text for the LLM to interpret
  return pipelineInstruction.instruction;
}
