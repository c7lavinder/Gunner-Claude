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
import { LEAD_MANAGER_RUBRIC, ACQUISITION_MANAGER_RUBRIC } from "./grading";
import { processCall } from "./grading";
import { invokeLLM } from "./_core/llm";
import { generateTeamInsights, saveGeneratedInsights, clearAiGeneratedInsights } from "./insights";
import { pollForNewCalls, getPollingStatus, startPolling, stopPolling } from "./ghlService";
import { storagePut } from "./storage";
import { runArchivalJob, getArchivalStats, archiveCall } from "./archival";

export const appRouter = router({
  system: systemRouter,
  
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),

  // ============ TEAM MEMBERS ============
  team: router({
    list: protectedProcedure.query(async () => {
      return await getTeamMembers();
    }),

    getById: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        return await getTeamMemberById(input.id);
      }),

    create: protectedProcedure
      .input(z.object({
        name: z.string(),
        teamRole: z.enum(["admin", "lead_manager", "acquisition_manager"]),
        ghlUserId: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        return await createTeamMember({
          name: input.name,
          teamRole: input.teamRole,
          ghlUserId: input.ghlUserId,
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
      return await getAllUsers();
    }),

    // Admin: Get team assignments
    getAssignments: protectedProcedure.query(async ({ ctx }) => {
      if (ctx.user?.teamRole !== 'admin') {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin access required' });
      }
      return await getTeamAssignments();
    }),

    // Admin: Update team member role
    updateRole: protectedProcedure
      .input(z.object({
        teamMemberId: z.number(),
        teamRole: z.enum(["admin", "lead_manager", "acquisition_manager"]),
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
        await assignLeadManagerToAcquisitionManager(input.leadManagerId, input.acquisitionManagerId);
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
        teamRole: z.enum(["admin", "lead_manager", "acquisition_manager"]),
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
        const permissionContext: UserPermissionContext = {
          teamMemberId: teamMember?.id,
          teamRole: (ctx.user?.teamRole as 'admin' | 'lead_manager' | 'acquisition_manager') || 'lead_manager',
          userId: ctx.user?.id,
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
        const permissionContext: UserPermissionContext = {
          teamMemberId: teamMember?.id,
          teamRole: (ctx.user?.teamRole as 'admin' | 'lead_manager' | 'acquisition_manager') || 'lead_manager',
          userId: ctx.user?.id,
        };
        
        return await getCallsWithPermissions(permissionContext, {
          limit: input?.limit || 20,
        });
      }),

    getById: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        const call = await getCallById(input.id);
        if (!call) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Call not found" });
        }
        return call;
      }),

    withGrades: protectedProcedure
      .input(z.object({
        teamMemberId: z.number().optional(),
        limit: z.number().optional(),
        offset: z.number().optional(),
      }).optional())
      .query(async ({ input }) => {
        return await getCallsWithGrades(input || {});
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
        callType: z.enum(["qualification", "offer"]).optional(),
      }))
      .mutation(async ({ input }) => {
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
      .mutation(async ({ input }) => {
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

    // Manual call upload with audio file
    uploadManual: protectedProcedure
      .input(z.object({
        audioData: z.string(), // Base64 encoded audio
        audioType: z.string(), // MIME type
        fileName: z.string(),
        teamMemberId: z.number(),
        contactName: z.string().optional(),
        contactPhone: z.string().optional(),
        propertyAddress: z.string().optional(),
        duration: z.number().optional(),
        callDate: z.string().optional(), // ISO date string
      }))
      .mutation(async ({ input }) => {
        try {
          // Upload audio to S3
          const buffer = Buffer.from(input.audioData, "base64");
          const timestamp = Date.now();
          const randomSuffix = Math.random().toString(36).substring(7);
          const fileKey = `calls/manual-${timestamp}-${randomSuffix}-${input.fileName}`;
          
          const { url: recordingUrl } = await storagePut(fileKey, buffer, input.audioType);
          console.log(`[ManualUpload] Uploaded audio to: ${recordingUrl}`);

          // Get team member info
          const teamMember = await getTeamMemberById(input.teamMemberId);
          if (!teamMember) {
            throw new TRPCError({ code: "NOT_FOUND", message: "Team member not found" });
          }

          // Create call record
          const call = await createCall({
            contactName: input.contactName,
            contactPhone: input.contactPhone,
            propertyAddress: input.propertyAddress,
            recordingUrl,
            duration: input.duration,
            teamMemberId: input.teamMemberId,
            teamMemberName: teamMember.name,
            callType: teamMember.teamRole === "acquisition_manager" ? "offer" : "qualification",
            status: "pending",
            callTimestamp: input.callDate ? new Date(input.callDate) : new Date(),
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
      .mutation(async ({ input }) => {
        const call = await getCallById(input.callId);
        if (!call) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Call not found" });
        }

        // Determine new status based on classification
        const shouldGrade = input.classification === "conversation";
        const newStatus = shouldGrade ? "completed" : "skipped";

        await updateCall(input.callId, {
          classification: input.classification,
          classificationReason: input.reason || `Manually reclassified to ${input.classification.replace(/_/g, " ")}`,
          status: newStatus,
        });

        // If reclassified to conversation and wasn't graded before, trigger grading
        if (shouldGrade && call.status === "skipped") {
          processCall(input.callId).catch(err => {
            console.error("[Reclassify] Error processing call:", err);
          });
        }

        return { success: true, newStatus, classification: input.classification };
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
  }),

  // ============ LEADERBOARD ============
  leaderboard: router({
    get: protectedProcedure.query(async () => {
      return await getLeaderboardData();
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
        const userRole = ctx.user?.teamRole as 'admin' | 'lead_manager' | 'acquisition_manager' | undefined;
        
        const permissionContext: UserPermissionContext = {
          teamMemberId: teamMember?.id,
          teamRole: userRole || 'lead_manager',
          userId: ctx.user?.id,
        };
        
        // Get viewable team member IDs based on permissions
        const viewableIds = await getViewableTeamMemberIds(permissionContext);
        
        // Pass viewable IDs to getCallStats for filtering
        return await getCallStats({
          ...input,
          viewableTeamMemberIds: viewableIds,
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
      .query(async ({ input }) => {
        return await getTrainingMaterials(input || {});
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
        applicableTo: z.enum(["all", "lead_manager", "acquisition_manager"]).optional(),
      }))
      .mutation(async ({ input }) => {
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
        
        return await createTrainingMaterial({
          title: input.title,
          description: input.description,
          content: extractedContent,
          fileName: input.fileName,
          fileUrl: input.fileUrl,
          fileType: input.fileType,
          category: input.category || "other",
          applicableTo: input.applicableTo || "all",
        });
      }),

    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        title: z.string().optional(),
        description: z.string().optional(),
        content: z.string().optional(),
        category: z.enum(["script", "objection_handling", "methodology", "best_practices", "examples", "other"]).optional(),
        applicableTo: z.enum(["all", "lead_manager", "acquisition_manager"]).optional(),
        isActive: z.enum(["true", "false"]).optional(),
      }))
      .mutation(async ({ input }) => {
        const { id, ...updates } = input;
        await updateTrainingMaterial(id, updates);
        return { success: true };
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
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
      .query(async ({ input }) => {
        return await getAIFeedback(input || {});
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
        });
      }),

    updateStatus: protectedProcedure
      .input(z.object({
        id: z.number(),
        status: z.enum(["pending", "reviewed", "incorporated", "dismissed"]),
      }))
      .mutation(async ({ input }) => {
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
      .query(async ({ input }) => {
        return await getGradingRules(input || {});
      }),

    create: protectedProcedure
      .input(z.object({
        title: z.string(),
        description: z.string().optional(),
        ruleText: z.string(),
        priority: z.number().optional(),
        applicableTo: z.enum(["all", "lead_manager", "acquisition_manager"]).optional(),
      }))
      .mutation(async ({ input }) => {
        return await createGradingRule({
          title: input.title,
          description: input.description,
          ruleText: input.ruleText,
          priority: input.priority || 0,
          applicableTo: input.applicableTo || "all",
        });
      }),

    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        title: z.string().optional(),
        description: z.string().optional(),
        ruleText: z.string().optional(),
        priority: z.number().optional(),
        applicableTo: z.enum(["all", "lead_manager", "acquisition_manager"]).optional(),
        isActive: z.enum(["true", "false"]).optional(),
      }))
      .mutation(async ({ input }) => {
        const { id, ...updates } = input;
        await updateGradingRule(id, updates);
        return { success: true };
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        await deleteGradingRule(input.id);
        return { success: true };
      }),
  }),

  // ============ AI COACH ============
  coach: router({
    askQuestion: protectedProcedure
      .input(z.object({ question: z.string() }))
      .mutation(async ({ input }) => {
        // Get training materials and recent successful calls for context
        const trainingMaterials = await getTrainingMaterials({});
        const recentCalls = await getCallsWithGrades({ limit: 20 });
        
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

        const systemPrompt = `You are a supportive sales coach for a real estate wholesaling team.

Training context:
${trainingContext.substring(0, 2000)}

${successfulCalls.length > 0 ? `High-scoring call examples available.` : ""}

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
      .mutation(async ({ input }) => {
        // Get training materials for context
        const trainingMaterials = await getTrainingMaterials({});
        const trainingContext = trainingMaterials
          .map(m => `${m.title}: ${m.content?.substring(0, 500) || ""}`)
          .join("\n");

        // Get recent calls for examples
        const recentCalls = await getCallsWithGrades({ limit: 30 });
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
      .mutation(async ({ input }) => {
        // Get training materials
        const trainingMaterials = await getTrainingMaterials({});
        const trainingContext = trainingMaterials
          .map(m => `### ${m.title}\n${m.content?.substring(0, 800) || ""}`)
          .join("\n\n");

        // Get recent calls for examples
        const recentCalls = await getCallsWithGrades({ limit: 30 });
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
      };
    }),

    getContext: protectedProcedure
      .input(z.object({ callType: z.enum(["qualification", "offer"]) }))
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
      }).optional())
      .query(async ({ input }) => {
        return await getTeamTrainingItems(input || {});
      }),

    getActive: protectedProcedure.query(async () => {
      return await getActiveTrainingItems();
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
      .mutation(async ({ input }) => {
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
      .mutation(async ({ input }) => {
        const { id, ...updates } = input;
        await updateTeamTrainingItem(id, updates);
        return { success: true };
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        await deleteTeamTrainingItem(input.id);
        return { success: true };
      }),

    complete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        await updateTeamTrainingItem(input.id, { 
          status: "completed",
          completedAt: new Date(),
        });
        return { success: true };
      }),

    // AI-generated insights
    generateInsights: protectedProcedure
      .mutation(async () => {
        // Clear existing AI-generated items
        await clearAiGeneratedInsights();
        
        // Generate new insights from recent calls
        const insights = await generateTeamInsights();
        
        // Save to database
        await saveGeneratedInsights(insights);
        
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
      .mutation(async () => {
        await clearAiGeneratedInsights();
        return { success: true };
      }),
  }),

  // ============ BRAND ASSETS ============
  brandAssets: router({
    list: protectedProcedure
      .input(z.object({
        assetType: z.string().optional(),
      }).optional())
      .query(async ({ input }) => {
        return await getBrandAssets(input || {});
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
      .mutation(async ({ input }) => {
        return await createBrandAsset(input);
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
      .mutation(async ({ input }) => {
        const { id, ...updates } = input;
        await updateBrandAsset(id, updates);
        return { success: true };
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
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
      .query(async ({ input }) => {
        return await getSocialPosts(input || {});
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
      .mutation(async ({ input }) => {
        const { id, ...updates } = input;
        await updateSocialPost(id, updates);
        return { success: true };
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
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
      .mutation(async ({ input }) => {
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
      .query(async ({ input }) => {
        return await getContentIdeas(input || {});
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
      .mutation(async ({ input }) => {
        return await createContentIdea(input);
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
      .mutation(async ({ input }) => {
        const { id, ...updates } = input;
        await updateContentIdea(id, updates);
        return { success: true };
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        await deleteContentIdea(input.id);
        return { success: true };
      }),

    generateIdeas: protectedProcedure
      .input(z.object({
        count: z.number().min(1).max(10).default(5),
        targetPlatform: z.enum(["x_twitter", "blog", "meta", "any"]).optional(),
        category: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
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
    get: protectedProcedure.query(async () => {
      return await getBrandProfile();
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
      .mutation(async ({ input }) => {
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
    getData: protectedProcedure.query(async () => {
      const [calls, kpis, stories, brandProfileData] = await Promise.all([
        getCallsForContentGeneration(20),
        getKPIsForContentGeneration(),
        getInterestingCallStories(10),
        getBrandProfile(),
      ]);
      return { calls, kpis, stories, brandProfile: brandProfileData };
    }),

    // Generate brand content from call data
    generateBrandContent: protectedProcedure
      .input(z.object({
        platform: z.enum(["blog", "meta", "google_business", "linkedin"]),
        contentType: z.enum(["problem_solved", "success_story", "market_insight", "tips"]),
      }))
      .mutation(async ({ input }) => {
        const [calls, kpis, brandProfileData] = await Promise.all([
          getCallsForContentGeneration(10),
          getKPIsForContentGeneration(),
          getBrandProfile(),
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
      .mutation(async ({ input }) => {
        const [stories, brandProfileData] = await Promise.all([
          getInterestingCallStories(10),
          getBrandProfile(),
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
      if (!teamMember) return [];
      return getAllBadgesWithProgress(teamMember.id, teamMember.teamRole);
    }),

    // Get gamification leaderboard
    getLeaderboard: protectedProcedure.query(async () => {
      return getGamificationLeaderboard();
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
      if (ctx.user?.teamRole !== 'admin') {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin access required' });
      }
      await initializeBadges();
      return { success: true };
    }),
  }),
});

export type AppRouter = typeof appRouter;
