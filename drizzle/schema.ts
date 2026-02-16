import { int, mysqlEnum, mysqlTable, text, timestamp, varchar, json, decimal } from "drizzle-orm/mysql-core";

// ============ MULTI-TENANCY SYSTEM ============

/**
 * Tenants table - each company/customer is a tenant
 * This is the core of the white-label SaaS platform
 */
export const tenants = mysqlTable("tenants", {
  id: int("id").autoincrement().primaryKey(),
  // Company info
  name: varchar("name", { length: 255 }).notNull(),
  slug: varchar("slug", { length: 100 }).notNull().unique(), // URL-friendly identifier
  domain: varchar("domain", { length: 255 }), // Custom domain if provided
  // Stripe billing
  stripeCustomerId: varchar("stripeCustomerId", { length: 255 }),
  stripeSubscriptionId: varchar("stripeSubscriptionId", { length: 255 }),
  // Subscription tier: starter, growth, scale
  subscriptionTier: mysqlEnum("subscriptionTier", ["trial", "starter", "growth", "scale"]).default("trial"),
  subscriptionStatus: mysqlEnum("subscriptionStatus", ["active", "past_due", "canceled", "paused"]).default("active"),
  // Trial info
  trialEndsAt: timestamp("trialEndsAt"),
  // User limits based on tier
  maxUsers: int("maxUsers").default(3), // Starter: 3, Growth: 10, Scale: unlimited (999)
  // CRM integration
  crmType: mysqlEnum("crmType", ["ghl", "hubspot", "salesforce", "close", "pipedrive", "none"]).default("none"),
  crmConnected: mysqlEnum("crmConnected", ["true", "false"]).default("false"),
  crmConfig: text("crmConfig"), // JSON config for CRM connection
  // Branding (Phase 2)
  logoUrl: text("logoUrl"),
  primaryColor: varchar("primaryColor", { length: 20 }),
  // Onboarding progress
  onboardingStep: int("onboardingStep").default(1),
  onboardingCompleted: mysqlEnum("onboardingCompleted", ["true", "false"]).default("false"),
  // Settings
  settings: text("settings"), // JSON for tenant-specific settings
  // CRM sync timestamps
  lastGhlSync: timestamp("lastGhlSync"),
  lastBatchDialerSync: timestamp("lastBatchDialerSync"),
  lastBatchLeadsSync: timestamp("lastBatchLeadsSync"),
  // Timestamps
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Tenant = typeof tenants.$inferSelect;
export type InsertTenant = typeof tenants.$inferInsert;

/**
 * Core user table backing auth flow.
 * Extended with team role for call coaching platform.
 * Now includes tenantId for multi-tenancy.
 */
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").references(() => tenants.id), // Multi-tenancy (nullable: users created before tenant assignment)
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  passwordHash: varchar("passwordHash", { length: 255 }), // For email/password auth
  emailVerified: mysqlEnum("emailVerified", ["true", "false"]).default("false"), // Email verification status
  loginMethod: varchar("loginMethod", { length: 64 }), // 'manus_oauth' or 'email_password'
  role: mysqlEnum("role", ["user", "admin", "super_admin"]).default("user").notNull(), // Added super_admin for platform owner
  // Team role for call coaching (consolidated - this is the single source of truth for roles)
  teamRole: mysqlEnum("teamRole", ["admin", "lead_manager", "acquisition_manager", "lead_generator"]).default("lead_manager"),
  // Is this user a tenant admin?
  isTenantAdmin: mysqlEnum("isTenantAdmin", ["true", "false"]).default("false"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
  profilePicture: text("profilePicture"), // S3 URL for profile picture
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/**
 * Password reset tokens for email/password auth
 */
export const passwordResetTokens = mysqlTable("password_reset_tokens", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").references(() => users.id).notNull(),
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
export const emailVerificationTokens = mysqlTable("email_verification_tokens", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").references(() => users.id).notNull(),
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
export const teamMembers = mysqlTable("team_members", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").references(() => tenants.id).notNull(), // Multi-tenancy
  name: varchar("name", { length: 255 }).notNull(),
  teamRole: mysqlEnum("teamRole", ["admin", "lead_manager", "acquisition_manager", "lead_generator"]).notNull(),
  userId: int("userId").references(() => users.id),
  ghlUserId: varchar("ghlUserId", { length: 255 }), // GoHighLevel user ID for matching
  isActive: mysqlEnum("isActive", ["true", "false"]).default("true"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type TeamMember = typeof teamMembers.$inferSelect;
export type InsertTeamMember = typeof teamMembers.$inferInsert;

/**
 * Team Assignments - maps Lead Managers to their Acquisition Manager supervisor
 */
export const teamAssignments = mysqlTable("team_assignments", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").references(() => tenants.id).notNull(), // Multi-tenancy
  // The Lead Manager being assigned
  leadManagerId: int("leadManagerId").references(() => teamMembers.id).notNull(),
  // The Acquisition Manager they report to
  acquisitionManagerId: int("acquisitionManagerId").references(() => teamMembers.id).notNull(),
  // Timestamps
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type TeamAssignment = typeof teamAssignments.$inferSelect;
export type InsertTeamAssignment = typeof teamAssignments.$inferInsert;

/**
 * Tenant Roles - custom roles defined by each tenant
 * Replaces hardcoded LM/AM roles
 */
export const tenantRoles = mysqlTable("tenant_roles", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").references(() => tenants.id).notNull(),
  name: varchar("name", { length: 100 }).notNull(), // e.g., "SDR", "AE", "Closer"
  code: varchar("code", { length: 50 }).notNull(), // e.g., "sdr", "ae", "closer"
  description: text("description"),
  // Which grading rubric to use
  rubricId: int("rubricId"), // References tenant_rubrics.id
  isActive: mysqlEnum("isActive", ["true", "false"]).default("true"),
  sortOrder: int("sortOrder").default(0),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type TenantRole = typeof tenantRoles.$inferSelect;
export type InsertTenantRole = typeof tenantRoles.$inferInsert;

/**
 * Tenant Rubrics - custom grading rubrics per tenant
 */
export const tenantRubrics = mysqlTable("tenant_rubrics", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").references(() => tenants.id).notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  // Criteria as JSON array: [{name, description, weight, maxScore}]
  criteria: text("criteria").notNull(),
  isActive: mysqlEnum("isActive", ["true", "false"]).default("true"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type TenantRubric = typeof tenantRubrics.$inferSelect;
export type InsertTenantRubric = typeof tenantRubrics.$inferInsert;

/**
 * Tenant Call Types - custom call type classifications per tenant
 */
export const tenantCallTypes = mysqlTable("tenant_call_types", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").references(() => tenants.id).notNull(),
  name: varchar("name", { length: 100 }).notNull(), // e.g., "Discovery", "Demo", "Closing"
  code: varchar("code", { length: 50 }).notNull(),
  description: text("description"),
  // Which rubric to use for this call type
  rubricId: int("rubricId").references(() => tenantRubrics.id),
  isActive: mysqlEnum("isActive", ["true", "false"]).default("true"),
  sortOrder: int("sortOrder").default(0),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type TenantCallType = typeof tenantCallTypes.$inferSelect;
export type InsertTenantCallType = typeof tenantCallTypes.$inferInsert;

/**
 * Calls table - stores incoming calls from CRM webhook
 * Now includes tenantId for multi-tenancy.
 */
export const calls = mysqlTable("calls", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").references(() => tenants.id).notNull(), // Multi-tenancy  // Call source - where the call data came from
  callSource: mysqlEnum("callSource", ["ghl", "batchdialer"]).default("ghl"),
  // GHL webhook data (kept for backwards compatibility, works with any CRM)
  ghlCallId: varchar("ghlCallId", { length: 255 }).unique(),
  ghlContactId: varchar("ghlContactId", { length: 255 }),
  ghlLocationId: varchar("ghlLocationId", { length: 255 }),
  // BatchDialer data
  batchDialerCallId: int("batchDialerCallId").unique(),
  batchDialerCampaignId: int("batchDialerCampaignId"),
  batchDialerCampaignName: varchar("batchDialerCampaignName", { length: 255 }),
  batchDialerAgentName: varchar("batchDialerAgentName", { length: 255 }),
  // Call metadata
  contactName: varchar("contactName", { length: 255 }),
  contactPhone: varchar("contactPhone", { length: 50 }),
  propertyAddress: text("propertyAddress"),
  // Recording info
  recordingUrl: text("recordingUrl"),
  duration: int("duration"), // in seconds
  callDirection: mysqlEnum("callDirection", ["inbound", "outbound"]).default("outbound"),
  // Team member who handled the call
  teamMemberId: int("teamMemberId").references(() => teamMembers.id),
  teamMemberName: varchar("teamMemberName", { length: 255 }),
  // Call type - now references tenant_call_types for custom types
  callType: mysqlEnum("callType", ["cold_call", "qualification", "follow_up", "offer", "seller_callback", "admin_callback"]).default("qualification"),
  tenantCallTypeId: int("tenantCallTypeId").references(() => tenantCallTypes.id), // Custom call type
  // How the call type was determined
  callTypeSource: mysqlEnum("callTypeSource", ["ai_suggested", "manual", "auto"]).default("ai_suggested"),
  // Call outcome - what was achieved on this call
  callOutcome: mysqlEnum("callOutcome", ["none", "appointment_set", "offer_made", "callback_scheduled", "interested", "left_vm", "no_answer", "not_interested", "dead"]).default("none"),
  // Call classification - determines if call should be graded
  classification: mysqlEnum("classification", ["pending", "conversation", "voicemail", "no_answer", "callback_request", "wrong_number", "too_short", "admin_call", "limit_reached"]).default("pending"),
  classificationReason: text("classificationReason"), // AI explanation for classification
  // Processing status
  status: mysqlEnum("status", ["pending", "transcribing", "classifying", "grading", "completed", "skipped", "failed"]).default("pending"),
  // Transcript
  transcript: text("transcript"),
  transcriptUrl: text("transcriptUrl"), // S3 URL for archived transcripts
  // BatchLeads property enrichment data (JSON)
  batchLeadsEnrichment: text("batchLeadsEnrichment"),
  // Archival
  isArchived: mysqlEnum("isArchived", ["true", "false"]).default("false"),
  archivedAt: timestamp("archivedAt"),
  // Timestamps
  callTimestamp: timestamp("callTimestamp"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Call = typeof calls.$inferSelect;
export type InsertCall = typeof calls.$inferInsert;

/**
 * Call grades table - stores AI-generated grades for each call
 */
export const callGrades = mysqlTable("call_grades", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").references(() => tenants.id).notNull(), // Multi-tenancy
  callId: int("callId").references(() => calls.id).notNull(),
  // Overall score
  overallScore: decimal("overallScore", { precision: 5, scale: 2 }),
  overallGrade: mysqlEnum("overallGrade", ["A", "B", "C", "D", "F"]),
  // Individual criteria scores (stored as JSON for flexibility)
  criteriaScores: json("criteriaScores"),
  // Coaching feedback
  strengths: json("strengths"), // Array of strings
  improvements: json("improvements"), // Array of strings
  coachingTips: json("coachingTips"), // Array of specific coaching tips
  // Red flags identified
  redFlags: json("redFlags"), // Array of strings
  // Objection handling - identified objections and suggested responses
  objectionHandling: json("objectionHandling"), // Array of {objection, context, suggestedResponses[]}
  // Summary
  summary: text("summary"),
  // Which rubric was used (legacy)
  rubricType: mysqlEnum("rubricType", ["lead_manager", "acquisition_manager", "lead_generator", "follow_up", "seller_callback", "admin_callback"]).notNull(),
  // Custom rubric reference
  tenantRubricId: int("tenantRubricId").references(() => tenantRubrics.id),
  // Timestamps
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type CallGrade = typeof callGrades.$inferSelect;
export type InsertCallGrade = typeof callGrades.$inferInsert;

/**
 * Webhook retry queue - stores failed Gunner Engine webhooks for automatic retry
 */
export const webhookRetryQueue = mysqlTable("webhook_retry_queue", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").references(() => tenants.id).notNull(),
  callId: int("callId").references(() => calls.id).notNull(),
  // Webhook payload (JSON)
  payload: text("payload").notNull(),
  // Retry tracking
  attemptCount: int("attemptCount").default(0).notNull(),
  maxAttempts: int("maxAttempts").default(5).notNull(),
  lastAttemptAt: timestamp("lastAttemptAt"),
  nextRetryAt: timestamp("nextRetryAt").notNull(),
  // Status: pending, delivered, failed
  status: mysqlEnum("status", ["pending", "delivered", "failed"]).default("pending").notNull(),
  // Last error message
  lastError: text("lastError"),
  // Timestamps
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type WebhookRetryQueue = typeof webhookRetryQueue.$inferSelect;
export type InsertWebhookRetryQueue = typeof webhookRetryQueue.$inferInsert;

/**
 * Performance metrics - aggregated stats for leaderboard
 */
export const performanceMetrics = mysqlTable("performance_metrics", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").references(() => tenants.id).notNull(), // Multi-tenancy
  teamMemberId: int("teamMemberId").references(() => teamMembers.id).notNull(),
  // Time period
  periodType: mysqlEnum("periodType", ["daily", "weekly", "monthly", "all_time"]).notNull(),
  periodStart: timestamp("periodStart").notNull(),
  periodEnd: timestamp("periodEnd").notNull(),
  // Metrics
  totalCalls: int("totalCalls").default(0),
  averageScore: decimal("averageScore", { precision: 5, scale: 2 }),
  aGradeCount: int("aGradeCount").default(0),
  bGradeCount: int("bGradeCount").default(0),
  cGradeCount: int("cGradeCount").default(0),
  dGradeCount: int("dGradeCount").default(0),
  fGradeCount: int("fGradeCount").default(0),
  // Improvement tracking
  scoreChange: decimal("scoreChange", { precision: 5, scale: 2 }), // vs previous period
  // Timestamps
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type PerformanceMetric = typeof performanceMetrics.$inferSelect;
export type InsertPerformanceMetric = typeof performanceMetrics.$inferInsert;


/**
 * Training materials - uploaded documents that influence grading criteria
 */
export const trainingMaterials = mysqlTable("training_materials", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").references(() => tenants.id).notNull(), // Multi-tenancy
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
  category: mysqlEnum("category", [
    "script",
    "objection_handling", 
    "methodology",
    "best_practices",
    "examples",
    "other"
  ]).default("other"),
  // Which role this applies to (legacy - use tenantRoleId for custom roles)
  applicableTo: mysqlEnum("applicableTo", ["all", "lead_manager", "acquisition_manager", "lead_generator"]).default("all"),
  tenantRoleId: int("tenantRoleId").references(() => tenantRoles.id), // Custom role reference
  // Status
  isActive: mysqlEnum("isActive", ["true", "false"]).default("true"),
  // Timestamps
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type TrainingMaterial = typeof trainingMaterials.$inferSelect;
export type InsertTrainingMaterial = typeof trainingMaterials.$inferInsert;

/**
 * AI Feedback - corrections and feedback on AI grading to improve future scoring
 */
export const aiFeedback = mysqlTable("ai_feedback", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").references(() => tenants.id).notNull(), // Multi-tenancy
  // Link to the call/grade being corrected
  callId: int("callId").references(() => calls.id),
  callGradeId: int("callGradeId").references(() => callGrades.id),
  // Who provided the feedback
  userId: int("userId").references(() => users.id),
  // Feedback type
  feedbackType: mysqlEnum("feedbackType", [
    "score_too_high",
    "score_too_low", 
    "wrong_criteria",
    "missed_issue",
    "incorrect_feedback",
    "general_correction",
    "praise"
  ]).notNull(),
  // The specific criteria being corrected (if applicable)
  criteriaName: varchar("criteriaName", { length: 255 }),
  // Original values
  originalScore: decimal("originalScore", { precision: 5, scale: 2 }),
  originalGrade: mysqlEnum("originalGrade", ["A", "B", "C", "D", "F"]),
  // Suggested corrections
  suggestedScore: decimal("suggestedScore", { precision: 5, scale: 2 }),
  suggestedGrade: mysqlEnum("suggestedGrade", ["A", "B", "C", "D", "F"]),
  // Detailed feedback explanation
  explanation: text("explanation").notNull(),
  // What the AI should have noticed or done differently
  correctBehavior: text("correctBehavior"),
  // Status - whether this feedback has been incorporated
  status: mysqlEnum("status", ["pending", "reviewed", "incorporated", "dismissed"]).default("pending"),
  // Timestamps
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type AIFeedback = typeof aiFeedback.$inferSelect;
export type InsertAIFeedback = typeof aiFeedback.$inferInsert;

/**
 * Grading rules - custom rules that override or supplement default rubrics
 */
export const gradingRules = mysqlTable("grading_rules", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").references(() => tenants.id).notNull(), // Multi-tenancy
  // Rule info
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  // The rule itself - natural language instruction for the AI
  ruleText: text("ruleText").notNull(),
  // Priority (higher = more important)
  priority: int("priority").default(0),
  // Which rubric this applies to (legacy)
  applicableTo: mysqlEnum("applicableTo", ["all", "lead_manager", "acquisition_manager", "lead_generator"]).default("all"),
  tenantRoleId: int("tenantRoleId").references(() => tenantRoles.id), // Custom role reference
  // Status
  isActive: mysqlEnum("isActive", ["true", "false"]).default("true"),
  // Timestamps
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type GradingRule = typeof gradingRules.$inferSelect;
export type InsertGradingRule = typeof gradingRules.$inferInsert;


/**
 * Team Training Items - tracks ongoing team development items
 * Used for weekly team calls and ongoing coaching
 */
export const teamTrainingItems = mysqlTable("team_training_items", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").references(() => tenants.id).notNull(), // Multi-tenancy
  // Item type
  itemType: mysqlEnum("itemType", [
    "skill",           // Long-term skills being developed
    "issue",           // Urgent issues/incompetencies to address
    "win",             // Small wins to celebrate
    "agenda"           // Weekly team call agenda items
  ]).notNull(),
  // Content
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  // For skills: what we're working toward
  targetBehavior: text("targetBehavior"),
  // For issues: what went wrong and how to fix it
  callReference: int("callReference").references(() => calls.id), // Link to specific call if applicable
  // For agenda items: order in the meeting
  sortOrder: int("sortOrder").default(0),
  // Priority level
  priority: mysqlEnum("priority", ["low", "medium", "high", "urgent"]).default("medium"),
  // Who this applies to (null = whole team)
  teamMemberId: int("teamMemberId").references(() => teamMembers.id),
  teamMemberName: varchar("teamMemberName", { length: 255 }),
  // Which role this insight applies to
  teamRole: mysqlEnum("teamRole", ["lead_manager", "acquisition_manager", "lead_generator"]),
  // Status
  status: mysqlEnum("status", ["active", "in_progress", "completed", "archived"]).default("active"),
  // AI generation tracking
  isAiGenerated: mysqlEnum("isAiGenerated", ["true", "false"]).default("false"),
  sourceCallIds: text("sourceCallIds"), // JSON array of call IDs that informed this insight
  // For agenda items: which meeting date
  meetingDate: timestamp("meetingDate"),
  // Timestamps
  completedAt: timestamp("completedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type TeamTrainingItem = typeof teamTrainingItems.$inferSelect;
export type InsertTeamTrainingItem = typeof teamTrainingItems.$inferInsert;


/**
 * Brand Assets - stores branding files, logos, style guides
 */
export const brandAssets = mysqlTable("brand_assets", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").references(() => tenants.id).notNull(), // Multi-tenancy
  // Asset info
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  // Asset type
  assetType: mysqlEnum("assetType", [
    "logo",
    "color_palette",
    "font",
    "style_guide",
    "image",
    "video",
    "document",
    "other"
  ]).notNull(),
  // File storage
  fileUrl: text("fileUrl"),
  fileKey: varchar("fileKey", { length: 512 }),
  mimeType: varchar("mimeType", { length: 128 }),
  fileSize: int("fileSize"),
  // Metadata (JSON for flexible storage)
  metadata: text("metadata"), // e.g., { colors: ["#fff", "#000"], fonts: ["Arial"] }
  // Status
  isActive: mysqlEnum("isActive", ["true", "false"]).default("true"),
  // Timestamps
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type BrandAsset = typeof brandAssets.$inferSelect;
export type InsertBrandAsset = typeof brandAssets.$inferInsert;

/**
 * Social Media Posts - stores all social media content
 */
export const socialPosts = mysqlTable("social_posts", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").references(() => tenants.id).notNull(), // Multi-tenancy
  // Content type - brand or creator
  contentType: mysqlEnum("contentType", ["brand", "creator"]).notNull(),
  // Platform
  platform: mysqlEnum("platform", [
    "blog",
    "meta_facebook",
    "meta_instagram",
    "google_business",
    "x_twitter",
    "linkedin",
    "other"
  ]).notNull(),
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
  status: mysqlEnum("status", [
    "draft",
    "scheduled",
    "published",
    "failed"
  ]).default("draft"),
  scheduledAt: timestamp("scheduledAt"),
  publishedAt: timestamp("publishedAt"),
  // External post ID (if published)
  externalPostId: varchar("externalPostId", { length: 255 }),
  // AI generation tracking
  isAiGenerated: mysqlEnum("isAiGenerated", ["true", "false"]).default("false"),
  aiPrompt: text("aiPrompt"), // The prompt used to generate this content
  // Author
  createdBy: int("createdBy").references(() => users.id),
  // Timestamps
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type SocialPost = typeof socialPosts.$inferSelect;
export type InsertSocialPost = typeof socialPosts.$inferInsert;

/**
 * Content Ideas - stores content ideas for creators
 */
export const contentIdeas = mysqlTable("content_ideas", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").references(() => tenants.id).notNull(), // Multi-tenancy
  // Idea content
  title: varchar("title", { length: 500 }).notNull(),
  description: text("description"),
  // Category/topic
  category: varchar("category", { length: 255 }),
  // Target platform
  targetPlatform: mysqlEnum("targetPlatform", [
    "x_twitter",
    "blog",
    "meta",
    "any"
  ]).default("any"),
  // Status
  status: mysqlEnum("status", [
    "new",
    "in_progress",
    "used",
    "archived"
  ]).default("new"),
  // Link to post if used
  usedInPostId: int("usedInPostId").references(() => socialPosts.id),
  // AI generation tracking
  isAiGenerated: mysqlEnum("isAiGenerated", ["true", "false"]).default("false"),
  // Timestamps
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type ContentIdea = typeof contentIdeas.$inferSelect;
export type InsertContentIdea = typeof contentIdeas.$inferInsert;


/**
 * Brand Profile - stores company brand identity and settings
 */
export const brandProfile = mysqlTable("brand_profile", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").references(() => tenants.id).notNull(), // Multi-tenancy
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
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type BrandProfile = typeof brandProfile.$inferSelect;
export type InsertBrandProfile = typeof brandProfile.$inferInsert;


// ============ GAMIFICATION SYSTEM ============

/**
 * Badge definitions - stores all available badges
 * Now tenant-scoped for custom badges per company
 */
export const badges = mysqlTable("badges", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").references(() => tenants.id), // Multi-tenancy (null = platform default)
  code: varchar("code", { length: 50 }).notNull(), // e.g., "on_fire", "script_starter"
  name: varchar("name", { length: 100 }).notNull(),
  description: text("description"),
  icon: varchar("icon", { length: 10 }), // Emoji icon
  category: mysqlEnum("category", ["universal", "lead_manager", "acquisition_manager", "lead_generator"]).notNull(),
  tier: mysqlEnum("tier", ["bronze", "silver", "gold"]).notNull(),
  target: int("target").notNull(), // Target count to earn this badge tier
  criteriaType: varchar("criteriaType", { length: 50 }).notNull(), // Type of criteria
  criteriaConfig: text("criteriaConfig"), // JSON config for criteria
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Badge = typeof badges.$inferSelect;
export type InsertBadge = typeof badges.$inferInsert;

/**
 * User badges - tracks which badges users have earned
 */
export const userBadges = mysqlTable("user_badges", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").references(() => tenants.id).notNull(), // Multi-tenancy
  teamMemberId: int("teamMemberId").references(() => teamMembers.id).notNull(),
  badgeId: int("badgeId").references(() => badges.id).notNull(),
  badgeCode: varchar("badgeCode", { length: 64 }).notNull(),
  progress: int("progress").default(0),
  earnedAt: timestamp("earnedAt").defaultNow().notNull(),
  triggerCallId: int("triggerCallId").references(() => calls.id),
  isViewed: mysqlEnum("isViewed", ["true", "false"]).default("false"),
});

export type UserBadge = typeof userBadges.$inferSelect;
export type InsertUserBadge = typeof userBadges.$inferInsert;

/**
 * Badge progress - tracks progress toward badges
 */
export const badgeProgress = mysqlTable("badge_progress", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").references(() => tenants.id).notNull(), // Multi-tenancy
  teamMemberId: int("teamMemberId").references(() => teamMembers.id).notNull(),
  badgeCode: varchar("badgeCode", { length: 64 }).notNull(),
  currentCount: int("currentCount").default(0),
  currentStreak: int("currentStreak").default(0),
  weekStart: timestamp("weekStart"),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type BadgeProgress = typeof badgeProgress.$inferSelect;
export type InsertBadgeProgress = typeof badgeProgress.$inferInsert;

/**
 * User streaks - tracks hot streaks and consistency streaks
 */
export const userStreaks = mysqlTable("user_streaks", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").references(() => tenants.id).notNull(), // Multi-tenancy
  teamMemberId: int("teamMemberId").references(() => teamMembers.id).notNull(),
  // Hot streak (consecutive C+ grades)
  hotStreakCurrent: int("hotStreakCurrent").default(0).notNull(),
  hotStreakBest: int("hotStreakBest").default(0).notNull(),
  hotStreakLastCallId: int("hotStreakLastCallId"),
  // Consistency streak (days with graded calls)
  consistencyStreakCurrent: int("consistencyStreakCurrent").default(0).notNull(),
  consistencyStreakBest: int("consistencyStreakBest").default(0).notNull(),
  consistencyLastDate: varchar("consistencyLastDate", { length: 10 }), // YYYY-MM-DD format
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type UserStreak = typeof userStreaks.$inferSelect;
export type InsertUserStreak = typeof userStreaks.$inferInsert;

/**
 * User XP - tracks total XP and level
 */
export const userXp = mysqlTable("user_xp", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").references(() => tenants.id).notNull(), // Multi-tenancy
  teamMemberId: int("teamMemberId").references(() => teamMembers.id).notNull(),
  totalXp: int("totalXp").default(0).notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type UserXp = typeof userXp.$inferSelect;
export type InsertUserXp = typeof userXp.$inferInsert;

/**
 * XP transactions - history of XP earned
 */
export const xpTransactions = mysqlTable("xp_transactions", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").references(() => tenants.id).notNull(), // Multi-tenancy
  teamMemberId: int("teamMemberId").references(() => teamMembers.id).notNull(),
  amount: int("amount").notNull(),
  reason: varchar("reason", { length: 100 }).notNull(),
  callId: int("callId").references(() => calls.id),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type XpTransaction = typeof xpTransactions.$inferSelect;
export type InsertXpTransaction = typeof xpTransactions.$inferInsert;

/**
 * Deals - tracks closed deals from GHL opportunities for Closer badge
 */
export const deals = mysqlTable("deals", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").references(() => tenants.id).notNull(), // Multi-tenancy
  ghlOpportunityId: varchar("ghlOpportunityId", { length: 255 }).notNull().unique(),
  ghlContactId: varchar("ghlContactId", { length: 255 }),
  teamMemberId: int("teamMemberId").references(() => teamMembers.id),
  callId: int("callId").references(() => calls.id), // The offer call that led to this deal
  dealValue: int("dealValue"), // Optional: deal amount in cents
  closedAt: timestamp("closedAt").defaultNow().notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Deal = typeof deals.$inferSelect;
export type InsertDeal = typeof deals.$inferInsert;

/**
 * Reward views - tracks which calls have been viewed for XP rewards
 * Prevents double-awarding XP when viewing the same call multiple times
 */
export const rewardViews = mysqlTable("reward_views", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").references(() => tenants.id).notNull(), // Multi-tenancy
  teamMemberId: int("teamMemberId").references(() => teamMembers.id).notNull(),
  callId: int("callId").references(() => calls.id).notNull(),
  xpAwarded: int("xpAwarded").default(0).notNull(),
  viewedAt: timestamp("viewedAt").defaultNow().notNull(),
});

export type RewardView = typeof rewardViews.$inferSelect;
export type InsertRewardView = typeof rewardViews.$inferInsert;


// ============ KPI TRACKING SYSTEM ============

/**
 * KPI Periods - tracks weekly/monthly periods for KPI data entry
 */
export const kpiPeriods = mysqlTable("kpi_periods", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").references(() => tenants.id).notNull(), // Multi-tenancy
  periodType: mysqlEnum("periodType", ["daily", "weekly", "monthly"]).notNull(),
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
export const teamMemberKpis = mysqlTable("team_member_kpis", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").references(() => tenants.id).notNull(), // Multi-tenancy
  teamMemberId: int("teamMemberId").references(() => teamMembers.id).notNull(),
  periodId: int("periodId").references(() => kpiPeriods.id).notNull(),
  // Role type determines which metrics are used
  roleType: mysqlEnum("roleType", ["am", "lm", "lg_cold_caller", "lg_sms"]).notNull(),
  // Metric 1 (calls for AM/LM, time for LG CC, sms sent for LG SMS)
  metric1: int("metric1").default(0).notNull(),
  metric1Label: varchar("metric1Label", { length: 50 }).default("Metric 1"),
  // Metric 2 (offers for AM, conversations for LM/LG CC, responses for LG SMS)
  metric2: int("metric2").default(0).notNull(),
  metric2Label: varchar("metric2Label", { length: 50 }).default("Metric 2"),
  // Metric 3 (contracts for AM, appointments for LM, leads for LG)
  metric3: int("metric3").default(0).notNull(),
  metric3Label: varchar("metric3Label", { length: 50 }).default("Metric 3"),
  // Notes
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type TeamMemberKpi = typeof teamMemberKpis.$inferSelect;
export type InsertTeamMemberKpi = typeof teamMemberKpis.$inferInsert;

/**
 * Campaign KPIs - tracks lead gen channel performance
 */
export const campaignKpis = mysqlTable("campaign_kpis", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").references(() => tenants.id).notNull(), // Multi-tenancy
  periodId: int("periodId").references(() => kpiPeriods.id).notNull(),
  market: mysqlEnum("market", ["tennessee", "global"]).default("global").notNull(),
  channel: mysqlEnum("channel", [
    "cold_calls", 
    "sms", 
    "forms", 
    "ppl", 
    "jv", 
    "ppc", 
    "postcards", 
    "referrals"
  ]).notNull(),
  // Metrics
  spent: int("spent").default(0).notNull(), // in cents
  volume: int("volume").default(0).notNull(), // # sent (calls, sms, postcards, etc.)
  contacts: int("contacts").default(0).notNull(), // # answered/responded (for answer rate/response rate)
  leads: int("leads").default(0).notNull(),
  offers: int("offers").default(0).notNull(),
  contracts: int("contracts").default(0).notNull(),
  dealsCount: int("dealsCount").default(0).notNull(),
  revenue: int("revenue").default(0).notNull(), // in cents
  // Notes
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type CampaignKpi = typeof campaignKpis.$inferSelect;
export type InsertCampaignKpi = typeof campaignKpis.$inferInsert;

/**
 * KPI Deals - tracks individual deals locked up
 */
export const kpiDeals = mysqlTable("kpi_deals", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").references(() => tenants.id).notNull(), // Multi-tenancy
  periodId: int("periodId").references(() => kpiPeriods.id),
  // Deal info
  propertyAddress: text("propertyAddress").notNull(),
  // Status: For Sale, Assigned, Funded
  inventoryStatus: mysqlEnum("inventoryStatus", [
    "for_sale",
    "assigned",
    "funded"
  ]).default("for_sale"),
  // Location: dynamic per-tenant market areas
  location: varchar("location", { length: 100 }),
  // Lead source
  leadSource: mysqlEnum("leadSource", [
    "cold_calls", 
    "sms", 
    "postcards",
    "forms", 
    "ppl", 
    "ppc", 
    "jv", 
    "referrals"
  ]),
  // Team members: dynamic per-tenant (stored as lowercase name)
  lmName: varchar("lmName", { length: 100 }),
  amName: varchar("amName", { length: 100 }),
  dmName: varchar("dmName", { length: 100 }),
  // Deal financials
  revenue: int("revenue").default(0), // in cents
  assignmentFee: int("assignmentFee").default(0), // in cents
  profit: int("profit").default(0), // in cents (calculated as revenue - costs)
  // Dates
  contractDate: timestamp("contractDate"),
  closingDate: timestamp("closingDate"),
  // Notes
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type KpiDeal = typeof kpiDeals.$inferSelect;
export type InsertKpiDeal = typeof kpiDeals.$inferInsert;

/**
 * KPI Goals - tracks goals for campaigns and team members
 */
export const kpiGoals = mysqlTable("kpi_goals", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").references(() => tenants.id).notNull(), // Multi-tenancy
  periodId: int("periodId").references(() => kpiPeriods.id),
  // Goal type
  goalType: mysqlEnum("goalType", ["campaign", "team_member"]).notNull(),
  // For campaign goals
  channel: mysqlEnum("channel", [
    "cold_calls", 
    "sms", 
    "forms", 
    "ppl", 
    "jv", 
    "ppc", 
    "postcards", 
    "referrals",
    "total"
  ]),
  // For team member goals
  teamMemberId: int("teamMemberId").references(() => teamMembers.id),
  // Goal metrics
  metricName: varchar("metricName", { length: 100 }).notNull(), // e.g., "leads", "deals", "revenue"
  targetValue: int("targetValue").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type KpiGoal = typeof kpiGoals.$inferSelect;
export type InsertKpiGoal = typeof kpiGoals.$inferInsert;


/**
 * Lead Gen Staff - tracks lead gen team members who don't need app access
 * Used for KPI tracking only (Cold Callers, SMS team)
 */
export const leadGenStaff = mysqlTable("lead_gen_staff", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").references(() => tenants.id).notNull(), // Multi-tenancy
  name: varchar("name", { length: 255 }).notNull(),
  roleType: mysqlEnum("roleType", ["lg_cold_caller", "lg_sms", "am", "lm"]).notNull(),
  isActive: mysqlEnum("isActive", ["true", "false"]).default("true").notNull(),
  startDate: timestamp("startDate").defaultNow(),
  endDate: timestamp("endDate"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type LeadGenStaff = typeof leadGenStaff.$inferSelect;
export type InsertLeadGenStaff = typeof leadGenStaff.$inferInsert;


/**
 * KPI Markets - configurable markets for campaign tracking
 */
export const kpiMarkets = mysqlTable("kpi_markets", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").references(() => tenants.id).notNull(), // Multi-tenancy
  name: varchar("name", { length: 255 }).notNull(),
  isActive: mysqlEnum("isActive", ["true", "false"]).default("true").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type KpiMarket = typeof kpiMarkets.$inferSelect;
export type InsertKpiMarket = typeof kpiMarkets.$inferInsert;

/**
 * KPI Channels - configurable lead gen channels for campaign tracking
 */
export const kpiChannels = mysqlTable("kpi_channels", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").references(() => tenants.id).notNull(), // Multi-tenancy
  name: varchar("name", { length: 255 }).notNull(),
  code: varchar("code", { length: 50 }).notNull(), // short code like 'cold_calls', 'sms'
  isActive: mysqlEnum("isActive", ["true", "false"]).default("true").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type KpiChannel = typeof kpiChannels.$inferSelect;
export type InsertKpiChannel = typeof kpiChannels.$inferInsert;


// ============ SUBSCRIPTION PRICING ============

/**
 * Subscription Plans - defines available pricing tiers
 */
export const subscriptionPlans = mysqlTable("subscription_plans", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 100 }).notNull(), // "Starter", "Growth", "Scale"
  code: varchar("code", { length: 50 }).notNull().unique(), // "starter", "growth", "scale"
  description: text("description"),
  // Pricing
  priceMonthly: int("priceMonthly").notNull(), // in cents (e.g., 9900 = $99)
  priceYearly: int("priceYearly"), // in cents (optional annual discount)
  // Trial configuration
  trialDays: int("trialDays").notNull().default(14),
  // Stripe Price IDs
  stripePriceIdMonthly: varchar("stripePriceIdMonthly", { length: 255 }),
  stripePriceIdYearly: varchar("stripePriceIdYearly", { length: 255 }),
  // Limits
  maxUsers: int("maxUsers").notNull(), // 3, 10, 999 (unlimited)
  maxCallsPerMonth: int("maxCallsPerMonth").notNull().default(500), // -1 for unlimited
  maxCrmIntegrations: int("maxCrmIntegrations").default(1),
  // Features (JSON array of feature codes)
  features: text("features"),
  // Display options
  isPopular: mysqlEnum("isPopular", ["true", "false"]).default("false"),
  // Status
  isActive: mysqlEnum("isActive", ["true", "false"]).default("true"),
  sortOrder: int("sortOrder").default(0),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type SubscriptionPlan = typeof subscriptionPlans.$inferSelect;
export type InsertSubscriptionPlan = typeof subscriptionPlans.$inferInsert;


// ============ PENDING INVITATIONS ============

/**
 * Pending Invitations - stores invitations for users who haven't signed up yet
 * When a user signs in with a matching email, they're automatically added to the tenant
 */
export const pendingInvitations = mysqlTable("pending_invitations", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").references(() => tenants.id).notNull(),
  email: varchar("email", { length: 320 }).notNull(),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  teamRole: mysqlEnum("teamRole", ["admin", "lead_manager", "acquisition_manager", "lead_generator"]).default("lead_manager").notNull(),
  // Invitation metadata
  invitedBy: int("invitedBy").references(() => users.id),
  inviteToken: varchar("inviteToken", { length: 64 }), // For email invite links
  expiresAt: timestamp("expiresAt"), // Optional expiration
  // Status
  status: mysqlEnum("status", ["pending", "accepted", "expired", "revoked"]).default("pending").notNull(),
  acceptedAt: timestamp("acceptedAt"),
  acceptedByUserId: int("acceptedByUserId").references(() => users.id),
  // Timestamps
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type PendingInvitation = typeof pendingInvitations.$inferSelect;
export type InsertPendingInvitation = typeof pendingInvitations.$inferInsert;


// ============ OUTREACH HISTORY ============

/**
 * Outreach History - tracks churn prevention emails sent to tenants
 * Used to prevent duplicate outreach and measure effectiveness
 */
export const outreachHistory = mysqlTable("outreach_history", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").references(() => tenants.id).notNull(),
  // Email template used
  templateType: mysqlEnum("templateType", ["7_day", "14_day", "30_day", "custom"]).notNull(),
  // Recipient info
  recipientEmail: varchar("recipientEmail", { length: 320 }).notNull(),
  recipientName: varchar("recipientName", { length: 255 }),
  // Context at time of sending
  daysInactive: int("daysInactive").notNull(),
  lastActivityDate: timestamp("lastActivityDate"),
  // Who sent it
  sentByUserId: int("sentByUserId").references(() => users.id),
  sentByName: varchar("sentByName", { length: 255 }),
  // Response tracking
  emailOpened: mysqlEnum("emailOpened", ["true", "false"]).default("false"),
  openedAt: timestamp("openedAt"),
  // Re-engagement tracking
  tenantReactivated: mysqlEnum("tenantReactivated", ["true", "false"]).default("false"),
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
export const apiUsage = mysqlTable("api_usage", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").references(() => tenants.id).notNull(),
  // Usage category
  category: mysqlEnum("category", [
    "ai_chat",           // AI coach chat requests
    "ai_insights",       // AI-generated insights
    "content_generation", // Social media content generation
    "grading",           // Call grading operations
    "api_calls",         // General API calls
  ]).notNull(),
  // Usage count for this period
  count: int("count").default(0).notNull(),
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
 * Includes default trial days and other platform-wide configurations
 */
export const platformSettings = mysqlTable("platform_settings", {
  id: int("id").autoincrement().primaryKey(),
  key: varchar("key", { length: 100 }).notNull().unique(),
  value: text("value").notNull(),
  description: text("description"),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type PlatformSetting = typeof platformSettings.$inferSelect;
export type InsertPlatformSetting = typeof platformSettings.$inferInsert;


/**
 * Email Sent Tracking - tracks which automated emails have been sent to users
 * Prevents duplicate emails and provides audit trail
 */
export const emailsSent = mysqlTable("emails_sent", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").references(() => users.id).notNull(),
  emailId: varchar("emailId", { length: 100 }).notNull(), // e.g., "day1_first_call", "day7_week_recap"
  sentAt: timestamp("sentAt").defaultNow().notNull(),
  // Optional metadata
  loopsEventId: varchar("loopsEventId", { length: 255 }), // Response from Loops API
  status: mysqlEnum("status", ["sent", "failed", "bounced"]).default("sent"),
});

export type EmailSent = typeof emailsSent.$inferSelect;
export type InsertEmailSent = typeof emailsSent.$inferInsert;


/**
 * Opportunities - AI-detected leads that need attention
 * Three tiers: missed (red), warning (yellow), possible (green)
 */
export const opportunities = mysqlTable("opportunities", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").references(() => tenants.id).notNull(),
  contactName: varchar("contactName", { length: 255 }),
  contactPhone: varchar("contactPhone", { length: 50 }),
  propertyAddress: text("propertyAddress"),
  ghlContactId: varchar("ghlContactId", { length: 255 }),
  // GHL pipeline tracking
  ghlOpportunityId: varchar("ghlOpportunityId", { length: 255 }),
  ghlPipelineStageId: varchar("ghlPipelineStageId", { length: 255 }),
  ghlPipelineStageName: varchar("ghlPipelineStageName", { length: 255 }),
  // Detection
  tier: mysqlEnum("tier", ["missed", "warning", "possible"]).notNull(),
  priorityScore: int("priorityScore").notNull().default(0),
  triggerRules: json("triggerRules").$type<string[]>().notNull(),
  reason: text("reason").notNull(),
  suggestion: text("suggestion").notNull(),
  detectionSource: mysqlEnum("detectionSource", ["pipeline", "conversation", "transcript", "hybrid"]).notNull().default("pipeline"),
  relatedCallId: int("relatedCallId").references(() => calls.id),
  teamMemberId: int("teamMemberId").references(() => teamMembers.id),
  teamMemberName: varchar("teamMemberName", { length: 255 }),
  assignedTo: varchar("assignedTo", { length: 255 }),
  status: mysqlEnum("status", ["active", "handled", "dismissed"]).notNull().default("active"),
  dismissReason: mysqlEnum("dismissReason", ["false_positive", "not_a_deal", "already_handled", "duplicate", "other"]),
  dismissNote: text("dismissNote"),
  resolvedBy: int("resolvedBy").references(() => users.id),
  resolvedAt: timestamp("resolvedAt"),
  // Price data extracted from transcripts
  ourOffer: int("ourOffer"),
  sellerAsk: int("sellerAsk"),
  priceGap: int("priceGap"),
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
export const coachActionLog = mysqlTable("coach_action_log", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").references(() => tenants.id).notNull(),
  requestedBy: int("requestedBy").references(() => users.id).notNull(),
  requestedByName: varchar("requestedByName", { length: 255 }),
  actionType: mysqlEnum("actionType", [
    "add_note_contact", "add_note_opportunity", "change_pipeline_stage",
    "send_sms", "create_task", "add_tag", "remove_tag", "update_field"
  ]).notNull(),
  requestText: text("requestText").notNull(),
  targetContactId: varchar("targetContactId", { length: 255 }),
  targetContactName: varchar("targetContactName", { length: 255 }),
  targetOpportunityId: varchar("targetOpportunityId", { length: 255 }),
  payload: json("payload"),
  status: mysqlEnum("status", ["pending", "confirmed", "executed", "failed", "cancelled"]).notNull().default("pending"),
  error: text("error"),
  confirmedAt: timestamp("confirmedAt"),
  executedAt: timestamp("executedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type CoachActionLog = typeof coachActionLog.$inferSelect;
export type InsertCoachActionLog = typeof coachActionLog.$inferInsert;

/**
 * Coach Action Edits - captures before/after for every confirmed action.
 * "before" = the AI-generated draft, "after" = what the user actually sent.
 * wasEdited=false means the user accepted as-is (positive signal).
 */
export const coachActionEdits = mysqlTable("coach_action_edits", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").references(() => tenants.id).notNull(),
  userId: int("userId").references(() => users.id).notNull(),
  actionLogId: int("actionLogId").references(() => coachActionLog.id).notNull(),
  // What kind of content this is
  category: mysqlEnum("category", [
    "sms",       // SMS message text
    "note",      // Contact/opportunity note body
    "task",      // Task title + description
  ]).notNull(),
  // The AI-generated draft
  draftContent: text("draftContent").notNull(),
  // What the user actually confirmed (may be identical to draft)
  finalContent: text("finalContent").notNull(),
  // Did the user change anything?
  wasEdited: mysqlEnum("wasEdited", ["true", "false"]).default("false").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type CoachActionEdit = typeof coachActionEdits.$inferSelect;
export type InsertCoachActionEdit = typeof coachActionEdits.$inferInsert;

/**
 * AI Coach Preferences - per-user (or per-tenant team-wide) style profiles.
 * Built by aggregating coach_action_edits patterns.
 * One row per user+category. userId=NULL means team-wide default.
 */
export const aiCoachPreferences = mysqlTable("ai_coach_preferences", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").references(() => tenants.id).notNull(),
  // NULL userId = team-wide default profile
  userId: int("userId").references(() => users.id),
  // Category of preference (one row per category per user)
  category: mysqlEnum("pref_category", [
    "sms_style",         // How they write SMS messages
    "note_style",        // How they write contact/opportunity notes
    "task_style",        // How they name and describe tasks
  ]).notNull(),
  // LLM-generated summary of the user's style
  // e.g. "Prefers shorter SMS. Always removes exclamation marks. Adds property address to task titles."
  styleSummary: text("styleSummary").notNull(),
  // JSON array of up to 5 recent final-content examples for few-shot prompting
  recentExamples: text("recentExamples"),
  // How many edits contributed to this preference
  sampleCount: int("sampleCount").default(0).notNull(),
  // Timestamps
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type AiCoachPreference = typeof aiCoachPreferences.$inferSelect;
export type InsertAiCoachPreference = typeof aiCoachPreferences.$inferInsert;

/**
 * AI Coach Messages - persists Q&A exchanges for conversation memory.
 * The UI always starts fresh, but the coach uses recent past messages
 * as context to provide better coaching continuity.
 * Each row is one message (user question or assistant answer).
 */
export const coachMessages = mysqlTable("coach_messages", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").references(() => tenants.id).notNull(),
  userId: int("userId").references(() => users.id).notNull(),
  // "user" for questions, "assistant" for answers
  role: mysqlEnum("coach_msg_role", ["user", "assistant"]).notNull(),
  content: text("content").notNull(),
  // Optional: link messages in the same exchange (question + answer share same exchangeId)
  exchangeId: varchar("exchangeId", { length: 36 }).notNull(),
  // Timestamps
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type CoachMessage = typeof coachMessages.$inferSelect;
export type InsertCoachMessage = typeof coachMessages.$inferInsert;
