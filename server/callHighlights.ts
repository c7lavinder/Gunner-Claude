/**
 * Call Highlights — AI-powered extraction of key moments from call recordings
 * 
 * Analyzes transcripts with Whisper segment timestamps to identify:
 * - Objections handled (and how well)
 * - Appointments set or attempted
 * - Price/offer discussions
 * - Rapport building moments
 * - Red flags or missed opportunities
 * - Closing attempts
 * - Key information gathered (motivation, timeline, condition)
 * 
 * Highlights are stored as JSON on the callGrades row and rendered
 * as clickable chips on the CallDetail page, allowing managers to
 * jump directly to the most important moments in a call.
 */

import { invokeLLM } from "./_core/llm";
import type { TranscriptionSegment } from "./grading";

export interface CallHighlight {
  /** Category of the highlight */
  type: 
    | "objection_handled"
    | "objection_missed"
    | "appointment_set"
    | "appointment_attempted"
    | "price_discussion"
    | "rapport_building"
    | "red_flag"
    | "closing_attempt"
    | "key_info_gathered"
    | "motivation_revealed"
    | "decision_maker"
    | "follow_up_scheduled"
    | "competitor_mention"
    | "strong_moment"
    | "missed_opportunity";
  /** Short human-readable label (e.g., "Handled price objection") */
  label: string;
  /** Timestamp in seconds where this moment occurs in the recording */
  timestampSeconds: number;
  /** Direct quote or paraphrase from the transcript */
  quote: string;
  /** Brief coaching insight about this moment */
  insight: string;
  /** Importance: 1 = nice to know, 2 = important, 3 = critical */
  importance: number;
}

/**
 * Build a segment-indexed transcript for the LLM prompt.
 * Groups segments into ~30-second windows with timestamp markers.
 */
function buildTimestampedTranscript(
  transcript: string,
  segments?: TranscriptionSegment[]
): string {
  if (!segments || segments.length === 0) {
    // No segments available — return plain transcript with a note
    return `[No timestamp segments available — use approximate timestamps based on position in transcript]\n\n${transcript}`;
  }

  // Build a timestamped transcript with markers every ~30 seconds
  const lines: string[] = [];
  let lastMarker = -30; // Force first marker

  for (const seg of segments) {
    // Add timestamp marker every ~30 seconds
    if (seg.start - lastMarker >= 30) {
      const mins = Math.floor(seg.start / 60);
      const secs = Math.floor(seg.start % 60);
      lines.push(`\n[${mins}:${secs.toString().padStart(2, "0")}]`);
      lastMarker = seg.start;
    }
    lines.push(seg.text.trim());
  }

  return lines.join(" ");
}

/**
 * Generate call highlights using LLM analysis of the transcript + segments.
 * 
 * @param transcript - Full call transcript text
 * @param segments - Whisper segments with start/end timestamps
 * @param callType - Type of call (qualification, cold_call, offer, etc.)
 * @param gradeInfo - Optional grade context for richer analysis
 * @returns Array of CallHighlight objects
 */
