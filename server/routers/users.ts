import { z } from "zod";
import { router, protectedProcedure } from "../_core/context";
import { db } from "../_core/db";
import { userVoiceProfiles } from "../../drizzle/schema";
import { eq, and } from "drizzle-orm";

export const usersRouter = router({
  /**
   * Update the current user's voice coaching consent.
   * Creates the voice profile row if it doesn't exist yet.
   */
  updateVoiceConsent: protectedProcedure
    .input(z.object({ consentGiven: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const { userId, tenantId } = ctx.user;

      const [existing] = await db
        .select()
        .from(userVoiceProfiles)
        .where(and(eq(userVoiceProfiles.userId, userId), eq(userVoiceProfiles.tenantId, tenantId)));

      if (existing) {
        await db
          .update(userVoiceProfiles)
          .set({
            consentGiven: input.consentGiven,
            consentDate: input.consentGiven ? new Date() : existing.consentDate,
            updatedAt: new Date(),
          })
          .where(and(eq(userVoiceProfiles.userId, userId), eq(userVoiceProfiles.tenantId, tenantId)));
      } else {
        await db.insert(userVoiceProfiles).values({
          tenantId,
          userId,
          consentGiven: input.consentGiven,
          consentDate: input.consentGiven ? new Date() : undefined,
          totalSamples: 0,
          totalDurationMinutes: "0",
          readyForCloning: false,
        });
      }

      return { success: true };
    }),

  /**
   * Get the current user's voice profile stats.
   */
  getVoiceProfile: protectedProcedure.query(async ({ ctx }) => {
    const { userId, tenantId } = ctx.user;

    const [profile] = await db
      .select()
      .from(userVoiceProfiles)
      .where(and(eq(userVoiceProfiles.userId, userId), eq(userVoiceProfiles.tenantId, tenantId)));

    return profile ?? null;
  }),
});
