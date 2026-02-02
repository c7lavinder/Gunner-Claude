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
