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
  getLeadGeneratorsForLeadManager,
  assignLeadManagerToAcquisitionManager,
  removeLeadManagerAssignment,
  updateTeamMemberRole,
  linkUserToTeamMember,
  getAllUsers,
  updateUserTeamRole,
  UserPermissionContext,
  saveCoachExchange,
  buildCoachMemoryContext,
} from "./db";
import { LEAD_MANAGER_RUBRIC, ACQUISITION_MANAGER_RUBRIC, LEAD_GENERATOR_RUBRIC, FOLLOW_UP_RUBRIC, SELLER_CALLBACK_RUBRIC, ADMIN_CALLBACK_RUBRIC } from "./grading";
import { processCall } from "./grading";
import { invokeLLM } from "./_core/llm";
import { generateTeamInsights, saveGeneratedInsights, clearAiGeneratedInsights } from "./insights";
import { pollForNewCalls, getPollingStatus, startPolling, stopPolling, resyncCallRecording, backfillGHLPropertyAddresses } from "./ghlService";
import { storagePut } from "./storage";
import { runArchivalJob, getArchivalStats, archiveCall } from "./archival";
import { verifyTenantOwnership } from "./tenantOwnership";
import { checkRateLimit, trackUsage } from "./rateLimit";
import { adminRouter } from "./adminRouter";
import { PLATFORM_KNOWLEDGE, SECURITY_RULES, isPlatformQuestion, isSensitiveQuestion } from "./platformKnowledge";
import { detectStatsIntent, computeStats } from "./coachStats";

