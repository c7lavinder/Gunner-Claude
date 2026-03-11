import { db } from "../_core/db";
import { calls, teamMembers, userVoiceSamples, userVoiceProfiles } from "../../drizzle/schema";
import { eq, and } from "drizzle-orm";

/**
 * Extract a voice sample from a graded call and update the user's voice profile.
 * Only runs if the team member is linked to a user who has given consent.
 *
 * @param callId - The call to extract a sample from
 * @param teamMemberId - The team member who handled the call
 * @param tenantId - Tenant scope
 */
export async function extractVoiceSample(
  callId: number,
  teamMemberId: number,
  tenantId: number
): Promise<void> {
  // Resolve the user ID from the team member record
  const [member] = await db
    .select({ userId: teamMembers.userId })
    .from(teamMembers)
    .where(and(eq(teamMembers.id, teamMemberId), eq(teamMembers.tenantId, tenantId)));

  if (!member?.userId) return; // Team member not linked to a user account

  const userId = member.userId;

  // Check consent via voice profile
  const [profile] = await db
    .select()
    .from(userVoiceProfiles)
    .where(and(eq(userVoiceProfiles.userId, userId), eq(userVoiceProfiles.tenantId, tenantId)));

  if (!profile?.consentGiven) return; // No consent — skip

  // Get the call
  const [call] = await db
    .select({ recordingUrl: calls.recordingUrl, duration: calls.duration })
    .from(calls)
    .where(and(eq(calls.id, callId), eq(calls.tenantId, tenantId)));

  if (!call?.recordingUrl) return; // No recording — nothing to store

  const durationSeconds = call.duration ? String(call.duration) : undefined;

  // Insert the voice sample (full recording, quality=unverified since no diarization yet)
  await db.insert(userVoiceSamples).values({
    tenantId,
    userId,
    callId,
    storageKey: call.recordingUrl,
    durationSeconds,
    quality: "unverified",
  });

  // Upsert voice profile stats
  const prevTotal = profile.totalSamples ?? 0;
  const prevMinutes = parseFloat(profile.totalDurationMinutes ?? "0");
  const addedMinutes = call.duration ? call.duration / 60 : 0;

  const newTotal = prevTotal + 1;
  const newMinutes = prevMinutes + addedMinutes;
  const readyForCloning = newTotal >= 20 && newMinutes >= 60;

  await db
    .update(userVoiceProfiles)
    .set({
      totalSamples: newTotal,
      totalDurationMinutes: newMinutes.toFixed(2),
      readyForCloning,
      updatedAt: new Date(),
    })
    .where(and(eq(userVoiceProfiles.userId, userId), eq(userVoiceProfiles.tenantId, tenantId)));
}
