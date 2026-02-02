import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
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
} from "./db";
import { LEAD_MANAGER_RUBRIC, ACQUISITION_MANAGER_RUBRIC } from "./grading";
import { processCall } from "./grading";
import { invokeLLM } from "./_core/llm";
import { generateTeamInsights, saveGeneratedInsights, clearAiGeneratedInsights } from "./insights";

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
      .query(async ({ input }) => {
        return await getCalls(input || {});
      }),

    recent: protectedProcedure
      .input(z.object({ limit: z.number().optional() }).optional())
      .query(async ({ input }) => {
        return await getRecentCalls(input?.limit || 20);
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
      .query(async ({ input }) => {
        return await getCallStats(input || {});
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
        category: z.enum(["script", "objection_handling", "methodology", "best_practices", "examples", "other"]).optional(),
        applicableTo: z.enum(["all", "lead_manager", "acquisition_manager"]).optional(),
      }))
      .mutation(async ({ input }) => {
        return await createTrainingMaterial({
          title: input.title,
          description: input.description,
          content: input.content,
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

        const systemPrompt = `You are an expert sales coach for a real estate wholesaling team. Your role is to help team members improve their phone skills based on the company's training methodology.

You have access to the following training materials:
${trainingContext}

${successfulCalls.length > 0 ? `Here are examples from recent high-scoring calls:\n${callExamples}` : ""}

When answering questions:
1. Reference specific training materials when relevant
2. Provide concrete examples and scripts when possible
3. If discussing objection handling, give word-for-word responses they can use
4. Be encouraging but direct - these are salespeople who want actionable advice
5. If you reference a successful call example, explain what made it effective`;

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
});

export type AppRouter = typeof appRouter;