export const appRouter = router({
  system: systemRouter,
  admin: adminRouter,
  
  auth: router({
    me: publicProcedure.query(async opts => {
      const user = opts.ctx.user;
      if (!user) return null;
      // Expose impersonation metadata as proper fields (set by context.ts during super_admin impersonation)
      const isImpersonating = (user as any)._isImpersonating === true;
      const impersonatedTenantName = (user as any)._impersonatedTenantName || null;
      const originalTenantId = (user as any)._originalTenantId || null;
      // Check if this is a demo tenant
      let isDemo = false;
      if (user.tenantId) {
        const { getDb } = await import("./db");
        const { tenants } = await import("../drizzle/schema");
        const { eq } = await import("drizzle-orm");
        const db = await getDb();
        if (db) {
          const [tenant] = await db.select({ slug: tenants.slug }).from(tenants).where(eq(tenants.id, user.tenantId)).limit(1);
          isDemo = tenant?.slug === 'demo-apex';
        }
      }
      return {
        ...user,
        _isImpersonating: isImpersonating,
        _impersonatedTenantName: impersonatedTenantName,
        _originalTenantId: originalTenantId,
        _isDemo: isDemo,
      };
    }),
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

    // Get team members visible to the current user (for dropdown filters)
    // LG: only themselves, LM: themselves + assigned LGs, AM/Admin: everyone
    visibleMembers: protectedProcedure.query(async ({ ctx }) => {
      const tenantId = ctx.user?.tenantId;
      const allMembers = await getTeamMembers(tenantId || undefined);
      const isAdmin = ctx.user?.role === 'admin' || ctx.user?.role === 'super_admin' || ctx.user?.isTenantAdmin === 'true';
      
      // Admins see everyone
      if (isAdmin || ctx.user?.teamRole === 'admin') return allMembers;
      
      // Get current user's team member record
      const currentMember = ctx.user?.id ? await getTeamMemberByUserId(ctx.user.id) : null;
      if (!currentMember) return allMembers; // fallback to all if no team member record
      
      // Lead Generators only see themselves
      if (currentMember.teamRole === 'lead_generator') {
        return allMembers.filter(m => m.id === currentMember.id);
      }
      
      // Lead Managers see themselves + assigned Lead Generators
      if (currentMember.teamRole === 'lead_manager') {
        const assignedLgIds = await getLeadGeneratorsForLeadManager(currentMember.id);
        const visibleIds = new Set([currentMember.id, ...assignedLgIds]);
        return allMembers.filter(m => visibleIds.has(m.id));
      }
      
      // Acquisition Managers see everyone
      if (currentMember.teamRole === 'acquisition_manager') return allMembers;
      
      // Fallback: show all
      return allMembers;
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
        
        // Auto-sync phone number for the linked team member
        let syncedPhone: string | null = null;
        try {
          const tenantId = ctx.user?.tenantId;
          if (tenantId) {
            const members = await getTeamMembers(tenantId);
            const member = members.find(m => m.id === input.teamMemberId);
            if (member?.ghlUserId) {
              const { parseCrmConfig, getTenantById } = await import("./tenant");
              const tenant = await getTenantById(tenantId);
              if (tenant) {
                const config = parseCrmConfig(tenant);
                if (config?.ghlApiKey && config?.ghlLocationId) {
                  const resp = await fetch(`https://services.leadconnectorhq.com/users/${member.ghlUserId}`, {
                    headers: {
                      'Authorization': `Bearer ${config.ghlApiKey}`,
                      'Version': '2021-07-28',
                    },
                  });
                  if (resp.ok) {
                    const userData = await resp.json();
                    const lcPhone = userData.lcPhone?.[config.ghlLocationId];
                    if (lcPhone) {
                      const { getDb } = await import("./db");
                      const { teamMembers: tmTable } = await import("../drizzle/schema");
                      const { eq: eqOp } = await import("drizzle-orm");
                      const db = await getDb();
                      if (db) {
                        await db.update(tmTable).set({ lcPhone }).where(eqOp(tmTable.id, member.id));
                        syncedPhone = lcPhone;
                        console.log(`[Team] Auto-synced phone ${lcPhone} for ${member.name} on link`);
                      }
                    }
                  }
                }
              }
            }
          }
        } catch (e) {
          console.warn(`[Team] Failed to auto-sync phone on link:`, e);
        }
        
        return { success: true, syncedPhone };
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

    // Admin: Sync LC phone numbers for all team members with GHL user IDs
    syncPhoneNumbers: protectedProcedure
      .mutation(async ({ ctx }) => {
        if (ctx.user?.teamRole !== 'admin') {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin access required' });
        }
        const tenantId = ctx.user?.tenantId;
        if (!tenantId) throw new TRPCError({ code: 'BAD_REQUEST', message: 'No tenant' });
        
        const members = await getTeamMembers(tenantId);
        const { parseCrmConfig, getTenantById } = await import("./tenant");
        const tenant = await getTenantById(tenantId);
        if (!tenant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Tenant not found' });
        const config = parseCrmConfig(tenant);
        if (!config?.ghlApiKey || !config?.ghlLocationId) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'GHL not configured' });
        }
        
        let synced = 0;
        for (const member of members) {
          if (!member.ghlUserId) continue;
          try {
            const resp = await fetch(`https://services.leadconnectorhq.com/users/${member.ghlUserId}`, {
              headers: {
                'Authorization': `Bearer ${config.ghlApiKey}`,
                'Version': '2021-07-28',
              },
            });
            if (resp.ok) {
              const userData = await resp.json();
              const lcPhone = userData.lcPhone?.[config.ghlLocationId];
              if (lcPhone && lcPhone !== member.lcPhone) {
                const { getDb } = await import("./db");
                const { teamMembers: tmTable } = await import("../drizzle/schema");
                const { eq: eqOp } = await import("drizzle-orm");
                const db = await getDb();
                if (!db) continue;
                await db.update(tmTable).set({ lcPhone }).where(eqOp(tmTable.id, member.id));
                synced++;
                console.log(`[Team] Synced phone ${lcPhone} for ${member.name}`);
              }
            }
          } catch (e) {
            console.warn(`[Team] Failed to sync phone for ${member.name}:`, e);
          }
        }
        return { success: true, synced };
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

    // List stuck/queued calls for admin UI
    listStuck: protectedProcedure
      .query(async ({ ctx }) => {
        if (ctx.user?.teamRole !== 'admin') {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin access required' });
        }

        const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
        const allCalls = await getCalls({ tenantId: ctx.user?.tenantId ?? undefined, limit: 500 });
        
        // Calls stuck in processing states
        const stuckProcessing = allCalls.filter(call => 
          (call.status === 'transcribing' || call.status === 'grading' || call.status === 'classifying') &&
          call.updatedAt && new Date(call.updatedAt) < oneHourAgo
        );
        // Calls stuck at pending with a recording (never picked up)
        const stuckPending = allCalls.filter(call => 
          call.status === 'pending' &&
          call.recordingUrl &&
          call.updatedAt && new Date(call.updatedAt) < oneHourAgo
        );
        
        return [...stuckProcessing, ...stuckPending].map(call => ({
          id: call.id,
          contactName: call.contactName,
          contactPhone: call.contactPhone,
          teamMemberName: call.teamMemberName,
          status: call.status,
          duration: call.duration,
          callSource: call.callSource,
          callType: call.callType,
          createdAt: call.createdAt,
          updatedAt: call.updatedAt,
          recordingUrl: call.recordingUrl,
        }));
      }),

    // Retry a specific stuck call by ID
    retryCall: protectedProcedure
      .input(z.object({ callId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user?.teamRole !== 'admin') {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin access required' });
        }
        
        const call = await getCallById(input.callId);
        if (!call) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Call not found' });
        }
        if (call.tenantId !== ctx.user?.tenantId) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Not your tenant' });
        }
        
        // Reset to pending if not already
        if (call.status !== 'pending') {
          await updateCall(input.callId, {
            status: 'pending',
            classificationReason: 'Manual retry from admin UI',
          });
        }
        
        // Trigger reprocessing
        processCall(input.callId).catch(err => {
          console.error(`[RetryCall] Error reprocessing call ${input.callId}:`, err);
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
        // Calls stuck in processing states
        const stuckProcessing = allCalls.filter(call => 
          (call.status === 'transcribing' || call.status === 'grading' || call.status === 'classifying') &&
          call.updatedAt && new Date(call.updatedAt) < oneHourAgo
        );
        // Calls stuck at pending with a recording (never picked up)
        const stuckPending = allCalls.filter(call => 
          call.status === 'pending' &&
          call.recordingUrl &&
          call.updatedAt && new Date(call.updatedAt) < oneHourAgo
        );
        const stuckCalls = [...stuckProcessing, ...stuckPending];

        let resetCount = 0;
        for (const call of stuckCalls) {
          const isPending = call.status === 'pending';
          if (!isPending) {
            await updateCall(call.id, { 
              status: 'pending',
              classificationReason: 'Reset from stuck state - will retry processing'
            });
          }
          // Trigger reprocessing
          processCall(call.id).catch(err => {
            console.error(`[ResetStuck] Error reprocessing call ${call.id}:`, err);
          });
          resetCount++;
        }

        console.log(`[ResetStuck] Reset ${resetCount} stuck calls`);
        return { success: true, resetCount };
      }),

    // Manual call upload with audio file (ADMIN ONLY)
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
        // Admin-only restriction
        if (ctx.user.role !== "admin") {
          throw new TRPCError({ code: "FORBIDDEN", message: "Only admins can manually upload calls" });
        }

        try {
          // Deduplication: Check if a manual upload for the same contact was created in the last 30 minutes
          if (input.contactName) {
            const { calls: callsTable } = await import("../drizzle/schema");
            const { eq, and, isNull, gte } = await import("drizzle-orm");
            const { getDb } = await import("./db");
            const db = await getDb();
            if (db) {
              const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000);
              const recentDuplicates = await db.select({ id: callsTable.id, createdAt: callsTable.createdAt })
                .from(callsTable)
                .where(
                  and(
                    eq(callsTable.contactName, input.contactName),
                    eq(callsTable.tenantId, ctx.user.tenantId!),
                    isNull(callsTable.ghlCallId),
                    isNull(callsTable.batchDialerCallId),
                    gte(callsTable.createdAt, thirtyMinAgo)
                  )
                )
                .limit(1);
              if (recentDuplicates.length > 0) {
                console.log(`[ManualUpload] Duplicate detected for ${input.contactName} - existing call ${recentDuplicates[0].id} created at ${recentDuplicates[0].createdAt}`);
                throw new TRPCError({ code: "CONFLICT", message: `A call for ${input.contactName} was already uploaded in the last 30 minutes (call #${recentDuplicates[0].id}). If this is a different call, please wait or change the contact name.` });
              }
            }
          }

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
            // Don't pre-assign "offer" based on role — AI detection in processCall will determine the real type.
            callType: teamMember.teamRole === "lead_generator" ? "cold_call" : "qualification",
            status: "pending",
            callTimestamp: input.callDate ? new Date(input.callDate) : new Date(),
            tenantId: ctx.user.tenantId!,
          });

          if (call) {
            // Process the call asynchronously
            processCall(call.id).catch(err => {
              console.error("[ManualUpload] Error processing call:", err);
            });

            // Auto-delete demo uploads after 15 minutes
            const { tenants: tenantsTable } = await import("../drizzle/schema");
            const { eq: eqOp } = await import("drizzle-orm");
            const { getDb: getDbFn } = await import("./db");
            const dbConn = await getDbFn();
            if (dbConn && ctx.user.tenantId) {
              const [tenant] = await dbConn.select({ slug: tenantsTable.slug }).from(tenantsTable).where(eqOp(tenantsTable.id, ctx.user.tenantId)).limit(1);
              if (tenant?.slug === 'demo-apex') {
                console.log(`[DemoUpload] Scheduling auto-delete for call ${call.id} in 15 minutes`);
                setTimeout(async () => {
                  try {
                    const { calls: callsT, callGrades: gradesT } = await import("../drizzle/schema");
                    const { eq: eqDel } = await import("drizzle-orm");
                    const { getDb: getDbDel } = await import("./db");
                    const dbDel = await getDbDel();
                    if (dbDel) {
                      await dbDel.delete(gradesT).where(eqDel(gradesT.callId, call.id));
                      await dbDel.delete(callsT).where(eqDel(callsT.id, call.id));
                      console.log(`[DemoUpload] Auto-deleted demo call ${call.id}`);
                    }
                  } catch (err) {
                    console.error(`[DemoUpload] Failed to auto-delete call ${call.id}:`, err);
                  }
                }, 15 * 60 * 1000); // 15 minutes
              }
            }
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
        classification: z.enum(["conversation", "admin_call", "voicemail", "no_answer", "callback_request", "wrong_number", "dismissed"]),
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
        const newStatus = input.classification === "dismissed" ? "dismissed" : (shouldGrade ? "completed" : "skipped");

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
          ...(input.classification !== "dismissed" ? { classification: input.classification } : {}),
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
        callOutcome: z.enum(["none", "appointment_set", "offer_made", "offer_rejected", "callback_scheduled", "interested", "left_vm", "no_answer", "not_interested", "dead"]),
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

    // Bulk re-grade calls with latest rubric and outcome classification
    bulkRegrade: protectedProcedure
      .input(z.object({
        filter: z.enum(["callback_only", "all_completed"]),
        daysBack: z.number().min(1).max(365).default(30),
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user?.teamRole !== 'admin') {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin access required' });
        }

        const { processCall } = await import("./grading");
        const { and, eq, gte, isNotNull, sql } = await import("drizzle-orm");
        const { getDb } = await import("./db");
        const { calls } = await import("../drizzle/schema");
        const db = await getDb();
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database unavailable' });

        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - input.daysBack);

        const conditions = [
          eq(calls.tenantId, ctx.user.tenantId!),
          eq(calls.status, "completed"),
          isNotNull(calls.transcript),
          gte(calls.callTimestamp, cutoffDate),
        ];

        if (input.filter === "callback_only") {
          conditions.push(eq(calls.callOutcome, "callback_scheduled"));
        }

        const callsToRegrade = await db.select({ id: calls.id })
          .from(calls)
          .where(and(...conditions))
          .orderBy(sql`${calls.callTimestamp} DESC`)
          .limit(200);

        // Process in background (don't await)
        const callIds = callsToRegrade.map((c: { id: number }) => c.id);
        if (callIds.length > 0) {
          (async () => {
            for (const callId of callIds) {
              try {
                await processCall(callId);
                console.log(`[BulkRegrade] Re-graded call ${callId}`);
              } catch (err) {
                console.error(`[BulkRegrade] Failed to re-grade call ${callId}:`, err);
              }
            }
            console.log(`[BulkRegrade] Completed. Processed ${callIds.length} calls.`);
          })();
        }

        return { queued: callIds.length, filter: input.filter, daysBack: input.daysBack };
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

    // ============ NEXT STEPS ============
    generateNextSteps: protectedProcedure
      .input(z.object({ callId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const call = await getCallById(input.callId);
        if (!call) throw new TRPCError({ code: "NOT_FOUND", message: "Call not found" });
        if (call.tenantId && ctx.user?.tenantId && call.tenantId !== ctx.user.tenantId) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Call not found" });
        }

        const tenantId = call.tenantId;
        const grade = await getCallGradeByCallId(input.callId);

        // 1. Fetch prior calls for same contact
        let priorCallsSummary = "";
        if (call.ghlContactId) {
          const { getDb } = await import("./db");
          const db1 = await getDb();
          if (db1) {
            const { calls: callsTable } = await import("../drizzle/schema");
            const { eq, and, ne, desc } = await import("drizzle-orm");
            const priorCalls = await db1.select()
              .from(callsTable)
              .where(and(
                eq(callsTable.ghlContactId, call.ghlContactId),
                ne(callsTable.id, call.id)
              ))
              .orderBy(desc(callsTable.callTimestamp))
              .limit(5);

            if (priorCalls.length > 0) {
              priorCallsSummary = "\n\nPRIOR CALLS WITH THIS CONTACT:\n";
              for (const pc of priorCalls) {
                priorCallsSummary += `- ${pc.callTimestamp ? new Date(pc.callTimestamp).toLocaleDateString() : 'Unknown date'}`;
                priorCallsSummary += ` | ${pc.callType || 'unknown'} | Outcome: ${pc.callOutcome || 'none'}`;
                priorCallsSummary += ` | ${pc.teamMemberName || 'Unknown'}\n`;
                if (pc.transcript) {
                  priorCallsSummary += `  Transcript excerpt: ${pc.transcript.substring(0, 1500)}...\n`;
                }
              }
            }
          }
        }

        // 2. Fetch GHL conversation messages (SMS history)
        let smsHistory = "";
        if (call.ghlContactId && tenantId) {
          try {
            const { getCredentialsForTenant, ghlFetch } = await import("./ghlActions");
            const creds = await getCredentialsForTenant(tenantId);
            if (creds) {
              const searchData = await ghlFetch(
                creds,
                `/conversations/search?locationId=${creds.locationId}&contactId=${call.ghlContactId}`
              );
              const conversations = searchData.conversations || [];
              if (conversations.length > 0) {
                const convId = conversations[0].id;
                const msgData = await ghlFetch(creds, `/conversations/${convId}/messages`);
                const messages = msgData.messages?.messages || msgData.messages || [];
                const recentMsgs = messages.slice(-10);
                if (recentMsgs.length > 0) {
                  smsHistory = "\n\nRECENT SMS HISTORY WITH THIS CONTACT:\n";
                  for (const msg of recentMsgs) {
                    const dir = msg.direction === 1 ? "SENT" : "RECEIVED";
                    const date = msg.dateAdded ? new Date(msg.dateAdded).toLocaleString() : 'Unknown';
                    smsHistory += `[${dir}] ${date}: ${msg.body || '(no text)'}\n`;
                  }
                }
              }
            }
          } catch (e) {
            console.error("[NextSteps] Failed to fetch SMS history:", e);
          }
        }

        // 3. Fetch GHL tasks for this contact
        let existingTasks = "";
        if (call.ghlContactId && tenantId) {
          try {
            const { getTasksForContact } = await import("./ghlActions");
            const tasks = await getTasksForContact(tenantId, call.ghlContactId);
            if (tasks.length > 0) {
              existingTasks = "\n\nEXISTING TASKS FOR THIS CONTACT:\n";
              for (const t of tasks) {
                existingTasks += `- ${t.title} | Due: ${t.dueDate || 'No date'} | ${t.completed ? 'COMPLETED' : 'PENDING'}\n`;
              }
            }
          } catch (e) {
            console.error("[NextSteps] Failed to fetch tasks:", e);
          }
        }

        // 4. Fetch recent executed actions by this user (learning from patterns)
        let recentActionPatterns = "";
        if (tenantId) {
          try {
            const { getDb: getDb2 } = await import("./db");
            const db2 = await getDb2();
            if (db2) {
              const { coachActionLog } = await import("../drizzle/schema");
              const { eq, and, desc } = await import("drizzle-orm");
              const recentActions = await db2.select()
                .from(coachActionLog)
                .where(and(
                  eq(coachActionLog.tenantId, tenantId),
                  eq(coachActionLog.status, "executed")
                ))
                .orderBy(desc(coachActionLog.createdAt))
                .limit(30);

              if (recentActions.length > 0) {
                recentActionPatterns = "\n\nRECENT ACTION PATTERNS (learn from what this team typically does after calls):\n";
                for (const a of recentActions) {
                  const payload = a.payload as any;
                  recentActionPatterns += `- ${a.actionType} for ${a.targetContactName || 'unknown'}`;
                  if (payload?.stageName) recentActionPatterns += ` → Stage: ${payload.stageName}`;
                  if (payload?.pipelineName) recentActionPatterns += ` in ${payload.pipelineName}`;
                  if (payload?.dueDate) recentActionPatterns += ` | Due: ${payload.dueDate}`;
                  if (payload?.title) recentActionPatterns += ` | Title: ${payload.title}`;
                  if (a.actionType === 'send_sms' && payload?.message) recentActionPatterns += ` | SMS: "${payload.message.substring(0, 80)}..."`;
                  recentActionPatterns += "\n";
                }
              }
            }
          } catch (e) {
            console.error("[NextSteps] Failed to fetch action patterns:", e);
          }
        }

        // 5. Fetch user style preferences
        let styleContext = "";
        if (tenantId && ctx.user?.id) {
          try {
            const { buildPreferenceContext } = await import("./coachPreferences");
            styleContext = await buildPreferenceContext(tenantId, ctx.user.id);
            if (styleContext) {
              styleContext = "\n\nUSER STYLE PREFERENCES (match this style when drafting content):\n" + styleContext;
            }
          } catch (e) {
            console.error("[NextSteps] Failed to fetch preferences:", e);
          }
        }

        // 6. Fetch available pipelines and workflows for accurate suggestions
        let availableOptions = "";
        if (tenantId) {
          try {
            const { getPipelinesForTenant } = await import("./ghlActions");
            const pipelines = await getPipelinesForTenant(tenantId).catch((e: any) => {
              console.warn("[NextSteps] Pipeline fetch failed (non-blocking):", e?.message || e);
              return [] as any[];
            });
            if (pipelines.length > 0) {
              availableOptions += "\n\nAVAILABLE PIPELINES AND STAGES:\n";
              for (const p of pipelines) {
                availableOptions += `Pipeline: "${p.name}" → Stages: ${p.stages.map((s: any) => `"${s.name}"`).join(", ")}\n`;
              }
            }
          } catch (e) {
            console.warn("[NextSteps] Pipeline fetch error (non-blocking):", e);
          }
          try {
            const { getWorkflowsForTenant } = await import("./ghlActions");
            const workflows = await getWorkflowsForTenant(tenantId).catch((e: any) => {
              console.warn("[NextSteps] Workflow fetch failed (non-blocking):", e?.message || e);
              return [] as any[];
            });
            if (workflows.length > 0) {
              availableOptions += "\nAVAILABLE WORKFLOWS:\n";
              for (const w of workflows) {
                availableOptions += `- "${w.name}"\n`;
              }
            }
          } catch (e) {
            console.warn("[NextSteps] Workflow fetch error (non-blocking):", e);
          }
        }

        // Build the LLM prompt
        const systemPrompt = `You are an AI assistant for a real estate flipping business. You analyze call transcripts, prior communication history, and team action patterns to suggest specific, actionable next steps for a lead.

You must deeply understand the FULL context — what was discussed, what was promised, what the seller's situation is, prior conversations, existing tasks, and SMS history — before suggesting actions.

IMPORTANT RULES:
- Only suggest actions that make sense based on what actually happened in the call and prior communication
- Learn from the team's recent action patterns — if they typically move contacts to certain stages after certain outcomes, suggest the same
- Match the user's writing style for SMS and notes based on their style preferences
- Use EXACT pipeline stage names and workflow names from the available options provided
- For tasks, suggest realistic due dates based on what was discussed (e.g., seller said "call me in 2 weeks" → due date 2 weeks out)
- For SMS, draft messages that reference specific details from the call (property address, price discussed, seller's concerns)
- Do NOT suggest redundant actions (e.g., don't suggest creating a task if one already exists for the same thing)
- Do NOT suggest actions that contradict what happened (e.g., don't suggest "send offer" if seller said they're not interested)
- Each action should have a clear reason WHY it's being suggested based on the call/communication context

Return a JSON object with an "actions" array. Each action object has:
- actionType: one of "check_off_task", "update_task", "create_task", "add_note", "create_appointment", "change_pipeline_stage", "send_sms", "schedule_sms", "add_to_workflow", "remove_from_workflow"
- reason: 1-2 sentence explanation of WHY this action is suggested based on the call context
- suggested: boolean — true if AI recommends this action, false if it's just an available option
- payload: object with the relevant fields for the action type:
  - check_off_task: { taskKeyword: "keyword to find the task" }
  - update_task: { taskKeyword: "keyword to find", dueDate: "YYYY-MM-DD", description: "optional new description" }
  - create_task: { title: "task title", description: "details", dueDate: "YYYY-MM-DD" }
  - add_note: { noteBody: "the note content — include call summary and specific details" }
  - create_appointment: { title: "appointment title", startTime: "ISO datetime", endTime: "ISO datetime", calendarName: "calendar name" }
  - change_pipeline_stage: { pipelineName: "exact pipeline name", stageName: "exact stage name" }
  - send_sms: { message: "SMS text" }
  - schedule_sms: { message: "SMS text", scheduledDate: "YYYY-MM-DD", scheduledTime: "HH:mm" }
  - add_to_workflow: { workflowName: "exact workflow name" }
  - remove_from_workflow: { workflowName: "exact workflow name" }

For schedule_sms, this will be implemented as a task reminder since GHL doesn't support scheduled SMS directly.

IMPORTANT: The payload object must include ALL fields (noteBody, title, description, dueDate, taskKeyword, message, scheduledDate, scheduledTime, pipelineName, stageName, workflowName, startTime, endTime, calendarName). Set unused fields to empty string "". For example, an add_note action should have noteBody filled with the actual note content, and all other fields set to "".

Return ONLY the JSON object, no other text.`;

        const userPrompt = `CALL DETAILS:
- Contact: ${call.contactName || 'Unknown'}
- Phone: ${call.contactPhone || 'Unknown'}
- Property: ${call.propertyAddress || 'Unknown'}
- Call Type: ${call.callType || 'Unknown'}
- Call Outcome: ${call.callOutcome || 'None'}
- Team Member: ${call.teamMemberName || 'Unknown'}
- Duration: ${call.duration ? Math.floor(call.duration / 60) + 'm ' + (call.duration % 60) + 's' : 'Unknown'}
- Date: ${call.callTimestamp ? new Date(call.callTimestamp).toLocaleString() : 'Unknown'}

GRADE SUMMARY:
${grade?.summary || 'No grade available'}
${grade?.strengths ? 'Strengths: ' + JSON.stringify(grade.strengths) : ''}
${grade?.improvements ? 'Areas for improvement: ' + JSON.stringify(grade.improvements) : ''}

FULL TRANSCRIPT:
${call.transcript || 'No transcript available'}
${priorCallsSummary}${smsHistory}${existingTasks}${recentActionPatterns}${styleContext}${availableOptions}

Based on ALL of the above context, suggest the most relevant next steps for this lead. Only suggest actions that are clearly warranted by the call content and communication history.`;

        const response = await invokeLLM({
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          response_format: {
            type: "json_schema",
            json_schema: {
              name: "next_steps",
              strict: true,
              schema: {
                type: "object",
                properties: {
                  actions: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        actionType: { type: "string" },
                        reason: { type: "string" },
                        suggested: { type: "boolean" },
                        payload: {
                          type: "object",
                          properties: {
                            noteBody: { type: "string", description: "Full note content for add_note actions" },
                            title: { type: "string", description: "Task or appointment title" },
                            description: { type: "string", description: "Task description or details" },
                            dueDate: { type: "string", description: "Due date in YYYY-MM-DD format" },
                            taskKeyword: { type: "string", description: "Keyword to find existing task" },
                            message: { type: "string", description: "SMS message text" },
                            scheduledDate: { type: "string", description: "Scheduled send date YYYY-MM-DD" },
                            scheduledTime: { type: "string", description: "Scheduled send time HH:mm" },
                            pipelineName: { type: "string", description: "Exact pipeline name" },
                            stageName: { type: "string", description: "Exact stage name" },
                            workflowName: { type: "string", description: "Exact workflow name" },
                            startTime: { type: "string", description: "Appointment start time ISO" },
                            endTime: { type: "string", description: "Appointment end time ISO" },
                            calendarName: { type: "string", description: "Calendar name" },
                          },
                          required: ["noteBody", "title", "description", "dueDate", "taskKeyword", "message", "scheduledDate", "scheduledTime", "pipelineName", "stageName", "workflowName", "startTime", "endTime", "calendarName"],
                          additionalProperties: false,
                        },
                      },
                      required: ["actionType", "reason", "suggested", "payload"],
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

        const content = response.choices?.[0]?.message?.content;
        if (!content) return { actions: [] };

        try {
          const parsed = JSON.parse(content as string);
          const VALID_NEXT_STEP_TYPES = [
            "check_off_task", "update_task", "create_task", "add_note",
            "create_appointment", "change_pipeline_stage", "send_sms",
            "schedule_sms", "add_to_workflow", "remove_from_workflow",
          ];
          const validActions = (parsed.actions || []).filter((a: any) =>
            VALID_NEXT_STEP_TYPES.includes(a.actionType)
          );

          // Log payload content for debugging
          for (const action of validActions) {
            console.log(`[NextSteps] Action: ${action.actionType}, payload keys with content:`, 
              Object.entries(action.payload || {}).filter(([_, v]) => v && String(v).trim()).map(([k]) => k));
          }

          // Persist to database
          if (validActions.length > 0) {
            const { getDb: getDbNs } = await import("./db");
            const dbNs = await getDbNs();
            if (dbNs) {
              const { callNextSteps } = await import("../drizzle/schema");
              const { eq } = await import("drizzle-orm");
              // Clear any existing pending next steps for this call (regeneration)
              await dbNs.delete(callNextSteps).where(
                eq(callNextSteps.callId, input.callId)
              );
              for (const action of validActions) {
                await dbNs.insert(callNextSteps).values({
                  callId: input.callId,
                  tenantId: call.tenantId || undefined,
                  actionType: action.actionType,
                  reason: action.reason || "",
                  suggested: action.suggested ? "true" : "false",
                  payload: action.payload || {},
                  status: "pending",
                });
              }
              console.log(`[NextSteps] Stored ${validActions.length} next steps for call ${input.callId}`);
            }
          }

          return {
            actions: validActions,
            contactName: call.contactName,
            contactId: call.ghlContactId,
          };
        } catch (e) {
          console.error("[NextSteps] Failed to parse LLM response:", e);
          return { actions: [] };
        }
      }),

    // Get stored next steps for a call
    getNextSteps: protectedProcedure
      .input(z.object({ callId: z.number() }))
      .query(async ({ ctx, input }) => {
        const call = await getCallById(input.callId);
        if (!call) return { actions: [], contactName: "", contactId: null };
        if (call.tenantId && ctx.user?.tenantId && call.tenantId !== ctx.user.tenantId) {
          return { actions: [], contactName: "", contactId: null };
        }

        const { getDb: getDbNs2 } = await import("./db");
        const dbNs2 = await getDbNs2();
        if (!dbNs2) return { actions: [], contactName: call.contactName || "", contactId: call.ghlContactId };

        const { callNextSteps } = await import("../drizzle/schema");
        const { eq, asc } = await import("drizzle-orm");
        const rows = await dbNs2.select().from(callNextSteps)
          .where(eq(callNextSteps.callId, input.callId))
          .orderBy(asc(callNextSteps.createdAt));

        const actions = rows.map(r => ({
          dbId: r.id,
          actionType: r.actionType,
          reason: r.reason,
          suggested: r.suggested === "true",
          payload: r.payload || {},
          status: r.status || "pending",
          result: r.result || undefined,
        }));

        return {
          actions,
          contactName: call.contactName || "",
          contactId: call.ghlContactId,
        };
      }),

    // Update a next step status (pushed, skipped, failed)
    updateNextStepStatus: protectedProcedure
      .input(z.object({
        nextStepId: z.number(),
        status: z.enum(["pending", "pushed", "skipped", "failed"]),
        result: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const { getDb: getDbNs3 } = await import("./db");
        const dbNs3 = await getDbNs3();
        if (!dbNs3) return { success: false };

        const { callNextSteps } = await import("../drizzle/schema");
        const { eq } = await import("drizzle-orm");
        await dbNs3.update(callNextSteps)
          .set({ status: input.status, result: input.result || null })
          .where(eq(callNextSteps.id, input.nextStepId));

        return { success: true };
      }),

    // Edit a next step's payload (manual edit or AI-assisted)
    editNextStep: protectedProcedure
      .input(z.object({
        nextStepId: z.number(),
        payload: z.record(z.string(), z.any()).optional(),
        aiInstruction: z.string().optional(),
        currentAction: z.any().optional(),
      }))
      .mutation(async ({ input }) => {
        const { getDb: getDbEdit } = await import("./db");
        const dbEdit = await getDbEdit();
        if (!dbEdit) return { success: false, action: null };

        const { callNextSteps } = await import("../drizzle/schema");
        const { eq } = await import("drizzle-orm");

        if (input.payload && !input.aiInstruction) {
          // Direct manual edit — just save the new payload
          await dbEdit.update(callNextSteps)
            .set({ payload: input.payload })
            .where(eq(callNextSteps.id, input.nextStepId));
          return { success: true, action: { payload: input.payload } };
        }

        if (input.aiInstruction && input.currentAction) {
          // AI-assisted edit — send instruction + current state to LLM
          const { invokeLLM } = await import("./_core/llm");
          const response = await invokeLLM({
            messages: [
              {
                role: "system",
                content: `You are editing a CRM action for a real estate business. The user wants to modify an existing action. Return ONLY a JSON object with the updated fields. Keep all fields that weren't mentioned unchanged. Available fields: noteBody, title, description, dueDate, taskKeyword, message, scheduledDate, scheduledTime, pipelineName, stageName, workflowName, startTime, endTime, calendarName.`,
              },
              {
                role: "user",
                content: `Current action type: ${input.currentAction.actionType}\nCurrent payload: ${JSON.stringify(input.currentAction.payload)}\n\nUser instruction: ${input.aiInstruction}\n\nReturn the updated payload as a JSON object.`,
              },
            ],
          });

          const rawContent = response.choices?.[0]?.message?.content;
          if (!rawContent) {
            console.error("[NextSteps] AI edit returned no content");
            return { success: false, action: null };
          }

          try {
            // Strip markdown code block wrappers if present
            let content = (rawContent as string).trim();
            if (content.startsWith("```")) {
              content = content.replace(/^```(?:json)?\s*\n?/, "").replace(/\n?```\s*$/, "");
            }
            console.log("[NextSteps] AI edit response:", content.substring(0, 200));
            const updatedPayload = JSON.parse(content);
            // Merge with existing payload
            const mergedPayload = { ...input.currentAction.payload, ...updatedPayload };
            await dbEdit.update(callNextSteps)
              .set({ payload: mergedPayload })
              .where(eq(callNextSteps.id, input.nextStepId));
            return { success: true, action: { payload: mergedPayload } };
          } catch (e) {
            console.error("[NextSteps] Failed to parse AI edit response:", e);
            return { success: false, action: null };
          }
        }

        return { success: false, action: null };
      }),

    // Get available pipelines and stages for dropdown
    getAvailablePipelines: protectedProcedure
      .query(async ({ ctx }) => {
        const tenantId = ctx.user.tenantId;
        if (!tenantId) return { pipelines: [] };
        try {
          const { getPipelinesForTenant } = await import("./ghlActions");
          const pipelines = await getPipelinesForTenant(tenantId);
          return { pipelines: pipelines.map(p => ({ id: p.id, name: p.name, stages: p.stages })) };
        } catch (e: any) {
          console.warn("[NextSteps] Failed to fetch pipelines for dropdown:", e?.message);
          return { pipelines: [] };
        }
      }),

    // Get available workflows for dropdown
    getAvailableWorkflows: protectedProcedure
      .query(async ({ ctx }) => {
        const tenantId = ctx.user.tenantId;
        if (!tenantId) return { workflows: [] };
        try {
          const { getWorkflowsForTenant } = await import("./ghlActions");
          const workflows = await getWorkflowsForTenant(tenantId);
          return { workflows: workflows.map(w => ({ id: w.id, name: w.name })) };
        } catch (e: any) {
          console.warn("[NextSteps] Failed to fetch workflows for dropdown:", e?.message);
          return { workflows: [] };
        }
      }),

    // Get tasks for a specific contact for dropdown
    getContactTasks: protectedProcedure
      .input(z.object({ ghlContactId: z.string() }))
      .query(async ({ ctx, input }) => {
        const tenantId = ctx.user.tenantId;
        if (!tenantId) return { tasks: [] };
        try {
          const { getTasksForContact } = await import("./ghlActions");
          const { getGhlUserIdMap } = await import("./db");
          const [tasks, ghlUserMap] = await Promise.all([
            getTasksForContact(tenantId, input.ghlContactId),
            getGhlUserIdMap(tenantId),
          ]);
          // Only show incomplete/open tasks in the dropdown
          const incompleteTasks = tasks.filter((t: any) => !t.completed);
          return {
            tasks: incompleteTasks.map((t: any) => {
              const assigneeName = t.assignedTo ? ghlUserMap.get(t.assignedTo)?.name || null : null;
              return {
                id: t.id,
                title: t.title || t.body || "Untitled Task",
                dueDate: t.dueDate,
                assignedTo: assigneeName,
                assignedToGhlId: t.assignedTo || null,
              };
            }),
          };
        } catch (e: any) {
          console.warn("[NextSteps] Failed to fetch tasks for dropdown:", e?.message);
          return { tasks: [] };
        }
      }),

    // Get available calendars for dropdown
    getAvailableCalendars: protectedProcedure
      .query(async ({ ctx }) => {
        const tenantId = ctx.user.tenantId;
        if (!tenantId) return { calendars: [] };
        try {
          const { getCalendarsForTenant } = await import("./ghlActions");
          const calendars = await getCalendarsForTenant(tenantId);
          return { calendars: calendars.map(c => ({ id: c.id, name: c.name })) };
        } catch (e: any) {
          console.warn("[NextSteps] Failed to fetch calendars for dropdown:", e?.message);
          return { calendars: [] };
        }
      }),

    // Get count of pending next steps for a call
    getNextStepsCount: protectedProcedure
      .input(z.object({ callId: z.number() }))
      .query(async ({ input }) => {
        const { getDb: getDbNs4 } = await import("./db");
        const dbNs4 = await getDbNs4();
        if (!dbNs4) return { count: 0 };

        const { callNextSteps } = await import("../drizzle/schema");
        const { eq, and, sql } = await import("drizzle-orm");
        const result = await dbNs4.select({ count: sql<number>`count(*)` })
          .from(callNextSteps)
          .where(and(
            eq(callNextSteps.callId, input.callId),
            eq(callNextSteps.status, "pending")
          ));

        return { count: result[0]?.count || 0 };
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

    // Backfill property addresses for existing GHL calls
    backfillAddresses: protectedProcedure.mutation(async () => {
      return await backfillGHLPropertyAddresses();
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
        
        // Pass viewable IDs, tenant ID, and current user's team member ID for personal stats
        return await getCallStats({
          ...input,
          viewableTeamMemberIds: viewableIds,
          tenantId: ctx.user?.tenantId || undefined,
          currentTeamMemberId: teamMember?.id,
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

    // Detect correction patterns across team feedback
    patterns: protectedProcedure
      .input(z.object({
        dayWindow: z.number().optional().default(7),
        minCount: z.number().optional().default(2),
      }).optional())
      .query(async ({ ctx, input }) => {
        const { detectCorrectionPatterns } = await import("./correctionMonitor");
        return await detectCorrectionPatterns({
          dayWindow: input?.dayWindow || 7,
          minCount: input?.minCount || 2,
          tenantId: ctx.user?.tenantId || undefined,
        });
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
      .input(z.object({
        question: z.string(),
        history: z.array(z.object({
          role: z.enum(["user", "assistant"]),
          content: z.string(),
        })).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        // Rate limit AI operations
        checkRateLimit(ctx.user?.tenantId, "ai");
        trackUsage(ctx.user?.tenantId, "ai_chat");
        
        const tenantId = ctx.user?.tenantId || undefined;

        // Load tenant playbook context for dynamic prompts
        const { buildCoachIndustryContext } = await import("./playbooks");
        const industryCtx = tenantId ? await buildCoachIndustryContext(tenantId) : null;

        // Get team members list (this is the source of truth for who's on the team)
        const teamMembersList = await getTeamMembers(tenantId);
        const teamMemberNames = teamMembersList.map(m => m.name);

        // Detect if the user is asking about a specific team member
        const questionLower = input.question.toLowerCase();
        let mentionedMember: typeof teamMembersList[0] | null = null;
        let mentionedMemberCalls: Array<any> = [];
        let isSelfReference = false;

        // Detect self-referencing: "my calls", "I already do it", "my score", etc.
        const selfReferencePatterns = /\b(my calls|my score|my grade|my performance|i already|i do that|i do it|i say that|i always|my approach|my style|my technique|my opening|my intro|how i|what i say|what i do|when i call|i set expectations|i handle|i ask|my last call|my recent|my average|grade me|my transcript)\b/i;
        if (selfReferencePatterns.test(input.question)) {
          isSelfReference = true;
        }

        // Try to match a team member name in the question
        for (const member of teamMembersList) {
          const nameParts = member.name.toLowerCase().split(' ');
          const fullName = member.name.toLowerCase();
          // Match full name or first name or last name
          if (questionLower.includes(fullName) ||
              nameParts.some(part => part.length > 2 && questionLower.includes(part))) {
            mentionedMember = member;
            break;
          }
        }

        // Check if the user mentioned a name that doesn't match any team member
        let unknownNameMentioned = false;
        if (!mentionedMember) {
          // Simple heuristic: look for capitalized words that could be names
          const namePatterns = input.question.match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?\b/g) || [];
          const commonWords = new Set(['What', 'How', 'Why', 'When', 'Where', 'Who', 'Can', 'Could', 'Would', 'Should', 'Tell', 'Show', 'Give', 'Help', 'About', 'Team', 'Call', 'Last', 'Recent', 'Best', 'Worst', 'Good', 'Bad', 'Well', 'Today', 'Yesterday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday', 'This', 'That', 'The', 'His', 'Her', 'Their', 'Score', 'Grade', 'Summary']);
          const potentialNames = namePatterns.filter(n => !commonWords.has(n) && !commonWords.has(n.split(' ')[0]));
          if (potentialNames.length > 0) {
            unknownNameMentioned = true;
          }
        }

        // --- ROLE-BASED VISIBILITY ---
        // Determine who the current user is on the team
        const currentUserTeamMember = ctx.user?.id
          ? await getTeamMemberByUserId(ctx.user.id)
          : null;
        const isAdmin = ctx.user?.role === 'admin' || ctx.user?.role === 'super_admin';
        const isLeadGenerator = currentUserTeamMember?.teamRole === 'lead_generator' || ctx.user?.teamRole === 'lead_generator';

        // Build set of team member IDs this user can see individual performance for
        const visibleMemberIds = new Set<number>();
        if (isAdmin) {
          // Admins see everyone
          teamMembersList.forEach(m => visibleMemberIds.add(m.id));
        } else if (currentUserTeamMember) {
          // Always can see yourself
          visibleMemberIds.add(currentUserTeamMember.id);
          // Get direct reports (people assigned to this user)
          try {
            const assignments = await getTeamAssignments(tenantId);
            for (const a of assignments) {
              // If current user is the "acquisitionManagerId" (supervisor), they can see the "leadManagerId" (report)
              if (a.acquisitionManagerId === currentUserTeamMember.id) {
                visibleMemberIds.add(a.leadManagerId);
              }
            }
          } catch { /* assignment lookup is best-effort */ }
        }

        // Check if user is asking about someone they can't see
        let accessDeniedForMember = false;
        if (mentionedMember && !isAdmin && !visibleMemberIds.has(mentionedMember.id)) {
          accessDeniedForMember = true;
        }

        // Member-specific calls are now fetched above in the smart data window section

        // Get training materials for context
        const trainingMaterials = await getTrainingMaterials({ tenantId });
        const trainingContext = trainingMaterials
          .map(m => `### ${m.title}\n${m.content || ""}`)
          .join("\n\n");

        // Get ALL recent calls for coaching insights (examples, patterns, objection handling)
        // This is available to everyone for learning purposes
        // Smart data window: pull more data when asking about specific topics or members
        
        // Self-reference: if user says "my calls" / "I already do it" and no specific member mentioned,
        // resolve to the current user's team member profile
        if (isSelfReference && !mentionedMember && currentUserTeamMember) {
          mentionedMember = currentUserTeamMember;
        }

        const isAskingAboutMember = !!mentionedMember;
        const isAskingAboutPerformance = /\b(performance|score|grade|average|trend|improv|progress|week|month|compare|rank|best|worst)\b/i.test(input.question);
        const isAskingAboutOutcome = /\b(walkthrough|appointment|callback|follow.?up|offer|close|no.?show|skip|disqualif)\b/i.test(input.question);
        
        // Base limit: 25 for general questions, 50 for performance/trend questions
        let callLimit = isAskingAboutPerformance ? 50 : 25;
        
        // For specific member queries, also fetch their dedicated calls with higher limit
        if (isAskingAboutMember && !accessDeniedForMember) {
          try {
            const memberCallsResult = await getCallsWithGrades({
              teamMemberId: mentionedMember!.id,
              limit: 20, // Up from 10 — more data for better analysis
              tenantId,
            });
            mentionedMemberCalls = memberCallsResult.items;
          } catch { /* call fetch is best-effort */ }
        }
        
        // For outcome-specific questions, filter by relevant outcomes
        let outcomeFilter: string[] | undefined;
        if (isAskingAboutOutcome) {
          const q = input.question.toLowerCase();
          if (q.includes('walkthrough') || q.includes('appointment')) outcomeFilter = ['appointment_set', 'walkthrough_scheduled'];
          else if (q.includes('callback') || q.includes('follow')) outcomeFilter = ['callback_scheduled', 'follow_up_needed'];
          else if (q.includes('offer') || q.includes('close')) outcomeFilter = ['offer_made', 'deal_closed'];
          else if (q.includes('no show') || q.includes('no-show')) outcomeFilter = ['no_show'];
          else if (q.includes('skip') || q.includes('disqualif')) outcomeFilter = ['not_interested', 'wrong_number', 'do_not_call'];
        }
        
        const recentCallsResult = await getCallsWithGrades({
          limit: callLimit,
          tenantId,
          ...(outcomeFilter ? { outcomes: outcomeFilter } : {}),
        });
        const recentCalls = recentCallsResult.items;

        // Build team member context — admins see full stats, regular users see limited info
        const teamContext = teamMembersList.map(m => {
          const memberCalls = recentCalls.filter(c => c.teamMemberId === m.id);
          const gradedCalls = memberCalls.filter(c => c.grade);
          if (isAdmin || visibleMemberIds.has(m.id)) {
            // Full stats for visible members
            const avgScore = gradedCalls.length > 0
              ? Math.round(gradedCalls.reduce((sum, c) => sum + parseFloat(c.grade?.overallScore || "0"), 0) / gradedCalls.length)
              : null;
            const outcomes = memberCalls.reduce((acc, c) => {
              const outcome = c.callOutcome || 'unknown';
              acc[outcome] = (acc[outcome] || 0) + 1;
              return acc;
            }, {} as Record<string, number>);
            const outcomeStr = Object.entries(outcomes).map(([k, v]) => `${k}: ${v}`).join(', ');
            const roleLabel = industryCtx?.roleDescriptions?.[m.teamRole || ''] ? m.teamRole : (m.teamRole || 'unknown').replace('_', ' ');
            return `- ${m.name} (${roleLabel}) — ${gradedCalls.length} graded calls${avgScore !== null ? `, avg score: ${avgScore}%` : ''}${outcomeStr ? `, outcomes: [${outcomeStr}]` : ''}`;
          } else {
            // Just name and role for non-visible members
            const roleLabel = industryCtx?.roleDescriptions?.[m.teamRole || ''] ? m.teamRole : (m.teamRole || 'unknown').replace('_', ' ');
            return `- ${m.name} (${roleLabel})`;
          }
        }).join('\n');

        // Build recent calls summary — for coaching insights, include all calls but
        // anonymize scores/grades for non-visible members (keep content for learning)
        let recentCallsSummary = "";
        if (recentCalls.length > 0) {
          const displayLimit = isAskingAboutPerformance ? 30 : 20;
          recentCallsSummary = `\n\nRECENT CALLS (${recentCalls.length} loaded, showing ${Math.min(recentCalls.length, displayLimit)} — use for coaching insights, examples, and patterns):\n`;
          for (const call of recentCalls.slice(0, displayLimit)) {
            const grade = call.grade;
            const canSeeDetails = isAdmin || visibleMemberIds.has(call.teamMemberId || 0);
            recentCallsSummary += `- ${call.contactName || 'Unknown'}`;
            if (call.propertyAddress) recentCallsSummary += ` | Property: ${call.propertyAddress}`;
            recentCallsSummary += ` | ${call.callType || 'unknown'} | ${call.callOutcome || 'no outcome'}`;
            recentCallsSummary += ` | Team: ${call.teamMemberName || 'Unknown'}`;
            recentCallsSummary += ` | ${call.callTimestamp ? new Date(call.callTimestamp).toLocaleDateString() : 'Unknown date'}`;
            if (grade) {
              if (canSeeDetails) {
                recentCallsSummary += ` | Grade: ${grade.overallGrade} (${grade.overallScore}%)`;
              }
              // Always include summary for coaching/learning (how objections were handled, etc.)
              if (grade.summary) recentCallsSummary += ` | ${grade.summary.substring(0, 150)}`;
            }
            recentCallsSummary += '\n';
          }
        } else {
          recentCallsSummary = "\n\nNo recent calls found in the system.";
        }

        // Build specific member call data if asked about someone
        let memberCallContext = "";
        if (accessDeniedForMember && mentionedMember) {
          memberCallContext = `\n\nACCESS RESTRICTED: The current user does not have permission to view ${mentionedMember.name}'s individual performance data. They can only view their own data and data for people assigned to them.`;
        } else if (mentionedMember && mentionedMemberCalls.length > 0) {
          memberCallContext = `\n\nDETAILED DATA FOR ${mentionedMember.name.toUpperCase()}${isSelfReference ? ' (THIS IS THE CURRENT USER — they are asking about their own calls)' : ''}:\n`;
          memberCallContext += `Role: ${(mentionedMember.teamRole || 'unknown').replace('_', ' ')}\n`;
          memberCallContext += `Recent graded calls: ${mentionedMemberCalls.length}\n`;
          const scores = mentionedMemberCalls.filter(c => c.grade).map(c => parseFloat(c.grade!.overallScore || "0"));
          if (scores.length > 0) {
            memberCallContext += `Average score: ${Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)}%\n`;
            memberCallContext += `Score range: ${Math.round(Math.min(...scores))}% - ${Math.round(Math.max(...scores))}%\n`;
          }
          // Detect if user is disputing a grade or claiming they already do something
          const isDisputingGrade = /\b(i already|i do that|i do it|but i|i always|i say|that's not fair|disagree|wrong|incorrect|i did|i said|my approach|my style|should.*score|should.*pass|should.*count)\b/i.test(input.question);
          
          for (const call of mentionedMemberCalls.slice(0, 5)) {
            const grade = call.grade;
            memberCallContext += `\n--- Call with ${call.contactName || "Unknown"} (${call.callTimestamp ? new Date(call.callTimestamp).toLocaleDateString() : 'Unknown date'}) ---\n`;
            if (call.propertyAddress) memberCallContext += `Property: ${call.propertyAddress}\n`;
            memberCallContext += `Type: ${call.callType || 'unknown'} | Outcome: ${call.callOutcome || 'none'}\n`;
            if (grade) {
              memberCallContext += `Grade: ${grade.overallGrade} (${grade.overallScore}%)\n`;
              memberCallContext += `Summary: ${grade.summary || 'N/A'}\n`;
              if (grade.strengths) memberCallContext += `Strengths: ${JSON.stringify(grade.strengths)}\n`;
              if (grade.improvements) memberCallContext += `Areas to improve: ${JSON.stringify(grade.improvements)}\n`;
              // Include per-criterion scores so AI can discuss specific criteria
              if (grade.criteriaScores) {
                try {
                  const criteria = typeof grade.criteriaScores === 'string' ? JSON.parse(grade.criteriaScores) : grade.criteriaScores;
                  if (Array.isArray(criteria)) {
                    memberCallContext += `Criteria breakdown:\n`;
                    for (const c of criteria) {
                      memberCallContext += `  - ${c.name}: ${c.score}/${c.maxPoints} — ${c.feedback}\n`;
                    }
                  }
                } catch { /* criteria parse is best-effort */ }
              }
            }
            // Include transcript excerpt when user is disputing grades or asking about their approach
            // This lets the AI verify claims like "I already do it" against actual call content
            if (call.transcript && (isDisputingGrade || isSelfReference)) {
              const transcriptExcerpt = call.transcript.length > 2000
                ? call.transcript.substring(0, 2000) + "... [truncated]"
                : call.transcript;
              memberCallContext += `Transcript excerpt:\n${transcriptExcerpt}\n`;
            }
          }
        } else if (mentionedMember && mentionedMemberCalls.length === 0) {
          memberCallContext = `\n\n${mentionedMember.name} has no recent graded calls to analyze.`;
        }

        // Get active opportunities/pipeline data — admin only
        let opportunityContext = "";
        if (isAdmin) {
          try {
            const { getDb } = await import("./db");
            const { opportunities } = await import("../drizzle/schema");
            const { eq, and, desc } = await import("drizzle-orm");
            const oppDb = await getDb();
            if (!oppDb || !tenantId) throw new Error('no db');
            const tid: number = tenantId;
            const conditions = [eq(opportunities.tenantId, tid), eq(opportunities.status, "active" as const)];
            const activeOpps = await oppDb
              .select()
              .from(opportunities)
              .where(and(...conditions))
              .orderBy(desc(opportunities.priorityScore))
              .limit(20);
            if (activeOpps.length > 0) {
              const tierCounts: Record<string, number> = {};
              for (const o of activeOpps) {
                tierCounts[o.tier] = (tierCounts[o.tier] || 0) + 1;
              }
              opportunityContext = `\n\nPIPELINE & OPPORTUNITIES (${activeOpps.length} active signals):\n`;
              opportunityContext += `Signal breakdown: ${Object.entries(tierCounts).map(([t, c]) => `${t}: ${c}`).join(', ')}\n`;
              for (const opp of activeOpps.slice(0, 10)) {
                opportunityContext += `- ${opp.contactName || 'Unknown'}`;
                if (opp.propertyAddress) opportunityContext += ` | ${opp.propertyAddress}`;
                opportunityContext += ` | Tier: ${opp.tier} | Priority: ${opp.priorityScore}`;
                if (opp.ghlPipelineStageName) opportunityContext += ` | Stage: ${opp.ghlPipelineStageName}`;
                if (opp.teamMemberName) opportunityContext += ` | Assigned: ${opp.teamMemberName}`;
                opportunityContext += ` | ${opp.reason.substring(0, 100)}`;
                if (opp.suggestion) opportunityContext += ` → ${opp.suggestion.substring(0, 80)}`;
                opportunityContext += '\n';
              }
            }
          } catch { /* opportunity data is best-effort */ }
        }

        // Detect platform and sensitive questions
        const questionIsPlatform = isPlatformQuestion(input.question);
        const questionIsSensitive = isSensitiveQuestion(input.question);

        // Detect and compute stats queries for precise answers
        let computedStatsContext = "";
        const statsIntent = detectStatsIntent(
          input.question,
          teamMembersList.map(m => ({ id: m.id, name: m.name })),
          currentUserTeamMember?.id
        );
        if (statsIntent) {
          try {
            computedStatsContext = await computeStats(
              statsIntent,
              tenantId || 0,
              visibleMemberIds,
              isAdmin,
              currentUserTeamMember?.id
            );
          } catch (err) {
            console.error("[Coach] Stats computation error:", err);
          }
        }

        // Get user's coaching tone preferences
        let coachingPrefs = "";
        try {
          const { buildPreferenceContext } = await import("./coachPreferences");
          coachingPrefs = await buildPreferenceContext(
            ctx.user?.tenantId || 0,
            ctx.user!.id
          );
        } catch { /* preferences are optional */ }

        // Load conversation memory from past sessions
        let conversationMemory = "";
        try {
          if (ctx.user?.tenantId && ctx.user?.id) {
            conversationMemory = await buildCoachMemoryContext(ctx.user.tenantId, ctx.user.id, 8);
          }
        } catch { /* memory is best-effort */ }

        const systemPrompt = `${isLeadGenerator ? (industryCtx?.leadGenFocus || `You are a data-driven cold calling coach for a lead generator on a real estate wholesaling team. Your focus is on LEAD GENERATION — helping this caller gauge seller interest, gather key details, and let interested sellers know their manager will follow up.

Your coaching should focus on:
- Opening lines and hooks for cold calls
- Quickly identifying seller motivation (distress, life events, timeline)
- Handling initial objections ("not interested", "how did you get my number", "stop calling")
- Recognizing when a seller is interested and wrapping up the call professionally ("I'll pass your info along to my manager and they'll reach out")
- Adding notes about seller interest level and key details for the manager
- Efficient call pacing and volume strategies
- NOT on full qualification, offers, walkthroughs, or closing — that's the Lead Manager and Acquisition Manager's job

The Lead Generator's workflow is simple: call, gauge interest, tell the seller their manager will follow up, then add notes so the manager has context. They do NOT do formal handoffs or transfers — they just let the seller know someone will be in touch.`) : (industryCtx?.coachIntro || 'You are a data-driven sales coach for a real estate wholesaling team.')} You have access to REAL call data and team performance metrics below. Your job is to give answers grounded in this actual data.

${SECURITY_RULES}
${questionIsPlatform ? PLATFORM_KNOWLEDGE : ''}
${questionIsSensitive ? '\nSENSITIVE QUESTION DETECTED: The user is asking about restricted information. Follow the SECURITY RULES above strictly. Do NOT reveal any technical, infrastructure, cross-tenant, or implementation details.\n' : ''}
${computedStatsContext ? `\n${computedStatsContext}\n` : ''}
${conversationMemory ? `\n${conversationMemory}\n` : ''}
TEAM MEMBERS (this is the COMPLETE list — no one else is on the team):
${teamContext}
${recentCallsSummary}
${memberCallContext}
${opportunityContext}

${unknownNameMentioned ? `IMPORTANT: The user mentioned a name that does NOT match any team member above. You MUST tell them that person is not on the team and list the actual team members they can ask about.\n` : ''}

Training materials available: ${trainingMaterials.length > 0 ? trainingMaterials.map(m => m.title).join(', ') : 'None'}

${(() => {
  // Semantic topic mapping — maps question concepts to training material topics
  const topicMap: Record<string, string[]> = {
    'walkthrough': ['walkthrough', 'property', 'inspection', 'visit', 'tour', 'checklist'],
    'offer': ['offer', 'closing', 'price', 'arv', 'contract', 'deal', 'negotiate', 'counter'],
    'objection': ['objection', 'pushback', 'concern', 'hesitat', 'think about', 'spouse', 'not sure', 'too low', 'no thanks', 'brush'],
    'script': ['script', 'talk track', 'pitch', 'opening', 'intro', 'dialogue'],
    'appointment': ['appointment', 'schedule', 'set', 'booking', 'meeting', 'calendar'],
    'follow': ['follow', 'callback', 'call back', 'reach out', 'touch base', 'sms', 'text', 'message'],
    'cold call': ['cold call', 'outbound', 'prospect', 'dial', 'first call', 'initial'],
    'disqualif': ['disqualif', 'dead lead', 'not interested', 'remove', 'bad lead'],
    'motivation': ['motivation', 'motivat', 'why sell', 'reason', 'distress', 'behind on', 'divorce', 'inherit', 'relocat'],
    'transfer': ['transfer', 'hand off', 'handoff', 'warm transfer', 'escalat', 'pass to'],
    'rapport': ['rapport', 'relationship', 'trust', 'connect', 'small talk', 'conversation'],
    'closing': ['close', 'closing', 'seal', 'commit', 'agreement', 'sign', 'paperwork'],
    'lead': ['lead', 'qualify', 'qualification', 'screening', 'criteria', 'hot lead', 'warm lead'],
    'backing_out': ['back out', 'backing out', 'cancel', 'changed mind', 'cold feet', 'back away', 'pull out', 'withdraw', 'renege', 'second thoughts', 'not sure anymore', 'family says', 'spouse says', 'another offer', 'list with agent', 'want more money', 'price too low', 'seller backing', 'seller cancel', 'under contract'],
  };
  const q = input.question.toLowerCase();
  // Score each training material by how many topic matches it has
  const scored = trainingMaterials.map(m => {
    const title = (m.title || '').toLowerCase();
    const content = (m.content || '').toLowerCase().substring(0, 500);
    const text = title + ' ' + content;
    let score = 0;
    // Direct keyword match from question words
    const keywords = q.split(/\s+/).filter(w => w.length > 3);
    for (const kw of keywords) {
      if (title.includes(kw)) score += 3;
      if (content.includes(kw)) score += 1;
    }
    // Topic-based matching
    for (const [, synonyms] of Object.entries(topicMap)) {
      const questionHasTopic = synonyms.some(s => q.includes(s));
      const materialHasTopic = synonyms.some(s => text.includes(s));
      if (questionHasTopic && materialHasTopic) score += 2;
    }
    return { material: m, score };
  });
  const relevant = scored.filter(s => s.score > 0).sort((a, b) => b.score - a.score);
  if (relevant.length > 0) {
    return `RELEVANT TRAINING MATERIAL (use the talk tracks and key moves below when coaching):\n${relevant.slice(0, 3).map(s => `### ${s.material.title}\n${(s.material.content || '').substring(0, 4000)}`).join('\n\n')}`;
  }
  return '';
})()}
${coachingPrefs ? `\n${coachingPrefs}` : ""}

CRM ACTION CAPABILITIES:
You have FULL access to ${industryCtx?.crmContext || "the team's GoHighLevel CRM"}. You CAN directly perform these actions:
- Add notes to contacts
- Change pipeline stages (move deals)
- Send SMS messages to contacts
- Create follow-up tasks
- Update existing tasks (change due dates, mark complete)
- Add or remove tags on contacts
- Update custom fields on contacts
- Add or remove contacts from workflows/automations
IMPORTANT: If the user asks you to perform ANY of these CRM actions (add a note, send a text, move a stage, create a task, update a task, tag someone, update a field, add/remove from workflow), you MUST start your response with the EXACT text "[ACTION_REDIRECT]" on its own line, followed by a brief acknowledgment like "On it — creating that for you now." This special tag tells the system to automatically route the request to the action handler. Do NOT tell the user to retype their request. Do NOT say "type your request as a command". Just use [ACTION_REDIRECT] and the system handles the rest.

CONVERSATIONAL FEEDBACK vs CRM ACTIONS:
Do NOT use [ACTION_REDIRECT] for these types of messages — they are CONVERSATIONS, not CRM actions:
- Complaints or feedback about a previous action (e.g., "That was not sent from my number", "That note was wrong", "That went to the wrong person")
- Questions about how something worked (e.g., "Why did it send from Chris's number?", "Which number did that go from?")
- Confirmations or acknowledgments (e.g., "Thanks", "Got it", "OK")
- General conversation or follow-up about a previous interaction
For these, respond conversationally. Acknowledge the issue, explain what you know, and offer to help fix it.

CRITICAL RULES:
1. ALWAYS ground your answers in the REAL DATA above. Reference specific calls, scores, outcomes, contacts, and property addresses when relevant.
2. If the user asks a question that requires data you don't have, say "Based on the data I can see..." and be honest about what's missing.
3. If asked about a person NOT in the team members list, say "I don't see [name] on your team. Your current team members are: ${teamMemberNames.join(', ')}." Then ask if they meant one of those people.
4. NEVER make up or hallucinate information. No fake names, scores, or details.
5. When asked strategic questions (like "should we do X or Y?"), look at the actual call outcomes, pipeline data, and opportunity signals to give a data-backed recommendation. Reference specific contacts, pipeline stages, and priority scores when available. For example: "Looking at your pipeline, you have 3 missed-tier signals that need immediate attention — [contact name] at [address] hasn't been followed up in 5 days."
6. Keep responses to 3-5 sentences. Be specific and actionable.
7. Reference training materials by name when they're relevant to the question (e.g., "Your Walkthrough Checklist covers this...").
8. Do NOT give generic advice that could apply to any team. Make it specific to THIS team's actual data.
9. ACCESS CONTROL: If you see "ACCESS RESTRICTED" for a team member, politely tell the user they don't have permission to view that person's individual performance. Suggest they ask their manager or an admin instead. However, you CAN still use that person's call examples for general coaching (e.g., "Here's a great example of handling that objection from a recent team call...") without revealing their scores or grades.
10. When answering general coaching questions (objection handling, scripts, techniques), freely reference examples from ALL team calls — the call summaries and techniques are available for everyone to learn from. Only individual scores/grades are restricted.
11. When answering questions about how Gunner features work (badges, XP, levels, streaks, grading, etc.), use the PLATFORM GUIDE above. Be helpful and specific — team members should feel empowered to use the platform.
12. ${isAdmin ? 'This user is an ADMIN — they can see opportunity/signal details and detection rule specifics.' : 'This user is NOT an admin — do NOT reveal opportunity/signal details, detection rule thresholds, or pipeline data. If they ask about signals, tell them to ask their manager or admin.'}
13. When you see a "COMPUTED STATS" block above, those numbers are EXACT — calculated directly from the database. You MUST use those exact numbers in your response. Do NOT estimate, round differently, or contradict the computed stats. Present them naturally in your answer (e.g., "You've made 12 calls this week with an average score of 78.3%").
14. NEVER say "I can't directly add notes", "I don't have access to your CRM", "I can't interact with your CRM controls", or anything similar. You DO have full CRM access.
15. If the user's message looks like a CRM action request, start your response with [ACTION_REDIRECT] on its own line. NEVER tell the user to retype or rephrase their request as a command.
16. If the user is giving feedback about a PREVIOUS action (like "that was wrong" or "not from my number"), respond conversationally — do NOT use [ACTION_REDIRECT]. Acknowledge the issue and offer to help.

GRADE DISPUTE & PUSHBACK HANDLING:
17. When a user says "I already do it", "I do that", "that's not fair", or disputes a grade: FIRST check the TRANSCRIPT EXCERPTS above to see what they actually said on their calls. Quote their exact words from the transcript. If the transcript shows they DO perform the behavior (even in a conversational/natural way), acknowledge it specifically: "Looking at your call with [contact], you said '[exact quote]' — that IS a form of [criterion]. The rubric scored it [X/Y] because [specific reason]."
18. NEVER dismiss a user's self-reported behavior without checking the evidence. If transcripts are available, use them. If they're not, say "I'd need to review the specific transcript to verify — can you tell me which call you're referring to?"
19. When evaluating a user's example phrase or approach, be fair about what it accomplishes vs. what the rubric ideally wants. Distinguish between: (a) "You don't do this at all" — a real gap, (b) "You do this naturally/conversationally but the rubric wants it more explicitly" — partial credit, acknowledge what works, (c) "You do this well" — give credit. For (b), frame it as "Your approach works and shows [skill]. The rubric is looking for [additional element] which could push your score even higher" rather than "it would not fully satisfy the criteria."
20. When a user provides a specific example of what they say on calls (e.g., "Do you have a couple of minutes to chat, just want to make sure we are a good fit to work together"), evaluate it honestly: What does it accomplish? (sets a conversational frame, implies mutual evaluation, asks permission) What could make it even stronger? (adding call structure, mentioning what info you'll gather, giving a time estimate). Be specific about what's good AND what could level it up — don't just say it "doesn't meet the criteria."
21. When the user is asking about their OWN calls (self-reference detected), use a collaborative tone: "your", "you", "let's look at your calls" rather than a third-person analytical tone. They're asking for personal coaching, not a report about someone else.

EARLY DISQUALIFICATION CONTEXT:
22. When a user disputes a grade on a short call or says the lead was clearly not viable ("not in buybox", "no motivation", "manufactured home", "going to list", "not in our area"), acknowledge that quick DQ calls should be graded differently. A rep who correctly identifies a dead lead and exits efficiently is doing their job well. The grading system now accounts for this, but if the user feels a specific call was unfairly graded, explain: "DQ calls are graded on how well you confirmed the disqualification (probing questions, correct identification, professional exit) rather than full qualification depth. If this call was scored against the full rubric, that may have been before the system was updated to handle DQ calls differently."
23. When discussing DQ calls, emphasize the balance: quick exits on dead leads are good, but always confirm with at least 1-2 probing questions before giving up. A seller who says "I'm thinking about listing" might still be persuadable — that's different from "manufactured home, fully remodeled, going to list next week."

PRIOR CONTEXT AWARENESS:
24. When a user says they "already had notes" or "already knew the info" from previous conversations or text leads, acknowledge this is valid. The grading system now recognizes prior context — reps should not be penalized for not re-asking questions when they already have the information from texts, prior calls, or CRM notes. If the user feels they were unfairly graded for this, explain the system now accounts for it.`;

        // Build messages with conversation history for context
        const messages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
          { role: "system", content: systemPrompt },
        ];
        // Include up to last 10 conversation turns for memory
        if (input.history && input.history.length > 0) {
          const recentHistory = input.history.slice(-10);
          for (const msg of recentHistory) {
            messages.push({ role: msg.role, content: msg.content });
          }
        }
        // Add the current question
        messages.push({ role: "user", content: input.question });

        const response = await invokeLLM({ messages });

        const messageContent = response.choices?.[0]?.message?.content;
        const answer = typeof messageContent === "string" 
          ? messageContent 
          : "I apologize, I couldn't generate a response. Please try again.";

        // Persist the exchange for conversation memory (fire-and-forget)
        if (ctx.user?.tenantId && ctx.user?.id) {
          const exchangeId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
          saveCoachExchange(ctx.user.tenantId, ctx.user.id, exchangeId, input.question, answer).catch(() => {});
        }
        
        return { answer };
      }),

    // Save a coach exchange from the streaming endpoint (called by frontend after stream completes)
    saveExchange: protectedProcedure
      .input(z.object({
        question: z.string(),
        answer: z.string(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (!ctx.user?.tenantId || !ctx.user?.id) return { saved: false };
        const exchangeId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        await saveCoachExchange(ctx.user.tenantId, ctx.user.id, exchangeId, input.question, input.answer);
        return { saved: true };
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
          .map(m => `${m.title}: ${m.content?.substring(0, 1500) || ""}`)
          .join("\n");

        // Get recent calls for examples (filtered by tenant)
        const recentCallsResult = await getCallsWithGrades({ limit: 50, tenantId: ctx.user?.tenantId || undefined });
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
        
        // Load tenant playbook context for dynamic prompts
        const { buildCoachIndustryContext: buildMeetingCtx } = await import("./playbooks");
        const meetingIndustryCtx = ctx.user?.tenantId ? await buildMeetingCtx(ctx.user.tenantId) : null;
        const industryLabel = meetingIndustryCtx?.industry || "real estate wholesaling";

        // Get training materials (filtered by tenant)
        const trainingMaterials = await getTrainingMaterials({ tenantId: ctx.user?.tenantId || undefined });
        const trainingContext = trainingMaterials
          .map(m => `### ${m.title}\n${m.content?.substring(0, 2000) || ""}`)
          .join("\n\n");

        // Get recent calls for examples (filtered by tenant)
        const recentCallsResult = await getCallsWithGrades({ limit: 50, tenantId: ctx.user?.tenantId || undefined });
        const recentCalls = recentCallsResult.items;
        const goodCalls = recentCalls.filter(c => c.grade && parseFloat(c.grade.overallScore || "0") >= 75).slice(0, 5);
        const badCalls = recentCalls.filter(c => c.grade && parseFloat(c.grade.overallScore || "0") < 60).slice(0, 5);

        let systemPrompt = "";

        if (input.mode === "roleplay") {
          // Role-play mode: AI plays the seller
          systemPrompt = `You are playing the role of a SELLER in a ${industryLabel} role-play exercise.

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

          systemPrompt = `You are a meeting facilitator helping a ${industryLabel} team learn from real call examples.

RECENT CALL EXAMPLES:
${callExamples}

TRAINING CONTEXT:
${trainingContext.substring(0, 5000)}

Your role:
1. When asked, share relevant examples from the calls above
2. Highlight what worked well and what could improve
3. Connect examples to the current agenda topic: "${input.currentAgendaItem?.title || "General discussion"}"
4. Keep responses focused and actionable (3-5 sentences)
5. Quote specific parts of transcripts when relevant

Be encouraging but honest about areas for improvement.`;
        } else if (input.mode === "qa") {
          // Q&A mode: Answer coaching questions
          systemPrompt = `You are a sales coach for a ${industryLabel} team, answering questions during a team meeting.

TRAINING MATERIALS:
${trainingContext.substring(0, 6000)}

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
          systemPrompt = `You are an AI meeting facilitator guiding a ${industryLabel} team through their weekly training call.

Current agenda item: "${input.currentAgendaItem?.title || "Meeting start"}"
${input.currentAgendaItem?.description ? `Details: ${input.currentAgendaItem.description}` : ""}

TRAINING CONTEXT:
${trainingContext.substring(0, 4000)}

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

        // Prepend security rules to all meeting facilitator prompts
        systemPrompt = `${SECURITY_RULES}\n\n${systemPrompt}`;

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
      .query(async ({ ctx, input }) => {
        return await getGradingContext(input.callType, ctx.user?.tenantId ?? undefined);
      }),

    // ============ TENANT RUBRIC CRUD ============
    getTenantRubrics: protectedProcedure.query(async ({ ctx }) => {
      if (!ctx.user?.tenantId) throw new TRPCError({ code: "FORBIDDEN", message: "No tenant" });
      const { getDb } = await import("./db");
      const { tenantRubrics } = await import("../drizzle/schema");
      const { and, eq } = await import("drizzle-orm");
      const db = await getDb();
      if (!db) return [];
      return await db.select().from(tenantRubrics).where(
        and(eq(tenantRubrics.tenantId, ctx.user.tenantId), eq(tenantRubrics.isActive, "true"))
      );
    }),

    createTenantRubric: protectedProcedure
      .input(z.object({
        name: z.string(),
        description: z.string().optional(),
        callType: z.string().optional(),
        criteria: z.string(), // JSON string
        redFlags: z.string().optional(), // JSON string
      }))
      .mutation(async ({ ctx, input }) => {
        if (!ctx.user?.tenantId) throw new TRPCError({ code: "FORBIDDEN", message: "No tenant" });
        const { getDb } = await import("./db");
        const { tenantRubrics } = await import("../drizzle/schema");
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        const result = await db.insert(tenantRubrics).values({
          tenantId: ctx.user.tenantId,
          name: input.name,
          description: input.description || null,
          callType: input.callType || null,
          criteria: input.criteria,
          redFlags: input.redFlags || null,
        });
        return { id: result[0].insertId };
      }),

    updateTenantRubric: protectedProcedure
      .input(z.object({
        id: z.number(),
        name: z.string().optional(),
        description: z.string().optional(),
        callType: z.string().optional(),
        criteria: z.string().optional(), // JSON string
        redFlags: z.string().optional(), // JSON string
      }))
      .mutation(async ({ ctx, input }) => {
        if (!ctx.user?.tenantId) throw new TRPCError({ code: "FORBIDDEN", message: "No tenant" });
        const { getDb } = await import("./db");
        const { tenantRubrics } = await import("../drizzle/schema");
        const { and, eq } = await import("drizzle-orm");
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        const updates: Record<string, any> = {};
        if (input.name !== undefined) updates.name = input.name;
        if (input.description !== undefined) updates.description = input.description;
        if (input.callType !== undefined) updates.callType = input.callType;
        if (input.criteria !== undefined) updates.criteria = input.criteria;
        if (input.redFlags !== undefined) updates.redFlags = input.redFlags;
        await db.update(tenantRubrics).set(updates).where(
          and(eq(tenantRubrics.id, input.id), eq(tenantRubrics.tenantId, ctx.user.tenantId))
        );
        return { success: true };
      }),

    deleteTenantRubric: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        if (!ctx.user?.tenantId) throw new TRPCError({ code: "FORBIDDEN", message: "No tenant" });
        const { getDb } = await import("./db");
        const { tenantRubrics } = await import("../drizzle/schema");
        const { and, eq } = await import("drizzle-orm");
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        await db.update(tenantRubrics).set({ isActive: "false" }).where(
          and(eq(tenantRubrics.id, input.id), eq(tenantRubrics.tenantId, ctx.user.tenantId))
        );
        return { success: true };
      }),

    seedDefaults: protectedProcedure.mutation(async ({ ctx }) => {
      if (!ctx.user?.tenantId) throw new TRPCError({ code: "FORBIDDEN", message: "No tenant" });
      const { getDb } = await import("./db");
      const { tenantRubrics } = await import("../drizzle/schema");
      const { and, eq } = await import("drizzle-orm");
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      // Check if tenant already has rubrics
      const existing = await db.select().from(tenantRubrics).where(
        and(eq(tenantRubrics.tenantId, ctx.user.tenantId), eq(tenantRubrics.isActive, "true"))
      );
      if (existing.length > 0) throw new TRPCError({ code: "BAD_REQUEST", message: "Tenant already has custom rubrics. Delete existing ones first." });
      const defaults = [
        { callType: "qualification", rubric: LEAD_MANAGER_RUBRIC },
        { callType: "offer", rubric: ACQUISITION_MANAGER_RUBRIC },
        { callType: "cold_call", rubric: LEAD_GENERATOR_RUBRIC },
        { callType: "follow_up", rubric: FOLLOW_UP_RUBRIC },
        { callType: "seller_callback", rubric: SELLER_CALLBACK_RUBRIC },
        { callType: "admin_callback", rubric: ADMIN_CALLBACK_RUBRIC },
      ];
      for (const d of defaults) {
        await db.insert(tenantRubrics).values({
          tenantId: ctx.user.tenantId,
          name: d.rubric.name,
          description: d.rubric.description,
          callType: d.callType,
          criteria: JSON.stringify(d.rubric.criteria),
          redFlags: JSON.stringify(d.rubric.redFlags),
        });
      }
      return { seeded: defaults.length };
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
        
        // Load tenant playbook context
        const { buildCoachIndustryContext: buildContentCtx } = await import("./playbooks");
        const contentIndustryCtx = ctx.user?.tenantId ? await buildContentCtx(ctx.user.tenantId) : null;
        const contentIndustryLabel = contentIndustryCtx?.industry || "real estate wholesaling";

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
              content: `You are a social media content creator for a ${contentIndustryLabel} business. Create engaging content that resonates with the target audience.

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

        // Load tenant playbook context
        const { buildCoachIndustryContext: buildIdeasCtx } = await import("./playbooks");
        const ideasIndustryCtx = ctx.user?.tenantId ? await buildIdeasCtx(ctx.user.tenantId) : null;
        const ideasIndustryLabel = ideasIndustryCtx?.industry || "real estate wholesaling";
        
        const response = await invokeLLM({
          messages: [
            {
              role: "system",
              content: `You are a content strategist for a ${ideasIndustryLabel} business. Generate creative content ideas that will engage the target audience.

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

        // Load tenant playbook context
        const { buildCoachIndustryContext: buildBrandCtx } = await import("./playbooks");
        const brandIndustryCtx = tenantId ? await buildBrandCtx(tenantId) : null;
        const brandIndustryLabel = brandIndustryCtx?.industry || "real estate wholesaling";

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
              content: `You are a content creator for ${brandProfileData?.companyName || `a ${brandIndustryLabel} company`}.

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

        // Load tenant playbook context
        const { buildCoachIndustryContext: buildCreatorCtx } = await import("./playbooks");
        const creatorIndustryCtx = tenantId ? await buildCreatorCtx(tenantId) : null;
        const creatorIndustryLabel = creatorIndustryCtx?.industry || "real estate wholesaling";

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
              content: `You are a content creator building a personal brand in ${creatorIndustryLabel}.

Brand: ${brandProfileData?.companyName || creatorIndustryLabel + " professional"}
Voice: Authentic, engaging, sometimes edgy - designed to grab attention on X/Twitter

Recent interesting call moments (use these for authentic stories):
${JSON.stringify(storyContext, null, 2)}

Create content that:
1. Grabs attention in the first line
2. Tells a real story from actual calls (anonymized)
3. Shows the reality of the business
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
        if (ctx.user?.role !== 'admin' && ctx.user?.role !== 'super_admin') {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin access required' });
        }
        const { getKpiPeriods } = await import("./kpi");
        return getKpiPeriods(input?.periodType);
      }),

    // Get period by ID
    getPeriodById: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ ctx, input }) => {
        if (ctx.user?.role !== 'admin' && ctx.user?.role !== 'super_admin') {
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
        if (ctx.user?.role !== 'admin' && ctx.user?.role !== 'super_admin') {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin access required' });
        }
        const { createKpiPeriod } = await import("./kpi");
        return createKpiPeriod({ ...input, tenantId: ctx.user.tenantId! });
      }),

    // Get team member KPIs for a period
    getTeamMemberKpis: protectedProcedure
      .input(z.object({ periodId: z.number() }))
      .query(async ({ ctx, input }) => {
        if (ctx.user?.role !== 'admin' && ctx.user?.role !== 'super_admin') {
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
        if (ctx.user?.role !== 'admin' && ctx.user?.role !== 'super_admin') {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin access required' });
        }
        const { upsertTeamMemberKpi } = await import("./kpi");
        return upsertTeamMemberKpi({ ...input, tenantId: ctx.user.tenantId! });
      }),

    // Get campaign KPIs for a period
    getCampaignKpis: protectedProcedure
      .input(z.object({ periodId: z.number() }))
      .query(async ({ ctx, input }) => {
        if (ctx.user?.role !== 'admin' && ctx.user?.role !== 'super_admin') {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin access required' });
        }
        const { getCampaignKpis } = await import("./kpi");
        return getCampaignKpis(input.periodId);
      }),

    // Upsert campaign KPI
    upsertCampaignKpi: protectedProcedure
      .input(z.object({
        periodId: z.number(),
        market: z.string(),
        channel: z.string(),
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
        if (ctx.user?.role !== 'admin' && ctx.user?.role !== 'super_admin') {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin access required' });
        }
        const { upsertCampaignKpi } = await import("./kpi");
        return upsertCampaignKpi({ ...input, tenantId: ctx.user.tenantId! });
      }),

    // Get deals
    getDeals: protectedProcedure
      .input(z.object({ periodId: z.number().optional() }).optional())
      .query(async ({ ctx, input }) => {
        if (ctx.user?.role !== 'admin' && ctx.user?.role !== 'super_admin') {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin access required' });
        }
        const { getKpiDeals } = await import("./kpi");
        return getKpiDeals(input?.periodId);
      }),

    // Get deal by ID
    getDealById: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ ctx, input }) => {
        if (ctx.user?.role !== 'admin' && ctx.user?.role !== 'super_admin') {
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
        inventoryStatus: z.string().optional(),
        location: z.string().optional(),
        leadSource: z.string().optional(),
        lmName: z.string().optional(),
        amName: z.string().optional(),
        dmName: z.string().optional(),
        revenue: z.number().optional(),
        assignmentFee: z.number().optional(),
        profit: z.number().optional(),
        contractDate: z.date().optional(),
        closingDate: z.date().optional(),
        notes: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user?.role !== 'admin' && ctx.user?.role !== 'super_admin') {
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
        inventoryStatus: z.string().optional(),
        location: z.string().optional(),
        leadSource: z.string().optional(),
        lmName: z.string().optional(),
        amName: z.string().optional(),
        dmName: z.string().optional(),
        revenue: z.number().optional(),
        assignmentFee: z.number().optional(),
        profit: z.number().optional(),
        contractDate: z.date().optional(),
        closingDate: z.date().optional(),
        notes: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user?.role !== 'admin' && ctx.user?.role !== 'super_admin') {
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
        if (ctx.user?.role !== 'admin' && ctx.user?.role !== 'super_admin') {
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
        if (ctx.user?.role !== 'admin' && ctx.user?.role !== 'super_admin') {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin access required' });
        }
        const { getScoreboardData } = await import("./kpi");
        return getScoreboardData(input.periodId);
      }),

    // ============ LEAD GEN STAFF ============
    getLeadGenStaff: protectedProcedure
      .input(z.object({ activeOnly: z.boolean().optional() }).optional())
      .query(async ({ ctx, input }) => {
        if (ctx.user?.role !== 'admin' && ctx.user?.role !== 'super_admin') {
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
        if (ctx.user?.role !== 'admin' && ctx.user?.role !== 'super_admin') {
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
        if (ctx.user?.role !== 'admin' && ctx.user?.role !== 'super_admin') {
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
        if (ctx.user?.role !== 'admin' && ctx.user?.role !== 'super_admin') {
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
        if (ctx.user?.role !== 'admin' && ctx.user?.role !== 'super_admin') {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin access required' });
        }
        const { getKpiMarkets } = await import("./kpi");
        return getKpiMarkets(input?.activeOnly ?? true);
      }),

    createMarket: protectedProcedure
      .input(z.object({ name: z.string() }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user?.role !== 'admin' && ctx.user?.role !== 'super_admin') {
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
        if (ctx.user?.role !== 'admin' && ctx.user?.role !== 'super_admin') {
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
        if (ctx.user?.role !== 'admin' && ctx.user?.role !== 'super_admin') {
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
        if (ctx.user?.role !== 'admin' && ctx.user?.role !== 'super_admin') {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin access required' });
        }
        const { getKpiChannels } = await import("./kpi");
        return getKpiChannels(input?.activeOnly ?? true);
      }),

    createChannel: protectedProcedure
      .input(z.object({ name: z.string(), code: z.string() }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user?.role !== 'admin' && ctx.user?.role !== 'super_admin') {
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
        if (ctx.user?.role !== 'admin' && ctx.user?.role !== 'super_admin') {
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
        if (ctx.user?.role !== 'admin' && ctx.user?.role !== 'super_admin') {
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
      const { hasPlatformAccess, getAllTenants } = await import("./tenant");
      if (!hasPlatformAccess(ctx.user || {})) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Platform owner access required' });
      }
      return getAllTenants();
    }),

    // Super Admin: Get platform metrics
    getMetrics: protectedProcedure.query(async ({ ctx }) => {
      const { hasPlatformAccess, getPlatformMetrics } = await import("./tenant");
      if (!hasPlatformAccess(ctx.user || {})) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Platform owner access required' });
      }
      return getPlatformMetrics();
    }),

    // Super Admin: Get recent activity
    getRecentActivity: protectedProcedure.query(async ({ ctx }) => {
      const { hasPlatformAccess, getRecentActivity } = await import("./tenant");
      if (!hasPlatformAccess(ctx.user || {})) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Platform owner access required' });
      }
      return getRecentActivity();
    }),

    // Super Admin: Get low usage tenants (churn risk)
    getLowUsageTenants: protectedProcedure.query(async ({ ctx }) => {
      const { hasPlatformAccess, getLowUsageTenants } = await import("./tenant");
      if (!hasPlatformAccess(ctx.user || {})) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Platform owner access required' });
      }
      return getLowUsageTenants();
    }),

    // Super Admin: Get tenant by ID
    getById: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ ctx, input }) => {
        const { hasPlatformAccess, getTenantById } = await import("./tenant");
        if (!hasPlatformAccess(ctx.user || {})) {
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
        const { hasPlatformAccess, createTenant } = await import("./tenant");
        if (!hasPlatformAccess(ctx.user || {})) {
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
          email: z.string().email().optional(),
          isTenantAdmin: z.boolean().optional(),
        })).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const { hasPlatformAccess, setupTenant } = await import("./tenant");
        if (!hasPlatformAccess(ctx.user || {})) {
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
        const { hasPlatformAccess, bulkAddTeamMembers } = await import("./tenant");
        if (!hasPlatformAccess(ctx.user || {})) {
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
        const { hasPlatformAccess, updateTenantSettings } = await import("./tenant");
        if (!hasPlatformAccess(ctx.user || {})) {
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
        if (ctx.user.role !== 'admin' && ctx.user.role !== 'super_admin') {
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
        if (ctx.user.role !== 'admin' && ctx.user.role !== 'super_admin') {
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
        if (ctx.user.role !== 'admin' && ctx.user.role !== 'super_admin') {
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
      if (ctx.user.role !== 'admin' && ctx.user.role !== 'super_admin') {
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
        if (ctx.user.role !== 'admin' && ctx.user.role !== 'super_admin') {
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

    // Fetch GHL users for a location to auto-link team members
    fetchGhlUsers: protectedProcedure
      .input(z.object({
        apiKey: z.string().min(1),
        locationId: z.string().min(1),
      }))
      .mutation(async ({ input }) => {
        const GHL_API_BASE = "https://services.leadconnectorhq.com";
        try {
          const url = new URL(`${GHL_API_BASE}/users/search`);
          url.searchParams.set("locationId", input.locationId);
          const response = await fetch(url.toString(), {
            headers: {
              "Authorization": `Bearer ${input.apiKey}`,
              "Version": "2021-07-28",
            },
          });
          if (!response.ok) {
            return { success: false, users: [], error: `Failed to fetch users (${response.status})` };
          }
          const data = await response.json() as { users?: Array<{ id: string; name?: string; firstName?: string; lastName?: string; email?: string; role?: string }> };
          const users = (data.users || []).map((u: any) => ({
            id: u.id,
            name: u.name || [u.firstName, u.lastName].filter(Boolean).join(" "),
            email: u.email || "",
            role: u.role || "",
          }));
          return { success: true, users };
        } catch (error: any) {
          return { success: false, users: [], error: error.message };
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
        const { hasPlatformAccess, updateTenantSettings, parseCrmConfig, getTenantById } = await import("./tenant");
        const targetTenantId = input.tenantId || ctx.user?.tenantId;
        if (!targetTenantId) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'No tenant specified' });
        }
        // Check permissions: platform owner can update any tenant, tenant admin can update own
        if (input.tenantId && !hasPlatformAccess(ctx.user || {})) {
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
        const { hasPlatformAccess, updateTenantSettings, parseCrmConfig, getTenantById } = await import("./tenant");
        const targetTenantId = input.tenantId || ctx.user?.tenantId;
        if (!targetTenantId) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'No tenant specified' });
        }
        // Check permissions
        if (input.tenantId && !hasPlatformAccess(ctx.user || {})) {
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

        const result = await updateTenantSettings(targetTenantId, {
          crmType,
          crmConfig: JSON.stringify(existingConfig),
          crmConnected,
        });

        // Trigger batch contact import if GHL is connected and not yet imported
        if (input.integration === 'ghl' && input.enabled && existingConfig.ghlApiKey && existingConfig.ghlLocationId) {
          const { triggerContactImportIfNeeded } = await import("./webhook");
          triggerContactImportIfNeeded(targetTenantId).catch(err => {
            console.error(`[CRM] Failed to trigger contact import for tenant ${targetTenantId}:`, err);
          });
        }

        return result;
      }),

    // Get parsed CRM integration status for the current tenant
    // Get GHL OAuth install URL for the current tenant
    getGhlOAuthInstallUrl: protectedProcedure.query(async ({ ctx }) => {
      const { isOAuthConfigured, getInstallUrl } = await import("./ghlOAuth");
      if (!isOAuthConfigured()) {
        return { available: false, url: null };
      }
      const tenantId = ctx.user?.tenantId;
      const state = tenantId ? Buffer.from(JSON.stringify({ tenantId })).toString("base64") : undefined;
      try {
        const url = getInstallUrl(state);
        return { available: true, url };
      } catch {
        return { available: false, url: null };
      }
    }),

    // Get GHL OAuth connection status for the current tenant
    getGhlOAuthStatus: protectedProcedure.query(async ({ ctx }) => {
      const { getOAuthStatus, isOAuthConfigured } = await import("./ghlOAuth");
      if (!ctx.user?.tenantId) {
        return { oauthConfigured: isOAuthConfigured(), connected: false };
      }
      const status = await getOAuthStatus(ctx.user.tenantId);
      return { oauthConfigured: isOAuthConfigured(), ...status };
    }),

    // Disconnect GHL OAuth for the current tenant
    disconnectGhlOAuth: protectedProcedure.mutation(async ({ ctx }) => {
      if (!ctx.user?.tenantId) throw new TRPCError({ code: 'NOT_FOUND', message: 'No tenant' });
      if (ctx.user?.role !== 'admin' && ctx.user?.role !== 'super_admin' && ctx.user?.isTenantAdmin !== 'true') {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin access required' });
      }
      const { disconnectOAuth } = await import("./ghlOAuth");
      await disconnectOAuth(ctx.user.tenantId);
      return { success: true };
    }),

    // Get detailed OAuth health info for the current tenant (admin only)
    getOAuthHealth: protectedProcedure.query(async ({ ctx }) => {
      if (!ctx.user?.tenantId) throw new TRPCError({ code: 'NOT_FOUND', message: 'No tenant' });
      if (ctx.user?.role !== 'admin' && ctx.user?.role !== 'super_admin' && ctx.user?.isTenantAdmin !== 'true') {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin access required' });
      }
      const { getOAuthStatus, isOAuthConfigured, getAuthMethod } = await import("./ghlOAuth");
      const { getTenantById } = await import("./tenant");
      const tenant = await getTenantById(ctx.user.tenantId);
      const oauthStatus = await getOAuthStatus(ctx.user.tenantId);
      const authMethod = await getAuthMethod(ctx.user.tenantId);

      // Calculate token health
      let tokenHealth: 'healthy' | 'expiring_soon' | 'expired' | 'error' | 'not_connected' = 'not_connected';
      let expiresInMs = 0;
      if (oauthStatus.connected && oauthStatus.expiresAt) {
        expiresInMs = new Date(oauthStatus.expiresAt).getTime() - Date.now();
        if (oauthStatus.lastError) {
          tokenHealth = 'error';
        } else if (expiresInMs <= 0) {
          tokenHealth = 'expired';
        } else if (expiresInMs < 60 * 60 * 1000) { // less than 1 hour
          tokenHealth = 'expiring_soon';
        } else {
          tokenHealth = 'healthy';
        }
      }

      return {
        oauthConfigured: isOAuthConfigured(),
        authMethod,
        oauth: {
          connected: oauthStatus.connected,
          locationId: oauthStatus.locationId,
          companyId: oauthStatus.companyId,
          expiresAt: oauthStatus.expiresAt?.toISOString() || null,
          expiresInMs,
          lastRefreshedAt: oauthStatus.lastRefreshedAt?.toISOString() || null,
          lastError: oauthStatus.lastError || null,
          scopes: oauthStatus.scopes || null,
          tokenHealth,
        },
        webhook: {
          active: tenant?.webhookActive === 'true',
          lastEventAt: tenant?.lastWebhookAt?.toISOString() || null,
        },
      };
    }),

    // Manually refresh OAuth token (admin only)
    refreshOAuthToken: protectedProcedure.mutation(async ({ ctx }) => {
      if (!ctx.user?.tenantId) throw new TRPCError({ code: 'NOT_FOUND', message: 'No tenant' });
      if (ctx.user?.role !== 'admin' && ctx.user?.role !== 'super_admin' && ctx.user?.isTenantAdmin !== 'true') {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin access required' });
      }
      const { handleTokenRefreshOn401 } = await import("./ghlOAuth");
      const newToken = await handleTokenRefreshOn401(ctx.user.tenantId);
      if (!newToken) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Token refresh failed. The refresh token may be expired or revoked. Try reconnecting via OAuth.' });
      }
      return { success: true, message: 'Token refreshed successfully' };
    }),

    // Super Admin: Get OAuth health status for ALL tenants
    getAllOAuthHealth: protectedProcedure.query(async ({ ctx }) => {
      const { hasPlatformAccess, getAllTenants } = await import("./tenant");
      if (!hasPlatformAccess(ctx.user || {})) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Platform owner access required' });
      }
      const { getOAuthStatus, isOAuthConfigured, getAuthMethod } = await import("./ghlOAuth");
      const { parseCrmConfig } = await import("./tenant");
      const allTenants = await getAllTenants();
      const oauthConfigured = isOAuthConfigured();

      const results = await Promise.all(
        allTenants.map(async (tenant) => {
          const oauthStatus = await getOAuthStatus(tenant.id);
          const authMethod = await getAuthMethod(tenant.id);
          const config = parseCrmConfig({ crmConfig: tenant.crmConfig as string | null });

          // Calculate token health
          let tokenHealth: 'healthy' | 'expiring_soon' | 'expired' | 'error' | 'not_connected' = 'not_connected';
          let expiresInMs = 0;
          if (oauthStatus.connected && oauthStatus.expiresAt) {
            expiresInMs = new Date(oauthStatus.expiresAt).getTime() - Date.now();
            if (oauthStatus.lastError) {
              tokenHealth = 'error';
            } else if (expiresInMs <= 0) {
              tokenHealth = 'expired';
            } else if (expiresInMs < 60 * 60 * 1000) {
              tokenHealth = 'expiring_soon';
            } else {
              tokenHealth = 'healthy';
            }
          }

          return {
            tenantId: tenant.id,
            tenantName: tenant.name,
            tenantSlug: tenant.slug,
            subscriptionStatus: tenant.subscriptionStatus,
            authMethod,
            crmConnected: tenant.crmConnected === 'true',
            locationId: oauthStatus.locationId || config.ghlLocationId || null,
            oauth: {
              connected: oauthStatus.connected,
              tokenHealth,
              expiresAt: oauthStatus.expiresAt?.toISOString() || null,
              expiresInMs,
              lastRefreshedAt: oauthStatus.lastRefreshedAt?.toISOString() || null,
              lastError: oauthStatus.lastError || null,
              scopes: oauthStatus.scopes || null,
            },
            webhook: {
              active: tenant.webhookActive === 'true',
              lastEventAt: tenant.lastWebhookAt?.toISOString() || null,
            },
          };
        })
      );

      return {
        oauthConfigured,
        tenants: results,
        summary: {
          total: results.length,
          oauthConnected: results.filter(r => r.oauth.connected).length,
          apiKeyOnly: results.filter(r => r.authMethod === 'apikey').length,
          noAuth: results.filter(r => r.authMethod === 'none').length,
          healthy: results.filter(r => r.oauth.tokenHealth === 'healthy').length,
          expiringSoon: results.filter(r => r.oauth.tokenHealth === 'expiring_soon').length,
          expired: results.filter(r => r.oauth.tokenHealth === 'expired').length,
          errors: results.filter(r => r.oauth.tokenHealth === 'error').length,
          webhookActive: results.filter(r => r.webhook.active).length,
        },
      };
    }),

    // Super Admin: Force refresh OAuth token for a specific tenant
    forceRefreshTenantOAuth: protectedProcedure
      .input(z.object({ tenantId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const { hasPlatformAccess } = await import("./tenant");
        if (!hasPlatformAccess(ctx.user || {})) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Platform owner access required' });
        }
        const { handleTokenRefreshOn401 } = await import("./ghlOAuth");
        const newToken = await handleTokenRefreshOn401(input.tenantId);
        if (!newToken) {
          throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Token refresh failed. The refresh token may be expired or revoked.' });
        }
        return { success: true, message: 'Token refreshed successfully' };
      }),

    getCrmIntegrations: protectedProcedure.query(async ({ ctx }) => {
      const { parseCrmConfig, getTenantById } = await import("./tenant");
      const { getOAuthStatus, isOAuthConfigured } = await import("./ghlOAuth");
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
      // Check OAuth status
      const oauthStatus = await getOAuthStatus(ctx.user.tenantId);
      const hasApiKey = !!(config.ghlApiKey && config.ghlLocationId);
      const hasOAuth = oauthStatus.connected;
      const ghlConnected = hasOAuth || hasApiKey;
      // Check both tenant-specific config AND global env fallback for API keys
      // (sync code uses env fallback, so connection status should reflect that)
      const hasBdKey = !!(config.batchDialerApiKey || process.env.BATCHDIALER_API_KEY);
      const hasBlKey = !!(config.batchLeadsApiKey || process.env.BATCHLEADS_API_KEY);
      return {
        ghl: {
          enabled: ghlConnected,
          connected: ghlConnected,
          hasApiKey: !!config.ghlApiKey,
          hasLocationId: !!(config.ghlLocationId || oauthStatus.locationId),
          locationId: oauthStatus.locationId || config.ghlLocationId || undefined,
          dispoPipelineName: config.dispoPipelineName || undefined,
          dispoPipelineId: config.dispoPipelineId || undefined,
          newDealStageName: config.newDealStageName || undefined,
          lastSynced: tenant.lastGhlSync ? tenant.lastGhlSync.toISOString() : null,
          // OAuth-specific fields
          authMethod: hasOAuth ? 'oauth' as const : hasApiKey ? 'apikey' as const : 'none' as const,
          oauthConfigured: isOAuthConfigured(),
          oauthConnected: hasOAuth,
          oauthLastError: oauthStatus.lastError || undefined,
        },
        // Advanced config
        stageClassification: config.stageClassification || null,
        industry: config.industry || null,
        engineWebhookUrl: config.engineWebhookUrl || null,
        batchDialer: {
          enabled: hasBdKey || !!config.batchDialerEnabled,
          connected: hasBdKey,
          hasApiKey: hasBdKey,
          lastSynced: tenant.lastBatchDialerSync ? tenant.lastBatchDialerSync.toISOString() : null,
        },
        batchLeads: {
          enabled: hasBlKey,
          connected: hasBlKey,
          hasApiKey: hasBlKey,
          lastSynced: tenant.lastBatchLeadsSync ? tenant.lastBatchLeadsSync.toISOString() : null,
        },
      };
    }),

    // Update advanced CRM config (stage classification, industry, webhook URL)
    updateAdvancedConfig: protectedProcedure
      .input(z.object({
        stageClassification: z.object({
          activeStages: z.array(z.string()),
          followUpStages: z.array(z.string()),
          deadStages: z.array(z.string()),
          highValueStages: z.array(z.string()).optional(),
          offerStages: z.array(z.string()).optional(),
        }).optional(),
        industry: z.string().optional(),
        engineWebhookUrl: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const { parseCrmConfig, getTenantById, updateTenantSettings } = await import("./tenant");
        if (!ctx.user?.tenantId) throw new TRPCError({ code: 'NOT_FOUND', message: 'No tenant' });
        if (ctx.user?.role !== 'admin' && ctx.user?.role !== 'super_admin' && ctx.user?.isTenantAdmin !== 'true') {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin access required' });
        }
        const tenant = await getTenantById(ctx.user.tenantId);
        if (!tenant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Tenant not found' });
        const existingConfig = parseCrmConfig({ crmConfig: tenant.crmConfig as string | null });
        
        if (input.stageClassification) {
          existingConfig.stageClassification = input.stageClassification;
        }
        if (input.industry !== undefined) {
          existingConfig.industry = input.industry || undefined;
        }
        if (input.engineWebhookUrl !== undefined) {
          existingConfig.engineWebhookUrl = input.engineWebhookUrl || undefined;
        }
        
        await updateTenantSettings(ctx.user.tenantId, {
          crmConfig: JSON.stringify(existingConfig),
        });
        return { success: true };
      }),

    // Manual BatchLeads sync (property enrichment for recent calls)
    syncBatchLeads: protectedProcedure.mutation(async ({ ctx }) => {
      if (ctx.user?.teamRole !== 'admin' && ctx.user?.role !== 'admin' && ctx.user?.role !== 'super_admin' && ctx.user?.isTenantAdmin !== 'true') {
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
      if (ctx.user?.teamRole !== 'admin' && ctx.user?.role !== 'admin' && ctx.user?.role !== 'super_admin' && ctx.user?.isTenantAdmin !== 'true') {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin access required' });
      }
      if (!ctx.user?.tenantId) {
        return { pending: 0, delivered: 0, failed: 0, recentFailures: [] };
      }
      const { getRetryQueueStatus } = await import("./webhookRetryQueue");
      return getRetryQueueStatus(ctx.user.tenantId);
    }),

    // Get webhook health stats (admin only)
    getWebhookHealth: protectedProcedure.query(async ({ ctx }) => {
      if (ctx.user?.teamRole !== 'admin' && ctx.user?.role !== 'admin' && ctx.user?.role !== 'super_admin' && ctx.user?.isTenantAdmin !== 'true') {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin access required' });
      }
      const { getWebhookHealthStats } = await import("./webhook");
      const stats = await getWebhookHealthStats(ctx.user?.tenantId || undefined);
      return stats || {
        status: 'never_connected' as const,
        lastEvent: null,
        lastHour: { total: 0, processed: 0, failed: 0, skipped: 0 },
        last24Hours: { total: 0, processed: 0, failed: 0 },
        eventsByType: [],
      };
    }),

    // Get webhook URL for setup wizard
    getWebhookUrl: protectedProcedure.query(async ({ ctx }) => {
      const appUrl = process.env.APP_URL || ctx.req.headers.origin || 'http://localhost:3000';
      return {
        webhookUrl: `${appUrl}/api/webhook/ghl`,
        supportedEvents: [
          'InboundMessage',
          'OutboundMessage',
          'OpportunityCreate',
          'OpportunityStageUpdate',
          'OpportunityStatusUpdate',
          'OpportunityDelete',
          'ContactCreate',
          'ContactUpdate',
          'ContactDelete',
          'ContactTagUpdate',
        ],
      };
    }),

    // Search contact cache (for AI Coach contact resolution)
    searchContactCache: protectedProcedure
      .input(z.object({ query: z.string().min(1) }))
      .query(async ({ ctx, input }) => {
        if (!ctx.user?.tenantId) return [];
        const { searchContactCache } = await import("./webhook");
        return searchContactCache(ctx.user.tenantId, input.query);
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
      if (ctx.user.role !== 'admin' && ctx.user.role !== 'super_admin') {
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
      if (ctx.user.role !== 'admin' && ctx.user.role !== 'super_admin') {
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
        if (ctx.user.role !== 'admin' && ctx.user.role !== 'super_admin') {
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
        const { hasPlatformAccess } = await import("./tenant");
        const { startImpersonation } = await import("./impersonation");
        
        if (!hasPlatformAccess(ctx.user || {})) {
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
      if (!ctx.user?.id) {
        throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Not authenticated' });
      }
      // Clear the impersonation session cookie entirely
      // The user's original auth (auth_token or app_session_id) will take over
      ctx.res.clearCookie('session', { path: '/' });
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
        const { hasPlatformAccess, getTenantById, getTenantUsers } = await import("./tenant");
        const { sendTieredChurnOutreachEmail } = await import("./emailService");
        
        if (!hasPlatformAccess(ctx.user || {})) {
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
        const { hasPlatformAccess } = await import("./tenant");
        
        if (!hasPlatformAccess(ctx.user || {})) {
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
        const { hasPlatformAccess } = await import("./tenant");
        
        if (!hasPlatformAccess(ctx.user || {})) {
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
        history: z.array(z.object({
          role: z.enum(["user", "assistant"]),
          content: z.string(),
        })).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const tenantId = ctx.user?.tenantId;
        if (!tenantId) throw new TRPCError({ code: "FORBIDDEN" });

        // Load tenant playbook context for dynamic prompts
        const { buildCoachIndustryContext: buildParseCtx } = await import("./playbooks");
        const parseIndustryCtx = await buildParseCtx(tenantId);
        const parseIndustryLabel = parseIndustryCtx?.industry || "real estate wholesaling";

        // Check if this is a user instruction/preference being set
        try {
          const { detectInstruction, saveInstruction } = await import("./userInstructions");
          const detected = await detectInstruction(input.message);
          if (detected && detected.isInstruction) {
            // Save the instruction permanently for this user
            await saveInstruction(ctx.user!.id, detected.instruction, detected.category);
            console.log(`[parseIntent] Saved user instruction: "${detected.instruction}" (category: ${detected.category}) for user ${ctx.user!.id}`);
            // Return empty actions with a special flag so the frontend shows the confirmation
            return {
              actions: [],
              instructionSaved: true,
              instructionConfirmation: detected.confirmation,
            };
          }
        } catch (e) {
          console.error("[parseIntent] Instruction detection error:", e);
        }

        // Get user's explicit instructions (persistent preferences)
        let instructionContext = "";
        try {
          const { buildInstructionContext } = await import("./userInstructions");
          instructionContext = await buildInstructionContext(ctx.user!.id);
        } catch { /* instructions are optional */ }

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
        let allMembers: Awaited<ReturnType<typeof getTeamMembers>> = [];
        let allowedAssigneeNames: string[] = [];
        try {
          allMembers = await getTeamMembers(tenantId);
          teamMemberNames = allMembers.map(m => m.name);
          
          // Determine who this user can assign tasks to (same hierarchy as AI Coach visibility)
          const isAdmin = ctx.user?.role === 'admin' || ctx.user?.role === 'super_admin';
          if (isAdmin) {
            allowedAssigneeNames = teamMemberNames;
          } else {
            // Can assign to self + direct reports
            const currentUserTeamMember = ctx.user?.id
              ? await getTeamMemberByUserId(ctx.user.id)
              : null;
            const allowedIds = new Set<number>();
            if (currentUserTeamMember) {
              allowedIds.add(currentUserTeamMember.id);
              try {
                const assignments = await getTeamAssignments(tenantId);
                for (const a of assignments) {
                  if (a.acquisitionManagerId === currentUserTeamMember.id) {
                    allowedIds.add(a.leadManagerId);
                  }
                }
              } catch { /* assignment lookup is best-effort */ }
            }
            allowedAssigneeNames = allMembers
              .filter(m => allowedIds.has(m.id))
              .map(m => m.name);
            // Always include self
            if (ctx.user?.name && !allowedAssigneeNames.includes(ctx.user.name)) {
              allowedAssigneeNames.push(ctx.user.name);
            }
          }
        } catch { /* team list is optional */ }

        // Always look up recent call data for the contact mentioned in the message
        // This provides real context for tasks, notes, SMS, and any other action
        let callContext = "";
        let contactNameForLookup = input.contextContactName || "";
        
        // If no contact name in current message context, try to extract from conversation history
        // This handles follow-up messages like "do it again", "try again", "its there"
        let historyContactName = "";
        if (!contactNameForLookup && input.history && input.history.length > 0) {
          // Scan history in reverse to find the most recent contact name mentioned
          for (let i = input.history.length - 1; i >= 0; i--) {
            const msg = input.history[i];
            if (msg.role === "user") {
              // Try to extract contact name from previous user messages
              const historyNamePatterns = [
                /(?:note|notes|summary|text|sms|task|call|tag|stage|workflow|appointment)\s+(?:to|for|about|on|with)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i,
                /(?:call|conversation|chat|summary|talk)\s+(?:with|for|about)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i,
                /([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)(?:'s|\u2019s)\s+(?:call|conversation|last\s+call)/i,
                /(?:^|\s)([A-Z][a-z]{1,15}\s+[A-Z][a-z]{1,15})(?:\s|$|[.,!?])/,
              ];
              for (const pattern of historyNamePatterns) {
                const match = msg.content.match(pattern);
                if (match && match[1]) {
                  const potentialName = match[1].trim();
                  // Filter out common words that aren't names
                  const commonWords = new Set(['The', 'This', 'That', 'What', 'How', 'Why', 'When', 'Where', 'Who', 'Can', 'Could', 'Would', 'Should', 'Tell', 'Show', 'Give', 'Help', 'About', 'Team', 'Call', 'Last', 'Recent', 'CRM', 'Sales', 'Pipeline']);
                  if (!commonWords.has(potentialName.split(' ')[0])) {
                    historyContactName = potentialName;
                    break;
                  }
                }
              }
              if (historyContactName) break;
            }
            // Also check assistant messages for contact names (e.g., "Creating note for Rita Adams...")
            if (msg.role === "assistant") {
              const assistantNamePatterns = [
                /(?:note|notes|task|sms|text|tag|stage)\s+(?:to|for|about)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i,
                /(?:Creating|Adding|Sending|Moving|Updating)\s+\w+\s+(?:to|for|about)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i,
              ];
              for (const pattern of assistantNamePatterns) {
                const match = msg.content.match(pattern);
                if (match && match[1]) {
                  historyContactName = match[1].trim();
                  break;
                }
              }
              if (historyContactName) break;
            }
          }
          if (historyContactName) {
            console.log(`[parseIntent] Extracted contact name from history: "${historyContactName}"`);
          }
        }
        try {
          const { getDb } = await import("./db");
          const db = await getDb();
          if (db) {
            const { calls: callsTable, callGrades } = await import("../drizzle/schema");
            const { desc, eq, and, like, isNotNull, sql } = await import("drizzle-orm");
            
            // Try to extract a contact name from the message for lookup
            // First use explicit context, then try to parse from the message
            if (!contactNameForLookup) contactNameForLookup = "";
            
            // Use history-derived contact name as fallback
            if (!contactNameForLookup && historyContactName) {
              contactNameForLookup = historyContactName;
              console.log(`[parseIntent] Using contact name from conversation history: "${historyContactName}"`);
            }
            
            if (!contactNameForLookup) {
              // Try to extract potential contact name from the message
              // Look for patterns like "call back [name]", "text [name]", "task for... to call [name]"
              // Also match standalone capitalized name patterns
              const nameExtractPatterns = [
                /(?:call\s+back|callback|follow\s*up\s+with|text|sms\s+to|message|contact|reach\s+out\s+to|note\s+(?:to|for|about|on))\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i,
                /(?:to\s+call|to\s+text|to\s+contact|to\s+reach)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i,
                // Match "call with [Name]", "summary for [Name]", "conversation with [Name]"
                /(?:call|conversation|chat|summary|talk)\s+(?:with|for|about)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i,
                // Match "[Name]'s call" or "[Name]'s last call"
                /([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)(?:'s|\u2019s)\s+(?:call|conversation|last\s+call)/i,
                // Broad fallback: any two capitalized words that look like a name (first + last)
                /(?:^|\s)([A-Z][a-z]{1,15}\s+[A-Z][a-z]{1,15})(?:\s|$|[.,!?])/,
              ];
              for (const pattern of nameExtractPatterns) {
                const match = input.message.match(pattern);
                if (match && match[1]) {
                  // Filter out team member names — we want the contact, not the assignee
                  const potentialName = match[1].trim();
                  const isTeamMember = teamMemberNames.some(tm => 
                    tm.toLowerCase() === potentialName.toLowerCase() ||
                    tm.toLowerCase().split(' ')[0] === potentialName.toLowerCase()
                  );
                  if (!isTeamMember) {
                    contactNameForLookup = potentialName;
                    break;
                  }
                }
              }
            }
            
            // Build query conditions
            const conditions: any[] = [
              eq(callsTable.tenantId, tenantId),
              eq(callsTable.isArchived, "false"),
            ];
            if (contactNameForLookup) {
              conditions.push(like(callsTable.contactName, `%${contactNameForLookup}%`));
            }
            
            // Get recent calls with grades
            const recentCalls = await db
              .select({
                id: callsTable.id,
                contactName: callsTable.contactName,
                contactPhone: callsTable.contactPhone,
                propertyAddress: callsTable.propertyAddress,
                callType: callsTable.callType,
                classification: callsTable.classification,
                duration: callsTable.duration,
                callTimestamp: callsTable.callTimestamp,
                teamMemberName: callsTable.teamMemberName,
                callOutcome: callsTable.callOutcome,
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
              callContext = "\n\nRECENT CALL DATA FOR THIS CONTACT (use this to write specific, accurate content — reference actual details like property address, what was discussed, outcome, etc.):\n";
              for (const call of recentCalls) {
                callContext += `\n--- Call with ${call.contactName || "Unknown"} ---\n`;
                callContext += `Date: ${call.callTimestamp ? new Date(call.callTimestamp).toLocaleDateString() : "Unknown"}\n`;
                callContext += `Type: ${call.callType || "Unknown"} | Duration: ${call.duration ? Math.floor(call.duration / 60) + "m " + (call.duration % 60) + "s" : "Unknown"}\n`;
                callContext += `Team Member: ${call.teamMemberName || "Unknown"}\n`;
                if (call.propertyAddress) callContext += `Property Address: ${call.propertyAddress}\n`;
                if (call.callOutcome) callContext += `Outcome: ${call.callOutcome}\n`;
                if (call.contactPhone) callContext += `Phone: ${call.contactPhone}\n`;
                if (call.gradeSummary) callContext += `Grade Summary: ${call.gradeSummary}\n`;
                if (call.overallGrade) callContext += `Grade: ${call.overallGrade} (${call.overallScore}%)\n`;
                if (call.strengths) callContext += `Strengths: ${JSON.stringify(call.strengths)}\n`;
                if (call.improvements) callContext += `Areas for improvement: ${JSON.stringify(call.improvements)}\n`;
                if (call.transcript) {
                  // Include up to 8000 chars of transcript for detailed summaries
                  const truncatedTranscript = call.transcript.length > 8000 
                    ? call.transcript.substring(0, 8000) + "... [truncated]"
                    : call.transcript;
                  callContext += `Transcript:\n${truncatedTranscript}\n`;
                }
              }
            } else if (contactNameForLookup) {
              callContext = `\n\nNo recent calls found for contact "${contactNameForLookup}". Write generic but professional content.`;
            }
          }
        } catch (e) {
          console.error("[AI Coach] Failed to fetch call context:", e);
        }

        // Step 1: Clean up sloppy/typo-filled user input before parsing
        const { hasSignificantTypos, cleanupMessage } = await import("./messageCleanup");
        let cleanedMessage = input.message;
        if (hasSignificantTypos(input.message)) {
          cleanedMessage = await cleanupMessage(input.message);
        }

        // Step 2: Use LLM to parse the intent
        const response = await invokeLLM({
          messages: [
            {
              role: "system",
              content: `You are an AI assistant that parses user requests into structured CRM actions.
The user is a ${parseIndustryLabel} team member. Parse their natural language request into CRM actions.

CRITICAL - CURRENT MESSAGE TAKES PRIORITY: The contact name mentioned in the CURRENT user message ALWAYS takes priority over any contact from conversation history. If the current message says "text Deanna Jonker", the action MUST target Deanna Jonker - NOT a contact from a previous conversation turn. Only use history contacts when the current message has NO contact name (e.g., "do it again", "try again").

Available action types:
1. add_note - Add a note to a contact (covers both contact notes and deal/opportunity notes)
2. change_pipeline_stage - Move a deal to a different pipeline stage
3. send_sms - Send an SMS to a contact
4. create_task - Create a follow-up task
5. add_tag - Add a tag to a contact
6. remove_tag - Remove a tag from a contact
7. update_field - Update a custom field on a contact
8. update_task - Update an existing task (change due date, title, description, or status)
9. add_to_workflow - Add a contact to a GHL workflow/automation
10. remove_from_workflow - Remove a contact from a GHL workflow/automation
11. create_appointment - Create a calendar appointment/event for a contact
12. update_appointment - Reschedule or update an existing appointment (change date/time, title, notes)
13. cancel_appointment - Cancel an existing appointment for a contact

MULTI-ACTION SUPPORT: A user may request MULTIPLE actions in a single message (e.g., "Add a note to Jose Ruiz, then create a task for 3 months from now, then move it to the 4 month stage"). You MUST detect ALL actions and return each one as a separate item in the "actions" array. Parse each action independently with its own contactName, params, and summary.

CRITICAL — ONLY PARSE THE CURRENT MESSAGE: You will see conversation history messages for context. ONLY parse the LAST user message (the current request) for new actions. Previous user messages in the history have ALREADY been processed and executed — do NOT re-detect or re-create actions from them. The history is provided ONLY so you can understand context for follow-ups like "do it again" or to extract contact names. If the current message says "move the task for Rose Hill to 5 weeks", return ONLY the Rose Hill action — do NOT also return actions from earlier messages in the history.

If the message contains NO CRM action requests (it's a coaching question, greeting, etc.), return an empty actions array.

CRITICAL — CONVERSATIONAL MESSAGES ARE NOT ACTIONS:
These types of messages are NOT CRM actions and MUST return an empty actions array:
- Feedback or complaints about a previous action (e.g., "That was not sent from my number", "That note was wrong", "That went to the wrong person")
- Questions about how something worked (e.g., "Why did it send from Chris's number?", "Which number did that go from?")
- Confirmations or acknowledgments (e.g., "Thanks", "Got it", "OK", "Perfect")
- General conversation or follow-up about a previous interaction
- Greetings (e.g., "Hey", "Hello", "What's up")
- COACHING/ADVICE QUESTIONS — when the user is asking for HELP on what to say, how to respond, or what to do:
  - "What do I say to this text?" → NOT an action (asking for advice on how to respond)
  - "How should I respond to this?" → NOT an action
  - "What should I text back?" → NOT an action (asking what to write, not asking to send)
  - "How do I handle this objection?" → NOT an action
  - "What's the best way to follow up?" → NOT an action
  - "What would you say to a seller who says..." → NOT an action
  - "How do I negotiate this?" → NOT an action
  - "What's a good response to..." → NOT an action
  - "Help me with what to say" → NOT an action
  - "What should I tell them?" → NOT an action
  - "How do I close this deal?" → NOT an action
  - "What's the play here?" → NOT an action
  KEY DISTINCTION: "What do I say to this text" = asking for ADVICE (return empty). "Send a text to John saying..." = ACTION. "Text John and ask if..." = ACTION. The difference: asking WHAT/HOW to say something = coaching. Telling you TO send/text/add/create = action.
Do NOT try to parse these as CRM actions. Return an empty actions array so the coaching system can handle them conversationally.

IMPORTANT — DETECT CONVERSATIONAL ACTION REQUESTS: Users may phrase actions conversationally rather than as direct commands. ALL of these are action requests and MUST be parsed into actions:
- "Can you add a note to John?" → add_note
- "I need to update the stage for this contact" → change_pipeline_stage
- "Could you send a text to Jane?" → send_sms
- "I want to create a follow-up task" → create_task
- "Tag this contact as hot-lead" → add_tag
- "Can you move this deal to pending appointment?" → change_pipeline_stage
- "Please note that the seller called back" → add_note
- "Text the seller and ask if they're still interested" → send_sms
- "Set a reminder to call back tomorrow" → create_task
- "Move the pending task for John to due on Monday" → update_task
- "Change the task due date for Jane to next Friday" → update_task
- "Update the task for Greg to be due in 2 weeks" → update_task
- "Push back the task for Mike to next month" → update_task
- "Mark the task for Sarah as completed" → update_task
- "Check off the task for Sue" → update_task (mark completed)
- "Check of the task for Sue for today" → update_task (mark completed, ignore typos like 'check of' = 'check off')
- "Complete the task for John" → update_task (mark completed)
- "Finish the task for Greg" → update_task (mark completed)
- "Done with the task for Mike" → update_task (mark completed)
- "Mark Sue's task as done" → update_task (mark completed)
- "Close out the task for Jane" → update_task (mark completed)
- "Add John to the follow-up workflow" → add_to_workflow
- "Remove Jane from the drip campaign" → remove_from_workflow
- "Put this contact in the nurture sequence" → add_to_workflow
- "Take him out of the cold calling workflow" → remove_from_workflow
- "Schedule an appointment with John for next Tuesday at 2pm" → create_appointment
- "Add a walkthrough for 123 Main St on Friday at 10am" → create_appointment
- "Book a meeting with the seller for tomorrow morning" → create_appointment
- "Set up an appointment to see the property next week" → create_appointment
- "Put John on the calendar for Thursday at 3" → create_appointment
- "Reschedule the appointment with John to next Wednesday at 3pm" → update_appointment
- "Move John's appointment to Friday" → update_appointment
- "Push back the meeting with Jane to next week" → update_appointment
- "Change the walkthrough time to 2pm" → update_appointment
- "Cancel the appointment with John" → cancel_appointment
- "Remove the meeting with Jane from the calendar" → cancel_appointment
- "Cancel John's walkthrough" → cancel_appointment
- "Can you create summary for the last call with Jackson James and add that summary as a note?" → add_note (use the RECENT CALL DATA to write the full summary as the noteBody)
- "Summarize the call with [Name] and save it as a note" → add_note (write the complete summary in noteBody)
- "Write up what happened on the last call and add it to their notes" → add_note
- "Create a summary of my call and note it" → add_note
Do NOT return empty actions for these — they are action requests even if phrased as questions.
COMPOUND REQUESTS: When a user asks to "create a summary AND add it as a note", this is ONE action (add_note) where you write the full summary as the noteBody. Do NOT treat this as two separate actions. Use the RECENT CALL DATA below to write the actual summary content.

FOLLOW-UP MESSAGES: If the user sends a short follow-up like "do it again", "try again", "redo it", "its there", "i confirmed it", "type it", "write it", or similar — look at the CONVERSATION HISTORY to understand what they originally asked for. Re-execute the same action type for the same contact using the RECENT CALL DATA below. Do NOT say you don't have the data — the transcript and call details ARE provided in this prompt. Use them.

Context: ${input.contextContactId ? `Currently viewing contact: ${input.contextContactName} (ID: ${input.contextContactId})` : "No contact context"}

The current user is: ${ctx.user!.name || "Unknown"}
Team members: ${teamMemberNames.length > 0 ? teamMemberNames.join(", ") : "Unknown"}

ASSIGNEE RESTRICTION: For create_task, the assignee MUST be one of these people ONLY: ${allowedAssigneeNames.length > 0 ? allowedAssigneeNames.join(", ") : ctx.user!.name || "Unknown"}. If the user tries to assign to someone not on this list, set assigneeName to "${ctx.user!.name || "Unknown"}" (the current user) and include a note in the summary that the task was assigned to them instead because they don't have permission to assign to the requested person.

IMPORTANT: For actions that involve writing content, you MUST generate the FULL DRAFT TEXT upfront so the user can review and edit it before confirming:
- For add_note: Write the complete note body in params.noteBody. Don't just describe what the note will say — write the actual note. ALL CRM notes on this platform follow a standardized format. You are writing internal CRM notes for a real estate acquisition team that purchases homes for cash. These rules apply to ALL tenants and ALL users. Follow these rules EXACTLY:
  1. Write in clear paragraph form ONLY. Do NOT use bullet points or lists.
  2. Be detailed without being overly summarized. A 14-minute call should produce a 200-400 word note. NEVER write a one-line summary.
  3. Do NOT use the word "features."
  4. Do NOT assume property condition. Only record condition details explicitly stated by the owner.
  5. Do NOT add opinions, sales language, explanations, or filler.
  6. Do NOT include acknowledgments such as thanking the owner or expressing appreciation.
  7. Do NOT invent motivation, urgency, or intent. Only document information directly stated or clearly confirmed by the owner.
  8. If information was not discussed or is unclear, explicitly state that it is unknown.
  9. Maintain a neutral, factual tone appropriate for internal CRM documentation.
  10. Include the following information ONLY if it was mentioned in the call:
      - Who was contacted and by what method (call or text)
      - Owner's stated plans for the property
      - Condition details provided by the owner
      - Renovations or updates mentioned, including timing if stated
      - Rental status if applicable
      - Price expectations if a specific number was provided
      - Decision makers involved
      - Next steps discussed, or note that no next steps were established
  Write the CRM note based ONLY on the transcript/call data below. Do NOT infer or add context beyond what is stated.
- For send_sms: Write the complete SMS message text in params.message. Don't describe the SMS — write the actual message that will be sent. CRITICAL: The SMS will be sent DIRECTLY to the contact, so always write it in SECOND PERSON ("you"/"your") as if speaking to them. The user may describe what to say in third person (e.g., "tell him we don't want his house") — you MUST convert this to direct address (e.g., "we're not interested in purchasing your house"). Never use "he/him/his/she/her" to refer to the recipient in the SMS body.
- For create_task: Write a clear task title in params.title AND a detailed description in params.description. The description MUST reference specific details from the call data below (property address, what was discussed, outcome, next steps). Never write vague descriptions like "call them about their property" — instead write something like "Follow up on 123 Main St. Last call on 2/10 discussed ARV of $180k, seller wants $150k. Need to present offer."
  IMPORTANT for dueDate: Convert the user's requested date to ISO 8601 format: YYYY-MM-DDTHH:mm:ssZ (e.g., "2026-02-24T10:00:00Z"). Today is ${new Date().toISOString().split('T')[0]}. If the user says "next Monday", calculate the actual date. If the user says "3 months from now", calculate 3 months ahead. If no date is specified, use tomorrow's date. Always include the time (default 10:00:00) and Z timezone suffix. NEVER return relative strings like "next monday" or "3 months" — always return the calculated ISO date.
- For update_task: Set params.title to a keyword describing which task to update (e.g. "pending", "follow up", "call back"). Set params.dueDate to the new due date in ISO 8601 format if the user wants to change the due date. Set params.description to the new description if the user wants to change it. The system will search the contact's existing tasks and find the best match.
  TASK COMPLETION: If the user says ANY of these phrases, set params.taskStatus to "completed": "check off", "check of" (typo for check off), "mark as completed", "mark as done", "complete the task", "finish the task", "done with the task", "close out the task". When "for today" is mentioned alongside a completion phrase, it means complete the task that is due today — still set taskStatus to "completed" and use "today" or "due today" as the title keyword to match the right task.
  IMPORTANT: "check of" is a common typo for "check off" — ALWAYS treat it as a task completion request.
- For add_to_workflow: Set params.workflowName to the workflow name the user mentioned (e.g. "follow-up", "drip campaign", "nurture sequence"). The system will fuzzy-match to the actual GHL workflow.
- For remove_from_workflow: Set params.workflowName to the workflow name to remove from. The system will fuzzy-match to the actual GHL workflow.
- For create_appointment: Set params.title to a descriptive appointment title (e.g. "Property Walkthrough - 123 Main St" or "Follow-up Meeting with John"). Set params.startTime to the appointment date/time in ISO 8601 format (YYYY-MM-DDTHH:mm:ssZ). Today is ${new Date().toISOString().split('T')[0]}. If the user says "next Tuesday at 2pm", calculate the actual date. If no time is specified, default to 10:00 AM. Set params.endTime to the end time (default 1 hour after start). Set params.calendarName to the calendar name if the user specifies one (e.g. "appointments calendar", "walkthrough calendar"). If no calendar is specified, leave it empty and the system will use the default calendar. Set params.notes to any additional details about the appointment. Set params.selectedTimezone to the user's timezone if mentioned (default: America/New_York).
- For update_appointment: Set params.title to the appointment title or keyword to find the right appointment (e.g. "walkthrough", "meeting"). If the user doesn't specify which appointment, leave title empty and the system will find the next upcoming one. Set params.startTime to the NEW date/time in ISO 8601 format if rescheduling. Today is ${new Date().toISOString().split('T')[0]}. If the user says "move to Friday at 2pm", calculate the actual date. Set params.endTime if the duration changes. Set params.notes if updating notes. Set params.appointmentTitle if renaming the appointment (different from params.title which is used for matching).
- For cancel_appointment: Set params.title to the appointment title or keyword to find the right appointment (e.g. "walkthrough", "meeting", "follow-up"). If the user doesn't specify which appointment, leave title empty and the system will find the next upcoming one. The system will set the appointment status to "cancelled" in GHL.

CRITICAL: You have REAL call data below. You MUST use it to write specific, accurate content. Reference actual property addresses, discussion topics, outcomes, and details from the transcripts. NEVER generate vague or placeholder text like "regarding his property" or "Please provide the summary" or "Insert details here".
${callContext}

Return JSON with an "actions" array. Each action object has:
- actionType: one of the types above
- contactName: the contact name mentioned (or from context). If multiple actions reference the same contact, use the same name for all.
- contactId: the contact ID if known from context
- assigneeName: for create_task ONLY, the TEAM MEMBER name to assign the task to. IMPORTANT: The assignee is the person who will DO the task, NOT the contact the task is about. The contact name goes in contactName. If the user says "make a task for Daniel to call John", Daniel is the assigneeName and John is the contactName. If the user says "create a task to follow up with Greg", Greg is the contactName and the assigneeName should be the current user ("${ctx.user!.name || "Unknown"}") since no specific team member was mentioned. For non-task actions, use empty string.
- params: action-specific parameters (noteBody, message, title, description, dueDate, tags, stageName, pipelineName, fieldKey, fieldValue, workflowName, taskStatus)
- For change_pipeline_stage: ALWAYS include stageName (the human-readable stage name the user mentioned, e.g. "pending appointment", "offer scheduled", "qualified"). Also include pipelineName if the user mentions a specific pipeline (e.g. "sales pipeline", "acquisition pipeline"). Leave pipelineId and stageId empty strings — the system will resolve the actual IDs automatically.
- summary: a SHORT one-line summary of the action (e.g. "Send SMS to John" or "Add note to Kimberly"). The full content will be shown separately.
- needsContactSearch: boolean - MUST be true if a contact name was mentioned but we don't have their GHL contact ID. Since there is ${input.contextContactId ? 'a known contact context' : 'NO contact context available'}, you should ${input.contextContactId ? 'set needsContactSearch to false and use the provided contactId' : 'ALWAYS set needsContactSearch to true for any action that references a contact by name'}
${preferenceContext ? `\nWhen drafting content (SMS messages, notes, task descriptions), match this user's established style:\n${preferenceContext}` : ""}
${instructionContext}`
            },
            // Include conversation history for context (so follow-ups like "do it again" work)
            // Tag previous user messages as already-processed to prevent re-detection
            ...(input.history && input.history.length > 0 ? input.history.slice(-6).map(msg => ({
              role: msg.role as "user" | "assistant",
              content: msg.role === "assistant" 
                ? `[Previous response: ${msg.content.substring(0, 500)}]` 
                : `[ALREADY PROCESSED - context only, do NOT parse as new action] ${msg.content}`
            })) : []),
            { role: "user", content: cleanedMessage }
          ],
          response_format: {
            type: "json_schema",
            json_schema: {
              name: "action_intents",
              strict: true,
              schema: {
                type: "object",
                properties: {
                  actions: {
                    type: "array",
                    items: {
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
                            pipelineName: { type: "string" },
                            fieldKey: { type: "string" },
                            fieldValue: { type: "string" },
                            opportunityId: { type: "string" },
                            pipelineId: { type: "string" },
                            stageId: { type: "string" },
                            workflowName: { type: "string" },
                            taskStatus: { type: "string" },
                            calendarName: { type: "string" },
                            calendarId: { type: "string" },
                            startTime: { type: "string" },
                            endTime: { type: "string" },
                            notes: { type: "string" },
selectedTimezone: { type: "string" },
                             appointmentTitle: { type: "string" },
                           },
                           required: ["noteBody", "message", "title", "description", "dueDate", "tags", "stageName", "pipelineName", "fieldKey", "fieldValue", "opportunityId", "pipelineId", "stageId", "workflowName", "taskStatus", "calendarName", "calendarId", "startTime", "endTime", "notes", "selectedTimezone", "appointmentTitle"],
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
                },
                required: ["actions"],
                additionalProperties: false
              }
            }
          }
        });

        const content = response.choices?.[0]?.message?.content;
        console.log(`[parseIntent] User message: "${input.message.substring(0, 100)}"`);
        console.log(`[parseIntent] Contact lookup name: "${contactNameForLookup || 'none'}"`);
        console.log(`[parseIntent] Call context available: ${callContext.length > 0 ? 'yes (' + callContext.length + ' chars)' : 'no'}`);
        if (content && typeof content === "string") {
          const parsed = JSON.parse(content);
          const VALID_ACTION_TYPES = ["add_note", "add_note_contact", "add_note_opportunity", "change_pipeline_stage", "send_sms", "create_task", "add_tag", "remove_tag", "update_field", "update_task", "add_to_workflow", "remove_from_workflow", "create_appointment", "update_appointment", "cancel_appointment"];
          // Return the actions array, or wrap legacy single-action format for backwards compatibility
          if (parsed.actions && Array.isArray(parsed.actions)) {
            // Filter out any actions with missing, empty, or invalid actionType
            const validActions = parsed.actions.filter((a: any) =>
              a && typeof a.actionType === "string" && a.actionType.trim() !== "" && a.actionType !== "none" && VALID_ACTION_TYPES.includes(a.actionType)
            );
            // Safety net: force needsContactSearch=true when LLM returned a contactName but no contactId
            // This prevents the frontend from skipping contact resolution and creating actions without a contact ID
            for (const action of validActions) {
              if (action.contactName && action.contactName.trim() !== "" && (!action.contactId || action.contactId.trim() === "")) {
                if (!action.needsContactSearch) {
                  console.log(`[parseIntent] Forcing needsContactSearch=true for action "${action.actionType}" — contactName="${action.contactName}" but contactId is empty`);
                  action.needsContactSearch = true;
                }
              }
            }
            console.log(`[parseIntent] LLM returned ${parsed.actions.length} actions, ${validActions.length} valid. Types: ${validActions.map((a: any) => a.actionType).join(', ') || 'none'}`);
            return { actions: validActions };
          }
          // Legacy fallback: single action format
          if (parsed.actionType && parsed.actionType !== "none" && VALID_ACTION_TYPES.includes(parsed.actionType)) {
            // Safety net for legacy format too
            if (parsed.contactName && parsed.contactName.trim() !== "" && (!parsed.contactId || parsed.contactId.trim() === "")) {
              parsed.needsContactSearch = true;
            }
            console.log(`[parseIntent] Legacy format detected: ${parsed.actionType}`);
            return { actions: [parsed] };
          }
          console.log(`[parseIntent] No valid actions detected. Raw response: ${content.substring(0, 200)}`);
          return { actions: [] };
        }
        console.log(`[parseIntent] No content in LLM response`);
        return { actions: [] };
      }),

    // Create a pending action (before confirmation)
    createPending: protectedProcedure
      .input(z.object({
        actionType: z.string().optional().default(""),
        requestText: z.string().optional().default(""),
        targetContactId: z.string().optional(),
        targetContactName: z.string().optional(),
        targetOpportunityId: z.string().optional(),
        payload: z.any(),
      }))
      .mutation(async ({ ctx, input }) => {
        const tenantId = ctx.user?.tenantId;
        if (!tenantId) throw new TRPCError({ code: "FORBIDDEN" });

        // Validate actionType server-side with a friendly error
        const VALID_ACTION_TYPES = ["add_note", "add_note_contact", "add_note_opportunity", "change_pipeline_stage", "send_sms", "create_task", "add_tag", "remove_tag", "update_field", "update_task", "add_to_workflow", "remove_from_workflow", "create_appointment", "update_appointment", "cancel_appointment"];
        if (!input.actionType || !VALID_ACTION_TYPES.includes(input.actionType)) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `I couldn't determine the action type. Please try rephrasing your request. (Received: ${input.actionType || "empty"})`,
          });
        }

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

        // Validate assignee permissions for task creation
        const { getDb } = await import("./db");
        const db = await getDb();
        if (db) {
          const { coachActionLog } = await import("../drizzle/schema");
          const { eq } = await import("drizzle-orm");
          const [actionRecord] = await db.select().from(coachActionLog).where(eq(coachActionLog.id, input.actionId));
          if (actionRecord?.actionType === "create_task") {
            const finalPayload = input.editedPayload || actionRecord.payload as any;
            const assigneeName = finalPayload?.assigneeName;
            if (assigneeName) {
              const isAdmin = ctx.user?.role === 'admin' || ctx.user?.role === 'super_admin';
              if (!isAdmin) {
                // Validate the assignee is in the user's allowed list
                const currentUserTeamMember = ctx.user?.id
                  ? await getTeamMemberByUserId(ctx.user.id)
                  : null;
                const allowedIds = new Set<number>();
                if (currentUserTeamMember) {
                  allowedIds.add(currentUserTeamMember.id);
                  try {
                    const assignments = await getTeamAssignments(tenantId);
                    for (const a of assignments) {
                      if (a.acquisitionManagerId === currentUserTeamMember.id) {
                        allowedIds.add(a.leadManagerId);
                      }
                    }
                  } catch { /* best-effort */ }
                }
                const allMembers = await getTeamMembers(tenantId);
                const assigneeMember = allMembers.find(m =>
                  m.name.toLowerCase().includes(assigneeName.toLowerCase()) ||
                  assigneeName.toLowerCase().includes(m.name.split(" ")[0].toLowerCase())
                );
                if (assigneeMember && !allowedIds.has(assigneeMember.id)) {
                  throw new TRPCError({
                    code: "FORBIDDEN",
                    message: `You don't have permission to assign tasks to ${assigneeMember.name}. You can only assign tasks to yourself and your direct reports.`,
                  });
                }
              }
            }
          }
        }

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

    // Resolve a stage name to the actual GHL pipeline/stage for confirmation
    resolveStage: protectedProcedure
      .input(z.object({
        stageName: z.string(),
        pipelineName: z.string().optional(),
        contactId: z.string().optional(),
      }))
      .query(async ({ ctx, input }) => {
        const tenantId = ctx.user?.tenantId;
        if (!tenantId) return { resolved: false as const };
        const { getPipelinesForTenant, resolveStageByName, findOpportunityByContact } = await import("./ghlActions");
        const pipelines = await getPipelinesForTenant(tenantId);
        if (!pipelines.length) return { resolved: false as const, error: "No pipelines found" };

        // If a contactId is provided and no explicit pipeline was specified,
        // look up the contact's current pipeline to prefer it during resolution.
        // This prevents moving contacts to the wrong pipeline when multiple pipelines
        // have stages with the same name (e.g. "Made Offer" in both Sales Process and Buyer Pipeline).
        let preferredPipelineName = input.pipelineName;
        if (input.contactId && !input.pipelineName) {
          try {
            const opp = await findOpportunityByContact(tenantId, input.contactId);
            if (opp) {
              const currentPipeline = pipelines.find(p => p.id === opp.pipelineId);
              if (currentPipeline) {
                preferredPipelineName = currentPipeline.name;
                console.log(`[resolveStage] Preferring contact's current pipeline: "${preferredPipelineName}"`);
              }
            }
          } catch (e) {
            console.warn("[resolveStage] Failed to look up contact's pipeline:", e);
          }
        }

        // First try with the preferred pipeline
        let result = resolveStageByName(pipelines, input.stageName, preferredPipelineName);

        // If not found in preferred pipeline and we inferred the pipeline (not user-specified),
        // fall back to searching all pipelines
        if (!result && preferredPipelineName && !input.pipelineName) {
          result = resolveStageByName(pipelines, input.stageName);
        }

        if (!result) return { resolved: false as const, error: `Could not find a stage matching "${input.stageName}"` };
        return {
          resolved: true as const,
          pipelineId: result.pipelineId,
          pipelineName: result.pipelineName,
          stageId: result.stageId,
          stageName: result.stageName,
        };
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

    // Admin: Get all coach activity across the team (actions + questions)
    adminActivityLog: protectedProcedure
      .input(z.object({
        limit: z.number().min(1).max(200).default(100),
        offset: z.number().min(0).default(0),
        teamMemberId: z.number().optional(),
        actionType: z.string().optional(),
        dateFrom: z.string().optional(),
        dateTo: z.string().optional(),
      }).optional())
      .query(async ({ ctx, input }) => {
        const isAdmin = ctx.user?.role === 'admin' || ctx.user?.role === 'super_admin' || ctx.user?.isTenantAdmin === 'true';
        if (!isAdmin) throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin access required' });

        const tenantId = ctx.user?.tenantId;
        if (!tenantId) throw new TRPCError({ code: 'FORBIDDEN' });

        const { getDb } = await import("./db");
        const db = await getDb();
        if (!db) return { actions: [], questions: [], total: 0 };

        const { coachActionLog, coachMessages, users } = await import("../drizzle/schema");
        const { eq, desc, and, gte, lte, sql, count } = await import("drizzle-orm");

        const limit = input?.limit || 100;
        const offset = input?.offset || 0;

        // Build conditions for actions
        const actionConditions: any[] = [eq(coachActionLog.tenantId, tenantId)];
        if (input?.teamMemberId) {
          actionConditions.push(eq(coachActionLog.requestedBy, input.teamMemberId));
        }
        if (input?.actionType) {
          actionConditions.push(eq(coachActionLog.actionType, input.actionType as any));
        }
        if (input?.dateFrom) {
          actionConditions.push(gte(coachActionLog.createdAt, new Date(input.dateFrom)));
        }
        if (input?.dateTo) {
          actionConditions.push(lte(coachActionLog.createdAt, new Date(input.dateTo)));
        }

        // Fetch actions with user info
        const actions = await db
          .select({
            id: coachActionLog.id,
            requestedBy: coachActionLog.requestedBy,
            requestedByName: coachActionLog.requestedByName,
            actionType: coachActionLog.actionType,
            requestText: coachActionLog.requestText,
            targetContactName: coachActionLog.targetContactName,
            targetContactId: coachActionLog.targetContactId,
            payload: coachActionLog.payload,
            status: coachActionLog.status,
            error: coachActionLog.error,
            confirmedAt: coachActionLog.confirmedAt,
            executedAt: coachActionLog.executedAt,
            createdAt: coachActionLog.createdAt,
          })
          .from(coachActionLog)
          .where(and(...actionConditions))
          .orderBy(desc(coachActionLog.createdAt))
          .limit(limit)
          .offset(offset);

        // Build conditions for questions
        const questionConditions: any[] = [
          eq(coachMessages.tenantId, tenantId),
          eq(coachMessages.role, "user"),
        ];
        if (input?.teamMemberId) {
          questionConditions.push(eq(coachMessages.userId, input.teamMemberId));
        }
        if (input?.dateFrom) {
          questionConditions.push(gte(coachMessages.createdAt, new Date(input.dateFrom)));
        }
        if (input?.dateTo) {
          questionConditions.push(lte(coachMessages.createdAt, new Date(input.dateTo)));
        }

        // Fetch questions with user info
        const questions = await db
          .select({
            id: coachMessages.id,
            userId: coachMessages.userId,
            content: coachMessages.content,
            exchangeId: coachMessages.exchangeId,
            createdAt: coachMessages.createdAt,
          })
          .from(coachMessages)
          .where(and(...questionConditions))
          .orderBy(desc(coachMessages.createdAt))
          .limit(limit)
          .offset(offset);

        // Get user names for questions
        const userIds = Array.from(new Set(questions.map(q => q.userId)));
        let userMap: Record<number, string> = {};
        if (userIds.length > 0) {
          const userRows = await db
            .select({ id: users.id, name: users.name })
            .from(users)
            .where(sql`${users.id} IN (${sql.join(userIds.map(id => sql`${id}`), sql`, `)})`);
          for (const u of userRows) {
            userMap[u.id] = u.name || "Unknown";
          }
        }

        // Get AI responses for each exchange
        const exchangeIds = Array.from(new Set(questions.map(q => q.exchangeId)));
        let responseMap: Record<string, string> = {};
        if (exchangeIds.length > 0) {
          const responses = await db
            .select({
              exchangeId: coachMessages.exchangeId,
              content: coachMessages.content,
            })
            .from(coachMessages)
            .where(and(
              eq(coachMessages.tenantId, tenantId),
              eq(coachMessages.role, "assistant"),
              sql`${coachMessages.exchangeId} IN (${sql.join(exchangeIds.map(id => sql`${id}`), sql`, `)})`
            ));
          for (const r of responses) {
            responseMap[r.exchangeId] = r.content;
          }
        }

        const enrichedQuestions = questions.map(q => ({
          ...q,
          userName: userMap[q.userId] || "Unknown",
          aiResponse: responseMap[q.exchangeId] || null,
        }));

        // Get total counts
        const [actionCount] = await db
          .select({ count: count() })
          .from(coachActionLog)
          .where(and(...actionConditions));
        const [questionCount] = await db
          .select({ count: count() })
          .from(coachMessages)
          .where(and(...questionConditions));

        return {
          actions,
          questions: enrichedQuestions,
          totalActions: actionCount?.count || 0,
          totalQuestions: questionCount?.count || 0,
        };
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

    // Check SMS delivery status for an executed action
    smsDeliveryStatus: protectedProcedure
      .input(z.object({ actionId: z.number() }))
      .query(async ({ ctx, input }) => {
        const { getDb } = await import("./db");
        const db = await getDb();
        if (!db) return { status: "unknown", found: false };
        const { coachActionLog } = await import("../drizzle/schema");
        const { eq } = await import("drizzle-orm");
        const [action] = await db.select().from(coachActionLog).where(eq(coachActionLog.id, input.actionId));
        if (!action || action.actionType !== "send_sms") return { status: "unknown", found: false };
        const meta = action.resultMeta as any;
        if (!meta?.messageId || !action.targetContactId) {
          // No messageId stored - SMS was sent but we can't track it
          return { status: action.status === "executed" ? "sent" : action.status || "unknown", found: false };
        }
        const { getMessageStatus } = await import("./ghlActions");
        return getMessageStatus(action.tenantId, action.targetContactId, meta.messageId);
      }),

    // Get team members for sender override dropdown (only those with GHL user IDs)
    smsTeamSenders: protectedProcedure
      .query(async ({ ctx }) => {
        const tenantId = ctx.user?.tenantId;
        if (!tenantId) return [];
        const { getTeamMembers } = await import("./db");
        const members = await getTeamMembers(tenantId);
        // Only return members that have a GHL user ID (meaning they can send SMS)
        return members
          .filter(m => m.ghlUserId)
          .map(m => ({
            id: m.id,
            name: m.name,
            ghlUserId: m.ghlUserId!,
            lcPhone: m.lcPhone || null,
          }));
      }),
  }),

  // ============ PLAYBOOK SYSTEM ============
  playbook: router({
    // Get the full playbook config for the current tenant
    get: protectedProcedure.query(async ({ ctx }) => {
      if (!ctx.user?.tenantId) throw new TRPCError({ code: "FORBIDDEN", message: "No tenant" });
      const { getTenantPlaybook } = await import("./playbooks");
      return await getTenantPlaybook(ctx.user.tenantId);
    }),

    // Get terminology only (lightweight)
    terminology: protectedProcedure.query(async ({ ctx }) => {
      if (!ctx.user?.tenantId) throw new TRPCError({ code: "FORBIDDEN", message: "No tenant" });
      const { getTenantTerminology } = await import("./playbooks");
      return await getTenantTerminology(ctx.user.tenantId);
    }),

    // Get available industry playbook templates
    availablePlaybooks: publicProcedure.query(async () => {
      const { getAvailablePlaybooks } = await import("../shared/playbooks");
      return getAvailablePlaybooks();
    }),

    // Seed a playbook for the current tenant (admin only)
    seed: protectedProcedure
      .input(z.object({ playbookCode: z.string() }))
      .mutation(async ({ ctx, input }) => {
        if (!ctx.user?.tenantId) throw new TRPCError({ code: "FORBIDDEN", message: "No tenant" });
        if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN", message: "Admin only" });
        const { seedPlaybookForTenant } = await import("./playbooks");
        const result = await seedPlaybookForTenant(ctx.user.tenantId, input.playbookCode);
        if (!result.success) throw new TRPCError({ code: "BAD_REQUEST", message: result.error });
        return result;
      }),

    // Update a role
    updateRole: protectedProcedure
      .input(z.object({
        roleId: z.number(),
        name: z.string().optional(),
        description: z.string().optional(),
        rubricId: z.number().nullable().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (!ctx.user?.tenantId) throw new TRPCError({ code: "FORBIDDEN", message: "No tenant" });
        if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN", message: "Admin only" });
        const { updateTenantRole } = await import("./playbooks");
        const result = await updateTenantRole(ctx.user.tenantId, input.roleId, {
          name: input.name,
          description: input.description,
          rubricId: input.rubricId,
        });
        if (!result.success) throw new TRPCError({ code: "BAD_REQUEST", message: result.error });
        return result;
      }),

    // Add a new role
    addRole: protectedProcedure
      .input(z.object({
        name: z.string(),
        code: z.string(),
        description: z.string().optional(),
        rubricId: z.number().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (!ctx.user?.tenantId) throw new TRPCError({ code: "FORBIDDEN", message: "No tenant" });
        if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN", message: "Admin only" });
        const { addTenantRole } = await import("./playbooks");
        return await addTenantRole(ctx.user.tenantId, input);
      }),

    // Delete (deactivate) a role
    deleteRole: protectedProcedure
      .input(z.object({ roleId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        if (!ctx.user?.tenantId) throw new TRPCError({ code: "FORBIDDEN", message: "No tenant" });
        if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN", message: "Admin only" });
        const { deactivateTenantRole } = await import("./playbooks");
        return await deactivateTenantRole(ctx.user.tenantId, input.roleId);
      }),

    // Update a rubric
    updateRubric: protectedProcedure
      .input(z.object({
        rubricId: z.number(),
        name: z.string().optional(),
        description: z.string().optional(),
        criteria: z.string().optional(),
        redFlags: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (!ctx.user?.tenantId) throw new TRPCError({ code: "FORBIDDEN", message: "No tenant" });
        if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN", message: "Admin only" });
        const { updateTenantRubric } = await import("./playbooks");
        const result = await updateTenantRubric(ctx.user.tenantId, input.rubricId, {
          name: input.name,
          description: input.description,
          criteria: input.criteria,
          redFlags: input.redFlags,
        });
        if (!result.success) throw new TRPCError({ code: "BAD_REQUEST", message: result.error });
        return result;
      }),

    // Add a new rubric
    addRubric: protectedProcedure
      .input(z.object({
        name: z.string(),
        description: z.string().optional(),
        callType: z.string().optional(),
        criteria: z.string(),
        redFlags: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (!ctx.user?.tenantId) throw new TRPCError({ code: "FORBIDDEN", message: "No tenant" });
        if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN", message: "Admin only" });
        const { addTenantRubric } = await import("./playbooks");
        return await addTenantRubric(ctx.user.tenantId, input);
      }),

    // Delete (deactivate) a rubric
    deleteRubric: protectedProcedure
      .input(z.object({ rubricId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        if (!ctx.user?.tenantId) throw new TRPCError({ code: "FORBIDDEN", message: "No tenant" });
        if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN", message: "Admin only" });
        const { deactivateTenantRubric } = await import("./playbooks");
        return await deactivateTenantRubric(ctx.user.tenantId, input.rubricId);
      }),

    // Update a call type
    updateCallType: protectedProcedure
      .input(z.object({
        callTypeId: z.number(),
        name: z.string().optional(),
        description: z.string().optional(),
        rubricId: z.number().nullable().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (!ctx.user?.tenantId) throw new TRPCError({ code: "FORBIDDEN", message: "No tenant" });
        if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN", message: "Admin only" });
        const { updateTenantCallType } = await import("./playbooks");
        const result = await updateTenantCallType(ctx.user.tenantId, input.callTypeId, {
          name: input.name,
          description: input.description,
          rubricId: input.rubricId,
        });
        if (!result.success) throw new TRPCError({ code: "BAD_REQUEST", message: result.error });
        return result;
      }),

    // Add a new call type
    addCallType: protectedProcedure
      .input(z.object({
        name: z.string(),
        code: z.string(),
        description: z.string().optional(),
        rubricId: z.number().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (!ctx.user?.tenantId) throw new TRPCError({ code: "FORBIDDEN", message: "No tenant" });
        if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN", message: "Admin only" });
        const { addTenantCallType } = await import("./playbooks");
        return await addTenantCallType(ctx.user.tenantId, input);
      }),

    // Delete (deactivate) a call type
    deleteCallType: protectedProcedure
      .input(z.object({ callTypeId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        if (!ctx.user?.tenantId) throw new TRPCError({ code: "FORBIDDEN", message: "No tenant" });
        if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN", message: "Admin only" });
        const { deactivateTenantCallType } = await import("./playbooks");
        return await deactivateTenantCallType(ctx.user.tenantId, input.callTypeId);
      }),

    // Update terminology
    updateTerminology: protectedProcedure
      .input(z.object({
        contactLabel: z.string().optional(),
        contactLabelPlural: z.string().optional(),
        dealLabel: z.string().optional(),
        dealLabelPlural: z.string().optional(),
        assetLabel: z.string().optional(),
        assetLabelPlural: z.string().optional(),
        roleLabels: z.record(z.string(), z.string()).optional(),
        callTypeLabels: z.record(z.string(), z.string()).optional(),
        outcomeLabels: z.record(z.string(), z.string()).optional(),
        kpiLabels: z.record(z.string(), z.string()).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (!ctx.user?.tenantId) throw new TRPCError({ code: "FORBIDDEN", message: "No tenant" });
        if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN", message: "Admin only" });
        const { updateTenantTerminology } = await import("./playbooks");
        const result = await updateTenantTerminology(ctx.user.tenantId, input as Partial<import("../shared/playbooks").PlaybookTerminology>);
        if (!result.success) throw new TRPCError({ code: "BAD_REQUEST", message: result.error });
        return result;
      }),
  }),
});

export type AppRouter = typeof appRouter;
