import { int, mysqlEnum, mysqlTable, text, timestamp, varchar, json, decimal } from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 * Extended with team role for call coaching platform.
 */
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  // Team role for call coaching
  teamRole: mysqlEnum("teamRole", ["admin", "lead_manager", "acquisition_manager"]).default("lead_manager"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/**
 * Team members table for pre-configured team (Chris, Daniel, Kyle)
 * These are mapped to users when they log in
 */
export const teamMembers = mysqlTable("team_members", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  teamRole: mysqlEnum("teamRole", ["admin", "lead_manager", "acquisition_manager"]).notNull(),
  userId: int("userId").references(() => users.id),
  ghlUserId: varchar("ghlUserId", { length: 255 }), // GoHighLevel user ID for matching
  isActive: mysqlEnum("isActive", ["true", "false"]).default("true"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type TeamMember = typeof teamMembers.$inferSelect;
export type InsertTeamMember = typeof teamMembers.$inferInsert;

/**
 * Calls table - stores incoming calls from GHL webhook
 */
export const calls = mysqlTable("calls", {
  id: int("id").autoincrement().primaryKey(),
  // GHL webhook data
  ghlCallId: varchar("ghlCallId", { length: 255 }).unique(),
  ghlContactId: varchar("ghlContactId", { length: 255 }),
  ghlLocationId: varchar("ghlLocationId", { length: 255 }),
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
  // Call type determines which rubric to use
  callType: mysqlEnum("callType", ["qualification", "offer"]).default("qualification"),
  // Call outcome - what was achieved on this call
  callOutcome: mysqlEnum("callOutcome", ["none", "appointment_set", "offer_accepted", "offer_rejected", "follow_up", "disqualified"]).default("none"),
  // Call classification - determines if call should be graded
  classification: mysqlEnum("classification", ["pending", "conversation", "voicemail", "no_answer", "callback_request", "wrong_number", "too_short"]).default("pending"),
  classificationReason: text("classificationReason"), // AI explanation for classification
  // Processing status
  status: mysqlEnum("status", ["pending", "transcribing", "classifying", "grading", "completed", "skipped", "failed"]).default("pending"),
  // Transcript
  transcript: text("transcript"),
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
  // Summary
  summary: text("summary"),
  // Which rubric was used
  rubricType: mysqlEnum("rubricType", ["lead_manager", "acquisition_manager"]).notNull(),
  // Timestamps
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type CallGrade = typeof callGrades.$inferSelect;
export type InsertCallGrade = typeof callGrades.$inferInsert;

/**
 * Performance metrics - aggregated stats for leaderboard
 */
export const performanceMetrics = mysqlTable("performance_metrics", {
  id: int("id").autoincrement().primaryKey(),
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
  // Which role this applies to
  applicableTo: mysqlEnum("applicableTo", ["all", "lead_manager", "acquisition_manager"]).default("all"),
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
  // Rule info
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  // The rule itself - natural language instruction for the AI
  ruleText: text("ruleText").notNull(),
  // Priority (higher = more important)
  priority: int("priority").default(0),
  // Which rubric this applies to
  applicableTo: mysqlEnum("applicableTo", ["all", "lead_manager", "acquisition_manager"]).default("all"),
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