export async function generateCallHighlights(
  transcript: string,
  segments?: TranscriptionSegment[],
  callType?: string,
  gradeInfo?: {
    overallGrade?: string;
    overallScore?: string;
    strengths?: string[];
    improvements?: string[];
    redFlags?: string[];
  }
): Promise<CallHighlight[]> {
  if (!transcript || transcript.trim().length < 50) {
    return [];
  }

  const timestampedTranscript = buildTimestampedTranscript(transcript, segments);

  // Build grade context if available
  let gradeContext = "";
  if (gradeInfo) {
    gradeContext = `\n\nGRADE CONTEXT:
Grade: ${gradeInfo.overallGrade || "N/A"} (${gradeInfo.overallScore || "N/A"}%)
${gradeInfo.strengths?.length ? `Strengths: ${gradeInfo.strengths.join("; ")}` : ""}
${gradeInfo.improvements?.length ? `Improvements: ${gradeInfo.improvements.join("; ")}` : ""}
${gradeInfo.redFlags?.length ? `Red Flags: ${gradeInfo.redFlags.join("; ")}` : ""}`;
  }

  const callTypeLabel = callType
    ? callType.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())
    : "Sales Call";

  try {
    const response = await invokeLLM({
      messages: [
        {
          role: "system",
          content: `You are an expert real estate wholesaling call analyst. Your job is to identify the KEY MOMENTS in a ${callTypeLabel} that a manager would want to jump to when reviewing the recording.

HIGHLIGHT TYPES (use these exact values):
- "objection_handled" — Rep successfully addressed a seller objection
- "objection_missed" — Seller raised an objection the rep failed to address
- "appointment_set" — An appointment/walkthrough was confirmed
- "appointment_attempted" — Rep tried to set an appointment but didn't close it
- "price_discussion" — Any discussion of price, ARV, repair costs, or offer amounts
- "rapport_building" — Notable moment of connection or trust-building
- "red_flag" — Something concerning (lying, being pushy, losing control)
- "closing_attempt" — Rep attempted to close or move to next step
- "key_info_gathered" — Important property or situation info was extracted
- "motivation_revealed" — Seller's true motivation for selling was uncovered
- "decision_maker" — Discussion about who makes the decision
- "follow_up_scheduled" — A specific follow-up time was agreed upon
- "competitor_mention" — Another buyer/company was mentioned
- "strong_moment" — Exceptionally good sales technique or response
- "missed_opportunity" — Clear opportunity the rep failed to capitalize on

RULES:
1. Return 3-8 highlights per call. Focus on the MOST important moments.
2. For short calls (<5 min), return 2-4 highlights.
3. Each highlight MUST have an accurate timestamp in seconds.
4. The "quote" should be a direct quote or close paraphrase (max 100 chars).
5. The "insight" should be a brief coaching note (max 120 chars).
6. Set importance: 3 = critical (objections, appointments, price), 2 = important, 1 = nice to know.
7. Prioritize moments that are ACTIONABLE for coaching.
8. If timestamp markers like [2:30] appear in the transcript, use those to calculate seconds (2:30 = 150).
9. If no timestamp markers exist, estimate based on position in transcript (e.g., 30% through a 10-min call ≈ 180s).

Return a JSON array of highlights sorted by timestamp.`
        },
        {
          role: "user",
          content: `Analyze this ${callTypeLabel} and extract the key moments:\n\n${timestampedTranscript.substring(0, 12000)}${gradeContext}`
        }
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "call_highlights",
          strict: true,
          schema: {
            type: "object",
            properties: {
              highlights: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    type: {
                      type: "string",
                      enum: [
                        "objection_handled", "objection_missed", "appointment_set",
                        "appointment_attempted", "price_discussion", "rapport_building",
                        "red_flag", "closing_attempt", "key_info_gathered",
                        "motivation_revealed", "decision_maker", "follow_up_scheduled",
                        "competitor_mention", "strong_moment", "missed_opportunity"
                      ]
                    },
                    label: { type: "string", description: "Short label for the highlight (max 50 chars)" },
                    timestampSeconds: { type: "number", description: "Timestamp in seconds" },
                    quote: { type: "string", description: "Direct quote or paraphrase (max 100 chars)" },
                    insight: { type: "string", description: "Brief coaching insight (max 120 chars)" },
                    importance: { type: "number", enum: [1, 2, 3], description: "1=nice to know, 2=important, 3=critical" }
                  },
                  required: ["type", "label", "timestampSeconds", "quote", "insight", "importance"],
                  additionalProperties: false
                }
              }
            },
            required: ["highlights"],
            additionalProperties: false
          }
        }
      }
    });

    const content = response.choices[0]?.message?.content;
    if (!content || typeof content !== "string") {
      console.warn("[CallHighlights] No content in LLM response");
      return [];
    }

    const parsed = JSON.parse(content);
    const highlights: CallHighlight[] = (parsed.highlights || [])
      .filter((h: any) => h.type && h.label && typeof h.timestampSeconds === "number")
      .map((h: any) => ({
        type: h.type,
        label: h.label.substring(0, 50),
        timestampSeconds: Math.max(0, Math.round(h.timestampSeconds)),
        quote: (h.quote || "").substring(0, 100),
        insight: (h.insight || "").substring(0, 120),
        importance: [1, 2, 3].includes(h.importance) ? h.importance : 2,
      }))
      .sort((a: CallHighlight, b: CallHighlight) => a.timestampSeconds - b.timestampSeconds);

    console.log(`[CallHighlights] Generated ${highlights.length} highlights`);
    return highlights;
  } catch (error) {
    console.error("[CallHighlights] Failed to generate highlights:", error);
    return [];
  }
}

/**
 * Generate and store highlights for a call that has already been graded.
 * Updates the callGrades row with the highlights JSON.
 */
export async function generateAndStoreHighlights(
  callId: number,
  transcript: string,
  segments?: TranscriptionSegment[],
  callType?: string,
  gradeInfo?: {
    overallGrade?: string;
    overallScore?: string;
    strengths?: string[];
    improvements?: string[];
    redFlags?: string[];
  }
): Promise<CallHighlight[]> {
  const highlights = await generateCallHighlights(transcript, segments, callType, gradeInfo);

  if (highlights.length === 0) {
    return [];
  }

  // Store highlights on the callGrades row
  try {
    const { getDb } = await import("./db");
    const { callGrades } = await import("../drizzle/schema");
    const { eq } = await import("drizzle-orm");
    const db = await getDb();
    if (!db) {
      console.error("[CallHighlights] No DB connection");
      return highlights;
    }

    await db.update(callGrades)
      .set({ highlights: highlights })
      .where(eq(callGrades.callId, callId));

    console.log(`[CallHighlights] Stored ${highlights.length} highlights for call ${callId}`);
  } catch (error) {
    console.error(`[CallHighlights] Failed to store highlights for call ${callId}:`, error);
  }

  return highlights;
}
