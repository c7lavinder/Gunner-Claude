import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { parseDocument } from "./documentParser";
import {
  getGamificationSummary,
  getUserBadges,
  getAllBadgesWithProgress,
  getGamificationLeaderboard,
  processCallViewRewards,
  initializeBadges,
  batchAwardXpForCalls,
  batchEvaluateBadges,
} from "./gamification";
import {
  getCalls,
  getCallById,
  getCallsWithGrades,
  getCallGradeByCallId,
  getTeamMembers,
  getTeamMemberById,
  getLeaderboardData,
  getCallStats,
  seedTeamMembers,
  createCall,
  getRecentCalls,
  createTeamMember,
  updateCall,
  // Training materials
  createTrainingMaterial,
  getTrainingMaterials,
  getTrainingMaterialById,
  updateTrainingMaterial,
  deleteTrainingMaterial,
  // AI Feedback
  createAIFeedback,
  getAIFeedback,
  getAIFeedbackById,
  updateAIFeedback,
  // Grading rules
  createGradingRule,
  getGradingRules,
  updateGradingRule,
  deleteGradingRule,
  // Grading context
  getGradingContext,
  // Team training items
  createTeamTrainingItem,
  getTeamTrainingItems,
  getTeamTrainingItemById,
  updateTeamTrainingItem,
  deleteTeamTrainingItem,
  getActiveTrainingItems,
  // Social media
  createBrandAsset,
  getBrandAssets,
  getBrandAssetById,
  updateBrandAsset,
  deleteBrandAsset,
  createSocialPost,
  getSocialPosts,
  getSocialPostById,
  updateSocialPost,
  deleteSocialPost,
  getCalendarPosts,
  createContentIdea,
  getContentIdeas,
  getContentIdeaById,
  updateContentIdea,
  deleteContentIdea,
  // Brand profile
  getBrandProfile,
  upsertBrandProfile,
  // Content generation helpers
  getCallsForContentGeneration,
  getKPIsForContentGeneration,
  getInterestingCallStories,
  // Permission-based queries
  getCallsWithPermissions,
  getViewableTeamMemberIds,
  getTeamMemberByUserId,
  getTeamAssignments,
  assignLeadManagerToAcquisitionManager,
  removeLeadManagerAssignment,
  updateTeamMemberRole,
  linkUserToTeamMember,
  getAllUsers,
  updateUserTeamRole,
  UserPermissionContext,
} from "./db";
import { LEAD_MANAGER_RUBRIC, ACQUISITION_MANAGER_RUBRIC, LEAD_GENERATOR_RUBRIC, FOLLOW_UP_RUBRIC, SELLER_CALLBACK_RUBRIC, ADMIN_CALLBACK_RUBRIC } from "./grading";
import { processCall } from "./grading";
import { invokeLLM } from "./_core/llm";
import { generateTeamInsights, saveGeneratedInsights, clearAiGeneratedInsights } from "./insights";
import { pollForNewCalls, getPollingStatus, startPolling, stopPolling, resyncCallRecording } from "./ghlService";
import { storagePut } from "./storage";
import { runArchivalJob, getArchivalStats, archiveCall } from "./archival";
import { verifyTenantOwnership } from "./tenantOwnership";
import { checkRateLimit, trackUsage } from "./rateLimit";
import { adminRouter } from "./adminRouter";

