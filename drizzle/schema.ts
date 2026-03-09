import { integer, pgTable, text, timestamp, varchar, jsonb, decimal, boolean, serial, uniqueIndex } from "drizzle-orm/pg-core";

// ============ MULTI-TENANCY SYSTEM ============

/**
 * Tenants table - each company/customer is a tenant
 * This is the core of the white-label SaaS platform
 */
export const tenants = pgTable("tenants", {
  id: serial("id").primaryKey(),
  // Company info
  name: varchar("name", { length: 255 }).notNull(),
  slug: varchar("slug", { length: 100 }).notNull().unique(), // URL-friendly identifier
  domain: varchar("domain", { length: 255 }), // Custom domain if provided
  // Stripe billing
  stripeCustomerId: varchar("stripeCustomerId", { length: 255 }),
  stripeSubscriptionId: varchar("stripeSubscriptionId", { length: 255 }),
  // Subscription tier: starter, growth, scale
  subscriptionTier: text("subscriptionTier").default("trial"),
  subscriptionStatus: text("subscriptionStatus").default("active"),
  // Trial info
  trialEndsAt: timestamp("trialEndsAt"),
  // User limits based on tier
  maxUsers: integer("maxUsers").default(3), // Starter: 3, Growth: 10, Scale: unlimited (999)
  // CRM integration
  crmType: text("crmType").default("none"),
  crmConnected: text("crmConnected").default("false"),
  crmConfig: text("crmConfig"), // JSON config for CRM connection
  // Branding (Phase 2)
  logoUrl: text("logoUrl"),
  primaryColor: varchar("primaryColor", { length: 20 }),
  // Onboarding progress
  onboardingStep: integer("onboardingStep").default(1),
  onboardingCompleted: text("onboardingCompleted").default("false"),
  // Settings
  settings: text("settings"), // JSON for tenant-specific settings
  // CRM sync timestamps
  lastGhlSync: timestamp("lastGhlSync"),
  lastBatchDialerSync: timestamp("lastBatchDialerSync"),
  lastBatchLeadsSync: timestamp("lastBatchLeadsSync"),
  // Webhook status
  webhookActive: text("webhookActive").default("false"),
  lastWebhookAt: timestamp("lastWebhookAt"),
  contactCacheImported: text("contactCacheImported").default("false"),
  // Timestamps
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type Tenant = typeof tenants.$inferSelect;
export type InsertTenant = typeof tenants.$inferInsert;

/**
 * Core user table backing auth flow.
 * Extended with team role for call coaching platform.
 * Now includes tenantId for multi-tenancy.
 */
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenantId").references(() => tenants.id), // Multi-tenancy (nullable: users created before tenant assignment)
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  passwordHash: varchar("passwordHash", { length: 255 }), // For email/password auth
  emailVerified: text("emailVerified").default("false"), // Email verification status
  loginMethod: varchar("loginMethod", { length: 64 }), // 'google' or 'email_password'
  role: text("role").default("user").notNull(), // user, admin, super_admin
  // Team role for call coaching (consolidated - this is the single source of truth for roles)
  teamRole: text("teamRole").default("lead_manager"),
  // Is this user a tenant admin?
  isTenantAdmin: text("isTenantAdmin").default("false"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
  profilePicture: text("profilePicture"), // S3 URL for profile picture
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/**
 * Password reset tokens for email/password auth
 */
export const passwordResetTokens = pgTable("password_reset_tokens", {
  id: serial("id").primaryKey(),
  userId: integer("userId").references(() => users.id).notNull(),
  token: varchar("token", { length: 255 }).notNull().unique(),
  expiresAt: timestamp("expiresAt").notNull(),
  usedAt: timestamp("usedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type PasswordResetToken = typeof passwordResetTokens.$inferSelect;
export type InsertPasswordResetToken = typeof passwordResetTokens.$inferInsert;

/**
 * Email verification tokens for new user signup
 */
export const emailVerificationTokens = pgTable("email_verification_tokens", {
  id: serial("id").primaryKey(),
  userId: integer("userId").references(() => users.id).notNull(),
  token: varchar("token", { length: 255 }).notNull().unique(),
  expiresAt: timestamp("expiresAt").notNull(),
  usedAt: timestamp("usedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type EmailVerificationToken = typeof emailVerificationTokens.$inferSelect;
export type InsertEmailVerificationToken = typeof emailVerificationTokens.$inferInsert;

/**
 * Team members table for pre-configured team
 * These are mapped to users when they log in
 * Now includes tenantId for multi-tenancy.
 */
export const teamMembers = pgTable("team_members", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenantId").references(() => tenants.id).notNull(), // Multi-tenancy
  name: varchar("name", { length: 255 }).notNull(),
  teamRole: text("teamRole").notNull(),
  userId: integer("userId").references(() => users.id),
  ghlUserId: varchar("ghlUserId", { length: 255 }), // GoHighLevel user ID for matching
  lcPhone: varchar("lcPhone", { length: 20 }), // LC phone number from GHL (e.g. +16157688784)
  lcPhones: text("lcPhones"), // JSON array of all LC phone numbers for this team member
  isActive: text("isActive").default("true"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type TeamMember = typeof teamMembers.$inferSelect;
export type InsertTeamMember = typeof teamMembers.$inferInsert;

/**
 * Team Assignments - maps Lead Managers to their Acquisition Manager supervisor
 */
export const teamAssignments = pgTable("team_assignments", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenantId").references(() => tenants.id).notNull(), // Multi-tenancy
  // The Lead Manager being assigned
  leadManagerId: integer("leadManagerId").references(() => teamMembers.id).notNull(),
  // The Acquisition Manager they report to
  acquisitionManagerId: integer("acquisitionManagerId").references(() => teamMembers.id).notNull(),
  // Timestamps
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type TeamAssignment = typeof teamAssignments.$inferSelect;
export type InsertTeamAssignment = typeof teamAssignments.$inferInsert;

/**
 * Tenant Roles - custom roles defined by each tenant
 * Replaces hardcoded LM/AM roles
 */
export const tenantRoles = pgTable("tenant_roles", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenantId").references(() => tenants.id).notNull(),
  name: varchar("name", { length: 100 }).notNull(), // e.g., "SDR", "AE", "Closer"
  code: varchar("code", { length: 50 }).notNull(), // e.g., "sdr", "ae", "closer"
  description: text("description"),
  // Which grading rubric to use
  rubricId: integer("rubricId"), // References tenant_rubrics.id
  isActive: text("isActive").default("true"),
  sortOrder: integer("sortOrder").default(0),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type TenantRole = typeof tenantRoles.$inferSelect;
export type InsertTenantRole = typeof tenantRoles.$inferInsert;

/**
 * Tenant Rubrics - custom grading rubrics per tenant
 */
export const tenantRubrics = pgTable("tenant_rubrics", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenantId").references(() => tenants.id).notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  // Maps to grading call type: qualification, offer, cold_call, follow_up, seller_callback, admin_callback
  callType: varchar("callType", { length: 50 }),
  // Criteria as JSON array: [{name, description, maxPoints, keyPhrases}]
  criteria: text("criteria").notNull(),
  // Red flags as JSON array: ["flag1", "flag2"]
  redFlags: text("redFlags"),
  isActive: text("isActive").default("true"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type TenantRubric = typeof tenantRubrics.$inferSelect;
export type InsertTenantRubric = typeof tenantRubrics.$inferInsert;

/**
 * Tenant Call Types - custom call type classifications per tenant
 */
export const tenantCallTypes = pgTable("tenant_call_types", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenantId").references(() => tenants.id).notNull(),
  name: varchar("name", { length: 100 }).notNull(), // e.g., "Discovery", "Demo", "Closing"
  code: varchar("code", { length: 50 }).notNull(),
  description: text("description"),
  // Which rubric to use for this call type
  rubricId: integer("rubricId").references(() => tenantRubrics.id),
  isActive: text("isActive").default("true"),
  sortOrder: integer("sortOrder").default(0),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type TenantCallType = typeof tenantCallTypes.$inferSelect;
export type InsertTenantCallType = typeof tenantCallTypes.$inferInsert;

/**
 * Calls table - stores incoming calls from CRM webhook
 * Now includes tenantId for multi-tenancy.
 */
export const calls = pgTable("calls", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenantId").references(() => tenants.id).notNull(), // Multi-tenancy
  // Call source - where the call data came from
  callSource: text("callSource").default("ghl"),
  // GHL webhook data
  ghlCallId: varchar("ghlCallId", { length: 255 }).unique(),
  ghlContactId: varchar("ghlContactId", { length: 255 }),
  ghlLocationId: varchar("ghlLocationId", { length: 255 }),
  // BatchDialer data
  batchDialerCallId: integer("batchDialerCallId").unique(),
  batchDialerCampaignId: integer("batchDialerCampaignId"),
  batchDialerCampaignName: varchar("batchDialerCampaignName", { length: 255 }),
  batchDialerAgentName: varchar("batchDialerAgentName", { length: 255 }),
  // Call metadata
  contactName: varchar("contactName", { length: 255 }),
  contactPhone: varchar("contactPhone", { length: 50 }),
  propertyAddress: text("propertyAddress"),
  // Recording info
  recordingUrl: text("recordingUrl"),
  duration: integer("duration"), // in seconds
  callDirection: text("callDirection").default("outbound"),
  // Team member who handled the call
  teamMemberId: integer("teamMemberId").references(() => teamMembers.id),
  teamMemberName: varchar("teamMemberName", { length: 255 }),
  // Call type
  callType: text("callType").default("qualification"),
  tenantCallTypeId: integer("tenantCallTypeId").references(() => tenantCallTypes.id), // Custom call type
  // How the call type was determined
  callTypeSource: text("callTypeSource").default("ai_suggested"),
  // Call outcome
  callOutcome: text("callOutcome").default("none"),
  // Secondary tag: whether a follow-up/callback was scheduled
  followUpScheduled: text("followUpScheduled").default("false"),
  // Call classification
  classification: text("classification").default("pending"),
  classificationReason: text("classificationReason"), // AI explanation for classification
  // Processing status
  status: text("status").default("pending"),
  // Transcript
  transcript: text("transcript"),
  transcriptUrl: text("transcriptUrl"), // S3 URL for archived transcripts
  // BatchLeads property enrichment data (JSON)
  batchLeadsEnrichment: text("batchLeadsEnrichment"),
  // Archival
  isArchived: text("isArchived").default("false"),
  archivedAt: timestamp("archivedAt"),
  // Timestamps
  callTimestamp: timestamp("callTimestamp"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type Call = typeof calls.$inferSelect;
export type InsertCall = typeof calls.$inferInsert;

/**
 * Call grades table - stores AI-generated grades for each call
 */
export const callGrades = pgTable("call_grades", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenantId").references(() => tenants.id).notNull(), // Multi-tenancy
  callId: integer("callId").references(() => calls.id).notNull(),
  // Overall score
  overallScore: decimal("overallScore", { precision: 5, scale: 2 }),
  overallGrade: text("overallGrade"),
  // Individual criteria scores (stored as JSON for flexibility)
  criteriaScores: jsonb("criteriaScores"),
  // Coaching feedback
  strengths: jsonb("strengths"), // Array of strings
  improvements: jsonb("improvements"), // Array of strings
  coachingTips: jsonb("coachingTips"), // Array of specific coaching tips
  // Red flags identified
  redFlags: jsonb("redFlags"), // Array of strings
  // Objection handling
  objectionHandling: jsonb("objectionHandling"), // Array of {objection, context, suggestedResponses[]}
  // Summary
  summary: text("summary"),
  // AI-generated call highlights
  highlights: jsonb("highlights"),
  // Which rubric was used (legacy)
  rubricType: text("rubricType").notNull(),
  // Custom rubric reference
  tenantRubricId: integer("tenantRubricId").references(() => tenantRubrics.id),
  // Timestamps
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type CallGrade = typeof callGrades.$inferSelect;
export type InsertCallGrade = typeof callGrades.$inferInsert;

/**
 * Webhook retry queue - stores failed Gunner Engine webhooks for automatic retry
 */
export const webhookRetryQueue = pgTable("webhook_retry_queue", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenantId").references(() => tenants.id).notNull(),
  callId: integer("callId").references(() => calls.id).notNull(),
  // Webhook payload (JSON)
  payload: text("payload").notNull(),
  // Retry tracking
  attemptCount: integer("attemptCount").default(0).notNull(),
  maxAttempts: integer("maxAttempts").default(5).notNull(),
  lastAttemptAt: timestamp("lastAttemptAt"),
  nextRetryAt: timestamp("nextRetryAt").notNull(),
  // Status: pending, delivered, failed
  status: text("status").default("pending").notNull(),
  // Last error message
  lastError: text("lastError"),
  // Timestamps
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type WebhookRetryQueue = typeof webhookRetryQueue.$inferSelect;
export type InsertWebhookRetryQueue = typeof webhookRetryQueue.$inferInsert;

/**
 * Performance metrics - aggregated stats for leaderboard
 */
export const performanceMetrics = pgTable("performance_metrics", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenantId").references(() => tenants.id).notNull(), // Multi-tenancy
  teamMemberId: integer("teamMemberId").references(() => teamMembers.id).notNull(),
  // Time period
  periodType: text("periodType").notNull(),
  periodStart: timestamp("periodStart").notNull(),
  periodEnd: timestamp("periodEnd").notNull(),
  // Metrics
  totalCalls: integer("totalCalls").default(0),
  averageScore: decimal("averageScore", { precision: 5, scale: 2 }),
  aGradeCount: integer("aGradeCount").default(0),
  bGradeCount: integer("bGradeCount").default(0),
  cGradeCount: integer("cGradeCount").default(0),
  dGradeCount: integer("dGradeCount").default(0),
  fGradeCount: integer("fGradeCount").default(0),
  // Improvement tracking
  scoreChange: decimal("scoreChange", { precision: 5, scale: 2 }), // vs previous period
  // Timestamps
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type PerformanceMetric = typeof performanceMetrics.$inferSelect;
export type InsertPerformanceMetric = typeof performanceMetrics.$inferInsert;


/**
 * Training materials - uploaded documents that influence grading criteria
 */
export const trainingMaterials = pgTable("training_materials", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenantId").references(() => tenants.id).notNull(), // Multi-tenancy
  // Material info
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  // Content - can be extracted text from uploaded documents
  content: text("content"),
  // File info if uploaded
  fileName: varchar("fileName", { length: 255 }),
  fileUrl: text("fileUrl"),
  fileType: varchar("fileType", { length: 50 }), // pdf, docx, txt, etc.
  // Category for organization
  category: text("category").default("other"),
  // Which role this applies to
  applicableTo: text("applicableTo").default("all"),
  tenantRoleId: integer("tenantRoleId").references(() => tenantRoles.id), // Custom role reference
  // Status
  isActive: text("isActive").default("true"),
  // Timestamps
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type TrainingMaterial = typeof trainingMaterials.$inferSelect;
export type InsertTrainingMaterial = typeof trainingMaterials.$inferInsert;

/**
 * AI Feedback - corrections and feedback on AI grading to improve future scoring
 */
export const aiFeedback = pgTable("ai_feedback", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenantId").references(() => tenants.id).notNull(), // Multi-tenancy
  // Link to the call/grade being corrected
  callId: integer("callId").references(() => calls.id),
  callGradeId: integer("callGradeId").references(() => callGrades.id),
  // Who provided the feedback
  userId: integer("userId").references(() => users.id),
  // Feedback type
  feedbackType: text("feedbackType").notNull(),
  // The specific criteria being corrected (if applicable)
  criteriaName: varchar("criteriaName", { length: 255 }),
  // Original values
  originalScore: decimal("originalScore", { precision: 5, scale: 2 }),
  originalGrade: text("originalGrade"),
  // Suggested corrections
  suggestedScore: decimal("suggestedScore", { precision: 5, scale: 2 }),
  suggestedGrade: text("suggestedGrade"),
  // Detailed feedback explanation
  explanation: text("explanation").notNull(),
  // What the AI should have noticed or done differently
  correctBehavior: text("correctBehavior"),
  // Status - whether this feedback has been incorporated
  status: text("status").default("pending"),
  // Timestamps
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type AIFeedback = typeof aiFeedback.$inferSelect;
export type InsertAIFeedback = typeof aiFeedback.$inferInsert;

/**
 * Grading rules - custom rules that override or supplement default rubrics
 */
export const gradingRules = pgTable("grading_rules", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenantId").references(() => tenants.id).notNull(), // Multi-tenancy
  // Rule info
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  // The rule itself - natural language instruction for the AI
  ruleText: text("ruleText").notNull(),
  // Priority (higher = more important)
  priority: integer("priority").default(0),
  // Which rubric this applies to
  applicableTo: text("applicableTo").default("all"),
  tenantRoleId: integer("tenantRoleId").references(() => tenantRoles.id), // Custom role reference
  // Status
  isActive: text("isActive").default("true"),
  // Timestamps
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type GradingRule = typeof gradingRules.$inferSelect;
export type InsertGradingRule = typeof gradingRules.$inferInsert;


/**
 * Team Training Items - tracks ongoing team development items
 */
export const teamTrainingItems = pgTable("team_training_items", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenantId").references(() => tenants.id).notNull(), // Multi-tenancy
  // Item type
  itemType: text("itemType").notNull(),
  // Content
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  // For skills: what we're working toward
  targetBehavior: text("targetBehavior"),
  // For issues: what went wrong and how to fix it
  callReference: integer("callReference").references(() => calls.id), // Link to specific call if applicable
  // For agenda items: order in the meeting
  sortOrder: integer("sortOrder").default(0),
  // Priority level
  priority: text("priority").default("medium"),
  // Who this applies to (null = whole team)
  teamMemberId: integer("teamMemberId").references(() => teamMembers.id),
  teamMemberName: varchar("teamMemberName", { length: 255 }),
  // Which role this insight applies to
  teamRole: text("teamRole"),
  // Status
  status: text("status").default("active"),
  // AI generation tracking
  isAiGenerated: text("isAiGenerated").default("false"),
  sourceCallIds: text("sourceCallIds"), // JSON array of call IDs that informed this insight
  // For agenda items: which meeting date
  meetingDate: timestamp("meetingDate"),
  // Timestamps
  completedAt: timestamp("completedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type TeamTrainingItem = typeof teamTrainingItems.$inferSelect;
export type InsertTeamTrainingItem = typeof teamTrainingItems.$inferInsert;


/**
 * Brand Assets - stores branding files, logos, style guides
 */
export const brandAssets = pgTable("brand_assets", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenantId").references(() => tenants.id).notNull(), // Multi-tenancy
  // Asset info
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  // Asset type
  assetType: text("assetType").notNull(),
  // File storage
  fileUrl: text("fileUrl"),
  fileKey: varchar("fileKey", { length: 512 }),
  mimeType: varchar("mimeType", { length: 128 }),
  fileSize: integer("fileSize"),
  // Metadata (JSON for flexible storage)
  metadata: text("metadata"),
  // Status
  isActive: text("isActive").default("true"),
  // Timestamps
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type BrandAsset = typeof brandAssets.$inferSelect;
export type InsertBrandAsset = typeof brandAssets.$inferInsert;

/**
 * Social Media Posts - stores all social media content
 */
export const socialPosts = pgTable("social_posts", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenantId").references(() => tenants.id).notNull(), // Multi-tenancy
  // Content type - brand or creator
  contentType: text("contentType").notNull(),
  // Platform
  platform: text("platform").notNull(),
  // Post content
  title: varchar("title", { length: 500 }),
  content: text("content").notNull(),
  // For blog posts - additional fields
  excerpt: text("excerpt"),
  slug: varchar("slug", { length: 255 }),
  // Media attachments (JSON array of URLs)
  mediaUrls: text("mediaUrls"),
  // Hashtags and mentions
  hashtags: text("hashtags"),
  mentions: text("mentions"),
  // Scheduling
  status: text("status").default("draft"),
  scheduledAt: timestamp("scheduledAt"),
  publishedAt: timestamp("publishedAt"),
  // External post ID (if published)
  externalPostId: varchar("externalPostId", { length: 255 }),
  // AI generation tracking
  isAiGenerated: text("isAiGenerated").default("false"),
  aiPrompt: text("aiPrompt"), // The prompt used to generate this content
  // Author
  createdBy: integer("createdBy").references(() => users.id),
  // Timestamps
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type SocialPost = typeof socialPosts.$inferSelect;
export type InsertSocialPost = typeof socialPosts.$inferInsert;

/**
 * Content Ideas - stores content ideas for creators
 */
export const contentIdeas = pgTable("content_ideas", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenantId").references(() => tenants.id).notNull(), // Multi-tenancy
  // Idea content
  title: varchar("title", { length: 500 }).notNull(),
  description: text("description"),
  // Category/topic
  category: varchar("category", { length: 255 }),
  // Target platform
  targetPlatform: text("targetPlatform").default("any"),
  // Status
  status: text("status").default("new"),
  // Link to post if used
  usedInPostId: integer("usedInPostId").references(() => socialPosts.id),
  // AI generation tracking
  isAiGenerated: text("isAiGenerated").default("false"),
  // Timestamps
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type ContentIdea = typeof contentIdeas.$inferSelect;
export type InsertContentIdea = typeof contentIdeas.$inferInsert;


/**
 * Brand Profile - stores company brand identity and settings
 */
export const brandProfile = pgTable("brand_profile", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenantId").references(() => tenants.id).notNull(), // Multi-tenancy
  // Website and branding
  websiteUrl: varchar("websiteUrl", { length: 500 }),
  extractedColors: text("extractedColors"), // JSON array of colors extracted from website
  extractedLogo: varchar("extractedLogo", { length: 500 }), // URL to extracted logo
  // Brand identity
  companyName: varchar("companyName", { length: 255 }),
  brandDescription: text("brandDescription"), // How we describe ourselves
  brandVoice: text("brandVoice"), // Tone and style of communication
  missionStatement: text("missionStatement"),
  tagline: varchar("tagline", { length: 500 }),
  // Target audience
  targetAudience: text("targetAudience"), // Who we serve
  uniqueValueProposition: text("uniqueValueProposition"), // What makes us different
  // Key messaging
  keyMessages: text("keyMessages"), // JSON array of key messages/talking points
  // Social media handles
  facebookUrl: varchar("facebookUrl", { length: 500 }),
  instagramUrl: varchar("instagramUrl", { length: 500 }),
  twitterUrl: varchar("twitterUrl", { length: 500 }),
  linkedinUrl: varchar("linkedinUrl", { length: 500 }),
  googleBusinessUrl: varchar("googleBusinessUrl", { length: 500 }),
  // Timestamps
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type BrandProfile = typeof brandProfile.$inferSelect;
export type InsertBrandProfile = typeof brandProfile.$inferInsert;


// ============ GAMIFICATION SYSTEM ============

/**
 * Badge definitions - stores all available badges
 */
export const badges = pgTable("badges", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenantId").references(() => tenants.id), // Multi-tenancy (null = platform default)
  code: varchar("code", { length: 50 }).notNull(), // e.g., "on_fire", "script_starter"
  name: varchar("name", { length: 100 }).notNull(),
  description: text("description"),
  icon: varchar("icon", { length: 10 }), // Emoji icon
  category: text("category").notNull(),
  tier: text("tier").notNull(),
  target: integer("target").notNull(), // Target count to earn this badge tier
  criteriaType: varchar("criteriaType", { length: 50 }).notNull(), // Type of criteria
  criteriaConfig: text("criteriaConfig"), // JSON config for criteria
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Badge = typeof badges.$inferSelect;
export type InsertBadge = typeof badges.$inferInsert;

/**
 * User badges - tracks which badges users have earned
 */
export const userBadges = pgTable("user_badges", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenantId").references(() => tenants.id).notNull(), // Multi-tenancy
  teamMemberId: integer("teamMemberId").references(() => teamMembers.id).notNull(),
  badgeId: integer("badgeId").references(() => badges.id).notNull(),
  badgeCode: varchar("badgeCode", { length: 64 }).notNull(),
  progress: integer("progress").default(0),
  earnedAt: timestamp("earnedAt").defaultNow().notNull(),
  triggerCallId: integer("triggerCallId").references(() => calls.id),
  isViewed: text("isViewed").default("false"),
});

export type UserBadge = typeof userBadges.$inferSelect;
export type InsertUserBadge = typeof userBadges.$inferInsert;

/**
 * Badge progress - tracks progress toward badges
 */
export const badgeProgress = pgTable("badge_progress", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenantId").references(() => tenants.id).notNull(), // Multi-tenancy
  teamMemberId: integer("teamMemberId").references(() => teamMembers.id).notNull(),
  badgeCode: varchar("badgeCode", { length: 64 }).notNull(),
  currentCount: integer("currentCount").default(0),
  currentStreak: integer("currentStreak").default(0),
  weekStart: timestamp("weekStart"),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type BadgeProgress = typeof badgeProgress.$inferSelect;
export type InsertBadgeProgress = typeof badgeProgress.$inferInsert;

/**
 * User streaks - tracks hot streaks and consistency streaks
 */
export const userStreaks = pgTable("user_streaks", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenantId").references(() => tenants.id).notNull(), // Multi-tenancy
  teamMemberId: integer("teamMemberId").references(() => teamMembers.id).notNull(),
  // Hot streak (consecutive C+ grades)
  hotStreakCurrent: integer("hotStreakCurrent").default(0).notNull(),
  hotStreakBest: integer("hotStreakBest").default(0).notNull(),
  hotStreakLastCallId: integer("hotStreakLastCallId"),
  // Consistency streak (days with graded calls)
  consistencyStreakCurrent: integer("consistencyStreakCurrent").default(0).notNull(),
  consistencyStreakBest: integer("consistencyStreakBest").default(0).notNull(),
  consistencyLastDate: varchar("consistencyLastDate", { length: 10 }), // YYYY-MM-DD format
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type UserStreak = typeof userStreaks.$inferSelect;
export type InsertUserStreak = typeof userStreaks.$inferInsert;

/**
 * User XP - tracks total XP and level
 */
export const userXp = pgTable("user_xp", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenantId").references(() => tenants.id).notNull(), // Multi-tenancy
  teamMemberId: integer("teamMemberId").references(() => teamMembers.id).notNull(),
  totalXp: integer("totalXp").default(0).notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type UserXp = typeof userXp.$inferSelect;
export type InsertUserXp = typeof userXp.$inferInsert;

/**
 * XP transactions - history of XP earned
 */
export const xpTransactions = pgTable("xp_transactions", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenantId").references(() => tenants.id).notNull(), // Multi-tenancy
  teamMemberId: integer("teamMemberId").references(() => teamMembers.id).notNull(),
  amount: integer("amount").notNull(),
  reason: varchar("reason", { length: 100 }).notNull(),
  callId: integer("callId").references(() => calls.id),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type XpTransaction = typeof xpTransactions.$inferSelect;
export type InsertXpTransaction = typeof xpTransactions.$inferInsert;

/**
 * Deals - tracks closed deals from GHL opportunities for Closer badge
 */
export const deals = pgTable("deals", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenantId").references(() => tenants.id).notNull(), // Multi-tenancy
  ghlOpportunityId: varchar("ghlOpportunityId", { length: 255 }).notNull().unique(),
  ghlContactId: varchar("ghlContactId", { length: 255 }),
  teamMemberId: integer("teamMemberId").references(() => teamMembers.id),
  callId: integer("callId").references(() => calls.id), // The offer call that led to this deal
  dealValue: integer("dealValue"), // Optional: deal amount in cents
  closedAt: timestamp("closedAt").defaultNow().notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Deal = typeof deals.$inferSelect;
export type InsertDeal = typeof deals.$inferInsert;

/**
 * Reward views - tracks which calls have been viewed for XP rewards
 */
export const rewardViews = pgTable("reward_views", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenantId").references(() => tenants.id).notNull(), // Multi-tenancy
  teamMemberId: integer("teamMemberId").references(() => teamMembers.id).notNull(),
  callId: integer("callId").references(() => calls.id).notNull(),
  xpAwarded: integer("xpAwarded").default(0).notNull(),
  viewedAt: timestamp("viewedAt").defaultNow().notNull(),
});

export type RewardView = typeof rewardViews.$inferSelect;
export type InsertRewardView = typeof rewardViews.$inferInsert;


// ============ KPI TRACKING SYSTEM ============

/**
 * KPI Periods - tracks weekly/monthly periods for KPI data entry
 */
export const kpiPeriods = pgTable("kpi_periods", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenantId").references(() => tenants.id).notNull(), // Multi-tenancy
  periodType: text("periodType").notNull(),
  periodStart: timestamp("periodStart").notNull(),
  periodEnd: timestamp("periodEnd").notNull(),
  periodLabel: varchar("periodLabel", { length: 50 }).notNull(), // e.g., "Week 5 2026", "January 2026"
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type KpiPeriod = typeof kpiPeriods.$inferSelect;
export type InsertKpiPeriod = typeof kpiPeriods.$inferInsert;

/**
 * Team Member KPIs - tracks the 3 key metrics per team member per period
 */
export const teamMemberKpis = pgTable("team_member_kpis", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenantId").references(() => tenants.id).notNull(), // Multi-tenancy
  teamMemberId: integer("teamMemberId").references(() => teamMembers.id).notNull(),
  periodId: integer("periodId").references(() => kpiPeriods.id).notNull(),
  // Role type determines which metrics are used
  roleType: text("roleType").notNull(),
  // Metric 1
  metric1: integer("metric1").default(0).notNull(),
  metric1Label: varchar("metric1Label", { length: 50 }).default("Metric 1"),
  // Metric 2
  metric2: integer("metric2").default(0).notNull(),
  metric2Label: varchar("metric2Label", { length: 50 }).default("Metric 2"),
  // Metric 3
  metric3: integer("metric3").default(0).notNull(),
  metric3Label: varchar("metric3Label", { length: 50 }).default("Metric 3"),
  // Notes
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type TeamMemberKpi = typeof teamMemberKpis.$inferSelect;
export type InsertTeamMemberKpi = typeof teamMemberKpis.$inferInsert;

/**
 * Campaign KPIs - tracks lead gen channel performance
 */
export const campaignKpis = pgTable("campaign_kpis", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenantId").references(() => tenants.id).notNull(), // Multi-tenancy
  periodId: integer("periodId").references(() => kpiPeriods.id).notNull(),
  market: varchar("market", { length: 100 }).default("global").notNull(),
  channel: varchar("channel", { length: 100 }).notNull(),
  // Metrics
  spent: integer("spent").default(0).notNull(), // in cents
  volume: integer("volume").default(0).notNull(),
  contacts: integer("contacts").default(0).notNull(),
  leads: integer("leads").default(0).notNull(),
  offers: integer("offers").default(0).notNull(),
  contracts: integer("contracts").default(0).notNull(),
  dealsCount: integer("dealsCount").default(0).notNull(),
  revenue: integer("revenue").default(0).notNull(), // in cents
  // Notes
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type CampaignKpi = typeof campaignKpis.$inferSelect;
export type InsertCampaignKpi = typeof campaignKpis.$inferInsert;

/**
 * KPI Deals - tracks individual deals locked up
 */
export const kpiDeals = pgTable("kpi_deals", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenantId").references(() => tenants.id).notNull(), // Multi-tenancy
  periodId: integer("periodId").references(() => kpiPeriods.id),
  // Deal info
  propertyAddress: text("propertyAddress").notNull(),
  // Status
  inventoryStatus: varchar("inventoryStatus", { length: 50 }).default("for_sale"),
  // Location
  location: varchar("location", { length: 100 }),
  // Lead source
  leadSource: varchar("leadSource", { length: 100 }),
  // Team members
  lmName: varchar("lmName", { length: 100 }),
  amName: varchar("amName", { length: 100 }),
  dmName: varchar("dmName", { length: 100 }),
  // Deal financials
  revenue: integer("revenue").default(0), // in cents
  assignmentFee: integer("assignmentFee").default(0), // in cents
  profit: integer("profit").default(0), // in cents
  // Dates
  contractDate: timestamp("contractDate"),
  closingDate: timestamp("closingDate"),
  // Notes
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type KpiDeal = typeof kpiDeals.$inferSelect;
export type InsertKpiDeal = typeof kpiDeals.$inferInsert;

/**
 * KPI Goals - tracks goals for campaigns and team members
 */
export const kpiGoals = pgTable("kpi_goals", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenantId").references(() => tenants.id).notNull(), // Multi-tenancy
  periodId: integer("periodId").references(() => kpiPeriods.id),
  // Goal type
  goalType: text("goalType").notNull(),
  // For campaign goals
  channel: varchar("channel", { length: 100 }),
  // For team member goals
  teamMemberId: integer("teamMemberId").references(() => teamMembers.id),
  // Goal metrics
  metricName: varchar("metricName", { length: 100 }).notNull(),
  targetValue: integer("targetValue").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type KpiGoal = typeof kpiGoals.$inferSelect;
export type InsertKpiGoal = typeof kpiGoals.$inferInsert;


/**
 * Lead Gen Staff - tracks lead gen team members who don't need app access
 */
export const leadGenStaff = pgTable("lead_gen_staff", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenantId").references(() => tenants.id).notNull(), // Multi-tenancy
  name: varchar("name", { length: 255 }).notNull(),
  roleType: text("roleType").notNull(),
  isActive: text("isActive").default("true").notNull(),
  startDate: timestamp("startDate").defaultNow(),
  endDate: timestamp("endDate"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type LeadGenStaff = typeof leadGenStaff.$inferSelect;
export type InsertLeadGenStaff = typeof leadGenStaff.$inferInsert;


/**
 * KPI Markets - configurable markets for campaign tracking
 */
export const kpiMarkets = pgTable("kpi_markets", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenantId").references(() => tenants.id).notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  zipCodes: jsonb("zipCodes").$type<string[]>().default([]),
  isGlobal: boolean("isGlobal").default(false).notNull(),
  isActive: text("isActive").default("true").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type KpiMarket = typeof kpiMarkets.$inferSelect;
export type InsertKpiMarket = typeof kpiMarkets.$inferInsert;

/**
 * KPI Channels - configurable lead gen channels for campaign tracking
 */
export const kpiChannels = pgTable("kpi_channels", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenantId").references(() => tenants.id).notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  code: varchar("code", { length: 50 }).notNull(), // short code like 'cold_calls', 'sms'
  isActive: text("isActive").default("true").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type KpiChannel = typeof kpiChannels.$inferSelect;
export type InsertKpiChannel = typeof kpiChannels.$inferInsert;

/**
 * KPI Sources - configurable lead sources for campaign tracking
 */
export const kpiSources = pgTable("kpi_sources", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenantId").references(() => tenants.id).notNull(),
  name: varchar("name", { length: 100 }).notNull(),
  type: text("kpi_source_type").notNull(),
  tracksVolume: boolean("tracksVolume").default(false).notNull(),
  volumeLabel: varchar("volumeLabel", { length: 100 }), // e.g. "Mailers Sent", "Calls Made"
  ghlSourceMapping: varchar("ghlSourceMapping", { length: 255 }), // maps to opportunity.source value
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});
export type KpiSource = typeof kpiSources.$inferSelect;
export type InsertKpiSource = typeof kpiSources.$inferInsert;

/**
 * KPI Spend - monthly marketing spend per source × market
 */
export const kpiSpend = pgTable("kpi_spend", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenantId").references(() => tenants.id).notNull(),
  sourceId: integer("sourceId").references(() => kpiSources.id).notNull(),
  marketId: integer("marketId").references(() => kpiMarkets.id).notNull(),
  month: varchar("month", { length: 7 }).notNull(), // YYYY-MM
  amount: integer("amount").default(0).notNull(), // in cents
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});
export type KpiSpend = typeof kpiSpend.$inferSelect;
export type InsertKpiSpend = typeof kpiSpend.$inferInsert;

/**
 * KPI Volume - monthly outbound volume per source × market
 */
export const kpiVolume = pgTable("kpi_volume", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenantId").references(() => tenants.id).notNull(),
  sourceId: integer("sourceId").references(() => kpiSources.id).notNull(),
  marketId: integer("marketId").references(() => kpiMarkets.id).notNull(),
  month: varchar("month", { length: 7 }).notNull(), // YYYY-MM
  count: integer("count").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});
export type KpiVolume = typeof kpiVolume.$inferSelect;
export type InsertKpiVolume = typeof kpiVolume.$inferInsert;


// ============ SUBSCRIPTION PRICING ============

/**
 * Subscription Plans - defines available pricing tiers
 */
export const subscriptionPlans = pgTable("subscription_plans", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 100 }).notNull(), // "Starter", "Growth", "Scale"
  code: varchar("code", { length: 50 }).notNull().unique(), // "starter", "growth", "scale"
  description: text("description"),
  // Pricing
  priceMonthly: integer("priceMonthly").notNull(), // in cents (e.g., 19900 = $199)
  priceYearly: integer("priceYearly"), // in cents (optional annual discount)
  // Trial configuration
  trialDays: integer("trialDays").notNull().default(14),
  // Stripe Price IDs
  stripePriceIdMonthly: varchar("stripePriceIdMonthly", { length: 255 }),
  stripePriceIdYearly: varchar("stripePriceIdYearly", { length: 255 }),
  // Limits
  maxUsers: integer("maxUsers").notNull(), // 3, 10, 999 (unlimited)
  maxCallsPerMonth: integer("maxCallsPerMonth").notNull().default(500), // -1 for unlimited
  maxCrmIntegrations: integer("maxCrmIntegrations").default(1),
  // Features (JSON array of feature codes)
  features: text("features"),
  // Display options
  isPopular: text("isPopular").default("false"),
  // Status
  isActive: text("isActive").default("true"),
  sortOrder: integer("sortOrder").default(0),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type SubscriptionPlan = typeof subscriptionPlans.$inferSelect;
export type InsertSubscriptionPlan = typeof subscriptionPlans.$inferInsert;


// ============ PENDING INVITATIONS ============

/**
 * Pending Invitations - stores invitations for users who haven't signed up yet
 */
export const pendingInvitations = pgTable("pending_invitations", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenantId").references(() => tenants.id).notNull(),
  email: varchar("email", { length: 320 }).notNull(),
  role: text("role").default("user").notNull(),
  teamRole: text("teamRole").default("lead_manager").notNull(),
  // Invitation metadata
  invitedBy: integer("invitedBy").references(() => users.id),
  inviteToken: varchar("inviteToken", { length: 64 }), // For email invite links
  expiresAt: timestamp("expiresAt"), // Optional expiration
  // Status
  status: text("status").default("pending").notNull(),
  acceptedAt: timestamp("acceptedAt"),
  acceptedByUserId: integer("acceptedByUserId").references(() => users.id),
  // Timestamps
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type PendingInvitation = typeof pendingInvitations.$inferSelect;
export type InsertPendingInvitation = typeof pendingInvitations.$inferInsert;


// ============ OUTREACH HISTORY ============

/**
 * Outreach History - tracks churn prevention emails sent to tenants
 */
export const outreachHistory = pgTable("outreach_history", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenantId").references(() => tenants.id).notNull(),
  // Email template used
  templateType: text("templateType").notNull(),
  // Recipient info
  recipientEmail: varchar("recipientEmail", { length: 320 }).notNull(),
  recipientName: varchar("recipientName", { length: 255 }),
  // Context at time of sending
  daysInactive: integer("daysInactive").notNull(),
  lastActivityDate: timestamp("lastActivityDate"),
  // Who sent it
  sentByUserId: integer("sentByUserId").references(() => users.id),
  sentByName: varchar("sentByName", { length: 255 }),
  // Response tracking
  emailOpened: text("emailOpened").default("false"),
  openedAt: timestamp("openedAt"),
  // Re-engagement tracking
  tenantReactivated: text("tenantReactivated").default("false"),
  reactivatedAt: timestamp("reactivatedAt"),
  // Notes
  notes: text("notes"),
  // Timestamps
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type OutreachHistory = typeof outreachHistory.$inferSelect;
export type InsertOutreachHistory = typeof outreachHistory.$inferInsert;


/**
 * API Usage Tracking - tracks API calls per tenant for rate limiting and analytics
 */
export const apiUsage = pgTable("api_usage", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenantId").references(() => tenants.id).notNull(),
  // Usage category
  category: text("category").notNull(),
  // Usage count for this period
  count: integer("count").default(0).notNull(),
  // Period tracking (hourly buckets)
  periodStart: timestamp("periodStart").notNull(),
  periodEnd: timestamp("periodEnd").notNull(),
  // Timestamps
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type ApiUsage = typeof apiUsage.$inferSelect;
export type InsertApiUsage = typeof apiUsage.$inferInsert;


/**
 * Platform Settings - global settings managed by super admin
 */
export const platformSettings = pgTable("platform_settings", {
  id: serial("id").primaryKey(),
  key: varchar("key", { length: 100 }).notNull().unique(),
  value: text("value").notNull(),
  description: text("description"),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type PlatformSetting = typeof platformSettings.$inferSelect;
export type InsertPlatformSetting = typeof platformSettings.$inferInsert;


/**
 * Email Sent Tracking - tracks which automated emails have been sent to users
 */
export const emailsSent = pgTable("emails_sent", {
  id: serial("id").primaryKey(),
  userId: integer("userId").references(() => users.id).notNull(),
  emailId: varchar("emailId", { length: 100 }).notNull(), // e.g., "day1_first_call", "day7_week_recap"
  sentAt: timestamp("sentAt").defaultNow().notNull(),
  // Optional metadata
  loopsEventId: varchar("loopsEventId", { length: 255 }), // Response from Loops API
  status: text("status").default("sent"),
});

export type EmailSent = typeof emailsSent.$inferSelect;
export type InsertEmailSent = typeof emailsSent.$inferInsert;


/**
 * Opportunities - AI-detected leads that need attention
 */
export const opportunities = pgTable("opportunities", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenantId").references(() => tenants.id).notNull(),
  contactName: varchar("contactName", { length: 255 }),
  contactPhone: varchar("contactPhone", { length: 50 }),
  propertyAddress: text("propertyAddress"),
  ghlContactId: varchar("ghlContactId", { length: 255 }),
  // GHL pipeline tracking
  ghlOpportunityId: varchar("ghlOpportunityId", { length: 255 }),
  ghlPipelineStageId: varchar("ghlPipelineStageId", { length: 255 }),
  ghlPipelineStageName: varchar("ghlPipelineStageName", { length: 255 }),
  // Detection
  tier: text("tier").notNull(),
  priorityScore: integer("priorityScore").notNull().default(0),
  triggerRules: jsonb("triggerRules").$type<string[]>().notNull(),
  reason: text("reason").notNull(),
  suggestion: text("suggestion").notNull(),
  detectionSource: text("detectionSource").notNull().default("pipeline"),
  relatedCallId: integer("relatedCallId").references(() => calls.id),
  teamMemberId: integer("teamMemberId").references(() => teamMembers.id),
  teamMemberName: varchar("teamMemberName", { length: 255 }),
  assignedTo: varchar("assignedTo", { length: 255 }),
  status: text("status").notNull().default("active"),
  dismissReason: text("dismissReason"),
  dismissNote: text("dismissNote"),
  resolvedBy: integer("resolvedBy").references(() => users.id),
  resolvedAt: timestamp("resolvedAt"),
  // Specific missed items
  missedItems: jsonb("missedItems").$type<string[]>(),
  // Price data extracted from transcripts
  ourOffer: integer("ourOffer"),
  sellerAsk: integer("sellerAsk"),
  priceGap: integer("priceGap"),
  lastActivityAt: timestamp("lastActivityAt"),
  lastStageChangeAt: timestamp("lastStageChangeAt"),
  flaggedAt: timestamp("flaggedAt").defaultNow().notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type Opportunity = typeof opportunities.$inferSelect;
export type InsertOpportunity = typeof opportunities.$inferInsert;

/**
 * Coach Action Log - audit trail for AI Coach GHL actions
 */
export const coachActionLog = pgTable("coach_action_log", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenantId").references(() => tenants.id).notNull(),
  requestedBy: integer("requestedBy").references(() => users.id).notNull(),
  requestedByName: varchar("requestedByName", { length: 255 }),
  actionType: text("actionType").notNull(),
  requestText: text("requestText").notNull(),
  targetContactId: varchar("targetContactId", { length: 255 }),
  targetContactName: varchar("targetContactName", { length: 255 }),
  targetOpportunityId: varchar("targetOpportunityId", { length: 255 }),
  payload: jsonb("payload"),
  status: text("status").notNull().default("pending"),
  error: text("error"),
  resultMeta: jsonb("resultMeta"), // Stores execution metadata
  confirmedAt: timestamp("confirmedAt"),
  executedAt: timestamp("executedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type CoachActionLog = typeof coachActionLog.$inferSelect;
export type InsertCoachActionLog = typeof coachActionLog.$inferInsert;

/**
 * Coach Action Edits - captures before/after for every confirmed action.
 */
export const coachActionEdits = pgTable("coach_action_edits", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenantId").references(() => tenants.id).notNull(),
  userId: integer("userId").references(() => users.id).notNull(),
  actionLogId: integer("actionLogId").references(() => coachActionLog.id).notNull(),
  // What kind of content this is
  category: text("category").notNull(),
  // The AI-generated draft
  draftContent: text("draftContent").notNull(),
  // What the user actually confirmed
  finalContent: text("finalContent").notNull(),
  // Did the user change anything?
  wasEdited: text("wasEdited").default("false").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type CoachActionEdit = typeof coachActionEdits.$inferSelect;
export type InsertCoachActionEdit = typeof coachActionEdits.$inferInsert;

/**
 * AI Coach Preferences - per-user style profiles.
 */
export const aiCoachPreferences = pgTable("ai_coach_preferences", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenantId").references(() => tenants.id).notNull(),
  // NULL userId = team-wide default profile
  userId: integer("userId").references(() => users.id),
  // Category of preference (one row per category per user)
  category: text("pref_category").notNull(),
  // LLM-generated summary of the user's style
  styleSummary: text("styleSummary").notNull(),
  // JSON array of up to 5 recent final-content examples for few-shot prompting
  recentExamples: text("recentExamples"),
  // How many edits contributed to this preference
  sampleCount: integer("sampleCount").default(0).notNull(),
  // Timestamps
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});
export type AiCoachPreference = typeof aiCoachPreferences.$inferSelect;
export type InsertAiCoachPreference = typeof aiCoachPreferences.$inferInsert;

/**
 * AI Coach Messages - persists Q&A exchanges for conversation memory.
 */
export const coachMessages = pgTable("coach_messages", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenantId").references(() => tenants.id).notNull(),
  userId: integer("userId").references(() => users.id).notNull(),
  // "user" for questions, "assistant" for answers
  role: text("coach_msg_role").notNull(),
  content: text("content").notNull(),
  // Optional: link messages in the same exchange
  exchangeId: varchar("exchangeId", { length: 36 }).notNull(),
  // Timestamps
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type CoachMessage = typeof coachMessages.$inferSelect;
export type InsertCoachMessage = typeof coachMessages.$inferInsert;

/**
 * User Instructions - Persistent explicit preferences/instructions from users.
 */
export const userInstructions = pgTable("user_instructions", {
  id: serial("id").primaryKey(),
  userId: integer("userId").references(() => users.id).notNull(),
  // The raw instruction text as the user stated it
  instruction: text("instruction").notNull(),
  // Category for grouping/display
  category: varchar("category", { length: 50 }).notNull().default("general"),
  // Whether this instruction is currently active
  isActive: varchar("isActive", { length: 5 }).notNull().default("true"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});
export type UserInstruction = typeof userInstructions.$inferSelect;
export type InsertUserInstruction = typeof userInstructions.$inferInsert;


// ============ CALL NEXT STEPS ============

/**
 * Stores AI-generated next steps for each graded call.
 */
export const callNextSteps = pgTable("call_next_steps", {
  id: serial("id").primaryKey(),
  callId: integer("callId").references(() => calls.id).notNull(),
  tenantId: integer("tenantId").references(() => tenants.id),
  // Action details
  actionType: varchar("actionType", { length: 50 }).notNull(),
  reason: text("reason").notNull(),
  suggested: varchar("suggested", { length: 5 }).notNull().default("true"),
  payload: jsonb("payload").$type<Record<string, any>>().notNull(),
  // Status tracking
  status: text("status").default("pending"),
  result: text("result"),
  // Timestamps
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});
export type CallNextStep = typeof callNextSteps.$inferSelect;
export type InsertCallNextStep = typeof callNextSteps.$inferInsert;


// ============ WEBHOOK EVENTS LOG ============

/**
 * Tracks all incoming webhook events for health monitoring.
 */
export const webhookEvents = pgTable("webhook_events", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenantId").references(() => tenants.id),
  // Source CRM provider
  provider: varchar("provider", { length: 50 }).notNull(),
  // GHL location ID for routing
  locationId: varchar("locationId", { length: 255 }),
  // Event details
  eventType: varchar("eventType", { length: 100 }).notNull(),
  eventId: varchar("eventId", { length: 255 }),
  // Processing result
  status: text("status").default("received").notNull(),
  errorMessage: text("errorMessage"),
  // Timing
  processedAt: timestamp("processedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type WebhookEvent = typeof webhookEvents.$inferSelect;
export type InsertWebhookEvent = typeof webhookEvents.$inferInsert;

// ============ CONTACT CACHE ============

/**
 * Local cache of CRM contacts to reduce API calls.
 */
export const contactCache = pgTable("contact_cache", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenantId").references(() => tenants.id).notNull(),
  // CRM identifiers
  ghlContactId: varchar("ghlContactId", { length: 255 }).notNull(),
  ghlLocationId: varchar("ghlLocationId", { length: 255 }),
  // Contact info
  name: varchar("name", { length: 512 }),
  phone: varchar("phone", { length: 50 }),
  // Pipeline & classification data
  currentStage: varchar("currentStage", { length: 100 }),
  source: varchar("source", { length: 100 }),
  market: varchar("market", { length: 100 }),
  buyBoxType: varchar("buyBoxType", { length: 100 }),
  ghlOpportunityId: varchar("ghlOpportunityId", { length: 255 }),
  // Buyer-specific fields
  buyerTier: varchar("buyerTier", { length: 50 }),
  responseSpeed: varchar("responseSpeed", { length: 50 }),
  verifiedFunding: varchar("verifiedFunding", { length: 10 }),
  hasPurchasedBefore: varchar("hasPurchasedBefore", { length: 10 }),
  secondaryMarket: varchar("secondaryMarket", { length: 255 }),
  buyerNotes: text("buyerNotes"),
  lastContactDate: timestamp("lastContactDate"),
  email: varchar("email", { length: 255 }),
  // Sync metadata
  lastSyncedAt: timestamp("lastSyncedAt").defaultNow().notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});
export type ContactCacheEntry = typeof contactCache.$inferSelect;
export type InsertContactCacheEntry = typeof contactCache.$inferInsert;

// ============ GHL OAUTH TOKENS ============

/**
 * Stores OAuth 2.0 tokens for GHL Marketplace App integration.
 */
export const ghlOAuthTokens = pgTable("ghl_oauth_tokens", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenantId").references(() => tenants.id).notNull(),
  // GHL identifiers from token response
  locationId: varchar("locationId", { length: 255 }).notNull(),
  companyId: varchar("companyId", { length: 255 }),
  ghlUserId: varchar("ghlUserId", { length: 255 }),
  // OAuth tokens
  accessToken: text("accessToken").notNull(),
  refreshToken: text("refreshToken").notNull(),
  // Token metadata
  expiresAt: timestamp("expiresAt").notNull(),
  scopes: text("scopes"),
  userType: varchar("userType", { length: 50 }).default("Location"),
  // Status
  isActive: text("isActive").default("true"),
  lastRefreshedAt: timestamp("lastRefreshedAt"),
  lastError: text("lastError"),
  // Timestamps
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});
export type GhlOAuthToken = typeof ghlOAuthTokens.$inferSelect;
export type InsertGhlOAuthToken = typeof ghlOAuthTokens.$inferInsert;


// ============ DAILY KPI ENTRIES (Manual tracking for Day Hub) ============

export const dailyKpiEntries = pgTable("daily_kpi_entries", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenantId").notNull(),
  userId: integer("userId").notNull(),
  date: varchar("entryDate", { length: 10 }).notNull(), // YYYY-MM-DD (column is entryDate in DB)
  kpiType: text("kpiType").notNull(),
  contactId: varchar("contactId", { length: 255 }),
  contactName: varchar("contactName", { length: 255 }),
  propertyAddress: text("propertyAddress"),
  propertyId: integer("propertyId"), // FK to dispo_properties
  teamMemberId: integer("teamMemberId"), // FK to team_members
  notes: text("notes"),
  ghlReferenceId: varchar("ghlReferenceId", { length: 255 }),
  source: text("kpi_source").default("manual").notNull(),
  detectionType: text("detectionType").default("manual"),
  sourceCallId: integer("sourceCallId"), // the call that triggered this entry
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type DailyKpiEntry = typeof dailyKpiEntries.$inferSelect;
export type InsertDailyKpiEntry = typeof dailyKpiEntries.$inferInsert;


// ============ PROPERTIES (Full Pipeline Inventory) ============
export const dispoProperties = pgTable("dispo_properties", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenantId").references(() => tenants.id).notNull(),
  // Property Details
  address: varchar("address", { length: 500 }).notNull(),
  city: varchar("city", { length: 100 }).notNull(),
  state: varchar("state", { length: 50 }).notNull(),
  zip: varchar("zip", { length: 20 }).notNull(),
  propertyType: text("propertyType").default("house").notNull(),
  beds: integer("beds"),
  baths: varchar("baths", { length: 10 }), // e.g. "2.5"
  sqft: integer("sqft"),
  yearBuilt: integer("yearBuilt"),
  // Financials
  contractPrice: integer("contractPrice"), // in cents
  askingPrice: integer("askingPrice"), // in cents
  assignmentFee: integer("assignmentFee"), // in cents
  arv: integer("arv"), // in cents — after repair value
  estRepairs: integer("estRepairs"), // in cents — estimated repairs
  // Access & Status
  lockboxCode: varchar("lockboxCode", { length: 50 }),
  occupancyStatus: text("occupancyStatus").default("unknown"),
  // Deal Pipeline Status
  status: varchar("status", { length: 50 }).default("lead").notNull(),
  // Media & Notes
  mediaLink: text("mediaLink"),
  description: text("description"),
  notes: text("notes"),
  // Tracking
  addedByUserId: integer("addedByUserId").references(() => users.id),
  assignedToUserId: integer("assignedToUserId").references(() => users.id),
  ghlContactId: varchar("ghlContactId", { length: 255 }),
  sellerName: varchar("sellerName", { length: 255 }),
  sellerPhone: varchar("sellerPhone", { length: 50 }),
  // Acquisition-stage fields
  leadSource: varchar("leadSource", { length: 100 }),
  leadSourceDetail: varchar("leadSourceDetail", { length: 255 }),
  assignedAmUserId: integer("assignedAmUserId").references(() => users.id),
  assignedLmUserId: integer("assignedLmUserId").references(() => users.id),
  // Offer tracking
  ourOfferAmount: integer("ourOfferAmount"), // in cents
  acceptedOffer: integer("acceptedOffer"), // in cents
  offerDate: timestamp("offerDate"),
  counterOfferAmount: integer("counterOfferAmount"), // in cents
  contractDate: timestamp("contractDate"),
  // Closing details
  closingDate: timestamp("closingDate"),
  actualCloseDate: timestamp("actualCloseDate"),
  assignmentAmount: integer("assignmentAmount"), // in cents
  buyerGhlContactId: varchar("buyerGhlContactId", { length: 255 }),
  buyerName: varchar("buyerName", { length: 255 }),
  buyerCompany: varchar("buyerCompany", { length: 255 }),
  expectedCloseDate: timestamp("expectedCloseDate"),
  // Pipeline metadata
  stageChangedAt: timestamp("stageChangedAt"),
  // Milestone flags
  aptEverSet: boolean("aptEverSet").default(false),
  offerEverMade: boolean("offerEverMade").default(false),
  everUnderContract: boolean("everUnderContract").default(false),
  everClosed: boolean("everClosed").default(false),
  // GHL Opportunity tracking
  ghlOpportunityId: varchar("ghlOpportunityId", { length: 255 }),
  ghlPipelineId: varchar("ghlPipelineId", { length: 255 }),
  ghlPipelineStageId: varchar("ghlPipelineStageId", { length: 255 }),
  // KPI Market & Source references
  marketId: integer("marketId"),
  sourceId: integer("sourceId"),
  // Stage timestamps
  contactedAt: timestamp("contactedAt"),
  aptSetAt: timestamp("aptSetAt"),
  offerMadeAt: timestamp("offerMadeAt"),
  underContractAt: timestamp("underContractAt"),
  closedAt: timestamp("closedAt"),
  // Market & Extra Details
  market: varchar("market", { length: 100 }),
  lotSize: varchar("lotSize", { length: 50 }),
  photos: text("photos"), // JSON array of photo URLs
  dispoAskingPrice: integer("dispoAskingPrice"), // in cents
  // Opportunity & Project Details
  opportunitySource: varchar("opportunitySource", { length: 255 }),
  projectType: varchar("projectType", { length: 255 }),
  lastContactedAt: timestamp("lastContactedAt"),
  lastConversationAt: timestamp("lastConversationAt"),
  // AI Property Research
  propertyResearch: jsonb("property_research").$type<{
    zestimate?: number;
    taxAssessment?: number;
    taxAmount?: number;
    ownerName?: string;
    deedDate?: string;
    legalDescription?: string;
    listingHistory?: Array<{ date: string; event: string; price?: number }>;
    recentComps?: Array<{ address: string; soldPrice: number; soldDate: string; sqft?: number; beds?: number; baths?: number }>;
    priceHistory?: Array<{ date: string; price: number; event: string }>;
    neighborhoodInfo?: string;
    streetViewUrl?: string;
    zillowUrl?: string;
    additionalNotes?: string;
  }>(),
  researchUpdatedAt: timestamp("research_updated_at"),
  // Timestamps
  marketedAt: timestamp("marketedAt"),
  soldAt: timestamp("soldAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
}, (table) => ([
  uniqueIndex("uniq_tenant_address").on(table.tenantId, table.address),
]));
export type DispoProperty = typeof dispoProperties.$inferSelect;
export type InsertDispoProperty = typeof dispoProperties.$inferInsert;
// Alias for cleaner code — new code should use `properties` instead of `dispoProperties`
export const properties = dispoProperties;
export type Property = DispoProperty;
export type InsertProperty = InsertDispoProperty;

// ============ PROPERTY STAGE HISTORY (Track all stage transitions) ============
export const propertyStageHistory = pgTable("property_stage_history", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenantId").references(() => tenants.id).notNull(),
  propertyId: integer("propertyId").references(() => dispoProperties.id).notNull(),
  fromStatus: varchar("fromStatus", { length: 50 }), // null for initial creation
  toStatus: varchar("toStatus", { length: 50 }).notNull(),
  changedByUserId: integer("changedByUserId").references(() => users.id),
  source: varchar("source", { length: 50 }).default("manual"),
  notes: text("notes"),
  changedAt: timestamp("changedAt").defaultNow().notNull(),
});
export type PropertyStageHistory = typeof propertyStageHistory.$inferSelect;
export type InsertPropertyStageHistory = typeof propertyStageHistory.$inferInsert;

// ============ DISPO PROPERTY SENDS (Tracking blasts/sends per property) ============
export const dispoPropertySends = pgTable("dispo_property_sends", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenantId").references(() => tenants.id).notNull(),
  propertyId: integer("propertyId").references(() => dispoProperties.id).notNull(),
  // Send details
  channel: text("channel").notNull(),
  buyerGroup: varchar("buyerGroup", { length: 255 }),
  recipientCount: integer("recipientCount").default(0),
  notes: text("notes"),
  sentByUserId: integer("sentByUserId").references(() => users.id),
  sentAt: timestamp("sentAt").defaultNow().notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type DispoPropertySend = typeof dispoPropertySends.$inferSelect;
export type InsertDispoPropertySend = typeof dispoPropertySends.$inferInsert;

// ============ DISPO PROPERTY OFFERS (Buyer offers on properties) ============
export const dispoPropertyOffers = pgTable("dispo_property_offers", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenantId").references(() => tenants.id).notNull(),
  propertyId: integer("propertyId").references(() => dispoProperties.id).notNull(),
  // Buyer info
  buyerName: varchar("buyerName", { length: 255 }).notNull(),
  buyerPhone: varchar("buyerPhone", { length: 50 }),
  buyerEmail: varchar("buyerEmail", { length: 255 }),
  buyerCompany: varchar("buyerCompany", { length: 255 }),
  ghlContactId: varchar("ghlContactId", { length: 255 }),
  // Offer details
  offerAmount: integer("offerAmount").notNull(), // in cents
  status: text("status").default("pending").notNull(),
  notes: text("notes"),
  // Timestamps
  offeredAt: timestamp("offeredAt").defaultNow().notNull(),
  respondedAt: timestamp("respondedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});
export type DispoPropertyOffer = typeof dispoPropertyOffers.$inferSelect;
export type InsertDispoPropertyOffer = typeof dispoPropertyOffers.$inferInsert;

// ============ DISPO PROPERTY SHOWINGS (Showing appointments) ============
export const dispoPropertyShowings = pgTable("dispo_property_showings", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenantId").references(() => tenants.id).notNull(),
  propertyId: integer("propertyId").references(() => dispoProperties.id).notNull(),
  // Buyer info
  buyerName: varchar("buyerName", { length: 255 }).notNull(),
  buyerPhone: varchar("buyerPhone", { length: 50 }),
  buyerCompany: varchar("buyerCompany", { length: 255 }),
  ghlContactId: varchar("ghlContactId", { length: 255 }),
  // Showing details
  showingDate: varchar("showingDate", { length: 10 }).notNull(), // YYYY-MM-DD
  showingTime: varchar("showingTime", { length: 10 }), // HH:MM (24h)
  status: text("status").default("scheduled").notNull(),
  feedback: text("feedback"),
  interestLevel: text("interestLevel"),
  notes: text("notes"),
  // Timestamps
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});
export type DispoPropertyShowing = typeof dispoPropertyShowings.$inferSelect;
export type InsertDispoPropertyShowing = typeof dispoPropertyShowings.$inferInsert;

// ============ PROPERTY BUYER ACTIVITY ============
export const propertyBuyerActivity = pgTable("property_buyer_activity", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenantId").references(() => tenants.id).notNull(),
  propertyId: integer("propertyId").references(() => dispoProperties.id).notNull(),
  // Buyer info
  buyerName: varchar("buyerName", { length: 255 }).notNull(),
  buyerPhone: varchar("buyerPhone", { length: 50 }),
  buyerEmail: varchar("buyerEmail", { length: 255 }),
  buyerCompany: varchar("buyerCompany", { length: 255 }),
  ghlContactId: varchar("ghlContactId", { length: 255 }),
  // Buyer preferences
  buyerMarkets: text("buyerMarkets"), // JSON array of markets
  buyerBudgetMin: integer("buyerBudgetMin"), // in cents
  buyerBudgetMax: integer("buyerBudgetMax"), // in cents
  buyerPropertyTypes: text("buyerPropertyTypes"), // JSON array
  buyerStrategy: varchar("buyerStrategy", { length: 100 }),
  isVip: text("isVip").default("false"),
  buyerTier: text("buyerTier").default("qualified"),
  // Activity tracking per buyer per property
  sendCount: integer("sendCount").default(0).notNull(),
  lastSentAt: timestamp("lastSentAt"),
  lastSentChannel: varchar("lastSentChannel", { length: 50 }),
  offerCount: integer("offerCount").default(0).notNull(),
  lastOfferAmount: integer("lastOfferAmount"), // in cents
  lastOfferAt: timestamp("lastOfferAt"),
  // Response tracking
  responseCount: integer("responseCount").default(0).notNull(),
  lastResponseAt: timestamp("lastResponseAt"),
  lastResponseNote: text("lastResponseNote"),
  // Status for this buyer on this property
  status: text("buyerStatus").default("matched").notNull(),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});
export type PropertyBuyerActivity = typeof propertyBuyerActivity.$inferSelect;
export type InsertPropertyBuyerActivity = typeof propertyBuyerActivity.$inferInsert;

// ============ PROPERTY ACTIVITY LOG (Chronological event history per property) ============
export const propertyActivityLog = pgTable("property_activity_log", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenantId").references(() => tenants.id).notNull(),
  propertyId: integer("propertyId").references(() => dispoProperties.id).notNull(),
  // Event type
  eventType: text("eventType").notNull(),
  // Event details
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  // Optional references
  buyerName: varchar("buyerName", { length: 255 }),
  buyerActivityId: integer("buyerActivityId"),
  offerId: integer("offerId"),
  showingId: integer("showingId"),
  sendId: integer("sendId"),
  callId: integer("callId"),
  // Metadata
  metadata: text("metadata"), // JSON for extra event-specific data
  performedByUserId: integer("performedByUserId").references(() => users.id),
  performedByName: varchar("performedByName", { length: 255 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type PropertyActivityLog = typeof propertyActivityLog.$inferSelect;
export type InsertPropertyActivityLog = typeof propertyActivityLog.$inferInsert;

// ============ DISPO DAILY KPI ENTRIES (Dispo-specific manual KPIs) ============
export const dispoDailyKpis = pgTable("dispo_daily_kpis", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenantId").references(() => tenants.id).notNull(),
  userId: integer("userId").notNull(),
  date: varchar("entryDate", { length: 10 }).notNull(), // YYYY-MM-DD
  kpiType: text("kpiType").notNull(),
  value: integer("value").default(1).notNull(),
  propertyId: integer("propertyId").references(() => dispoProperties.id),
  notes: text("notes"),
  source: text("kpi_source").default("manual").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type DispoDailyKpi = typeof dispoDailyKpis.$inferSelect;
export type InsertDispoDailyKpi = typeof dispoDailyKpis.$inferInsert;

// ─── SYNC LOG (audit trail for GHL polling) ───
export const syncLog = pgTable("sync_log", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenantId").notNull(),
  syncType: text("syncType").notNull(),
  syncStatus: text("syncStatus").notNull(),
  totalProcessed: integer("totalProcessed").default(0),
  imported: integer("imported").default(0),
  updated: integer("updated").default(0),
  skipped: integer("skipped").default(0),
  errors: integer("errors").default(0),
  errorMessages: text("errorMessages"),
  durationMs: integer("durationMs"),
  triggeredBy: varchar("triggeredBy", { length: 50 }),
  notes: text("notes"),
  startedAt: timestamp("startedAt"),
  completedAt: timestamp("completedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type SyncLog = typeof syncLog.$inferSelect;
export type InsertSyncLog = typeof syncLog.$inferInsert;

// ============ DEAL DISTRIBUTION ============

/**
 * Deal Distributions — stores AI-generated content per property per buyer tier.
 */
export const dealDistributions = pgTable("deal_distributions", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenantId").references(() => tenants.id).notNull(),
  propertyId: integer("propertyId").references(() => dispoProperties.id).notNull(),
  // Which buyer tier this content targets
  buyerTier: text("buyerTier").notNull(),
  // Generated content
  smsContent: text("smsContent"),
  emailSubject: varchar("emailSubject", { length: 500 }),
  emailBody: text("emailBody"),
  pdfUrl: text("pdfUrl"),
  pdfFileKey: varchar("pdfFileKey", { length: 512 }),
  // User-edited versions
  editedSmsContent: text("editedSmsContent"),
  editedEmailSubject: varchar("editedEmailSubject", { length: 500 }),
  editedEmailBody: text("editedEmailBody"),
  // Status tracking
  status: text("distStatus").default("draft").notNull(),
  // Who generated / reviewed
  generatedByUserId: integer("generatedByUserId").references(() => users.id),
  reviewedByUserId: integer("reviewedByUserId").references(() => users.id),
  reviewedAt: timestamp("reviewedAt"),
  sentAt: timestamp("sentAt"),
  // Timestamps
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});
export type DealDistribution = typeof dealDistributions.$inferSelect;
export type InsertDealDistribution = typeof dealDistributions.$inferInsert;

/**
 * Deal Content Edits — tracks every edit the user makes to AI-generated content.
 */
export const dealContentEdits = pgTable("deal_content_edits", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenantId").references(() => tenants.id).notNull(),
  distributionId: integer("distributionId").references(() => dealDistributions.id).notNull(),
  // Which field was edited
  contentType: text("contentType").notNull(),
  // Original AI-generated content
  originalContent: text("originalContent").notNull(),
  // User's edited version
  editedContent: text("editedContent").notNull(),
  // The buyer tier context
  buyerTier: text("editBuyerTier").notNull(),
  // Who edited
  editedByUserId: integer("editedByUserId").references(() => users.id),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type DealContentEdit = typeof dealContentEdits.$inferSelect;
export type InsertDealContentEdit = typeof dealContentEdits.$inferInsert;