export const appRouter = router({
  system: systemRouter,
  admin: adminRouter,
  
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
    updateProfilePicture: protectedProcedure
      .input(z.object({ imageBase64: z.string(), mimeType: z.string() }))
      .mutation(async ({ ctx, input }) => {
        const { storagePut } = await import("./storage");
        const { getDb } = await import("./db");
        const { users } = await import("../drizzle/schema");
        const { eq } = await import("drizzle-orm");
        
        // Generate unique filename
        const ext = input.mimeType.split('/')[1] || 'jpg';
        const filename = `profile-pictures/${ctx.user!.id}-${Date.now()}.${ext}`;
        
        // Convert base64 to buffer
        const buffer = Buffer.from(input.imageBase64, 'base64');
        
        // Upload to S3
        const { url } = await storagePut(filename, buffer, input.mimeType);
        
        // Update user record
        const db = await getDb();
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
        await db.update(users).set({ profilePicture: url }).where(eq(users.id, ctx.user!.id));
        
        return { url };
      }),

    changePassword: protectedProcedure
      .input(z.object({
        currentPassword: z.string().min(1, "Current password is required"),
        newPassword: z.string().min(8, "New password must be at least 8 characters"),
      }))
      .mutation(async ({ ctx, input }) => {
        const { getDb } = await import("./db");
        const { users } = await import("../drizzle/schema");
        const { eq } = await import("drizzle-orm");
        const { verifyPassword, hashPassword } = await import("./selfServeAuth");
        
        const db = await getDb();
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
        
        // Get user with password hash
        const [user] = await db.select().from(users).where(eq(users.id, ctx.user!.id)).limit(1);
        if (!user) throw new TRPCError({ code: 'NOT_FOUND', message: 'User not found' });
        
        // Only email/password users can change password
        if (user.loginMethod !== 'email_password') {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Password change is only available for email/password accounts. You signed in with Google.' });
        }
        
        if (!user.passwordHash) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'No password set for this account' });
        }
        
        // Verify current password
        const isValid = await verifyPassword(input.currentPassword, user.passwordHash);
        if (!isValid) {
          throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Current password is incorrect' });
        }
        
        // Hash and save new password
        const newHash = await hashPassword(input.newPassword);
        await db.update(users).set({ passwordHash: newHash }).where(eq(users.id, ctx.user!.id));
        
        return { success: true };
      }),

    updateProfile: protectedProcedure
      .input(z.object({
        name: z.string().min(1, "Name is required").optional(),
        email: z.string().email("Invalid email").optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const { getDb } = await import("./db");
        const { users } = await import("../drizzle/schema");
        const { eq } = await import("drizzle-orm");
        
        const db = await getDb();
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
        
        const updates: Record<string, string> = {};
        if (input.name) updates.name = input.name;
        if (input.email) {
          // Check if email is already taken by another user
          const [existing] = await db.select().from(users).where(eq(users.email, input.email)).limit(1);
          if (existing && existing.id !== ctx.user!.id) {
            throw new TRPCError({ code: 'CONFLICT', message: 'Email is already in use by another account' });
          }
          updates.email = input.email;
        }
        
        if (Object.keys(updates).length > 0) {
          await db.update(users).set(updates).where(eq(users.id, ctx.user!.id));
        }
        
        return { success: true };
      }),

    getAccountInfo: protectedProcedure
      .query(async ({ ctx }) => {
        const { getDb } = await import("./db");
        const { users } = await import("../drizzle/schema");
        const { eq } = await import("drizzle-orm");
        
        const db = await getDb();
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
        
        const [user] = await db.select().from(users).where(eq(users.id, ctx.user!.id)).limit(1);
        if (!user) throw new TRPCError({ code: 'NOT_FOUND', message: 'User not found' });
        
        return {
          name: user.name,
          email: user.email,
          loginMethod: user.loginMethod,
          emailVerified: user.emailVerified === 'true',
          profilePicture: user.profilePicture,
          createdAt: user.createdAt,
        };
      }),
  }),

  // ============ TEAM MEMBERS ============
  team: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      // Pass tenant ID for multi-tenant filtering
      return await getTeamMembers(ctx.user?.tenantId || undefined);
    }),

    getById: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        return await getTeamMemberById(input.id);
      }),

    create: protectedProcedure
      .input(z.object({
        name: z.string(),
        teamRole: z.enum(["admin", "lead_manager", "acquisition_manager", "lead_generator"]),
        ghlUserId: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        // Check plan limits before adding team member
        if (ctx.user?.tenantId) {
          const { canAddUser } = await import("./planLimits");
          const limitCheck = await canAddUser(ctx.user.tenantId);
          if (!limitCheck.allowed) {
            throw new TRPCError({
              code: 'FORBIDDEN',
              message: limitCheck.reason || 'Team member limit reached. Please upgrade your plan.',
            });
          }
        }
        // Include tenantId when creating new team members
        return await createTeamMember({
          name: input.name,
          teamRole: input.teamRole,
          ghlUserId: input.ghlUserId,
          tenantId: ctx.user!.tenantId!,
        });
      }),

    seed: protectedProcedure.mutation(async () => {
      await seedTeamMembers();
      return { success: true };
    }),

    // Get current user's team member profile
    myProfile: protectedProcedure.query(async ({ ctx }) => {
      if (!ctx.user?.id) return null;
      return await getTeamMemberByUserId(ctx.user.id);
    }),

    // Admin: Get all users for management
    allUsers: protectedProcedure.query(async ({ ctx }) => {
      if (ctx.user?.teamRole !== 'admin') {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin access required' });
      }
      // Filter by tenant to ensure tenant isolation
      return await getAllUsers(ctx.user?.tenantId ?? undefined);
    }),

    // Admin: Get team assignments
    getAssignments: protectedProcedure.query(async ({ ctx }) => {
      if (ctx.user?.teamRole !== 'admin') {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin access required' });
      }
      // Filter by tenant to ensure tenant isolation
      return await getTeamAssignments(ctx.user?.tenantId ?? undefined);
    }),

    // Admin: Update team member role
    updateRole: protectedProcedure
      .input(z.object({
        teamMemberId: z.number(),
        teamRole: z.enum(["admin", "lead_manager", "acquisition_manager", "lead_generator"]),
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user?.teamRole !== 'admin') {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin access required' });
        }
        await updateTeamMemberRole(input.teamMemberId, input.teamRole);
        return { success: true };
      }),

    // Admin: Link user account to team member
    linkUser: protectedProcedure
      .input(z.object({
        userId: z.number(),
        teamMemberId: z.number(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user?.teamRole !== 'admin') {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin access required' });
        }
        await linkUserToTeamMember(input.userId, input.teamMemberId);
        return { success: true };
      }),

    // Admin: Assign Lead Manager to Acquisition Manager
    assignToManager: protectedProcedure
      .input(z.object({
        leadManagerId: z.number(),
        acquisitionManagerId: z.number(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user?.teamRole !== 'admin') {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin access required' });
        }
        await assignLeadManagerToAcquisitionManager(input.leadManagerId, input.acquisitionManagerId, ctx.user?.tenantId ?? undefined);
        return { success: true };
      }),

    // Admin: Remove Lead Manager assignment
    removeAssignment: protectedProcedure
      .input(z.object({ leadManagerId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user?.teamRole !== 'admin') {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin access required' });
        }
        await removeLeadManagerAssignment(input.leadManagerId);
        return { success: true };
      }),

    // Admin: Update user's team role
    updateUserRole: protectedProcedure
      .input(z.object({
        userId: z.number(),
        teamRole: z.enum(["admin", "lead_manager", "acquisition_manager", "lead_generator"]),
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user?.teamRole !== 'admin') {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin access required' });
        }
        await updateUserTeamRole(input.userId, input.teamRole);
        return { success: true };
      }),
  }),

  // ============ CALLS ============
  calls: router({
    list: protectedProcedure
      .input(z.object({
        teamMemberId: z.number().optional(),
        status: z.string().optional(),
        limit: z.number().optional(),
        offset: z.number().optional(),
      }).optional())
      .query(async ({ ctx, input }) => {
        // Get user's permission context
        const teamMember = ctx.user?.id ? await getTeamMemberByUserId(ctx.user.id) : null;
        const rawRole = teamMember?.teamRole || ctx.user?.teamRole || ctx.user?.role;
        const normalizedRole = (rawRole === 'super_admin' || rawRole === 'admin') ? 'admin' : rawRole;
        const permissionContext: UserPermissionContext = {
          teamMemberId: teamMember?.id,
          teamRole: (normalizedRole as 'admin' | 'lead_manager' | 'acquisition_manager' | 'lead_generator') || 'lead_manager',
          userId: ctx.user?.id,
          tenantId: ctx.user?.tenantId ?? undefined, // Multi-tenant isolation
        };
        
        // Use permission-based query
        return await getCallsWithPermissions(permissionContext, {
          status: input?.status,
          limit: input?.limit,
          offset: input?.offset,
        });
      }),

    recent: protectedProcedure
      .input(z.object({ limit: z.number().optional() }).optional())
      .query(async ({ ctx, input }) => {
        // Get user's permission context
        const teamMember = ctx.user?.id ? await getTeamMemberByUserId(ctx.user.id) : null;
        const rawRole = teamMember?.teamRole || ctx.user?.teamRole || ctx.user?.role;
        const normalizedRole = (rawRole === 'super_admin' || rawRole === 'admin') ? 'admin' : rawRole;
        const permissionContext: UserPermissionContext = {
          teamMemberId: teamMember?.id,
          teamRole: (normalizedRole as 'admin' | 'lead_manager' | 'acquisition_manager' | 'lead_generator') || 'lead_manager',
          userId: ctx.user?.id,
          tenantId: ctx.user?.tenantId ?? undefined, // Multi-tenant isolation
        };
        
        return await getCallsWithPermissions(permissionContext, {
          limit: input?.limit || 20,
        });
      }),

    getById: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ ctx, input }) => {
        const call = await getCallById(input.id);
        if (!call) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Call not found" });
        }
        // CRITICAL: Verify tenant ownership for multi-tenant isolation
        if (call.tenantId && ctx.user?.tenantId && call.tenantId !== ctx.user.tenantId) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Call not found" });
        }
        return call;
      }),

    withGrades: protectedProcedure
      .input(z.object({
        teamMemberId: z.number().optional(),
        limit: z.number().optional(),
        offset: z.number().optional(),
        startDate: z.string().optional(),
        endDate: z.string().optional(),
        callTypes: z.array(z.string()).optional(),
        outcomes: z.array(z.string()).optional(),
        statuses: z.array(z.string()).optional(),
        directions: z.array(z.string()).optional(),
        scoreRanges: z.array(z.string()).optional(),
        teamMembers: z.array(z.string()).optional(),
      }).optional())
      .query(async ({ ctx, input }) => {
        // Get the current user's team member record for permission scoping
        const teamMember = ctx.user?.id ? await getTeamMemberByUserId(ctx.user.id) : null;
        // Normalize role: super_admin and admin users should both map to 'admin' for permission checks
        const rawRole = teamMember?.teamRole || ctx.user?.teamRole || ctx.user?.role;
        const normalizedRole = (rawRole === 'super_admin' || rawRole === 'admin') ? 'admin' : rawRole;
        const permissionContext = {
          teamRole: normalizedRole as 'admin' | 'lead_manager' | 'acquisition_manager' | 'lead_generator' | undefined,
          teamMemberId: teamMember?.id,
          tenantId: ctx.user?.tenantId ?? undefined,
        };
        
        // Get allowed team member IDs based on role
        const allowedTeamMemberIds = await getViewableTeamMemberIds(permissionContext);
        
        return await getCallsWithGrades({ 
          ...input, 
          tenantId: ctx.user?.tenantId || undefined,
          allowedTeamMemberIds,
        });
      }),

    getGrade: protectedProcedure
      .input(z.object({ callId: z.number() }))
      .query(async ({ input }) => {
        return await getCallGradeByCallId(input.callId);
      }),

    // Manual call creation for testing
    create: protectedProcedure
      .input(z.object({
        contactName: z.string().optional(),
        contactPhone: z.string().optional(),
        propertyAddress: z.string().optional(),
        recordingUrl: z.string(),
        duration: z.number().optional(),
        teamMemberId: z.number(),
        teamMemberName: z.string().optional(),
        callType: z.enum(["cold_call", "qualification", "follow_up", "offer", "seller_callback", "admin_callback"]).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const call = await createCall({
          contactName: input.contactName,
          contactPhone: input.contactPhone,
          propertyAddress: input.propertyAddress,
          recordingUrl: input.recordingUrl,
          duration: input.duration,
          teamMemberId: input.teamMemberId,
          teamMemberName: input.teamMemberName,
          callType: input.callType || "qualification",
          status: "pending",
          callTimestamp: new Date(),
          tenantId: ctx.user.tenantId!,
        });

        if (call) {
          // Process the call asynchronously
          processCall(call.id).catch(err => {
            console.error("[Calls] Error processing call:", err);
          });
        }

        return call;
      }),

    // Reprocess a failed call
    reprocess: protectedProcedure
      .input(z.object({ callId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        // Only admins can reprocess calls
        if (ctx.user?.teamRole !== 'admin' && ctx.user?.role !== 'admin' && ctx.user?.role !== 'super_admin') {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin access required' });
        }
        const call = await getCallById(input.callId);
        if (!call) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Call not found" });
        }

        await updateCall(input.callId, { status: "pending" });
        processCall(input.callId).catch(err => {
          console.error("[Calls] Error reprocessing call:", err);
        });

        return { success: true };
      }),

    // Reset stuck calls (transcribing/grading for more than 1 hour)
    resetStuck: protectedProcedure
      .mutation(async ({ ctx }) => {
        // Only admins can reset stuck calls
        if (ctx.user?.teamRole !== 'admin') {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin access required' });
        }

        const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
        
        // Get all calls for this tenant and filter for stuck ones
        const allCalls = await getCalls({ tenantId: ctx.user?.tenantId ?? undefined });
        const stuckCalls = allCalls.filter(call => 
          (call.status === 'transcribing' || call.status === 'grading' || call.status === 'classifying') &&
          call.updatedAt && new Date(call.updatedAt) < oneHourAgo
        );

        let resetCount = 0;
        for (const call of stuckCalls) {
          await updateCall(call.id, { 
            status: 'pending',
            classificationReason: 'Reset from stuck state - will retry processing'
          });
          // Trigger reprocessing
          processCall(call.id).catch(err => {
            console.error(`[ResetStuck] Error reprocessing call ${call.id}:`, err);
          });
          resetCount++;
        }

        console.log(`[ResetStuck] Reset ${resetCount} stuck calls`);
        return { success: true, resetCount };
      }),

    // Manual call upload with audio file
    uploadManual: protectedProcedure
      .input(z.object({
        audioData: z.string(), // Base64 encoded audio
        audioType: z.string(), // MIME type
        fileName: z.string(),
        contactName: z.string().optional(),
        contactPhone: z.string().optional(),
        propertyAddress: z.string().optional(),
        duration: z.number().optional(),
        callDate: z.string().optional(), // ISO date string
      }))
      .mutation(async ({ ctx, input }) => {
        try {
          // Upload audio to S3
          const buffer = Buffer.from(input.audioData, "base64");
          const timestamp = Date.now();
          const randomSuffix = Math.random().toString(36).substring(7);
          const fileKey = `calls/manual-${timestamp}-${randomSuffix}-${input.fileName}`;
          
          const { url: recordingUrl } = await storagePut(fileKey, buffer, input.audioType);
          console.log(`[ManualUpload] Uploaded audio to: ${recordingUrl}`);

          // Get team member info from logged-in user
          const teamMember = await getTeamMemberByUserId(ctx.user.id);
          if (!teamMember) {
            throw new TRPCError({ code: "NOT_FOUND", message: "Team member not found for this user" });
          }

          // Create call record
          const call = await createCall({
            contactName: input.contactName,
            contactPhone: input.contactPhone,
            propertyAddress: input.propertyAddress,
            recordingUrl,
            duration: input.duration,
            teamMemberId: teamMember.id,
            teamMemberName: teamMember.name,
            callType: teamMember.teamRole === "acquisition_manager" ? "offer" : teamMember.teamRole === "lead_generator" ? "cold_call" : "qualification",
            status: "pending",
            callTimestamp: input.callDate ? new Date(input.callDate) : new Date(),
            tenantId: ctx.user.tenantId!,
          });

          if (call) {
            // Process the call asynchronously
            processCall(call.id).catch(err => {
              console.error("[ManualUpload] Error processing call:", err);
            });
          }

          return { success: true, callId: call?.id };
        } catch (error) {
          console.error("[ManualUpload] Error:", error);
          throw new TRPCError({ 
            code: "INTERNAL_SERVER_ERROR", 
            message: error instanceof Error ? error.message : "Failed to upload call" 
          });
        }
      }),

    // Reclassify a call (change classification manually)
    reclassify: protectedProcedure
      .input(z.object({
        callId: z.number(),
        classification: z.enum(["conversation", "admin_call", "voicemail", "no_answer", "callback_request", "wrong_number"]),
        reason: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        // Only admins can reclassify calls
        if (ctx.user?.teamRole !== 'admin' && ctx.user?.role !== 'admin' && ctx.user?.role !== 'super_admin') {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin access required' });
        }
        const call = await getCallById(input.callId);
        if (!call) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Call not found" });
        }

        // Determine new status based on classification
        const shouldGrade = input.classification === "conversation" || input.classification === "admin_call";
        const newStatus = shouldGrade ? "completed" : "skipped";

        let classificationReason = input.reason || `Manually reclassified to ${input.classification.replace(/_/g, " ")}`;
        
        // For admin calls, generate a summary if we have a transcript
        if (input.classification === "admin_call" && call.transcript && !input.reason) {
          try {
            const { invokeLLM } = await import("./_core/llm");
            const response = await invokeLLM({
              messages: [
                {
                  role: "system",
                  content: "You are summarizing a real estate administrative call. Provide a brief 1-2 sentence summary of what the call was about. Focus on the main purpose: document signing, technical help, scheduling, follow-up, etc.",
                },
                {
                  role: "user",
                  content: `Summarize this call:\n\n${call.transcript.substring(0, 3000)}`,
                },
              ],
            });
            const summary = response.choices[0]?.message?.content;
            if (summary && typeof summary === 'string') {
              classificationReason = summary.trim();
            }
          } catch (err) {
            console.error("[Reclassify] Error generating summary:", err);
          }
        }

        await updateCall(input.callId, {
          classification: input.classification,
          classificationReason,
          status: newStatus,
        });

        // If reclassified to conversation or admin_call and wasn't graded before, trigger grading
        if (shouldGrade && (call.status === "skipped" || call.status === "completed")) {
          processCall(input.callId).catch(err => {
            console.error("[Reclassify] Error processing call:", err);
          });
        }

        return { success: true, newStatus, classification: input.classification };
      }),

    // Update call type manually
    updateCallType: protectedProcedure
      .input(z.object({
        callId: z.number(),
        callType: z.enum(["cold_call", "qualification", "follow_up", "offer", "seller_callback", "admin_callback"]),
        regrade: z.boolean().optional(), // Whether to re-grade with the new rubric
      }))
      .mutation(async ({ input }) => {
        const call = await getCallById(input.callId);
        if (!call) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Call not found" });
        }

        await updateCall(input.callId, {
          callType: input.callType,
          callTypeSource: "manual",
        });

        // Optionally re-grade with the correct rubric
        if (input.regrade && call.status === "completed" && call.transcript) {
          // Reset status and reprocess
          await updateCall(input.callId, { status: "pending" });
          processCall(input.callId).catch(err => {
            console.error(`[UpdateCallType] Error reprocessing call ${input.callId}:`, err);
          });
        }

        return { success: true, callType: input.callType };
      }),

    // Update call outcome manually
    updateCallOutcome: protectedProcedure
      .input(z.object({
        callId: z.number(),
        callOutcome: z.enum(["none", "appointment_set", "offer_made", "callback_scheduled", "interested", "left_vm", "no_answer", "not_interested", "dead"]),
      }))
      .mutation(async ({ input }) => {
        const call = await getCallById(input.callId);
        if (!call) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Call not found" });
        }

        await updateCall(input.callId, {
          callOutcome: input.callOutcome,
        });

        return { success: true, callOutcome: input.callOutcome };
      }),

    // Manual BatchDialer sync
    syncBatchDialer: protectedProcedure.mutation(async ({ ctx }) => {
      // Only admin can trigger manual sync
      if (ctx.user?.teamRole !== 'admin') {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin access required' });
      }
      
      const { syncBatchDialerCalls } = await import("./batchDialerSync");
      const stats = await syncBatchDialerCalls();
      return stats;
    }),
  }),

  // ============ GHL SYNC ============
  ghlSync: router({
    // Get current sync status
    status: protectedProcedure.query(async () => {
      return getPollingStatus();
    }),

    // Manually trigger a sync
    syncNow: protectedProcedure.mutation(async () => {
      const result = await pollForNewCalls();
      return result;
    }),

    // Start automatic polling
    startAutoSync: protectedProcedure
      .input(z.object({ intervalMinutes: z.number().min(1).max(60).default(5) }))
      .mutation(async ({ input }) => {
        startPolling(input.intervalMinutes);
        return { success: true, message: `Auto-sync started with ${input.intervalMinutes} minute interval` };
      }),

    // Stop automatic polling
    stopAutoSync: protectedProcedure.mutation(async () => {
      stopPolling();
      return { success: true, message: "Auto-sync stopped" };
    }),

    // Re-sync a call's recording from GHL
    resyncRecording: protectedProcedure
      .input(z.object({ callId: z.number() }))
      .mutation(async ({ input }) => {
        return await resyncCallRecording(input.callId);
      }),
  }),

  // ============ SYNC STATUS ============
  sync: router({
    status: protectedProcedure.query(async () => {
      const { getPollingStatus } = await import("./ghlService");
      const status = getPollingStatus();
      return {
        lastSyncedAt: status.lastPollTime?.toISOString() || null,
        isPolling: status.isPolling,
        intervalMinutes: status.intervalMinutes,
      };
    }),
  }),

  // ============ LEADERBOARD ============
  leaderboard: router({
    get: protectedProcedure
      .input(z.object({
        dateRange: z.enum(["today", "week", "month", "ytd", "all"]).optional(),
      }).optional())
      .query(async ({ ctx, input }) => {
        // Pass tenant ID and date range for consistent filtering with analytics
        return await getLeaderboardData(ctx.user?.tenantId || undefined, input?.dateRange);
      }),
  }),

  // ============ ANALYTICS ============
  analytics: router({
    stats: protectedProcedure
      .input(z.object({
        dateRange: z.enum(["today", "week", "month", "ytd", "all"]).optional(),
      }).optional())
      .query(async ({ ctx, input }) => {
        // Get user's permission context for filtering
        const teamMember = ctx.user?.id ? await getTeamMemberByUserId(ctx.user.id) : null;
        const rawRole = teamMember?.teamRole || ctx.user?.teamRole || ctx.user?.role;
        const normalizedRole = (rawRole === 'super_admin' || rawRole === 'admin') ? 'admin' : rawRole;
        
        const permissionContext: UserPermissionContext = {
          teamMemberId: teamMember?.id,
          teamRole: (normalizedRole as 'admin' | 'lead_manager' | 'acquisition_manager' | 'lead_generator') || 'lead_manager',
          userId: ctx.user?.id,
          tenantId: ctx.user?.tenantId ?? undefined, // Multi-tenant isolation
        };
        
        // Get viewable team member IDs based on permissions
        const viewableIds = await getViewableTeamMemberIds(permissionContext);
        
        // Pass viewable IDs and tenant ID to getCallStats for filtering
        return await getCallStats({
          ...input,
          viewableTeamMemberIds: viewableIds,
          tenantId: ctx.user?.tenantId || undefined,
        });
      }),
  }),

  // ============ ARCHIVAL ============
  archival: router({
    // Get archival statistics
    stats: protectedProcedure.query(async () => {
      return await getArchivalStats();
    }),

    // Run archival job manually
    runJob: protectedProcedure.mutation(async () => {
      console.log("[Archival] Manual archival job triggered");
      const result = await runArchivalJob();
      return result;
    }),

    // Archive a specific call
    archiveCall: protectedProcedure
      .input(z.object({ callId: z.number() }))
      .mutation(async ({ input }) => {
        const success = await archiveCall(input.callId);
        return { success };
      }),
  }),

  // ============ TRAINING MATERIALS ============
  training: router({
    list: protectedProcedure
      .input(z.object({
        category: z.string().optional(),
        applicableTo: z.string().optional(),
      }).optional())
      .query(async ({ ctx, input }) => {
        // Pass tenant ID for multi-tenant filtering
        return await getTrainingMaterials({
          ...input,
          tenantId: ctx.user?.tenantId || undefined,
        });
      }),

    getById: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        const material = await getTrainingMaterialById(input.id);
        if (!material) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Training material not found" });
        }
        return material;
      }),

    create: protectedProcedure
      .input(z.object({
        title: z.string(),
        description: z.string().optional(),
        content: z.string().optional(),
        fileName: z.string().optional(),
        fileUrl: z.string().optional(),
        fileType: z.string().optional(),
        fileData: z.string().optional(), // Base64 encoded file data for PDF/DOCX
        category: z.enum(["script", "objection_handling", "methodology", "best_practices", "examples", "other"]).optional(),
        applicableTo: z.enum(["all", "lead_manager", "acquisition_manager", "lead_generator"]).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        let extractedContent = input.content;
        
        // If file data is provided, parse the document to extract text
        if (input.fileData && input.fileType) {
          try {
            const buffer = Buffer.from(input.fileData, "base64");
            extractedContent = await parseDocument(buffer, input.fileType, input.fileName);
            console.log(`[Training] Extracted ${extractedContent.length} characters from ${input.fileName}`);
          } catch (error) {
            console.error("[Training] Error parsing document:", error);
            throw new TRPCError({ 
              code: "BAD_REQUEST", 
              message: `Failed to parse document: ${error instanceof Error ? error.message : "Unknown error"}` 
            });
          }
        }
        
        // Include tenantId when creating new training materials
        return await createTrainingMaterial({
          title: input.title,
          description: input.description,
          content: extractedContent,
          fileName: input.fileName,
          fileUrl: input.fileUrl,
          fileType: input.fileType,
          category: input.category || "other",
          applicableTo: input.applicableTo || "all",
          tenantId: ctx.user.tenantId!,
        });
      }),

    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        title: z.string().optional(),
        description: z.string().optional(),
        content: z.string().optional(),
        category: z.enum(["script", "objection_handling", "methodology", "best_practices", "examples", "other"]).optional(),
        applicableTo: z.enum(["all", "lead_manager", "acquisition_manager", "lead_generator"]).optional(),
        isActive: z.enum(["true", "false"]).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        // CRITICAL: Verify tenant ownership before updating
        await verifyTenantOwnership("trainingMaterial", input.id, ctx.user?.tenantId);
        const { id, ...updates } = input;
        await updateTrainingMaterial(id, updates);
        return { success: true };
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        // CRITICAL: Verify tenant ownership before deleting
        await verifyTenantOwnership("trainingMaterial", input.id, ctx.user?.tenantId);
        await deleteTrainingMaterial(input.id);
        return { success: true };
      }),
  }),

  // ============ AI FEEDBACK ============
  feedback: router({
    list: protectedProcedure
      .input(z.object({
        callId: z.number().optional(),
        status: z.string().optional(),
        limit: z.number().optional(),
      }).optional())
      .query(async ({ ctx, input }) => {
        // CRITICAL: Include tenantId for multi-tenant isolation
        return await getAIFeedback({
          ...input,
          tenantId: ctx.user?.tenantId || undefined,
        });
      }),

    getById: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        const feedback = await getAIFeedbackById(input.id);
        if (!feedback) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Feedback not found" });
        }
        return feedback;
      }),

    create: protectedProcedure
      .input(z.object({
        callId: z.number(),
        callGradeId: z.number().optional(),
        feedbackType: z.enum([
          "score_too_high",
          "score_too_low",
          "wrong_criteria",
          "missed_issue",
          "incorrect_feedback",
          "general_correction",
          "praise"
        ]),
        criteriaName: z.string().optional(),
        originalScore: z.number().optional(),
        originalGrade: z.enum(["A", "B", "C", "D", "F"]).optional(),
        suggestedScore: z.number().optional(),
        suggestedGrade: z.enum(["A", "B", "C", "D", "F"]).optional(),
        explanation: z.string(),
        correctBehavior: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        return await createAIFeedback({
          callId: input.callId,
          callGradeId: input.callGradeId,
          userId: ctx.user?.id,
          feedbackType: input.feedbackType,
          criteriaName: input.criteriaName,
          originalScore: input.originalScore?.toString(),
          originalGrade: input.originalGrade,
          suggestedScore: input.suggestedScore?.toString(),
          suggestedGrade: input.suggestedGrade,
          explanation: input.explanation,
          correctBehavior: input.correctBehavior,
          status: "pending",
          tenantId: ctx.user.tenantId!,
        });
      }),

    updateStatus: protectedProcedure
      .input(z.object({
        id: z.number(),
        status: z.enum(["pending", "reviewed", "incorporated", "dismissed"]),
      }))
      .mutation(async ({ ctx, input }) => {
        // CRITICAL: Verify tenant ownership before updating
        await verifyTenantOwnership("aiFeedback", input.id, ctx.user?.tenantId);
        await updateAIFeedback(input.id, { status: input.status });
        return { success: true };
      }),
  }),

  // ============ GRADING RULES ============
  rules: router({
    list: protectedProcedure
      .input(z.object({
        applicableTo: z.string().optional(),
      }).optional())
      .query(async ({ ctx, input }) => {
        // CRITICAL: Include tenantId for multi-tenant isolation
        return await getGradingRules({
          ...input,
          tenantId: ctx.user?.tenantId || undefined,
        });
      }),

    create: protectedProcedure
      .input(z.object({
        title: z.string(),
        description: z.string().optional(),
        ruleText: z.string(),
        priority: z.number().optional(),
        applicableTo: z.enum(["all", "lead_manager", "acquisition_manager", "lead_generator"]).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        // CRITICAL: Include tenantId for multi-tenant isolation
        return await createGradingRule({
          title: input.title,
          description: input.description,
          ruleText: input.ruleText,
          priority: input.priority || 0,
          applicableTo: input.applicableTo || "all",
          tenantId: ctx.user.tenantId!,
        });
      }),

    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        title: z.string().optional(),
        description: z.string().optional(),
        ruleText: z.string().optional(),
        priority: z.number().optional(),
        applicableTo: z.enum(["all", "lead_manager", "acquisition_manager", "lead_generator"]).optional(),
        isActive: z.enum(["true", "false"]).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        // CRITICAL: Verify tenant ownership before updating
        await verifyTenantOwnership("gradingRule", input.id, ctx.user?.tenantId);
        const { id, ...updates } = input;
        await updateGradingRule(id, updates);
        return { success: true };
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        // CRITICAL: Verify tenant ownership before deleting
        await verifyTenantOwnership("gradingRule", input.id, ctx.user?.tenantId);
        await deleteGradingRule(input.id);
        return { success: true };
      }),
  }),

  // ============ AI COACH ============
  coach: router({
    askQuestion: protectedProcedure
      .input(z.object({ question: z.string() }))
      .mutation(async ({ ctx, input }) => {
        // Rate limit AI operations
        checkRateLimit(ctx.user?.tenantId, "ai");
        trackUsage(ctx.user?.tenantId, "ai_chat");
        
        // Get training materials and recent successful calls for context (filtered by tenant)
        const trainingMaterials = await getTrainingMaterials({ tenantId: ctx.user?.tenantId || undefined });
        const recentCallsResult = await getCallsWithGrades({ limit: 20, tenantId: ctx.user?.tenantId || undefined });
        const recentCalls = recentCallsResult.items;
        
        // Filter for high-scoring calls to use as examples
        const successfulCalls = recentCalls
          .filter(c => c.grade && parseFloat(c.grade.overallScore || "0") >= 80)
          .slice(0, 5);

        // Build context from training materials
        const trainingContext = trainingMaterials
          .map(m => `### ${m.title}\n${m.content || ""}`)
          .join("\n\n");

        // Build context from successful calls
        const callExamples = successfulCalls
          .map(c => {
            const grade = c.grade;
            return `### Call with ${c.contactName || "Unknown"} (Score: ${grade?.overallScore}%)\nSummary: ${grade?.summary || "N/A"}\nStrengths: ${JSON.stringify(grade?.strengths || [])}\nTranscript excerpt: ${c.transcript?.substring(0, 500) || "N/A"}...`;
          })
          .join("\n\n");

        // Get user's coaching tone preferences
        let coachingPrefs = "";
        try {
          const { buildPreferenceContext } = await import("./coachPreferences");
          coachingPrefs = await buildPreferenceContext(
            ctx.user?.tenantId || 0,
            ctx.user!.id
          );
        } catch { /* preferences are optional */ }

        const systemPrompt = `You are a supportive sales coach for a real estate wholesaling team.

Training context:
${trainingContext.substring(0, 2000)}

${successfulCalls.length > 0 ? `High-scoring call examples available.` : ""}${coachingPrefs ? `\n${coachingPrefs}` : ""}

CRITICAL - YOUR RESPONSE MUST BE:
1. EXACTLY 2-4 sentences total (NO MORE)
2. Warm and encouraging tone
3. One specific, actionable tip

DO NOT:
- Write long explanations
- Include full scripts (just mention the key phrase)
- Use bullet points or lists
- Exceed 4 sentences under any circumstances

Format: Start with brief encouragement, then give your one tip in 1-2 sentences.`;

        const response = await invokeLLM({
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: input.question },
          ],
        });

        const messageContent = response.choices?.[0]?.message?.content;
        const answer = typeof messageContent === "string" 
          ? messageContent 
          : "I apologize, I couldn't generate a response. Please try again.";
        
        return { answer };
      }),
  }),

  // ============ MEETING FACILITATOR ============
  meeting: router({
    // Start a meeting session with agenda context
    startSession: protectedProcedure
      .input(z.object({
        agendaItems: z.array(z.object({
          id: z.number(),
          title: z.string(),
          description: z.string().optional(),
        })),
      }))
      .mutation(async ({ ctx, input }) => {
        // Get training materials for context (filtered by tenant)
        const trainingMaterials = await getTrainingMaterials({ tenantId: ctx.user?.tenantId || undefined });
        const trainingContext = trainingMaterials
          .map(m => `${m.title}: ${m.content?.substring(0, 500) || ""}`)
          .join("\n");

        // Get recent calls for examples (filtered by tenant)
        const recentCallsResult = await getCallsWithGrades({ limit: 30, tenantId: ctx.user?.tenantId || undefined });
        const recentCalls = recentCallsResult.items;
        const goodCalls = recentCalls.filter(c => c.grade && parseFloat(c.grade.overallScore || "0") >= 75).slice(0, 5);
        const badCalls = recentCalls.filter(c => c.grade && parseFloat(c.grade.overallScore || "0") < 60).slice(0, 5);

        return {
          sessionId: Date.now().toString(),
          agendaItems: input.agendaItems,
          context: {
            trainingMaterialCount: trainingMaterials.length,
            goodCallExamples: goodCalls.length,
            badCallExamples: badCalls.length,
          },
        };
      }),

    // Chat with the meeting facilitator
    chat: protectedProcedure
      .input(z.object({
        message: z.string(),
        mode: z.enum(["facilitate", "roleplay", "example", "qa"]),
        currentAgendaItem: z.object({
          id: z.number(),
          title: z.string(),
          description: z.string().optional(),
        }).optional(),
        roleplayContext: z.object({
          scenario: z.string().optional(),
          sellerPersonality: z.string().optional(),
        }).optional(),
        conversationHistory: z.array(z.object({
          role: z.enum(["user", "assistant"]),
          content: z.string(),
        })).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        // Rate limit AI operations
        checkRateLimit(ctx.user?.tenantId, "ai");
        trackUsage(ctx.user?.tenantId, "ai_chat");
        
        // Get training materials (filtered by tenant)
        const trainingMaterials = await getTrainingMaterials({ tenantId: ctx.user?.tenantId || undefined });
        const trainingContext = trainingMaterials
          .map(m => `### ${m.title}\n${m.content?.substring(0, 800) || ""}`)
          .join("\n\n");

        // Get recent calls for examples (filtered by tenant)
        const recentCallsResult = await getCallsWithGrades({ limit: 30, tenantId: ctx.user?.tenantId || undefined });
        const recentCalls = recentCallsResult.items;
        const goodCalls = recentCalls.filter(c => c.grade && parseFloat(c.grade.overallScore || "0") >= 75).slice(0, 5);
        const badCalls = recentCalls.filter(c => c.grade && parseFloat(c.grade.overallScore || "0") < 60).slice(0, 5);

        let systemPrompt = "";

        if (input.mode === "roleplay") {
          // Role-play mode: AI plays the seller
          systemPrompt = `You are playing the role of a SELLER in a real estate wholesaling role-play exercise.

Your personality: ${input.roleplayContext?.sellerPersonality || "Skeptical homeowner who inherited a property and is unsure about selling"}
Scenario: ${input.roleplayContext?.scenario || "First call - seller is exploring options"}

BEHAVIOR RULES:
1. Stay in character as the seller - never break character
2. Respond naturally as a real homeowner would
3. Raise realistic objections (price concerns, timing, other offers, need to think about it)
4. If the team member handles objections well, gradually warm up
5. If they push too hard or miss cues, become more resistant
6. Keep responses conversational (2-4 sentences max)

Common objections to use:
- "That seems low, I was hoping for more"
- "I need to talk to my spouse/family first"
- "I'm talking to other investors too"
- "I'm not in a rush to sell"
- "How do I know you're legitimate?"

Respond as the seller would. Stay in character.`;
        } else if (input.mode === "example") {
          // Example mode: Show real call examples
          const callExamples = [...goodCalls, ...badCalls].map(c => {
            const grade = c.grade;
            const score = parseFloat(grade?.overallScore || "0");
            return `### ${score >= 75 ? "✅ GOOD" : "❌ NEEDS WORK"} - Call with ${c.contactName || "Unknown"} (${Math.round(score)}%)
Team Member: ${c.teamMemberName || "Unknown"}
Summary: ${grade?.summary || "N/A"}
Strengths: ${(grade?.strengths as string[] || []).join(", ") || "N/A"}
Improvements: ${(grade?.improvements as string[] || []).join(", ") || "N/A"}
Transcript excerpt: "${c.transcript?.substring(0, 600) || "N/A"}..."`;
          }).join("\n\n");

          systemPrompt = `You are a meeting facilitator helping a real estate wholesaling team learn from real call examples.

RECENT CALL EXAMPLES:
${callExamples}

TRAINING CONTEXT:
${trainingContext.substring(0, 2000)}

Your role:
1. When asked, share relevant examples from the calls above
2. Highlight what worked well and what could improve
3. Connect examples to the current agenda topic: "${input.currentAgendaItem?.title || "General discussion"}"
4. Keep responses focused and actionable (3-5 sentences)
5. Quote specific parts of transcripts when relevant

Be encouraging but honest about areas for improvement.`;
        } else if (input.mode === "qa") {
          // Q&A mode: Answer coaching questions
          systemPrompt = `You are a sales coach for a real estate wholesaling team, answering questions during a team meeting.

TRAINING MATERIALS:
${trainingContext.substring(0, 3000)}

Current agenda topic: "${input.currentAgendaItem?.title || "General discussion"}"
${input.currentAgendaItem?.description ? `Topic details: ${input.currentAgendaItem.description}` : ""}

RESPONSE RULES:
1. Keep answers concise (3-5 sentences max)
2. Be warm and encouraging
3. Give specific, actionable advice
4. Reference training materials when relevant
5. If asked about scripts, give a brief example phrase, not full scripts

Answer the team's question helpfully and concisely.`;
        } else {
          // Facilitate mode: Guide through agenda
          systemPrompt = `You are an AI meeting facilitator guiding a real estate wholesaling team through their weekly training call.

Current agenda item: "${input.currentAgendaItem?.title || "Meeting start"}"
${input.currentAgendaItem?.description ? `Details: ${input.currentAgendaItem.description}` : ""}

TRAINING CONTEXT:
${trainingContext.substring(0, 1500)}

Your role:
1. Guide discussion on the current agenda topic
2. Ask thought-provoking questions to engage the team
3. Suggest when to do role-plays or review examples
4. Keep the meeting moving - suggest transitioning after thorough discussion
5. Be encouraging and energetic

RESPONSE FORMAT:
- Keep responses brief (2-4 sentences)
- End with a question or action suggestion when appropriate
- Use a warm, coach-like tone`;
        }

        // Build conversation history
        const messages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
          { role: "system", content: systemPrompt },
        ];

        // Add conversation history
        if (input.conversationHistory) {
          for (const msg of input.conversationHistory.slice(-10)) {
            messages.push({ role: msg.role === "user" ? "user" : "assistant", content: msg.content });
          }
        }

        // Add current message
        messages.push({ role: "user", content: input.message });

        const response = await invokeLLM({ messages });

        const messageContent = response.choices?.[0]?.message?.content;
        const answer = typeof messageContent === "string"
          ? messageContent
          : "I apologize, I couldn't generate a response. Please try again.";

        return { answer, mode: input.mode };
      }),

    // Generate meeting summary
    generateSummary: protectedProcedure
      .input(z.object({
        agendaItems: z.array(z.object({
          title: z.string(),
          discussed: z.boolean(),
        })),
        conversationHighlights: z.array(z.string()).optional(),
        roleplayCount: z.number().optional(),
      }))
      .mutation(async ({ input }) => {
        const systemPrompt = `Generate a brief meeting summary for a sales team training call.

Agenda items covered:
${input.agendaItems.map(item => `- ${item.discussed ? "✅" : "⏭️"} ${item.title}`).join("\n")}

${input.roleplayCount ? `Role-plays conducted: ${input.roleplayCount}` : ""}

Generate:
1. A 2-3 sentence summary of what was covered
2. 2-3 key action items for the team
3. One encouraging closing statement

Keep it brief and actionable.`;

        const response = await invokeLLM({
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: "Generate the meeting summary." },
          ],
        });

        const messageContent = response.choices?.[0]?.message?.content;
        return {
          summary: typeof messageContent === "string"
            ? messageContent
            : "Meeting completed. Great work team!",
        };
      }),
  }),

  // ============ RUBRICS (Read-only) ============
  rubrics: router({
    get: protectedProcedure
      .input(z.object({ type: z.enum(["lead_manager", "acquisition_manager"]) }))
      .query(async ({ input }) => {
        return input.type === "lead_manager" ? LEAD_MANAGER_RUBRIC : ACQUISITION_MANAGER_RUBRIC;
      }),

    getAll: protectedProcedure.query(async () => {
      return {
        leadManager: LEAD_MANAGER_RUBRIC,
        acquisitionManager: ACQUISITION_MANAGER_RUBRIC,
        leadGenerator: LEAD_GENERATOR_RUBRIC,
        followUp: FOLLOW_UP_RUBRIC,
        sellerCallback: SELLER_CALLBACK_RUBRIC,
        adminCallback: ADMIN_CALLBACK_RUBRIC,
      };
    }),

    getContext: protectedProcedure
      .input(z.object({ callType: z.enum(["qualification", "offer", "lead_generation", "follow_up", "seller_callback", "admin_callback"]) }))
      .query(async ({ input }) => {
        return await getGradingContext(input.callType);
      }),
  }),

  // ============ TEAM TRAINING ITEMS ============
  teamTraining: router({
    list: protectedProcedure
      .input(z.object({
        itemType: z.enum(["skill", "issue", "win", "agenda"]).optional(),
        status: z.enum(["active", "in_progress", "completed", "archived"]).optional(),
        teamMemberId: z.number().optional(),
        teamRole: z.enum(["lead_manager", "acquisition_manager", "lead_generator"]).optional(),
      }).optional())
      .query(async ({ ctx, input }) => {
        // CRITICAL: Include tenantId for multi-tenant isolation
        // When no teamRole is specified ("All Roles" view), limit to top 5 per category
        const ALL_ROLES_LIMIT = 5;
        return await getTeamTrainingItems({
          ...input,
          tenantId: ctx.user?.tenantId || undefined,
          limit: input?.teamRole ? undefined : ALL_ROLES_LIMIT,
        });
      }),

    getActive: protectedProcedure.query(async ({ ctx }) => {
      // CRITICAL: Include tenantId for multi-tenant isolation
      return await getActiveTrainingItems(ctx.user?.tenantId || undefined);
    }),

    getById: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        const item = await getTeamTrainingItemById(input.id);
        if (!item) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Training item not found" });
        }
        return item;
      }),

    create: protectedProcedure
      .input(z.object({
        itemType: z.enum(["skill", "issue", "win", "agenda"]),
        title: z.string(),
        description: z.string().optional(),
        targetBehavior: z.string().optional(),
        callReference: z.number().optional(),
        sortOrder: z.number().optional(),
        priority: z.enum(["low", "medium", "high", "urgent"]).optional(),
        teamMemberId: z.number().optional(),
        teamMemberName: z.string().optional(),
        meetingDate: z.date().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        // Include tenantId when creating
        return await createTeamTrainingItem({
          itemType: input.itemType,
          title: input.title,
          description: input.description,
          targetBehavior: input.targetBehavior,
          callReference: input.callReference,
          sortOrder: input.sortOrder || 0,
          priority: input.priority || "medium",
          teamMemberId: input.teamMemberId,
          teamMemberName: input.teamMemberName,
          meetingDate: input.meetingDate,
          status: "active",
          tenantId: ctx.user.tenantId!,
        });
      }),

    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        title: z.string().optional(),
        description: z.string().optional(),
        targetBehavior: z.string().optional(),
        sortOrder: z.number().optional(),
        priority: z.enum(["low", "medium", "high", "urgent"]).optional(),
        status: z.enum(["active", "in_progress", "completed", "archived"]).optional(),
        meetingDate: z.date().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        // CRITICAL: Verify tenant ownership before updating
        await verifyTenantOwnership("teamTrainingItem", input.id, ctx.user?.tenantId);
        const { id, ...updates } = input;
        await updateTeamTrainingItem(id, updates);
        return { success: true };
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        // CRITICAL: Verify tenant ownership before deleting
        await verifyTenantOwnership("teamTrainingItem", input.id, ctx.user?.tenantId);
        await deleteTeamTrainingItem(input.id);
        return { success: true };
      }),

    complete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        // CRITICAL: Verify tenant ownership before completing
        await verifyTenantOwnership("teamTrainingItem", input.id, ctx.user?.tenantId);
        await updateTeamTrainingItem(input.id, { 
          status: "completed",
          completedAt: new Date(),
        });
        return { success: true };
      }),

    // AI-generated insights
    generateInsights: protectedProcedure
      .mutation(async ({ ctx }) => {
        // Rate limit AI operations
        checkRateLimit(ctx.user?.tenantId, "ai");
        trackUsage(ctx.user?.tenantId, "ai_chat");
        
        const tenantId = ctx.user?.tenantId;
        
        // Clear existing AI-generated items for this tenant
        await clearAiGeneratedInsights(tenantId || undefined);
        
        // Generate new insights from recent calls for this tenant
        const insights = await generateTeamInsights(tenantId || undefined);
        
        // Save to database with tenant association
        await saveGeneratedInsights(insights, tenantId || undefined);
        
        return {
          success: true,
          generated: {
            issues: insights.issues.length,
            wins: insights.wins.length,
            skills: insights.skills.length,
            agenda: insights.agenda.length,
          },
        };
      }),

    clearAiInsights: protectedProcedure
      .mutation(async ({ ctx }) => {
        // CRITICAL: Only clear insights for this tenant
        await clearAiGeneratedInsights(ctx.user?.tenantId || undefined);
        return { success: true };
      }),
  }),

  // ============ BRAND ASSETS ============
  brandAssets: router({
    list: protectedProcedure
      .input(z.object({
        assetType: z.string().optional(),
      }).optional())
      .query(async ({ ctx, input }) => {
        // CRITICAL: Include tenantId for multi-tenant isolation
        return await getBrandAssets({
          ...input,
          tenantId: ctx.user?.tenantId || undefined,
        });
      }),

    getById: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        const asset = await getBrandAssetById(input.id);
        if (!asset) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Asset not found" });
        }
        return asset;
      }),

    create: protectedProcedure
      .input(z.object({
        name: z.string(),
        description: z.string().optional(),
        assetType: z.enum(["logo", "color_palette", "font", "style_guide", "image", "video", "document", "other"]),
        fileUrl: z.string().optional(),
        fileKey: z.string().optional(),
        mimeType: z.string().optional(),
        fileSize: z.number().optional(),
        metadata: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        return await createBrandAsset({
          ...input,
          tenantId: ctx.user.tenantId!,
        });
      }),

    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        name: z.string().optional(),
        description: z.string().optional(),
        assetType: z.enum(["logo", "color_palette", "font", "style_guide", "image", "video", "document", "other"]).optional(),
        fileUrl: z.string().optional(),
        metadata: z.string().optional(),
        isActive: z.enum(["true", "false"]).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        // CRITICAL: Verify tenant ownership before updating
        await verifyTenantOwnership("brandAsset", input.id, ctx.user?.tenantId);
        const { id, ...updates } = input;
        await updateBrandAsset(id, updates);
        return { success: true };
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        // CRITICAL: Verify tenant ownership before deleting
        await verifyTenantOwnership("brandAsset", input.id, ctx.user?.tenantId);
        await deleteBrandAsset(input.id);
        return { success: true };
      }),
  }),

  // ============ SOCIAL POSTS ============
  socialPosts: router({
    list: protectedProcedure
      .input(z.object({
        contentType: z.enum(["brand", "creator"]).optional(),
        platform: z.string().optional(),
        status: z.string().optional(),
      }).optional())
      .query(async ({ ctx, input }) => {
        return await getSocialPosts({ ...input, tenantId: ctx.user?.tenantId || undefined });
      }),

    getById: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        const post = await getSocialPostById(input.id);
        if (!post) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Post not found" });
        }
        return post;
      }),

    getCalendar: protectedProcedure
      .input(z.object({
        startDate: z.date(),
        endDate: z.date(),
      }))
      .query(async ({ input }) => {
        return await getCalendarPosts(input.startDate, input.endDate);
      }),

    create: protectedProcedure
      .input(z.object({
        contentType: z.enum(["brand", "creator"]),
        platform: z.enum(["blog", "meta_facebook", "meta_instagram", "google_business", "x_twitter", "linkedin", "other"]),
        title: z.string().optional(),
        content: z.string(),
        excerpt: z.string().optional(),
        slug: z.string().optional(),
        mediaUrls: z.string().optional(),
        hashtags: z.string().optional(),
        mentions: z.string().optional(),
        status: z.enum(["draft", "scheduled", "published", "failed"]).optional(),
        scheduledAt: z.date().optional(),
        isAiGenerated: z.enum(["true", "false"]).optional(),
        aiPrompt: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        return await createSocialPost({
          ...input,
          createdBy: ctx.user?.id,
          tenantId: ctx.user.tenantId!,
        });
      }),

    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        title: z.string().optional(),
        content: z.string().optional(),
        excerpt: z.string().optional(),
        mediaUrls: z.string().optional(),
        hashtags: z.string().optional(),
        mentions: z.string().optional(),
        status: z.enum(["draft", "scheduled", "published", "failed"]).optional(),
        scheduledAt: z.date().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        // CRITICAL: Verify tenant ownership before updating
        await verifyTenantOwnership("socialPost", input.id, ctx.user?.tenantId);
        const { id, ...updates } = input;
        await updateSocialPost(id, updates);
        return { success: true };
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        // CRITICAL: Verify tenant ownership before deleting
        await verifyTenantOwnership("socialPost", input.id, ctx.user?.tenantId);
        await deleteSocialPost(input.id);
        return { success: true };
      }),

    generateContent: protectedProcedure
      .input(z.object({
        contentType: z.enum(["brand", "creator"]),
        platform: z.enum(["blog", "meta_facebook", "meta_instagram", "google_business", "x_twitter", "linkedin"]),
        topic: z.string(),
        tone: z.string().optional(),
        additionalContext: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        // Rate limit content generation
        checkRateLimit(ctx.user?.tenantId, "contentGeneration");
        trackUsage(ctx.user?.tenantId, "content_generation");
        
        // Get brand assets for context
        const assets = await getBrandAssets({ activeOnly: true });
        const brandContext = assets.map(a => `${a.name}: ${a.description || ""}`).join("\n");

        const platformGuidelines: Record<string, string> = {
          blog: "Write a comprehensive blog post with introduction, main points, and conclusion. Use headers and formatting.",
          meta_facebook: "Write an engaging Facebook post. Keep it conversational and include a call-to-action. 1-3 paragraphs max.",
          meta_instagram: "Write a captivating Instagram caption. Start with a hook, tell a story, and end with a call-to-action. Include relevant hashtag suggestions.",
          google_business: "Write a professional Google Business post. Keep it concise and informative. Include a clear call-to-action.",
          x_twitter: "Write a punchy tweet or thread. Be concise and engaging. Max 280 characters per tweet.",
          linkedin: "Write a professional LinkedIn post. Be insightful and add value. Include a thought-provoking question or call-to-action.",
        };

        const response = await invokeLLM({
          messages: [
            {
              role: "system",
              content: `You are a social media content creator for a real estate wholesaling business. Create engaging content that resonates with property sellers and real estate investors.

Brand Context:
${brandContext}

Platform: ${input.platform}
Guidelines: ${platformGuidelines[input.platform]}
Tone: ${input.tone || "professional yet approachable"}

Provide the content in JSON format with fields: title (optional for non-blog), content, hashtags (array), suggestedMediaDescription (what image/video would work well).`,
            },
            {
              role: "user",
              content: `Create ${input.platform} content about: ${input.topic}${input.additionalContext ? `\n\nAdditional context: ${input.additionalContext}` : ""}`,
            },
          ],
          response_format: {
            type: "json_schema",
            json_schema: {
              name: "social_content",
              strict: true,
              schema: {
                type: "object",
                properties: {
                  title: { type: "string", description: "Title for blog posts, optional for other platforms" },
                  content: { type: "string", description: "The main content/copy" },
                  hashtags: { type: "array", items: { type: "string" }, description: "Relevant hashtags" },
                  suggestedMediaDescription: { type: "string", description: "Description of suggested visual content" },
                },
                required: ["content", "hashtags", "suggestedMediaDescription"],
                additionalProperties: false,
              },
            },
          },
        });

        const content = response.choices[0]?.message?.content;
        if (typeof content === "string") {
          return JSON.parse(content);
        }
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to generate content" });
      }),
  }),

  // ============ CONTENT IDEAS ============
  contentIdeas: router({
    list: protectedProcedure
      .input(z.object({
        status: z.string().optional(),
        targetPlatform: z.string().optional(),
      }).optional())
      .query(async ({ ctx, input }) => {
        // CRITICAL: Include tenantId for multi-tenant isolation
        return await getContentIdeas({
          ...input,
          tenantId: ctx.user?.tenantId || undefined,
        });
      }),

    getById: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        const idea = await getContentIdeaById(input.id);
        if (!idea) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Idea not found" });
        }
        return idea;
      }),

    create: protectedProcedure
      .input(z.object({
        title: z.string(),
        description: z.string().optional(),
        category: z.string().optional(),
        targetPlatform: z.enum(["x_twitter", "blog", "meta", "any"]).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        return await createContentIdea({
          ...input,
          tenantId: ctx.user.tenantId!,
        });
      }),

    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        title: z.string().optional(),
        description: z.string().optional(),
        category: z.string().optional(),
        targetPlatform: z.enum(["x_twitter", "blog", "meta", "any"]).optional(),
        status: z.enum(["new", "in_progress", "used", "archived"]).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        // CRITICAL: Verify tenant ownership before updating
        await verifyTenantOwnership("contentIdea", input.id, ctx.user?.tenantId);
        const { id, ...updates } = input;
        await updateContentIdea(id, updates);
        return { success: true };
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        // CRITICAL: Verify tenant ownership before deleting
        await verifyTenantOwnership("contentIdea", input.id, ctx.user?.tenantId);
        await deleteContentIdea(input.id);
        return { success: true };
      }),

    generateIdeas: protectedProcedure
      .input(z.object({
        count: z.number().min(1).max(10).default(5),
        targetPlatform: z.enum(["x_twitter", "blog", "meta", "any"]).optional(),
        category: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        // Rate limit content generation
        checkRateLimit(ctx.user?.tenantId, "contentGeneration");
        trackUsage(ctx.user?.tenantId, "content_generation");
        
        const response = await invokeLLM({
          messages: [
            {
              role: "system",
              content: `You are a content strategist for a real estate wholesaling business. Generate creative content ideas that will engage property sellers and real estate investors.

Focus on topics like:
- Selling distressed properties
- Working with cash buyers
- Real estate market insights
- Success stories and testimonials
- Tips for homeowners facing foreclosure, divorce, or inherited properties
- Behind-the-scenes of real estate wholesaling

Provide ${input.count} unique content ideas in JSON format.`,
            },
            {
              role: "user",
              content: `Generate ${input.count} content ideas${input.targetPlatform && input.targetPlatform !== "any" ? ` for ${input.targetPlatform}` : ""}${input.category ? ` in the category: ${input.category}` : ""}.`,
            },
          ],
          response_format: {
            type: "json_schema",
            json_schema: {
              name: "content_ideas",
              strict: true,
              schema: {
                type: "object",
                properties: {
                  ideas: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        title: { type: "string" },
                        description: { type: "string" },
                        category: { type: "string" },
                        targetPlatform: { type: "string", enum: ["x_twitter", "blog", "meta", "any"] },
                      },
                      required: ["title", "description", "category", "targetPlatform"],
                      additionalProperties: false,
                    },
                  },
                },
                required: ["ideas"],
                additionalProperties: false,
              },
            },
          },
        });

        const content = response.choices[0]?.message?.content;
        if (typeof content === "string") {
          const parsed = JSON.parse(content);
          // Save ideas to database
          const savedIdeas = [];
          for (const idea of parsed.ideas) {
            const saved = await createContentIdea({
              title: idea.title,
              description: idea.description,
              category: idea.category,
              targetPlatform: idea.targetPlatform as any,
              isAiGenerated: "true",
              tenantId: ctx.user.tenantId!,
            });
            if (saved) savedIdeas.push(saved);
          }
          return { ideas: savedIdeas };
        }
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to generate ideas" });
      }),
  }),

  // ============ BRAND PROFILE ============
  brandProfile: router({
    get: protectedProcedure.query(async ({ ctx }) => {
      return await getBrandProfile(ctx.user?.tenantId || undefined);
    }),

    update: protectedProcedure
      .input(z.object({
        websiteUrl: z.string().optional(),
        extractedColors: z.string().optional(),
        extractedLogo: z.string().optional(),
        companyName: z.string().optional(),
        brandDescription: z.string().optional(),
        brandVoice: z.string().optional(),
        missionStatement: z.string().optional(),
        tagline: z.string().optional(),
        targetAudience: z.string().optional(),
        uniqueValueProposition: z.string().optional(),
        keyMessages: z.string().optional(),
        facebookUrl: z.string().optional(),
        instagramUrl: z.string().optional(),
        twitterUrl: z.string().optional(),
        linkedinUrl: z.string().optional(),
        googleBusinessUrl: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        return await upsertBrandProfile(input);
      }),

    extractFromWebsite: protectedProcedure
      .input(z.object({ url: z.string() }))
      .mutation(async ({ ctx, input }) => {
        // Rate limit AI operations
        checkRateLimit(ctx.user?.tenantId, "ai");
        trackUsage(ctx.user?.tenantId, "ai_chat");
        
        // Use LLM to analyze website and extract branding info
        const response = await invokeLLM({
          messages: [
            {
              role: "system",
              content: `You are a brand analyst. Given a website URL, analyze the brand identity and extract key branding elements. Return a JSON object with the following fields:
- colors: array of hex color codes used on the site
- companyName: the company name
- tagline: any tagline or slogan found
- brandVoice: description of the tone/voice (professional, casual, etc.)
- targetAudience: who the brand seems to target`,
            },
            {
              role: "user",
              content: `Analyze the brand identity from this website: ${input.url}`,
            },
          ],
          response_format: {
            type: "json_schema",
            json_schema: {
              name: "brand_analysis",
              strict: true,
              schema: {
                type: "object",
                properties: {
                  colors: { type: "array", items: { type: "string" } },
                  companyName: { type: "string" },
                  tagline: { type: "string" },
                  brandVoice: { type: "string" },
                  targetAudience: { type: "string" },
                },
                required: ["colors", "companyName", "tagline", "brandVoice", "targetAudience"],
                additionalProperties: false,
              },
            },
          },
        });

        const content = response.choices[0]?.message?.content;
        if (content && typeof content === "string") {
          const parsed = JSON.parse(content);
          return {
            extractedColors: JSON.stringify(parsed.colors),
            companyName: parsed.companyName,
            tagline: parsed.tagline,
            brandVoice: parsed.brandVoice,
            targetAudience: parsed.targetAudience,
          };
        }
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to extract brand info" });
      }),
  }),

  // ============ CONTENT GENERATION WITH CALL DATA ============
  contentGeneration: router({
    // Get data for content generation
    getData: protectedProcedure.query(async ({ ctx }) => {
      const tenantId = ctx.user?.tenantId || undefined;
      const [calls, kpis, stories, brandProfileData] = await Promise.all([
        getCallsForContentGeneration(20, tenantId),
        getKPIsForContentGeneration(tenantId),
        getInterestingCallStories(10, tenantId),
        getBrandProfile(tenantId),
      ]);
      return { calls, kpis, stories, brandProfile: brandProfileData };
    }),

    // Generate brand content from call data
    generateBrandContent: protectedProcedure
      .input(z.object({
        platform: z.enum(["blog", "meta", "google_business", "linkedin"]),
        contentType: z.enum(["problem_solved", "success_story", "market_insight", "tips"]),
      }))
      .mutation(async ({ ctx, input }) => {
        // Rate limit content generation
        checkRateLimit(ctx.user?.tenantId, "contentGeneration");
        trackUsage(ctx.user?.tenantId, "content_generation");
        
        const tenantId = ctx.user?.tenantId || undefined;
        const [calls, kpis, brandProfileData] = await Promise.all([
          getCallsForContentGeneration(10, tenantId),
          getKPIsForContentGeneration(tenantId),
          getBrandProfile(tenantId),
        ]);

        // Build context from real call data
        const callContext = calls.slice(0, 5).map(c => ({
          situation: c.transcript?.substring(0, 500) || "No transcript",
          outcome: c.callOutcome,
          strengths: c.strengths,
        }));

        const response = await invokeLLM({
          messages: [
            {
              role: "system",
              content: `You are a content creator for ${brandProfileData?.companyName || "a real estate wholesaling company"}.

Brand Voice: ${brandProfileData?.brandVoice || "Professional yet approachable"}
Mission: ${brandProfileData?.missionStatement || "Help homeowners sell their properties quickly and hassle-free"}
Target Audience: ${brandProfileData?.targetAudience || "Homeowners facing difficult situations"}

Business KPIs:
- Total deals closed: ${kpis.totalDeals}
- Appointments this month: ${kpis.appointmentsThisMonth}
- Offers accepted this month: ${kpis.offersAcceptedThisMonth}

Recent call situations (use these for authentic content):
${JSON.stringify(callContext, null, 2)}

Create content that:
1. References real situations from calls (anonymized)
2. Shows how we solve problems for sellers
3. Demonstrates our expertise and track record
4. Maintains our brand voice`,
            },
            {
              role: "user",
              content: `Create a ${input.contentType.replace("_", " ")} post for ${input.platform}. Make it authentic by drawing from the real call situations provided.`,
            },
          ],
          response_format: {
            type: "json_schema",
            json_schema: {
              name: "brand_content",
              strict: true,
              schema: {
                type: "object",
                properties: {
                  title: { type: "string" },
                  content: { type: "string" },
                  hashtags: { type: "array", items: { type: "string" } },
                  callToAction: { type: "string" },
                },
                required: ["title", "content", "hashtags", "callToAction"],
                additionalProperties: false,
              },
            },
          },
        });

        const content = response.choices[0]?.message?.content;
        if (content && typeof content === "string") {
          return JSON.parse(content);
        }
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to generate content" });
      }),

    // Generate creator content (attention-grabbing stories)
    generateCreatorContent: protectedProcedure
      .input(z.object({
        style: z.enum(["crazy_story", "property_walkthrough", "day_in_life", "tips_tricks"]),
      }))
      .mutation(async ({ ctx, input }) => {
        // Rate limit content generation
        checkRateLimit(ctx.user?.tenantId, "contentGeneration");
        trackUsage(ctx.user?.tenantId, "content_generation");
        
        const tenantId = ctx.user?.tenantId || undefined;
        const [stories, brandProfileData] = await Promise.all([
          getInterestingCallStories(10, tenantId),
          getBrandProfile(tenantId),
        ]);

        // Extract interesting moments from calls
        const storyContext = stories.map(s => ({
          transcript_snippet: s.transcript?.substring(0, 300) || "No transcript",
          strengths: s.strengths,
          score: s.overallScore,
        }));

        const response = await invokeLLM({
          messages: [
            {
              role: "system",
              content: `You are a content creator building a personal brand in real estate wholesaling.

Brand: ${brandProfileData?.companyName || "Real estate investor"}
Voice: Authentic, engaging, sometimes edgy - designed to grab attention on X/Twitter

Recent interesting call moments (use these for authentic stories):
${JSON.stringify(storyContext, null, 2)}

Create content that:
1. Grabs attention in the first line
2. Tells a real story from actual calls (anonymized)
3. Shows the reality of real estate wholesaling
4. Encourages engagement and discussion`,
            },
            {
              role: "user",
              content: `Create a ${input.style.replace(/_/g, " ")} post for X/Twitter. Make it attention-grabbing and authentic based on real call situations.`,
            },
          ],
          response_format: {
            type: "json_schema",
            json_schema: {
              name: "creator_content",
              strict: true,
              schema: {
                type: "object",
                properties: {
                  hook: { type: "string", description: "Attention-grabbing first line" },
                  content: { type: "string" },
                  hashtags: { type: "array", items: { type: "string" } },
                },
                required: ["hook", "content", "hashtags"],
                additionalProperties: false,
              },
            },
          },
        });

        const content = response.choices[0]?.message?.content;
        if (content && typeof content === "string") {
          return JSON.parse(content);
        }
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to generate content" });
      }),
  }),

  // Gamification router
  gamification: router({
    // Get current user's gamification summary (XP, level, streaks, badges)
    getSummary: protectedProcedure.query(async ({ ctx }) => {
      const teamMember = await getTeamMemberByUserId(ctx.user.id);
      if (!teamMember) {
        return {
          xp: { totalXp: 0, level: 1, title: "Rookie", nextLevelXp: 500, progress: 0 },
          streaks: { hotStreakCurrent: 0, hotStreakBest: 0, consistencyStreakCurrent: 0, consistencyStreakBest: 0 },
          badges: [],
          badgeCount: 0,
        };
      }
      return getGamificationSummary(teamMember.id);
    }),

    // Get all badges with progress for current user
    getAllBadges: protectedProcedure.query(async ({ ctx }) => {
      const teamMember = await getTeamMemberByUserId(ctx.user.id);
      if (!teamMember) {
        // For users without team member link (like admins), show all universal badges with zero progress
        const { ALL_BADGES } = await import("./gamification");
        return ALL_BADGES.filter(b => b.category === "universal").map(badgeDef => ({
          code: badgeDef.code,
          name: badgeDef.name,
          description: badgeDef.description,
          icon: badgeDef.icon,
          category: badgeDef.category,
          tiers: {
            bronze: { target: badgeDef.tiers.bronze.count, earned: false },
            silver: { target: badgeDef.tiers.silver.count, earned: false },
            gold: { target: badgeDef.tiers.gold.count, earned: false },
          },
          currentProgress: 0,
        }));
      }
      return getAllBadgesWithProgress(teamMember.id, teamMember.teamRole);
    }),

    // Get gamification leaderboard (tenant-scoped)
    getLeaderboard: protectedProcedure.query(async ({ ctx }) => {
      return getGamificationLeaderboard(ctx.user?.tenantId || undefined);
    }),

    // Process rewards when viewing a call (awards XP and updates streaks)
    processCallView: protectedProcedure
      .input(z.object({ callId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const teamMember = await getTeamMemberByUserId(ctx.user.id);
        if (!teamMember) {
          return { xpEarned: 0, badgesEarned: [], streakUpdated: false };
        }
        return processCallViewRewards(teamMember.id, input.callId);
      }),

    // Initialize badges (admin only, run once)
    initBadges: protectedProcedure.mutation(async ({ ctx }) => {
      if (ctx.user?.teamRole !== 'admin' && ctx.user?.role !== 'super_admin' && ctx.user?.role !== 'admin') {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin access required' });
      }
      await initializeBadges();
      return { success: true };
    }),

    // Batch award XP for all unprocessed calls (admin only)
    batchAwardXp: protectedProcedure.mutation(async ({ ctx }) => {
      if (ctx.user?.teamRole !== 'admin' && ctx.user?.role !== 'super_admin' && ctx.user?.role !== 'admin') {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin access required' });
      }
      return batchAwardXpForCalls();
    }),
    
    // Batch evaluate badges for all team members
    batchEvaluateBadges: protectedProcedure.mutation(async ({ ctx }) => {
      if (ctx.user?.teamRole !== 'admin' && ctx.user?.role !== 'super_admin' && ctx.user?.role !== 'admin') {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin access required' });
      }
      return batchEvaluateBadges();
    }),
  }),

  // ============ KPI TRACKING ============
  kpi: router({
    // Get all periods
    getPeriods: protectedProcedure
      .input(z.object({
        periodType: z.enum(["daily", "weekly", "monthly"]).optional(),
      }).optional())
      .query(async ({ ctx, input }) => {
        if (ctx.user?.role !== 'admin') {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin access required' });
        }
        const { getKpiPeriods } = await import("./kpi");
        return getKpiPeriods(input?.periodType);
      }),

    // Get period by ID
    getPeriodById: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ ctx, input }) => {
        if (ctx.user?.role !== 'admin') {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin access required' });
        }
        const { getKpiPeriodById } = await import("./kpi");
        return getKpiPeriodById(input.id);
      }),

    // Create a new period
    createPeriod: protectedProcedure
      .input(z.object({
        periodType: z.enum(["daily", "weekly", "monthly"]),
        periodStart: z.date(),
        periodEnd: z.date(),
        periodLabel: z.string(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user?.role !== 'admin') {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin access required' });
        }
        const { createKpiPeriod } = await import("./kpi");
        return createKpiPeriod({ ...input, tenantId: ctx.user.tenantId! });
      }),

    // Get team member KPIs for a period
    getTeamMemberKpis: protectedProcedure
      .input(z.object({ periodId: z.number() }))
      .query(async ({ ctx, input }) => {
        if (ctx.user?.role !== 'admin') {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin access required' });
        }
        const { getTeamMemberKpis } = await import("./kpi");
        return getTeamMemberKpis(input.periodId);
      }),

    // Upsert team member KPI
    upsertTeamMemberKpi: protectedProcedure
      .input(z.object({
        teamMemberId: z.number(),
        periodId: z.number(),
        roleType: z.enum(["am", "lm", "lg_cold_caller", "lg_sms"]),
        metric1: z.number(),
        metric2: z.number(),
        metric3: z.number(),
        notes: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user?.role !== 'admin') {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin access required' });
        }
        const { upsertTeamMemberKpi } = await import("./kpi");
        return upsertTeamMemberKpi({ ...input, tenantId: ctx.user.tenantId! });
      }),

    // Get campaign KPIs for a period
    getCampaignKpis: protectedProcedure
      .input(z.object({ periodId: z.number() }))
      .query(async ({ ctx, input }) => {
        if (ctx.user?.role !== 'admin') {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin access required' });
        }
        const { getCampaignKpis } = await import("./kpi");
        return getCampaignKpis(input.periodId);
      }),

    // Upsert campaign KPI
    upsertCampaignKpi: protectedProcedure
      .input(z.object({
        periodId: z.number(),
        market: z.enum(["tennessee", "global"]),
        channel: z.enum(["cold_calls", "sms", "forms", "ppl", "jv", "ppc", "postcards", "referrals"]),
        spent: z.number(),
        volume: z.number(),
        contacts: z.number(),
        leads: z.number(),
        offers: z.number(),
        contracts: z.number(),
        dealsCount: z.number(),
        revenue: z.number(),
        notes: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user?.role !== 'admin') {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin access required' });
        }
        const { upsertCampaignKpi } = await import("./kpi");
        return upsertCampaignKpi({ ...input, tenantId: ctx.user.tenantId! });
      }),

    // Get deals
    getDeals: protectedProcedure
      .input(z.object({ periodId: z.number().optional() }).optional())
      .query(async ({ ctx, input }) => {
        if (ctx.user?.role !== 'admin') {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin access required' });
        }
        const { getKpiDeals } = await import("./kpi");
        return getKpiDeals(input?.periodId);
      }),

    // Get deal by ID
    getDealById: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ ctx, input }) => {
        if (ctx.user?.role !== 'admin') {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin access required' });
        }
        const { getKpiDealById } = await import("./kpi");
        return getKpiDealById(input.id);
      }),

    // Create inventory item
    createDeal: protectedProcedure
      .input(z.object({
        periodId: z.number().optional(),
        propertyAddress: z.string(),
        inventoryStatus: z.enum(["for_sale", "assigned", "funded"]).optional(),
        location: z.enum(["nashville", "nash_sw", "knoxville", "chattanooga", "global", "nah"]).optional(),
        leadSource: z.enum(["cold_calls", "sms", "postcards", "forms", "ppl", "ppc", "jv", "referrals"]).optional(),
        lmName: z.enum(["chris", "daniel"]).optional(),
        amName: z.enum(["kyle"]).optional(),
        dmName: z.enum(["esteban", "steve"]).optional(),
        revenue: z.number().optional(),
        assignmentFee: z.number().optional(),
        profit: z.number().optional(),
        contractDate: z.date().optional(),
        closingDate: z.date().optional(),
        notes: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user?.role !== 'admin') {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin access required' });
        }
        const { createKpiDeal } = await import("./kpi");
        return createKpiDeal({ ...input, tenantId: ctx.user.tenantId! });
      }),

    // Update deal
    updateDeal: protectedProcedure
      .input(z.object({
        id: z.number(),
        periodId: z.number().optional(),
        propertyAddress: z.string().optional(),
        inventoryStatus: z.enum(["for_sale", "assigned", "funded"]).optional(),
        location: z.enum(["nashville", "nash_sw", "knoxville", "chattanooga", "global", "nah"]).optional(),
        leadSource: z.enum(["cold_calls", "sms", "postcards", "forms", "ppl", "ppc", "jv", "referrals"]).optional(),
        lmName: z.enum(["chris", "daniel"]).optional(),
        amName: z.enum(["kyle"]).optional(),
        dmName: z.enum(["esteban", "steve"]).optional(),
        revenue: z.number().optional(),
        assignmentFee: z.number().optional(),
        profit: z.number().optional(),
        contractDate: z.date().optional(),
        closingDate: z.date().optional(),
        notes: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user?.role !== 'admin') {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin access required' });
        }
        const { updateKpiDeal } = await import("./kpi");
        const { id, ...data } = input;
        await updateKpiDeal(id, data);
        return { success: true };
      }),

    // Delete deal
    deleteDeal: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user?.role !== 'admin') {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin access required' });
        }
        const { deleteKpiDeal } = await import("./kpi");
        await deleteKpiDeal(input.id);
        return { success: true };
      }),

    // Get scoreboard data (calculated metrics)
    getScoreboard: protectedProcedure
      .input(z.object({ periodId: z.number() }))
      .query(async ({ ctx, input }) => {
        if (ctx.user?.role !== 'admin') {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin access required' });
        }
        const { getScoreboardData } = await import("./kpi");
        return getScoreboardData(input.periodId);
      }),

    // ============ LEAD GEN STAFF ============
    getLeadGenStaff: protectedProcedure
      .input(z.object({ activeOnly: z.boolean().optional() }).optional())
      .query(async ({ ctx, input }) => {
        if (ctx.user?.role !== 'admin') {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin access required' });
        }
        const { getLeadGenStaff } = await import("./kpi");
        return getLeadGenStaff(input?.activeOnly ?? true);
      }),

    createLeadGenStaff: protectedProcedure
      .input(z.object({
        name: z.string(),
        roleType: z.enum(["lg_cold_caller", "lg_sms", "am", "lm"]),
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user?.role !== 'admin') {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin access required' });
        }
        const { createLeadGenStaff } = await import("./kpi");
        const id = await createLeadGenStaff({ ...input, tenantId: ctx.user.tenantId! });
        return { id };
      }),

    updateLeadGenStaff: protectedProcedure
      .input(z.object({
        id: z.number(),
        name: z.string().optional(),
        roleType: z.enum(["lg_cold_caller", "lg_sms", "am", "lm"]).optional(),
        isActive: z.enum(["true", "false"]).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user?.role !== 'admin') {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin access required' });
        }
        const { updateLeadGenStaff } = await import("./kpi");
        const { id, ...data } = input;
        await updateLeadGenStaff(id, data);
        return { success: true };
      }),

    deleteLeadGenStaff: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user?.role !== 'admin') {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin access required' });
        }
        const { deleteLeadGenStaff } = await import("./kpi");
        await deleteLeadGenStaff(input.id);
        return { success: true };
      }),

    // ============ KPI MARKETS ============
    getMarkets: protectedProcedure
      .input(z.object({ activeOnly: z.boolean().optional() }).optional())
      .query(async ({ ctx, input }) => {
        if (ctx.user?.role !== 'admin') {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin access required' });
        }
        const { getKpiMarkets } = await import("./kpi");
        return getKpiMarkets(input?.activeOnly ?? true);
      }),

    createMarket: protectedProcedure
      .input(z.object({ name: z.string() }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user?.role !== 'admin') {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin access required' });
        }
        const { createKpiMarket } = await import("./kpi");
        const id = await createKpiMarket(input.name, ctx.user.tenantId!);
        return { id };
      }),

    updateMarket: protectedProcedure
      .input(z.object({
        id: z.number(),
        name: z.string().optional(),
        isActive: z.enum(["true", "false"]).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user?.role !== 'admin') {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin access required' });
        }
        const { updateKpiMarket } = await import("./kpi");
        const { id, ...data } = input;
        await updateKpiMarket(id, data);
        return { success: true };
      }),

    deleteMarket: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user?.role !== 'admin') {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin access required' });
        }
        const { deleteKpiMarket } = await import("./kpi");
        await deleteKpiMarket(input.id);
        return { success: true };
      }),

    // ============ KPI CHANNELS ============
    getChannels: protectedProcedure
      .input(z.object({ activeOnly: z.boolean().optional() }).optional())
      .query(async ({ ctx, input }) => {
        if (ctx.user?.role !== 'admin') {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin access required' });
        }
        const { getKpiChannels } = await import("./kpi");
        return getKpiChannels(input?.activeOnly ?? true);
      }),

    createChannel: protectedProcedure
      .input(z.object({ name: z.string(), code: z.string() }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user?.role !== 'admin') {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin access required' });
        }
        const { createKpiChannel } = await import("./kpi");
        const id = await createKpiChannel(input.name, input.code, ctx.user.tenantId!);
        return { id };
      }),

    updateChannel: protectedProcedure
      .input(z.object({
        id: z.number(),
        name: z.string().optional(),
        code: z.string().optional(),
        isActive: z.enum(["true", "false"]).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user?.role !== 'admin') {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin access required' });
        }
        const { updateKpiChannel } = await import("./kpi");
        const { id, ...data } = input;
        await updateKpiChannel(id, data);
        return { success: true };
      }),

    deleteChannel: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user?.role !== 'admin') {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin access required' });
        }
        const { deleteKpiChannel } = await import("./kpi");
        await deleteKpiChannel(input.id);
        return { success: true };
      }),
  }),

  // ============ TENANT MANAGEMENT (Multi-Tenancy) ============
  tenant: router({
    // Super Admin: List all tenants
    list: protectedProcedure.query(async ({ ctx }) => {
      const { isPlatformOwner, getAllTenants } = await import("./tenant");
      if (!ctx.user?.openId || !isPlatformOwner(ctx.user.openId)) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Platform owner access required' });
      }
      return getAllTenants();
    }),

    // Super Admin: Get platform metrics
    getMetrics: protectedProcedure.query(async ({ ctx }) => {
      const { isPlatformOwner, getPlatformMetrics } = await import("./tenant");
      if (!ctx.user?.openId || !isPlatformOwner(ctx.user.openId)) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Platform owner access required' });
      }
      return getPlatformMetrics();
    }),

    // Super Admin: Get recent activity
    getRecentActivity: protectedProcedure.query(async ({ ctx }) => {
      const { isPlatformOwner, getRecentActivity } = await import("./tenant");
      if (!ctx.user?.openId || !isPlatformOwner(ctx.user.openId)) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Platform owner access required' });
      }
      return getRecentActivity();
    }),

    // Super Admin: Get low usage tenants (churn risk)
    getLowUsageTenants: protectedProcedure.query(async ({ ctx }) => {
      const { isPlatformOwner, getLowUsageTenants } = await import("./tenant");
      if (!ctx.user?.openId || !isPlatformOwner(ctx.user.openId)) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Platform owner access required' });
      }
      return getLowUsageTenants();
    }),

    // Super Admin: Get tenant by ID
    getById: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ ctx, input }) => {
        const { isPlatformOwner, getTenantById } = await import("./tenant");
        if (!ctx.user?.openId || !isPlatformOwner(ctx.user.openId)) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Platform owner access required' });
        }
        return getTenantById(input.id);
      }),

    // Super Admin: Create new tenant
    create: protectedProcedure
      .input(z.object({
        name: z.string(),
        slug: z.string(),
        subscriptionTier: z.enum(['trial', 'starter', 'growth', 'scale']).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const { isPlatformOwner, createTenant } = await import("./tenant");
        if (!ctx.user?.openId || !isPlatformOwner(ctx.user.openId)) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Platform owner access required' });
        }
        return createTenant(input);
      }),

    // Super Admin: Setup new tenant with CRM config and team members
    setup: protectedProcedure
      .input(z.object({
        name: z.string().min(1),
        slug: z.string().min(1),
        subscriptionTier: z.enum(['trial', 'starter', 'growth', 'scale']).optional(),
        crmType: z.enum(['ghl', 'none']).optional(),
        crmConfig: z.object({
          ghlApiKey: z.string().optional(),
          ghlLocationId: z.string().optional(),
          batchDialerEnabled: z.boolean().optional(),
          batchDialerApiKey: z.string().optional(),
          dispoPipelineName: z.string().optional(),
          dispoPipelineId: z.string().optional(),
          newDealStageName: z.string().optional(),
          newDealStageId: z.string().optional(),
          stageMapping: z.record(z.string(), z.string()).optional(),
        }).optional(),
        teamMembers: z.array(z.object({
          name: z.string().min(1),
          teamRole: z.enum(['admin', 'lead_manager', 'acquisition_manager', 'lead_generator']),
          phone: z.string().optional(),
        })).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const { isPlatformOwner, setupTenant } = await import("./tenant");
        if (!ctx.user?.openId || !isPlatformOwner(ctx.user.openId)) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Platform owner access required' });
        }
        return setupTenant(input);
      }),

    // Super Admin: Bulk add team members to a tenant
    bulkAddMembers: protectedProcedure
      .input(z.object({
        tenantId: z.number(),
        members: z.array(z.object({
          name: z.string().min(1),
          teamRole: z.enum(['admin', 'lead_manager', 'acquisition_manager', 'lead_generator']),
          phone: z.string().optional(),
        })).min(1),
      }))
      .mutation(async ({ ctx, input }) => {
        const { isPlatformOwner, bulkAddTeamMembers } = await import("./tenant");
        if (!ctx.user?.openId || !isPlatformOwner(ctx.user.openId)) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Platform owner access required' });
        }
        return bulkAddTeamMembers(input.tenantId, input.members);
      }),

    // Super Admin: Update tenant CRM config
    updateTenantCrmConfig: protectedProcedure
      .input(z.object({
        tenantId: z.number(),
        crmType: z.enum(['ghl', 'none']),
        crmConfig: z.object({
          ghlApiKey: z.string().optional(),
          ghlLocationId: z.string().optional(),
          batchDialerEnabled: z.boolean().optional(),
          batchDialerApiKey: z.string().optional(),
          dispoPipelineName: z.string().optional(),
          dispoPipelineId: z.string().optional(),
          newDealStageName: z.string().optional(),
          newDealStageId: z.string().optional(),
          stageMapping: z.record(z.string(), z.string()).optional(),
        }),
      }))
      .mutation(async ({ ctx, input }) => {
        const { isPlatformOwner, updateTenantSettings } = await import("./tenant");
        if (!ctx.user?.openId || !isPlatformOwner(ctx.user.openId)) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Platform owner access required' });
        }
        const crmConnected = (input.crmConfig.ghlApiKey && input.crmConfig.ghlLocationId) ? 'true' as const : 'false' as const;
        return updateTenantSettings(input.tenantId, {
          crmType: input.crmType,
          crmConfig: JSON.stringify(input.crmConfig),
          crmConnected,
        });
      }),

    // Tenant Admin: Get own tenant settings
    getSettings: protectedProcedure.query(async ({ ctx }) => {
      const { getTenantSettings } = await import("./tenant");
      if (!ctx.user?.tenantId) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'No tenant associated with user' });
      }
      return getTenantSettings(ctx.user.tenantId);
    }),

    // Tenant Admin: Update own tenant settings
    updateSettings: protectedProcedure
      .input(z.object({
        name: z.string().optional(),
        domain: z.string().optional(),
        crmType: z.enum(['ghl', 'hubspot', 'salesforce', 'close', 'pipedrive', 'none']).optional(),
        crmConfig: z.string().optional(),
        crmConnected: z.enum(['true', 'false']).optional(),
        onboardingStep: z.number().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const { updateTenantSettings } = await import("./tenant");
        if (!ctx.user?.tenantId) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'No tenant associated with user' });
        }
        // Check if user is tenant admin (admin, super_admin, or isTenantAdmin)
        if (ctx.user.role !== 'admin' && ctx.user.role !== 'super_admin' && ctx.user.isTenantAdmin !== 'true') {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Tenant admin access required' });
        }
        return updateTenantSettings(ctx.user.tenantId, input);
      }),

    // Complete onboarding - mark tenant as onboarded
    completeOnboarding: protectedProcedure
      .mutation(async ({ ctx }) => {
        const { completeOnboarding } = await import("./tenant");
        if (!ctx.user?.tenantId) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'No tenant associated with user' });
        }
        return completeOnboarding(ctx.user.tenantId, ctx.user.id);
      }),

    // Tenant Admin: Get users in tenant
    getUsers: protectedProcedure.query(async ({ ctx }) => {
      const { getTenantUsers } = await import("./tenant");
      if (!ctx.user?.tenantId) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'No tenant associated with user' });
      }
      return getTenantUsers(ctx.user.tenantId);
    }),

    // Get subscription plans
    getPlans: publicProcedure.query(async () => {
      const { getSubscriptionPlans } = await import("./tenant");
      return getSubscriptionPlans();
    }),

    // Tenant Admin: Invite user to tenant
    inviteUser: protectedProcedure
      .input(z.object({
        email: z.string().email(),
        role: z.enum(['admin', 'user']).default('user'),
        teamRole: z.enum(['admin', 'acquisition_manager', 'lead_manager', 'lead_generator']).default('lead_manager'),
      }))
      .mutation(async ({ ctx, input }) => {
        const { inviteUserToTenant } = await import("./tenant");
        if (!ctx.user?.tenantId) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'No tenant associated with user' });
        }
        if (ctx.user.role !== 'admin') {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin access required' });
        }
        // Check plan limits before inviting
        const { canAddUser } = await import("./planLimits");
        const limitCheck = await canAddUser(ctx.user.tenantId);
        if (!limitCheck.allowed) {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: limitCheck.reason || 'Team member limit reached. Please upgrade your plan.',
          });
        }
        return inviteUserToTenant(ctx.user.tenantId, input.email, input.role, input.teamRole);
      }),

    // Tenant Admin: Remove user from tenant
    removeUser: protectedProcedure
      .input(z.object({ userId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const { removeUserFromTenant } = await import("./tenant");
        if (!ctx.user?.tenantId) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'No tenant associated with user' });
        }
        if (ctx.user.role !== 'admin') {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin access required' });
        }
        // Prevent removing yourself
        if (input.userId === ctx.user.id) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Cannot remove yourself from the organization' });
        }
        return removeUserFromTenant(ctx.user.tenantId, input.userId);
      }),

    // Tenant Admin: Update user role
    updateUserRole: protectedProcedure
      .input(z.object({
        userId: z.number(),
        role: z.enum(['admin', 'user']),
        teamRole: z.enum(['admin', 'acquisition_manager', 'lead_manager', 'lead_generator']),
      }))
      .mutation(async ({ ctx, input }) => {
        const { updateUserRole } = await import("./tenant");
        if (!ctx.user?.tenantId) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'No tenant associated with user' });
        }
        if (ctx.user.role !== 'admin') {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin access required' });
        }
        return updateUserRole(ctx.user.tenantId, input.userId, input.role, input.teamRole);
      }),

    // Get pending invitations for tenant
    getPendingInvitations: protectedProcedure.query(async ({ ctx }) => {
      const { getPendingInvitations } = await import("./tenant");
      if (!ctx.user?.tenantId) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'No tenant associated with user' });
      }
      if (ctx.user.role !== 'admin') {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin access required' });
      }
      return getPendingInvitations(ctx.user.tenantId);
    }),

    // Revoke a pending invitation
    revokeInvitation: protectedProcedure
      .input(z.object({ invitationId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const { revokePendingInvitation } = await import("./tenant");
        if (!ctx.user?.tenantId) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'No tenant associated with user' });
        }
        if (ctx.user.role !== 'admin') {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin access required' });
        }
        return revokePendingInvitation(ctx.user.tenantId, input.invitationId);
      }),

    // Test GHL connection with provided credentials
    testGhlConnection: protectedProcedure
      .input(z.object({
        apiKey: z.string().min(1),
        locationId: z.string().min(1),
      }))
      .mutation(async ({ input }) => {
        const GHL_API_BASE = "https://services.leadconnectorhq.com";
        try {
          // Try fetching location info to validate credentials
          const response = await fetch(`${GHL_API_BASE}/locations/${input.locationId}`, {
            method: "GET",
            headers: {
              "Authorization": `Bearer ${input.apiKey}`,
              "Version": "2021-07-28",
              "Accept": "application/json",
            },
          });
          if (!response.ok) {
            const errorText = await response.text();
            if (response.status === 401) {
              return { success: false, error: "Invalid API key. Check that your Private Integration token is correct." };
            }
            if (response.status === 404 || response.status === 422) {
              return { success: false, error: "Location not found. Check your Location ID." };
            }
            return { success: false, error: `GHL API error (${response.status}): ${errorText.substring(0, 200)}` };
          }
          const data = await response.json();
          const locationName = data.location?.name || data.name || "Unknown";
          return { success: true, locationName, message: `Connected to "${locationName}"` };
        } catch (error: any) {
          return { success: false, error: `Connection failed: ${error.message || "Network error"}` };
        }
      }),

    // Fetch GHL pipelines for a tenant (or with provided credentials)
    fetchGhlPipelines: protectedProcedure
      .input(z.object({
        apiKey: z.string().min(1),
        locationId: z.string().min(1),
      }))
      .mutation(async ({ input }) => {
        const GHL_API_BASE = "https://services.leadconnectorhq.com";
        try {
          const response = await fetch(`${GHL_API_BASE}/opportunities/pipelines?locationId=${input.locationId}`, {
            method: "GET",
            headers: {
              "Authorization": `Bearer ${input.apiKey}`,
              "Version": "2021-07-28",
              "Content-Type": "application/json",
            },
          });
          if (!response.ok) {
            return { success: false, pipelines: [], error: `Failed to fetch pipelines (${response.status})` };
          }
          const data = await response.json();
          const pipelines = (data.pipelines || []).map((p: any) => ({
            id: p.id,
            name: p.name,
            stages: (p.stages || []).map((s: any) => ({ id: s.id, name: s.name })),
          }));
          return { success: true, pipelines };
        } catch (error: any) {
          return { success: false, pipelines: [], error: error.message };
        }
      }),

    // Save pipeline stage mapping for a tenant
    savePipelineMapping: protectedProcedure
      .input(z.object({
        tenantId: z.number().optional(), // If provided, super admin updating another tenant
        pipelineMapping: z.object({
          dispoPipelineId: z.string().optional(),
          dispoPipelineName: z.string().optional(),
          newDealStageId: z.string().optional(),
          newDealStageName: z.string().optional(),
          stageMapping: z.record(z.string(), z.string()).optional(), // stageId -> callType mapping
        }),
      }))
      .mutation(async ({ ctx, input }) => {
        const { isPlatformOwner, updateTenantSettings, parseCrmConfig, getTenantById } = await import("./tenant");
        const targetTenantId = input.tenantId || ctx.user?.tenantId;
        if (!targetTenantId) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'No tenant specified' });
        }
        // Check permissions: platform owner can update any tenant, tenant admin can update own
        if (input.tenantId && (!ctx.user?.openId || !isPlatformOwner(ctx.user.openId))) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Platform owner access required' });
        }
        if (!input.tenantId && ctx.user?.role !== 'admin' && ctx.user?.role !== 'super_admin' && ctx.user?.isTenantAdmin !== 'true') {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Tenant admin access required' });
        }
        // Get existing CRM config and merge pipeline mapping
        const tenant = await getTenantById(targetTenantId);
        if (!tenant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Tenant not found' });
        const existingConfig = parseCrmConfig({ crmConfig: tenant.crmConfig as string | null });
        const updatedConfig = {
          ...existingConfig,
          dispoPipelineName: input.pipelineMapping.dispoPipelineName || existingConfig.dispoPipelineName,
          dispoPipelineId: input.pipelineMapping.dispoPipelineId || existingConfig.dispoPipelineId,
          newDealStageName: input.pipelineMapping.newDealStageName || existingConfig.newDealStageName,
          newDealStageId: input.pipelineMapping.newDealStageId || existingConfig.newDealStageId,
          stageMapping: input.pipelineMapping.stageMapping || existingConfig.stageMapping,
        };
        return updateTenantSettings(targetTenantId, { crmConfig: JSON.stringify(updatedConfig) });
      }),

    // Test BatchDialer API key
    testBatchDialerConnection: protectedProcedure
      .input(z.object({
        apiKey: z.string().min(1),
      }))
      .mutation(async ({ input }) => {
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 15000);
          const response = await fetch("https://app.batchdialer.com/api/campaigns", {
            method: "GET",
            headers: {
              "X-ApiKey": input.apiKey,
              "Accept": "application/json",
            },
            signal: controller.signal,
          });
          clearTimeout(timeoutId);
          if (!response.ok) {
            if (response.status === 401 || response.status === 403) {
              return { success: false, error: "Invalid API key. Check your BatchDialer API key in Settings → API." };
            }
            return { success: false, error: `BatchDialer API error (${response.status})` };
          }
          const data = await response.json();
          const campaignCount = Array.isArray(data) ? data.length : (data.items?.length || 0);
          return { success: true, message: `Connected! Found ${campaignCount} campaigns.` };
        } catch (error: any) {
          if (error.name === 'AbortError') {
            return { success: false, error: "Connection timed out. Please try again." };
          }
          return { success: false, error: `Connection failed: ${error.message || "Network error"}` };
        }
      }),

    // Test BatchLeads API key
    testBatchLeadsConnection: protectedProcedure
      .input(z.object({
        apiKey: z.string().min(1),
      }))
      .mutation(async ({ input }) => {
        const { validateApiKey } = await import("./batchLeadsService");
        const result = await validateApiKey(input.apiKey);
        if (result.valid) {
          const props = result.usage?.Properties;
          return {
            success: true,
            message: `Connected! ${props?.total_properties || 0} properties available.`,
            usage: result.usage,
          };
        }
        return { success: false, error: result.error || "Failed to validate API key" };
      }),

    // Save individual CRM integration config (supports multiple simultaneous integrations)
    saveCrmIntegration: protectedProcedure
      .input(z.object({
        tenantId: z.number().optional(), // If provided, super admin updating another tenant
        integration: z.enum(['ghl', 'batchdialer', 'batchleads']),
        enabled: z.boolean(),
        config: z.object({
          apiKey: z.string().optional(),
          locationId: z.string().optional(), // GHL only
        }),
      }))
      .mutation(async ({ ctx, input }) => {
        const { isPlatformOwner, updateTenantSettings, parseCrmConfig, getTenantById } = await import("./tenant");
        const targetTenantId = input.tenantId || ctx.user?.tenantId;
        if (!targetTenantId) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'No tenant specified' });
        }
        // Check permissions
        if (input.tenantId && (!ctx.user?.openId || !isPlatformOwner(ctx.user.openId))) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Platform owner access required' });
        }
        if (!input.tenantId && ctx.user?.role !== 'admin' && ctx.user?.role !== 'super_admin' && ctx.user?.isTenantAdmin !== 'true') {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Tenant admin access required' });
        }

        // Get existing CRM config and merge
        const tenant = await getTenantById(targetTenantId);
        if (!tenant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Tenant not found' });
        const existingConfig = parseCrmConfig({ crmConfig: tenant.crmConfig as string | null });

        if (input.integration === 'ghl') {
          existingConfig.ghlApiKey = input.enabled ? (input.config.apiKey || existingConfig.ghlApiKey) : undefined;
          existingConfig.ghlLocationId = input.enabled ? (input.config.locationId || existingConfig.ghlLocationId) : undefined;
        } else if (input.integration === 'batchdialer') {
          existingConfig.batchDialerEnabled = input.enabled;
          existingConfig.batchDialerApiKey = input.enabled ? (input.config.apiKey || existingConfig.batchDialerApiKey) : undefined;
        } else if (input.integration === 'batchleads') {
          existingConfig.batchLeadsApiKey = input.enabled ? (input.config.apiKey || existingConfig.batchLeadsApiKey) : undefined;
        }

        // Determine overall CRM connection status
        const hasAnyCrm = !!(existingConfig.ghlApiKey || existingConfig.batchDialerApiKey || existingConfig.batchLeadsApiKey);
        const crmConnected = hasAnyCrm ? 'true' as const : 'false' as const;
        // Keep crmType as 'ghl' if GHL is connected, otherwise 'none' (legacy field)
        const crmType = existingConfig.ghlApiKey ? 'ghl' as const : 'none' as const;

        return updateTenantSettings(targetTenantId, {
          crmType,
          crmConfig: JSON.stringify(existingConfig),
          crmConnected,
        });
      }),

    // Get parsed CRM integration status for the current tenant
    getCrmIntegrations: protectedProcedure.query(async ({ ctx }) => {
      const { parseCrmConfig, getTenantById } = await import("./tenant");
      if (!ctx.user?.tenantId) {
        return {
          ghl: { enabled: false, connected: false },
          batchDialer: { enabled: false, connected: false },
          batchLeads: { enabled: false, connected: false },
        };
      }
      const tenant = await getTenantById(ctx.user.tenantId);
      if (!tenant) {
        return {
          ghl: { enabled: false, connected: false },
          batchDialer: { enabled: false, connected: false },
          batchLeads: { enabled: false, connected: false },
        };
      }
      const config = parseCrmConfig({ crmConfig: tenant.crmConfig as string | null });
      return {
        ghl: {
          enabled: !!(config.ghlApiKey && config.ghlLocationId),
          connected: !!(config.ghlApiKey && config.ghlLocationId),
          hasApiKey: !!config.ghlApiKey,
          hasLocationId: !!config.ghlLocationId,
          locationId: config.ghlLocationId || undefined,
          dispoPipelineName: config.dispoPipelineName || undefined,
          dispoPipelineId: config.dispoPipelineId || undefined,
          newDealStageName: config.newDealStageName || undefined,
          lastSynced: tenant.lastGhlSync ? tenant.lastGhlSync.toISOString() : null,
        },
        batchDialer: {
          enabled: !!config.batchDialerEnabled,
          connected: !!config.batchDialerApiKey,
          hasApiKey: !!config.batchDialerApiKey,
          lastSynced: tenant.lastBatchDialerSync ? tenant.lastBatchDialerSync.toISOString() : null,
        },
        batchLeads: {
          enabled: !!config.batchLeadsApiKey,
          connected: !!config.batchLeadsApiKey,
          hasApiKey: !!config.batchLeadsApiKey,
          lastSynced: tenant.lastBatchLeadsSync ? tenant.lastBatchLeadsSync.toISOString() : null,
        },
      };
    }),

    // Manual BatchLeads sync (property enrichment for recent calls)
    syncBatchLeads: protectedProcedure.mutation(async ({ ctx }) => {
      if (ctx.user?.teamRole !== 'admin' && ctx.user?.role !== 'admin' && ctx.user?.isTenantAdmin !== 'true') {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin access required' });
      }
      const { syncBatchLeadsForTenant } = await import("./batchLeadsSync");
      if (!ctx.user?.tenantId) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'No tenant associated' });
      }
      return syncBatchLeadsForTenant(ctx.user.tenantId);
    }),

    // Get webhook retry queue status (admin only)
    getWebhookRetryQueueStatus: protectedProcedure.query(async ({ ctx }) => {
      if (ctx.user?.teamRole !== 'admin' && ctx.user?.role !== 'admin' && ctx.user?.isTenantAdmin !== 'true') {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin access required' });
      }
      if (!ctx.user?.tenantId) {
        return { pending: 0, delivered: 0, failed: 0, recentFailures: [] };
      }
      const { getRetryQueueStatus } = await import("./webhookRetryQueue");
      return getRetryQueueStatus(ctx.user.tenantId);
    }),

    // Create checkout session for subscription
    createCheckout: protectedProcedure
      .input(z.object({
        planCode: z.enum(['starter', 'growth', 'scale']),
        billingPeriod: z.enum(['monthly', 'yearly']),
      }))
      .mutation(async ({ ctx, input }) => {
        const { createTenantCheckoutSession } = await import("./tenant");
        if (!ctx.user) {
          throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Not authenticated' });
        }
        const origin = ctx.req.headers.origin || 'http://localhost:3000';
        return createTenantCheckoutSession({
          planCode: input.planCode,
          billingPeriod: input.billingPeriod,
          userId: ctx.user.id,
          userEmail: ctx.user.email || '',
          userName: ctx.user.name || '',
          tenantId: ctx.user.tenantId || undefined,
          origin,
        });
      }),

    // Get billing portal URL
    getBillingPortal: protectedProcedure.mutation(async ({ ctx }) => {
      const { createTenantBillingPortal } = await import("./tenant");
      if (!ctx.user?.tenantId) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'No tenant associated with user' });
      }
      const origin = ctx.req.headers.origin || 'http://localhost:3000';
      return createTenantBillingPortal(ctx.user.tenantId, `${origin}/settings/billing`);
    }),

    // Get subscription status
    getSubscriptionStatus: protectedProcedure.query(async ({ ctx }) => {
      const { getTenantSubscriptionStatus } = await import("./tenant");
      if (!ctx.user?.tenantId) {
        return null;
      }
      return getTenantSubscriptionStatus(ctx.user.tenantId);
    }),

    // Cancel subscription
    cancelSubscription: protectedProcedure.mutation(async ({ ctx }) => {
      const { cancelTenantSubscription } = await import("./tenant");
      if (!ctx.user?.tenantId) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'No tenant associated with user' });
      }
      if (ctx.user.role !== 'admin') {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin access required' });
      }
      return cancelTenantSubscription(ctx.user.tenantId);
    }),

    // Reactivate subscription
    reactivateSubscription: protectedProcedure.mutation(async ({ ctx }) => {
      const { reactivateTenantSubscription } = await import("./tenant");
      if (!ctx.user?.tenantId) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'No tenant associated with user' });
      }
      if (ctx.user.role !== 'admin') {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin access required' });
      }
      return reactivateTenantSubscription(ctx.user.tenantId);
    }),

    // Change subscription plan (upgrade/downgrade)
    changeSubscription: protectedProcedure
      .input(z.object({
        planCode: z.enum(['starter', 'growth', 'scale']),
        billingPeriod: z.enum(['monthly', 'yearly']),
      }))
      .mutation(async ({ ctx, input }) => {
        const { changeTenantSubscription } = await import("./tenant");
        if (!ctx.user?.tenantId) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'No tenant associated with user' });
        }
        if (ctx.user.role !== 'admin') {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin access required' });
        }
        return changeTenantSubscription(ctx.user.tenantId, input.planCode, input.billingPeriod);
      }),

    // Get usage summary for current tenant
    getUsageSummary: protectedProcedure.query(async ({ ctx }) => {
      const { getTenantUsageSummary } = await import("./planLimits");
      if (!ctx.user?.tenantId) {
        return null;
      }
      return getTenantUsageSummary(ctx.user.tenantId);
    }),

    // Check if can add more users
    canAddUser: protectedProcedure.query(async ({ ctx }) => {
      const { canAddUser } = await import("./planLimits");
      if (!ctx.user?.tenantId) {
        return { allowed: false, reason: 'No tenant associated' };
      }
      return canAddUser(ctx.user.tenantId);
    }),

    // Check if can process more calls
    canProcessCall: protectedProcedure.query(async ({ ctx }) => {
      const { canProcessCall } = await import("./planLimits");
      if (!ctx.user?.tenantId) {
        return { allowed: false, reason: 'No tenant associated' };
      }
      return canProcessCall(ctx.user.tenantId);
    }),

    // Super Admin: Start impersonating a tenant
    startImpersonation: protectedProcedure
      .input(z.object({ tenantId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const { isPlatformOwner } = await import("./tenant");
        const { startImpersonation } = await import("./impersonation");
        
        if (!ctx.user?.openId || !isPlatformOwner(ctx.user.openId)) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Platform owner access required' });
        }
        
        const result = await startImpersonation(ctx.user.id, input.tenantId);
        if (!result.success) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: result.error || 'Failed to start impersonation' });
        }
        
        // Set the impersonation token as a cookie
        ctx.res.cookie('session', result.token, getSessionCookieOptions(ctx.req));
        
        return { success: true };
      }),

    // Super Admin: Stop impersonating and return to normal view
    stopImpersonation: protectedProcedure.mutation(async ({ ctx }) => {
      const { stopImpersonation } = await import("./impersonation");
      
      if (!ctx.user?.id) {
        throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Not authenticated' });
      }
      
      const result = await stopImpersonation(ctx.user.id);
      if (!result.success) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: result.error || 'Failed to stop impersonation' });
      }
      
      // Set the regular session token as a cookie
      ctx.res.cookie('session', result.token, getSessionCookieOptions(ctx.req));
      
      return { success: true };
    }),

    // Get impersonation status
    getImpersonationStatus: protectedProcedure.query(async ({ ctx }) => {
      const { getImpersonationInfo } = await import("./impersonation");
      const jwt = await import("jsonwebtoken");
      
      // Get the session token from cookies
      const token = ctx.req.cookies?.session;
      if (!token) {
        return { isImpersonating: false };
      }
      
      try {
        const decoded = jwt.default.verify(token, process.env.JWT_SECRET || 'dev-secret');
        return getImpersonationInfo(decoded);
      } catch {
        return { isImpersonating: false };
      }
    }),

    // Super Admin: Send churn outreach email with tiered templates
    sendChurnOutreach: protectedProcedure
      .input(z.object({ tenantId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const { isPlatformOwner, getTenantById, getTenantUsers } = await import("./tenant");
        const { sendTieredChurnOutreachEmail } = await import("./emailService");
        
        if (!ctx.user?.openId || !isPlatformOwner(ctx.user.openId)) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Platform owner access required' });
        }
        
        // Get tenant info
        const tenant = await getTenantById(input.tenantId);
        if (!tenant) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Tenant not found' });
        }
        
        // Get tenant admin/users to find contact
        const tenantUsers = await getTenantUsers(input.tenantId);
        const adminUser = tenantUsers.find(u => u.role === 'admin') || tenantUsers[0];
        
        if (!adminUser?.email) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'No contact email found for tenant' });
        }
        
        // Calculate days inactive
        const db = await import("./db").then(m => m.getDb());
        const { calls } = await import("../drizzle/schema");
        const { eq, desc } = await import("drizzle-orm");
        
        let daysInactive = 0;
        let lastActivity = tenant.createdAt;
        let lastActivityDate: Date | null = null;
        
        if (db) {
          const [latestCall] = await db
            .select({ createdAt: calls.createdAt })
            .from(calls)
            .where(eq(calls.tenantId, input.tenantId))
            .orderBy(desc(calls.createdAt))
            .limit(1);
          
          if (latestCall?.createdAt) {
            lastActivity = latestCall.createdAt;
            lastActivityDate = new Date(latestCall.createdAt);
          }
          
          daysInactive = Math.floor((Date.now() - new Date(lastActivity).getTime()) / (1000 * 60 * 60 * 24));
        }
        
        // Send the tiered outreach email and record history
        const result = await sendTieredChurnOutreachEmail(
          input.tenantId,
          tenant.name,
          adminUser.name || 'there',
          adminUser.email,
          daysInactive,
          new Date(lastActivity).toLocaleDateString(),
          lastActivityDate,
          ctx.user.id,
          ctx.user.name || 'Platform Owner'
        );
        
        if (!result.success) {
          throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to send outreach email' });
        }
        
        return { 
          success: true, 
          sentTo: adminUser.email,
          templateUsed: result.templateUsed
        };
      }),

    // Trigger email sequence jobs (Super Admin only)
    triggerEmailSequence: protectedProcedure
      .mutation(async ({ ctx }) => {
        const { isPlatformOwner } = await import("./tenant");
        
        if (!ctx.user?.openId || !isPlatformOwner(ctx.user.openId)) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Platform owner access required' });
        }
        
        const { runEmailSequenceJob } = await import("./emailSequenceJob");
        const result = await runEmailSequenceJob();
        
        return {
          success: true,
          usersProcessed: result.usersProcessed,
          emailsSent: result.emailsSent,
          details: result.details
        };
      }),

    // Get outreach history for a tenant
    getOutreachHistory: protectedProcedure
      .input(z.object({ tenantId: z.number().optional() }))
      .query(async ({ ctx, input }) => {
        const { isPlatformOwner } = await import("./tenant");
        
        if (!ctx.user?.openId || !isPlatformOwner(ctx.user.openId)) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Platform owner access required' });
        }
        
        const db = await import("./db").then(m => m.getDb());
        const { outreachHistory, tenants } = await import("../drizzle/schema");
        const { eq, desc } = await import("drizzle-orm");
        
        if (!db) {
          return [];
        }
        
        let query = db
          .select({
            id: outreachHistory.id,
            tenantId: outreachHistory.tenantId,
            templateType: outreachHistory.templateType,
            recipientEmail: outreachHistory.recipientEmail,
            recipientName: outreachHistory.recipientName,
            daysInactive: outreachHistory.daysInactive,
            lastActivityDate: outreachHistory.lastActivityDate,
            sentByName: outreachHistory.sentByName,
            tenantReactivated: outreachHistory.tenantReactivated,
            reactivatedAt: outreachHistory.reactivatedAt,
            createdAt: outreachHistory.createdAt,
            tenantName: tenants.name,
          })
          .from(outreachHistory)
          .leftJoin(tenants, eq(outreachHistory.tenantId, tenants.id))
          .orderBy(desc(outreachHistory.createdAt));
        
        if (input.tenantId) {
          query = query.where(eq(outreachHistory.tenantId, input.tenantId)) as typeof query;
        }
        
        const history = await query.limit(100);
        return history;
      }),
  }),

  // ============ OPPORTUNITIES ============
  opportunities: router({
    // Get opportunities for a tenant with tier filtering
    list: protectedProcedure
      .input(z.object({
        tier: z.enum(["missed", "warning", "possible", "all"]).default("all"),
        status: z.enum(["active", "handled", "dismissed", "all"]).default("active"),
        limit: z.number().min(1).max(100).default(50),
      }).optional())
      .query(async ({ ctx, input }) => {
        const { getDb } = await import("./db");
        const db = await getDb();
        if (!db) return [];
        const { opportunities, calls } = await import("../drizzle/schema");
        const { eq, and, desc } = await import("drizzle-orm");

        const tenantId = ctx.user?.tenantId;
        if (!tenantId) return [];

        const tier = input?.tier || "all";
        const status = input?.status || "active";

        const conditions = [eq(opportunities.tenantId, tenantId)];
        if (tier !== "all") conditions.push(eq(opportunities.tier, tier));
        if (status !== "all") conditions.push(eq(opportunities.status, status));

        const results = await db
          .select()
          .from(opportunities)
          .where(and(...conditions))
          .orderBy(desc(opportunities.priorityScore), desc(opportunities.flaggedAt))
          .limit(input?.limit || 50);

        return results;
      }),

    // Get opportunity counts by tier for the dashboard badges
    counts: protectedProcedure
      .query(async ({ ctx }) => {
        const { getDb } = await import("./db");
        const db = await getDb();
        if (!db) return { missed: 0, warning: 0, possible: 0, total: 0 };
        const { opportunities } = await import("../drizzle/schema");
        const { eq, and, sql } = await import("drizzle-orm");

        const tenantId = ctx.user?.tenantId;
        if (!tenantId) return { missed: 0, warning: 0, possible: 0, total: 0 };

        const counts = await db
          .select({
            tier: opportunities.tier,
            count: sql<number>`count(*)`,
          })
          .from(opportunities)
          .where(and(
            eq(opportunities.tenantId, tenantId),
            eq(opportunities.status, "active")
          ))
          .groupBy(opportunities.tier);

        const result = { missed: 0, warning: 0, possible: 0, total: 0 };
        for (const row of counts) {
          if (row.tier === "missed") result.missed = Number(row.count);
          else if (row.tier === "warning") result.warning = Number(row.count);
          else if (row.tier === "possible") result.possible = Number(row.count);
        }
        result.total = result.missed + result.warning + result.possible;
        return result;
      }),

    // Mark an opportunity as handled or dismissed
    resolve: protectedProcedure
      .input(z.object({
        id: z.number(),
        status: z.enum(["handled", "dismissed"]),
        dismissReason: z.enum(["false_positive", "not_a_deal", "already_handled", "duplicate", "other"]).optional(),
        dismissNote: z.string().max(500).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const { getDb } = await import("./db");
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        const { opportunities } = await import("../drizzle/schema");
        const { eq, and } = await import("drizzle-orm");

        const tenantId = ctx.user?.tenantId;
        if (!tenantId) throw new TRPCError({ code: "FORBIDDEN" });

        await db.update(opportunities)
          .set({
            status: input.status,
            dismissReason: input.status === "dismissed" ? (input.dismissReason || "not_a_deal") : null,
            dismissNote: input.status === "dismissed" ? (input.dismissNote || null) : null,
            resolvedBy: ctx.user!.id,
            resolvedAt: new Date(),
          })
          .where(and(
            eq(opportunities.id, input.id),
            eq(opportunities.tenantId, tenantId)
          ));

        return { success: true };
      }),

    // Run detection manually (admin only)
    runDetection: protectedProcedure
      .mutation(async ({ ctx }) => {
        const tenantId = ctx.user?.tenantId;
        if (!tenantId) throw new TRPCError({ code: "FORBIDDEN" });
        if (ctx.user?.role !== "admin" && ctx.user?.role !== "super_admin" && ctx.user?.isTenantAdmin !== "true") {
          throw new TRPCError({ code: "FORBIDDEN", message: "Admin access required" });
        }

        const { runOpportunityDetection } = await import("./opportunityDetection");
        const result = await runOpportunityDetection(tenantId);
        return result;
      }),
  }),

  // ============ COACH ACTIONS (GHL) ============
  coachActions: router({
    // Search GHL contacts
    searchContacts: protectedProcedure
      .input(z.object({ query: z.string().min(1) }))
      .mutation(async ({ ctx, input }) => {
        const tenantId = ctx.user?.tenantId;
        if (!tenantId) throw new TRPCError({ code: "FORBIDDEN" });

        const { searchContacts } = await import("./ghlActions");
        return searchContacts(tenantId, input.query);
      }),

    // Parse user intent from natural language
    parseIntent: protectedProcedure
      .input(z.object({
        message: z.string(),
        contextContactId: z.string().optional(),
        contextContactName: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const tenantId = ctx.user?.tenantId;
        if (!tenantId) throw new TRPCError({ code: "FORBIDDEN" });

        // Get user's learned preferences to improve content drafting
        let preferenceContext = "";
        try {
          const { buildPreferenceContext } = await import("./coachPreferences");
          preferenceContext = await buildPreferenceContext(
            tenantId,
            ctx.user!.id,
            ["sms_style", "note_style", "task_style"]
          );
        } catch { /* preferences are optional */ }

        // Get team members list for assignee resolution
        let teamMemberNames: string[] = [];
        try {
          const members = await getTeamMembers(tenantId);
          teamMemberNames = members.map(m => m.name);
        } catch { /* team list is optional */ }

        // Look up recent call data for the contact if the message mentions calls/summaries
        let callContext = "";
        const callKeywords = /\b(call|summary|summarize|last call|recent call|conversation)\b/i;
        if (callKeywords.test(input.message)) {
          try {
            const { getDb } = await import("./db");
            const db = await getDb();
            if (db) {
              const { calls: callsTable, callGrades } = await import("../drizzle/schema");
              const { desc, eq, and, like, isNotNull, sql } = await import("drizzle-orm");
              
              // Extract contact name from message for lookup
              const contactNameForLookup = input.contextContactName || "";
              
              // Build query conditions
              const conditions: any[] = [eq(callsTable.tenantId, tenantId)];
              if (contactNameForLookup) {
                conditions.push(like(callsTable.contactName, `%${contactNameForLookup}%`));
              }
              
              // Get recent calls with grades
              const recentCalls = await db
                .select({
                  id: callsTable.id,
                  contactName: callsTable.contactName,
                  callType: callsTable.callType,
                  classification: callsTable.classification,
                  duration: callsTable.duration,
                  callTimestamp: callsTable.callTimestamp,
                  teamMemberName: callsTable.teamMemberName,
                  transcript: callsTable.transcript,
                  gradeSummary: callGrades.summary,
                  overallScore: callGrades.overallScore,
                  overallGrade: callGrades.overallGrade,
                  strengths: callGrades.strengths,
                  improvements: callGrades.improvements,
                })
                .from(callsTable)
                .leftJoin(callGrades, eq(callsTable.id, callGrades.callId))
                .where(and(...conditions))
                .orderBy(desc(callsTable.callTimestamp))
                .limit(3);
              
              if (recentCalls.length > 0) {
                callContext = "\n\nRECENT CALL DATA (use this to draft accurate notes/summaries):\n";
                for (const call of recentCalls) {
                  callContext += `\n--- Call with ${call.contactName || "Unknown"} ---\n`;
                  callContext += `Date: ${call.callTimestamp ? new Date(call.callTimestamp).toLocaleDateString() : "Unknown"}\n`;
                  callContext += `Type: ${call.callType || "Unknown"} | Duration: ${call.duration ? Math.floor(call.duration / 60) + "m " + (call.duration % 60) + "s" : "Unknown"}\n`;
                  callContext += `Team Member: ${call.teamMemberName || "Unknown"}\n`;
                  if (call.gradeSummary) callContext += `Grade Summary: ${call.gradeSummary}\n`;
                  if (call.overallGrade) callContext += `Grade: ${call.overallGrade} (${call.overallScore}%)\n`;
                  if (call.strengths) callContext += `Strengths: ${JSON.stringify(call.strengths)}\n`;
                  if (call.improvements) callContext += `Areas for improvement: ${JSON.stringify(call.improvements)}\n`;
                  if (call.transcript) {
                    // Include first 2000 chars of transcript for context
                    const truncatedTranscript = call.transcript.length > 2000 
                      ? call.transcript.substring(0, 2000) + "... [truncated]"
                      : call.transcript;
                    callContext += `Transcript:\n${truncatedTranscript}\n`;
                  }
                }
              }
            }
          } catch (e) {
            console.error("[AI Coach] Failed to fetch call context:", e);
          }
        }

        // Use LLM to parse the intent
        const response = await invokeLLM({
          messages: [
            {
              role: "system",
              content: `You are an AI assistant that parses user requests into structured CRM actions.
The user is a real estate wholesaling team member. Parse their natural language request into one of these action types:

1. add_note_contact - Add a note to a contact
2. add_note_opportunity - Add a note to an opportunity/deal
3. change_pipeline_stage - Move a deal to a different pipeline stage
4. send_sms - Send an SMS to a contact
5. create_task - Create a follow-up task
6. add_tag - Add a tag to a contact
7. remove_tag - Remove a tag from a contact
8. update_field - Update a custom field on a contact

If the message is NOT a CRM action request (it's a coaching question, greeting, etc.), return actionType as "none".

Context: ${input.contextContactId ? `Currently viewing contact: ${input.contextContactName} (ID: ${input.contextContactId})` : "No contact context"}

The current user is: ${ctx.user!.name || "Unknown"}
Team members: ${teamMemberNames.length > 0 ? teamMemberNames.join(", ") : "Unknown"}

IMPORTANT: For actions that involve writing content, you MUST generate the FULL DRAFT TEXT upfront so the user can review and edit it before confirming:
- For add_note_contact / add_note_opportunity: Write the complete note body in params.noteBody. Don't just describe what the note will say — write the actual note. If the user asks to summarize a call, use the RECENT CALL DATA provided below to write a real summary.
- For send_sms: Write the complete SMS message text in params.message. Don't describe the SMS — write the actual message that will be sent. CRITICAL: The SMS will be sent DIRECTLY to the contact, so always write it in SECOND PERSON ("you"/"your") as if speaking to them. The user may describe what to say in third person (e.g., "tell him we don't want his house") — you MUST convert this to direct address (e.g., "we're not interested in purchasing your house"). Never use "he/him/his/she/her" to refer to the recipient in the SMS body.
- For create_task: Write a clear task title in params.title AND a detailed description in params.description.

NEVER generate placeholder text like "Please provide the summary" or "Insert details here". You have access to real call data below — use it to write actual content.
${callContext}

Return JSON with:
- actionType: one of the types above or "none"
- contactName: the contact name mentioned (or from context)
- contactId: the contact ID if known from context
- assigneeName: for create_task, the team member name to assign the task to. If the user mentions a specific team member by name, use that name. If no specific person is mentioned, use the current user's name ("${ctx.user!.name || "Unknown"}"). For non-task actions, use empty string.
- params: action-specific parameters (noteBody, message, title, description, dueDate, tags, stageName, fieldKey, fieldValue)
- summary: a SHORT one-line summary of the action (e.g. "Send SMS to John" or "Add note to Kimberly"). The full content will be shown separately.
- needsContactSearch: boolean - true if a contact name was mentioned but we need to search for their ID
${preferenceContext ? `\nWhen drafting content (SMS messages, notes, task descriptions), match this user's established style:\n${preferenceContext}` : ""}`
            },
            { role: "user", content: input.message }
          ],
          response_format: {
            type: "json_schema",
            json_schema: {
              name: "action_intent",
              strict: true,
              schema: {
                type: "object",
                properties: {
                  actionType: { type: "string" },
                  contactName: { type: "string" },
                  contactId: { type: "string" },
                  params: {
                    type: "object",
                    properties: {
                      noteBody: { type: "string" },
                      message: { type: "string" },
                      title: { type: "string" },
                      description: { type: "string" },
                      dueDate: { type: "string" },
                      tags: { type: "string" },
                      stageName: { type: "string" },
                      fieldKey: { type: "string" },
                      fieldValue: { type: "string" },
                      opportunityId: { type: "string" },
                      pipelineId: { type: "string" },
                      stageId: { type: "string" },
                    },
                    required: ["noteBody", "message", "title", "description", "dueDate", "tags", "stageName", "fieldKey", "fieldValue", "opportunityId", "pipelineId", "stageId"],
                    additionalProperties: false
                  },
                  assigneeName: { type: "string" },
                  summary: { type: "string" },
                  needsContactSearch: { type: "boolean" }
                },
                required: ["actionType", "contactName", "contactId", "assigneeName", "params", "summary", "needsContactSearch"],
                additionalProperties: false
              }
            }
          }
        });

        const content = response.choices?.[0]?.message?.content;
        if (content && typeof content === "string") {
          return JSON.parse(content);
        }
        return { actionType: "none", contactName: "", contactId: "", assigneeName: "", params: {}, summary: "", needsContactSearch: false };
      }),

    // Create a pending action (before confirmation)
    createPending: protectedProcedure
      .input(z.object({
        actionType: z.string(),
        requestText: z.string(),
        targetContactId: z.string().optional(),
        targetContactName: z.string().optional(),
        targetOpportunityId: z.string().optional(),
        payload: z.any(),
      }))
      .mutation(async ({ ctx, input }) => {
        const tenantId = ctx.user?.tenantId;
        if (!tenantId) throw new TRPCError({ code: "FORBIDDEN" });

        const { createActionLog } = await import("./ghlActions");
        const actionId = await createActionLog({
          tenantId,
          requestedBy: ctx.user!.id,
          requestedByName: ctx.user!.name || "Unknown",
          actionType: input.actionType,
          requestText: input.requestText,
          targetContactId: input.targetContactId,
          targetContactName: input.targetContactName,
          targetOpportunityId: input.targetOpportunityId,
          payload: input.payload,
        });

        return { actionId };
      }),

    // Confirm and execute an action
    confirmAndExecute: protectedProcedure
      .input(z.object({
        actionId: z.number(),
        // If the user edited the content before confirming, send the edited payload
        editedPayload: z.record(z.string(), z.any()).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const tenantId = ctx.user?.tenantId;
        if (!tenantId) throw new TRPCError({ code: "FORBIDDEN" });

        const { confirmAction, executeAction } = await import("./ghlActions");
        const { recordEdit } = await import("./coachPreferences");

        // If user edited the payload, update the action log before executing
        if (input.editedPayload) {
          const { getDb } = await import("./db");
          const db = await getDb();
          if (db) {
            const { coachActionLog } = await import("../drizzle/schema");
            const { eq } = await import("drizzle-orm");
            // Get original payload for before/after comparison
            const [action] = await db.select().from(coachActionLog).where(eq(coachActionLog.id, input.actionId));
            if (action) {
              const originalPayload = action.payload as any;
              // Update the action log with edited payload
              await db.update(coachActionLog)
                .set({ payload: input.editedPayload })
                .where(eq(coachActionLog.id, input.actionId));
              // Record the before/after edit
              try {
                await recordEdit({
                  tenantId,
                  userId: ctx.user!.id,
                  actionLogId: input.actionId,
                  actionType: action.actionType,
                  originalPayload,
                  finalPayload: input.editedPayload,
                  wasEdited: true,
                });
              } catch (e) {
                console.error("[CoachPreferences] Failed to record edit:", e);
              }
            }
          }
        }

        await confirmAction(input.actionId);
        const result = await executeAction(input.actionId);

        // If user accepted as-is (no edit), record that as a positive signal
        if (!input.editedPayload && result.success) {
          try {
            const { getDb } = await import("./db");
            const db = await getDb();
            if (db) {
              const { coachActionLog } = await import("../drizzle/schema");
              const { eq } = await import("drizzle-orm");
              const [action] = await db.select().from(coachActionLog).where(eq(coachActionLog.id, input.actionId));
              if (action) {
                await recordEdit({
                  tenantId,
                  userId: ctx.user!.id,
                  actionLogId: input.actionId,
                  actionType: action.actionType,
                  originalPayload: action.payload as any,
                  finalPayload: action.payload as any,
                  wasEdited: false,
                });
              }
            }
          } catch (e) {
            console.error("[CoachPreferences] Failed to record accept-as-is:", e);
          }
        }

        return result;
      }),

    // Cancel a pending action
    cancel: protectedProcedure
      .input(z.object({ actionId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const { cancelAction } = await import("./ghlActions");
        await cancelAction(input.actionId);
        return { success: true };
      }),

    // Get action history (audit log)
    history: protectedProcedure
      .input(z.object({
        limit: z.number().min(1).max(100).default(50),
      }).optional())
      .query(async ({ ctx, input }) => {
        const { getDb } = await import("./db");
        const db = await getDb();
        if (!db) return [];
        const { coachActionLog } = await import("../drizzle/schema");
        const { eq, desc } = await import("drizzle-orm");

        const tenantId = ctx.user?.tenantId;
        if (!tenantId) return [];

        const results = await db
          .select()
          .from(coachActionLog)
          .where(eq(coachActionLog.tenantId, tenantId))
          .orderBy(desc(coachActionLog.createdAt))
          .limit(input?.limit || 50);

        return results;
      }),

    // Get current user's learned preferences
    getPreferences: protectedProcedure
      .query(async ({ ctx }) => {
        const tenantId = ctx.user?.tenantId;
        if (!tenantId) return [];

        const { getAllPreferences } = await import("./coachPreferences");
        return getAllPreferences(tenantId, ctx.user!.id);
      }),

    // Get edit stats for the current user
    editStats: protectedProcedure
      .query(async ({ ctx }) => {
        const tenantId = ctx.user?.tenantId;
        if (!tenantId) return { totalEdits: 0, totalAccepts: 0, categories: [] as string[] };

        const { getEditStats } = await import("./coachPreferences");
        return getEditStats(tenantId, ctx.user!.id);
      }),
  }),
});

export type AppRouter = typeof appRouter;
