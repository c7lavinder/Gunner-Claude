import { eq, desc, and, gte, lte, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { 
  InsertUser, users, calls, callGrades, teamMembers, performanceMetrics, 
  InsertCall, InsertCallGrade, InsertTeamMember, Call, CallGrade, TeamMember,
  trainingMaterials, aiFeedback, gradingRules, teamTrainingItems,
  InsertTrainingMaterial, InsertAIFeedback, InsertGradingRule,
  TrainingMaterial, AIFeedback, GradingRule,
  TeamTrainingItem, InsertTeamTrainingItem,
  brandAssets, socialPosts, contentIdeas, brandProfile,
  InsertBrandAsset, InsertSocialPost, InsertContentIdea,
  BrandAsset, SocialPost, ContentIdea, BrandProfile, InsertBrandProfile
} from "../drizzle/schema";
import { ENV } from './_core/env';

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

// ============ USER FUNCTIONS ============

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = 'admin';
      updateSet.role = 'admin';
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);

  return result.length > 0 ? result[0] : undefined;
}

// ============ TEAM MEMBER FUNCTIONS ============

export async function createTeamMember(member: InsertTeamMember): Promise<TeamMember | null> {
  const db = await getDb();
  if (!db) return null;

  await db.insert(teamMembers).values(member);
  const result = await db.select().from(teamMembers).where(eq(teamMembers.name, member.name)).limit(1);
  return result[0] || null;
}

export async function getTeamMembers(): Promise<TeamMember[]> {
  const db = await getDb();
  if (!db) return [];

  return await db.select().from(teamMembers).where(eq(teamMembers.isActive, "true"));
}

export async function getTeamMemberById(id: number): Promise<TeamMember | null> {
  const db = await getDb();
  if (!db) return null;

  const result = await db.select().from(teamMembers).where(eq(teamMembers.id, id)).limit(1);
  return result[0] || null;
}

export async function getTeamMemberByName(name: string): Promise<TeamMember | null> {
  const db = await getDb();
  if (!db) return null;

  const result = await db.select().from(teamMembers).where(eq(teamMembers.name, name)).limit(1);
  return result[0] || null;
}

export async function getTeamMemberByGhlUserId(ghlUserId: string): Promise<TeamMember | null> {
  const db = await getDb();
  if (!db) return null;

  const result = await db.select().from(teamMembers).where(eq(teamMembers.ghlUserId, ghlUserId)).limit(1);
  return result[0] || null;
}

export async function updateTeamMemberUserId(teamMemberId: number, userId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;

  await db.update(teamMembers).set({ userId }).where(eq(teamMembers.id, teamMemberId));
}

// ============ CALL FUNCTIONS ============

export async function createCall(call: InsertCall): Promise<Call | null> {
  const db = await getDb();
  if (!db) return null;

  const result = await db.insert(calls).values(call);
  const insertId = result[0].insertId;
  const created = await db.select().from(calls).where(eq(calls.id, insertId)).limit(1);
  return created[0] || null;
}

export async function getCallById(id: number): Promise<Call | null> {
  const db = await getDb();
  if (!db) return null;

  const result = await db.select().from(calls).where(eq(calls.id, id)).limit(1);
  return result[0] || null;
}

export async function getCallByGhlId(ghlCallId: string): Promise<Call | null> {
  const db = await getDb();
  if (!db) return null;

  const result = await db.select().from(calls).where(eq(calls.ghlCallId, ghlCallId)).limit(1);
  return result[0] || null;
}

export async function updateCall(id: number, updates: Partial<InsertCall>): Promise<void> {
  const db = await getDb();
  if (!db) return;

  await db.update(calls).set(updates).where(eq(calls.id, id));
}

export async function getCalls(options: {
  teamMemberId?: number;
  status?: string;
  limit?: number;
  offset?: number;
}): Promise<Call[]> {
  const db = await getDb();
  if (!db) return [];

  let query = db.select().from(calls);
  
  const conditions = [];
  if (options.teamMemberId) {
    conditions.push(eq(calls.teamMemberId, options.teamMemberId));
  }
  if (options.status) {
    conditions.push(eq(calls.status, options.status as any));
  }

  if (conditions.length > 0) {
    query = query.where(and(...conditions)) as any;
  }

  return await query
    .orderBy(desc(calls.createdAt))
    .limit(options.limit || 50)
    .offset(options.offset || 0);
}

export async function getRecentCalls(limit: number = 20): Promise<Call[]> {
  const db = await getDb();
  if (!db) return [];

  return await db.select().from(calls)
    .orderBy(desc(calls.createdAt))
    .limit(limit);
}

export async function getPendingCalls(): Promise<Call[]> {
  const db = await getDb();
  if (!db) return [];

  return await db.select().from(calls)
    .where(eq(calls.status, "pending"))
    .orderBy(calls.createdAt);
}

// ============ CALL GRADE FUNCTIONS ============

export async function createCallGrade(grade: InsertCallGrade): Promise<CallGrade | null> {
  const db = await getDb();
  if (!db) return null;

  const result = await db.insert(callGrades).values(grade);
  const insertId = result[0].insertId;
  const created = await db.select().from(callGrades).where(eq(callGrades.id, insertId)).limit(1);
  return created[0] || null;
}

export async function getCallGradeByCallId(callId: number): Promise<CallGrade | null> {
  const db = await getDb();
  if (!db) return null;

  const result = await db.select().from(callGrades).where(eq(callGrades.callId, callId)).limit(1);
  return result[0] || null;
}

export async function getCallsWithGrades(options: {
  teamMemberId?: number;
  limit?: number;
  offset?: number;
}): Promise<Array<Call & { grade: CallGrade | null }>> {
  const db = await getDb();
  if (!db) return [];

  const callsList = await getCalls(options);
  
  const result = await Promise.all(
    callsList.map(async (call) => {
      const grade = await getCallGradeByCallId(call.id);
      return { ...call, grade };
    })
  );

  return result;
}

// ============ LEADERBOARD FUNCTIONS ============

export async function getLeaderboardData(): Promise<Array<{
  teamMember: TeamMember;
  totalCalls: number;
  gradedCalls: number;
  skippedCalls: number;
  averageScore: number;
  appointmentsSet: number;
  offersAccepted: number;
  abScoredCalls: number;
  gradeDistribution: { A: number; B: number; C: number; D: number; F: number };
}>> {
  const db = await getDb();
  if (!db) return [];

  const members = await getTeamMembers();
  
  const leaderboard = await Promise.all(
    members.map(async (member) => {
      // Get all calls for this member
      const memberCalls = await db.select().from(calls)
        .where(eq(calls.teamMemberId, member.id));
      
      // Only count completed (graded) calls for leaderboard
      const gradedCalls = memberCalls.filter(c => c.status === "completed" && c.classification === "conversation");
      const skippedCalls = memberCalls.filter(c => c.status === "skipped");
      
      // Count appointments and offers
      const appointmentsSet = memberCalls.filter(c => c.callOutcome === "appointment_set").length;
      const offersAccepted = memberCalls.filter(c => c.callOutcome === "offer_accepted").length;
      
      const grades = await Promise.all(
        gradedCalls.map(async (call) => {
          return await getCallGradeByCallId(call.id);
        })
      );

      const validGrades = grades.filter((g): g is CallGrade => g !== null);
      
      const gradeDistribution = { A: 0, B: 0, C: 0, D: 0, F: 0 };
      let totalScore = 0;

      validGrades.forEach((grade) => {
        if (grade.overallGrade) {
          gradeDistribution[grade.overallGrade as keyof typeof gradeDistribution]++;
        }
        if (grade.overallScore) {
          totalScore += parseFloat(grade.overallScore);
        }
      });
      
      // Count A and B scored calls
      const abScoredCalls = gradeDistribution.A + gradeDistribution.B;

      return {
        teamMember: member,
        totalCalls: memberCalls.length,
        gradedCalls: gradedCalls.length,
        skippedCalls: skippedCalls.length,
        averageScore: validGrades.length > 0 ? totalScore / validGrades.length : 0,
        appointmentsSet,
        offersAccepted,
        abScoredCalls,
        gradeDistribution,
      };
    })
  );

  return leaderboard.sort((a, b) => b.averageScore - a.averageScore);
}

// ============ ANALYTICS FUNCTIONS ============

export async function getCallStats(options?: {
  dateRange?: "today" | "week" | "month" | "ytd" | "all";
}): Promise<{
  totalCalls: number;
  gradedCalls: number;
  skippedCalls: number;
  pendingCalls: number;
  averageScore: number;
  callsToday: number;
  callsThisWeek: number;
  gradedToday: number;
  skippedToday: number;
  appointmentsSet: number;
  offersAccepted: number;
  classificationBreakdown: {
    conversation: number;
    voicemail: number;
    no_answer: number;
    callback_request: number;
    wrong_number: number;
    too_short: number;
  };
}> {
  const db = await getDb();
  if (!db) return {
    totalCalls: 0,
    gradedCalls: 0,
    skippedCalls: 0,
    pendingCalls: 0,
    averageScore: 0,
    callsToday: 0,
    callsThisWeek: 0,
    gradedToday: 0,
    skippedToday: 0,
    appointmentsSet: 0,
    offersAccepted: 0,
    classificationBreakdown: {
      conversation: 0,
      voicemail: 0,
      no_answer: 0,
      callback_request: 0,
      wrong_number: 0,
      too_short: 0,
    },
  };

  // Calculate date range
  const now = new Date();
  let startDate: Date | null = null;
  
  switch (options?.dateRange) {
    case "today":
      startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate()); // Start of today
      break;
    case "week":
      startDate = new Date(now);
      startDate.setDate(startDate.getDate() - 7);
      break;
    case "month":
      startDate = new Date(now);
      startDate.setMonth(startDate.getMonth() - 1);
      break;
    case "ytd":
      startDate = new Date(now.getFullYear(), 0, 1); // January 1st of current year
      break;
    case "all":
    default:
      startDate = null;
      break;
  }

  // Get calls with optional date filter
  let allCalls: Call[];
  if (startDate) {
    allCalls = await db.select().from(calls).where(gte(calls.createdAt, startDate));
  } else {
    allCalls = await db.select().from(calls);
  }
  const gradedCalls = allCalls.filter(c => c.status === "completed" && c.classification === "conversation");
  const skippedCalls = allCalls.filter(c => c.status === "skipped");
  const pendingCalls = allCalls.filter(c => c.status === "pending" || c.status === "transcribing" || c.status === "classifying" || c.status === "grading");

  // Only count grades from graded conversations
  const grades = await db.select().from(callGrades);
  const totalScore = grades.reduce((sum, g) => sum + (parseFloat(g.overallScore || "0")), 0);
  const averageScore = grades.length > 0 ? totalScore / grades.length : 0;

  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const weekStart = new Date(todayStart);
  weekStart.setDate(weekStart.getDate() - 7);

  const callsToday = allCalls.filter(c => c.createdAt >= todayStart).length;
  const callsThisWeek = allCalls.filter(c => c.createdAt >= weekStart).length;
  const gradedToday = gradedCalls.filter(c => c.createdAt >= todayStart).length;
  const skippedToday = skippedCalls.filter(c => c.createdAt >= todayStart).length;

  // Classification breakdown
  const classificationBreakdown = {
    conversation: allCalls.filter(c => c.classification === "conversation").length,
    voicemail: allCalls.filter(c => c.classification === "voicemail").length,
    no_answer: allCalls.filter(c => c.classification === "no_answer").length,
    callback_request: allCalls.filter(c => c.classification === "callback_request").length,
    wrong_number: allCalls.filter(c => c.classification === "wrong_number").length,
    too_short: allCalls.filter(c => c.classification === "too_short").length,
  };

  // Count outcomes
  const appointmentsSet = allCalls.filter(c => c.callOutcome === "appointment_set").length;
  const offersAccepted = allCalls.filter(c => c.callOutcome === "offer_accepted").length;

  return {
    totalCalls: allCalls.length,
    gradedCalls: gradedCalls.length,
    skippedCalls: skippedCalls.length,
    pendingCalls: pendingCalls.length,
    averageScore,
    callsToday,
    callsThisWeek,
    gradedToday,
    skippedToday,
    appointmentsSet,
    offersAccepted,
    classificationBreakdown,
  };
}

// ============ SEED DATA ============

export async function seedTeamMembers(): Promise<void> {
  const db = await getDb();
  if (!db) return;

  const existingMembers = await getTeamMembers();
  if (existingMembers.length > 0) return;

  const defaultMembers: InsertTeamMember[] = [
    { name: "Chris", teamRole: "lead_manager" },
    { name: "Daniel", teamRole: "lead_manager" },
    { name: "Kyle", teamRole: "acquisition_manager" },
  ];

  for (const member of defaultMembers) {
    await createTeamMember(member);
  }

  console.log("[Database] Seeded default team members");
}


// ============ TRAINING MATERIALS FUNCTIONS ============

export async function createTrainingMaterial(material: InsertTrainingMaterial): Promise<TrainingMaterial | null> {
  const db = await getDb();
  if (!db) return null;

  const result = await db.insert(trainingMaterials).values(material);
  const insertId = result[0].insertId;
  const created = await db.select().from(trainingMaterials).where(eq(trainingMaterials.id, insertId)).limit(1);
  return created[0] || null;
}

export async function getTrainingMaterials(options?: {
  category?: string;
  applicableTo?: string;
  activeOnly?: boolean;
}): Promise<TrainingMaterial[]> {
  const db = await getDb();
  if (!db) return [];

  const conditions = [];
  
  if (options?.activeOnly !== false) {
    conditions.push(eq(trainingMaterials.isActive, "true"));
  }
  if (options?.category) {
    conditions.push(eq(trainingMaterials.category, options.category as any));
  }
  if (options?.applicableTo) {
    conditions.push(eq(trainingMaterials.applicableTo, options.applicableTo as any));
  }

  let query = db.select().from(trainingMaterials);
  if (conditions.length > 0) {
    query = query.where(and(...conditions)) as any;
  }

  return await query.orderBy(desc(trainingMaterials.createdAt));
}

export async function getTrainingMaterialById(id: number): Promise<TrainingMaterial | null> {
  const db = await getDb();
  if (!db) return null;

  const result = await db.select().from(trainingMaterials).where(eq(trainingMaterials.id, id)).limit(1);
  return result[0] || null;
}

export async function updateTrainingMaterial(id: number, updates: Partial<InsertTrainingMaterial>): Promise<void> {
  const db = await getDb();
  if (!db) return;

  await db.update(trainingMaterials).set(updates).where(eq(trainingMaterials.id, id));
}

export async function deleteTrainingMaterial(id: number): Promise<void> {
  const db = await getDb();
  if (!db) return;

  // Soft delete by setting isActive to false
  await db.update(trainingMaterials).set({ isActive: "false" }).where(eq(trainingMaterials.id, id));
}

// ============ AI FEEDBACK FUNCTIONS ============

export async function createAIFeedback(feedback: InsertAIFeedback): Promise<AIFeedback | null> {
  const db = await getDb();
  if (!db) return null;

  const result = await db.insert(aiFeedback).values(feedback);
  const insertId = result[0].insertId;
  const created = await db.select().from(aiFeedback).where(eq(aiFeedback.id, insertId)).limit(1);
  return created[0] || null;
}

export async function getAIFeedback(options?: {
  callId?: number;
  status?: string;
  limit?: number;
}): Promise<AIFeedback[]> {
  const db = await getDb();
  if (!db) return [];

  const conditions = [];
  
  if (options?.callId) {
    conditions.push(eq(aiFeedback.callId, options.callId));
  }
  if (options?.status) {
    conditions.push(eq(aiFeedback.status, options.status as any));
  }

  let query = db.select().from(aiFeedback);
  if (conditions.length > 0) {
    query = query.where(and(...conditions)) as any;
  }

  return await query.orderBy(desc(aiFeedback.createdAt)).limit(options?.limit || 100);
}

export async function getAIFeedbackById(id: number): Promise<AIFeedback | null> {
  const db = await getDb();
  if (!db) return null;

  const result = await db.select().from(aiFeedback).where(eq(aiFeedback.id, id)).limit(1);
  return result[0] || null;
}

export async function updateAIFeedback(id: number, updates: Partial<InsertAIFeedback>): Promise<void> {
  const db = await getDb();
  if (!db) return;

  await db.update(aiFeedback).set(updates).where(eq(aiFeedback.id, id));
}

export async function getPendingFeedbackForGrading(): Promise<AIFeedback[]> {
  const db = await getDb();
  if (!db) return [];

  return await db.select().from(aiFeedback)
    .where(eq(aiFeedback.status, "incorporated"))
    .orderBy(desc(aiFeedback.createdAt))
    .limit(50);
}

// ============ GRADING RULES FUNCTIONS ============

export async function createGradingRule(rule: InsertGradingRule): Promise<GradingRule | null> {
  const db = await getDb();
  if (!db) return null;

  const result = await db.insert(gradingRules).values(rule);
  const insertId = result[0].insertId;
  const created = await db.select().from(gradingRules).where(eq(gradingRules.id, insertId)).limit(1);
  return created[0] || null;
}

export async function getGradingRules(options?: {
  applicableTo?: string;
  activeOnly?: boolean;
}): Promise<GradingRule[]> {
  const db = await getDb();
  if (!db) return [];

  const conditions = [];
  
  if (options?.activeOnly !== false) {
    conditions.push(eq(gradingRules.isActive, "true"));
  }
  if (options?.applicableTo) {
    conditions.push(eq(gradingRules.applicableTo, options.applicableTo as any));
  }

  let query = db.select().from(gradingRules);
  if (conditions.length > 0) {
    query = query.where(and(...conditions)) as any;
  }

  return await query.orderBy(desc(gradingRules.priority));
}

export async function updateGradingRule(id: number, updates: Partial<InsertGradingRule>): Promise<void> {
  const db = await getDb();
  if (!db) return;

  await db.update(gradingRules).set(updates).where(eq(gradingRules.id, id));
}

export async function deleteGradingRule(id: number): Promise<void> {
  const db = await getDb();
  if (!db) return;

  await db.update(gradingRules).set({ isActive: "false" }).where(eq(gradingRules.id, id));
}

// ============ GET GRADING CONTEXT ============

/**
 * Get all active training materials and rules for grading context
 */
export async function getGradingContext(callType: "qualification" | "offer"): Promise<{
  trainingMaterials: TrainingMaterial[];
  gradingRules: GradingRule[];
  recentFeedback: AIFeedback[];
}> {
  const applicableTo = callType === "qualification" ? "lead_manager" : "acquisition_manager";
  
  // Get training materials applicable to this call type or all
  const materials = await getTrainingMaterials({ activeOnly: true });
  const filteredMaterials = materials.filter(m => 
    m.applicableTo === "all" || m.applicableTo === applicableTo
  );

  // Get grading rules applicable to this call type or all
  const rules = await getGradingRules({ activeOnly: true });
  const filteredRules = rules.filter(r => 
    r.applicableTo === "all" || r.applicableTo === applicableTo
  );

  // Get recent incorporated feedback for learning
  const feedback = await getPendingFeedbackForGrading();

  return {
    trainingMaterials: filteredMaterials,
    gradingRules: filteredRules,
    recentFeedback: feedback,
  };
}


// ============ TEAM TRAINING ITEMS FUNCTIONS ============

export async function createTeamTrainingItem(item: InsertTeamTrainingItem): Promise<TeamTrainingItem | null> {
  const db = await getDb();
  if (!db) return null;

  const result = await db.insert(teamTrainingItems).values(item);
  const insertId = result[0].insertId;
  const created = await db.select().from(teamTrainingItems).where(eq(teamTrainingItems.id, insertId)).limit(1);
  return created[0] || null;
}

export async function getTeamTrainingItems(options?: {
  itemType?: "skill" | "issue" | "win" | "agenda";
  status?: "active" | "in_progress" | "completed" | "archived";
  teamMemberId?: number;
  meetingDate?: Date;
}): Promise<TeamTrainingItem[]> {
  const db = await getDb();
  if (!db) return [];

  const conditions = [];
  
  if (options?.itemType) {
    conditions.push(eq(teamTrainingItems.itemType, options.itemType));
  }
  if (options?.status) {
    conditions.push(eq(teamTrainingItems.status, options.status));
  }
  if (options?.teamMemberId) {
    conditions.push(eq(teamTrainingItems.teamMemberId, options.teamMemberId));
  }

  let query = db.select().from(teamTrainingItems);
  
  if (conditions.length > 0) {
    query = query.where(and(...conditions)) as any;
  }

  return await query.orderBy(desc(teamTrainingItems.createdAt));
}

export async function getTeamTrainingItemById(id: number): Promise<TeamTrainingItem | null> {
  const db = await getDb();
  if (!db) return null;

  const result = await db.select().from(teamTrainingItems).where(eq(teamTrainingItems.id, id)).limit(1);
  return result[0] || null;
}

export async function updateTeamTrainingItem(id: number, updates: Partial<InsertTeamTrainingItem>): Promise<void> {
  const db = await getDb();
  if (!db) return;

  await db.update(teamTrainingItems).set(updates).where(eq(teamTrainingItems.id, id));
}

export async function deleteTeamTrainingItem(id: number): Promise<void> {
  const db = await getDb();
  if (!db) return;

  await db.delete(teamTrainingItems).where(eq(teamTrainingItems.id, id));
}

export async function getActiveTrainingItems(): Promise<{
  skills: TeamTrainingItem[];
  issues: TeamTrainingItem[];
  wins: TeamTrainingItem[];
  agenda: TeamTrainingItem[];
}> {
  const db = await getDb();
  if (!db) return { skills: [], issues: [], wins: [], agenda: [] };

  const activeItems = await db.select().from(teamTrainingItems)
    .where(
      and(
        eq(teamTrainingItems.status, "active"),
      )
    )
    .orderBy(teamTrainingItems.sortOrder);

  return {
    skills: activeItems.filter(i => i.itemType === "skill"),
    issues: activeItems.filter(i => i.itemType === "issue"),
    wins: activeItems.filter(i => i.itemType === "win"),
    agenda: activeItems.filter(i => i.itemType === "agenda"),
  };
}

export async function getUpcomingMeetingAgenda(meetingDate?: Date): Promise<TeamTrainingItem[]> {
  const db = await getDb();
  if (!db) return [];

  // Get agenda items, optionally filtered by meeting date
  const conditions = [eq(teamTrainingItems.itemType, "agenda")];
  
  if (meetingDate) {
    conditions.push(eq(teamTrainingItems.meetingDate, meetingDate));
  }

  return await db.select().from(teamTrainingItems)
    .where(and(...conditions))
    .orderBy(teamTrainingItems.sortOrder);
}


// ============ BRAND ASSETS FUNCTIONS ============

export async function createBrandAsset(asset: InsertBrandAsset): Promise<BrandAsset | null> {
  const db = await getDb();
  if (!db) return null;

  const result = await db.insert(brandAssets).values(asset);
  const insertId = result[0].insertId;
  const created = await db.select().from(brandAssets).where(eq(brandAssets.id, insertId)).limit(1);
  return created[0] || null;
}

export async function getBrandAssets(options?: {
  assetType?: string;
  activeOnly?: boolean;
}): Promise<BrandAsset[]> {
  const db = await getDb();
  if (!db) return [];

  const conditions = [];
  
  if (options?.activeOnly !== false) {
    conditions.push(eq(brandAssets.isActive, "true"));
  }
  if (options?.assetType) {
    conditions.push(eq(brandAssets.assetType, options.assetType as any));
  }

  let query = db.select().from(brandAssets);
  if (conditions.length > 0) {
    query = query.where(and(...conditions)) as any;
  }

  return await query.orderBy(desc(brandAssets.createdAt));
}

export async function getBrandAssetById(id: number): Promise<BrandAsset | null> {
  const db = await getDb();
  if (!db) return null;

  const result = await db.select().from(brandAssets).where(eq(brandAssets.id, id)).limit(1);
  return result[0] || null;
}

export async function updateBrandAsset(id: number, updates: Partial<InsertBrandAsset>): Promise<void> {
  const db = await getDb();
  if (!db) return;

  await db.update(brandAssets).set(updates).where(eq(brandAssets.id, id));
}

export async function deleteBrandAsset(id: number): Promise<void> {
  const db = await getDb();
  if (!db) return;

  await db.update(brandAssets).set({ isActive: "false" }).where(eq(brandAssets.id, id));
}

// ============ SOCIAL POSTS FUNCTIONS ============

export async function createSocialPost(post: InsertSocialPost): Promise<SocialPost | null> {
  const db = await getDb();
  if (!db) return null;

  const result = await db.insert(socialPosts).values(post);
  const insertId = result[0].insertId;
  const created = await db.select().from(socialPosts).where(eq(socialPosts.id, insertId)).limit(1);
  return created[0] || null;
}

export async function getSocialPosts(options?: {
  contentType?: "brand" | "creator";
  platform?: string;
  status?: string;
  startDate?: Date;
  endDate?: Date;
}): Promise<SocialPost[]> {
  const db = await getDb();
  if (!db) return [];

  const conditions = [];
  
  if (options?.contentType) {
    conditions.push(eq(socialPosts.contentType, options.contentType));
  }
  if (options?.platform) {
    conditions.push(eq(socialPosts.platform, options.platform as any));
  }
  if (options?.status) {
    conditions.push(eq(socialPosts.status, options.status as any));
  }
  if (options?.startDate) {
    conditions.push(gte(socialPosts.scheduledAt, options.startDate));
  }
  if (options?.endDate) {
    conditions.push(lte(socialPosts.scheduledAt, options.endDate));
  }

  let query = db.select().from(socialPosts);
  if (conditions.length > 0) {
    query = query.where(and(...conditions)) as any;
  }

  return await query.orderBy(desc(socialPosts.createdAt));
}

export async function getSocialPostById(id: number): Promise<SocialPost | null> {
  const db = await getDb();
  if (!db) return null;

  const result = await db.select().from(socialPosts).where(eq(socialPosts.id, id)).limit(1);
  return result[0] || null;
}

export async function updateSocialPost(id: number, updates: Partial<InsertSocialPost>): Promise<void> {
  const db = await getDb();
  if (!db) return;

  await db.update(socialPosts).set(updates).where(eq(socialPosts.id, id));
}

export async function deleteSocialPost(id: number): Promise<void> {
  const db = await getDb();
  if (!db) return;

  await db.delete(socialPosts).where(eq(socialPosts.id, id));
}

export async function getScheduledPosts(startDate: Date, endDate: Date): Promise<SocialPost[]> {
  const db = await getDb();
  if (!db) return [];

  return await db.select().from(socialPosts)
    .where(
      and(
        gte(socialPosts.scheduledAt, startDate),
        lte(socialPosts.scheduledAt, endDate),
        eq(socialPosts.status, "scheduled")
      )
    )
    .orderBy(socialPosts.scheduledAt);
}

export async function getCalendarPosts(startDate: Date, endDate: Date): Promise<SocialPost[]> {
  const db = await getDb();
  if (!db) return [];

  // Get all posts (scheduled, published, draft) within the date range for calendar view
  return await db.select().from(socialPosts)
    .where(
      and(
        gte(socialPosts.scheduledAt, startDate),
        lte(socialPosts.scheduledAt, endDate)
      )
    )
    .orderBy(socialPosts.scheduledAt);
}

// ============ CONTENT IDEAS FUNCTIONS ============

export async function createContentIdea(idea: InsertContentIdea): Promise<ContentIdea | null> {
  const db = await getDb();
  if (!db) return null;

  const result = await db.insert(contentIdeas).values(idea);
  const insertId = result[0].insertId;
  const created = await db.select().from(contentIdeas).where(eq(contentIdeas.id, insertId)).limit(1);
  return created[0] || null;
}

export async function getContentIdeas(options?: {
  status?: string;
  targetPlatform?: string;
}): Promise<ContentIdea[]> {
  const db = await getDb();
  if (!db) return [];

  const conditions = [];
  
  if (options?.status) {
    conditions.push(eq(contentIdeas.status, options.status as any));
  }
  if (options?.targetPlatform) {
    conditions.push(eq(contentIdeas.targetPlatform, options.targetPlatform as any));
  }

  let query = db.select().from(contentIdeas);
  if (conditions.length > 0) {
    query = query.where(and(...conditions)) as any;
  }

  return await query.orderBy(desc(contentIdeas.createdAt));
}

export async function getContentIdeaById(id: number): Promise<ContentIdea | null> {
  const db = await getDb();
  if (!db) return null;

  const result = await db.select().from(contentIdeas).where(eq(contentIdeas.id, id)).limit(1);
  return result[0] || null;
}

export async function updateContentIdea(id: number, updates: Partial<InsertContentIdea>): Promise<void> {
  const db = await getDb();
  if (!db) return;

  await db.update(contentIdeas).set(updates).where(eq(contentIdeas.id, id));
}

export async function deleteContentIdea(id: number): Promise<void> {
  const db = await getDb();
  if (!db) return;

  await db.delete(contentIdeas).where(eq(contentIdeas.id, id));
}


// ============ BRAND PROFILE FUNCTIONS ============

export async function getBrandProfile(): Promise<BrandProfile | null> {
  const db = await getDb();
  if (!db) return null;

  const result = await db.select().from(brandProfile).limit(1);
  return result[0] || null;
}

export async function upsertBrandProfile(profile: Partial<InsertBrandProfile>): Promise<BrandProfile | null> {
  const db = await getDb();
  if (!db) return null;

  // Check if profile exists
  const existing = await getBrandProfile();
  
  if (existing) {
    // Update existing profile
    await db.update(brandProfile).set(profile).where(eq(brandProfile.id, existing.id));
    return await getBrandProfile();
  } else {
    // Create new profile
    const result = await db.insert(brandProfile).values(profile as InsertBrandProfile);
    const insertId = result[0].insertId;
    const created = await db.select().from(brandProfile).where(eq(brandProfile.id, insertId)).limit(1);
    return created[0] || null;
  }
}

// ============ CONTENT GENERATION DATA HELPERS ============

/**
 * Get recent call conversations for content generation
 * Returns interesting/notable calls with transcripts
 */
export async function getCallsForContentGeneration(limit: number = 20): Promise<Array<{
  id: number;
  transcript: string | null;
  contactName: string | null;
  teamMemberName: string | null;
  overallScore: string | null;
  strengths: string | null;
  improvements: string | null;
  callOutcome: string | null;
  duration: number | null;
}>> {
  const db = await getDb();
  if (!db) return [];

  const result = await db
    .select({
      id: calls.id,
      transcript: calls.transcript,
      contactName: calls.contactName,
      teamMemberName: teamMembers.name,
      overallScore: callGrades.overallScore,
      strengths: callGrades.strengths,
      improvements: callGrades.improvements,
      callOutcome: calls.callOutcome,
      duration: calls.duration,
    })
    .from(calls)
    .leftJoin(callGrades, eq(calls.id, callGrades.callId))
    .leftJoin(teamMembers, eq(calls.teamMemberId, teamMembers.id))
    .where(
      and(
        eq(calls.classification, "conversation"),
        eq(calls.status, "completed")
      )
    )
    .orderBy(desc(calls.createdAt))
    .limit(limit);

  return result.map(r => ({
    ...r,
    strengths: r.strengths as string | null,
    improvements: r.improvements as string | null,
    callOutcome: r.callOutcome as string | null,
  }));
}

/**
 * Get business KPIs for content generation
 */
export async function getKPIsForContentGeneration(): Promise<{
  totalDeals: number;
  appointmentsThisMonth: number;
  offersAcceptedThisMonth: number;
  averageScore: number | null;
  topPerformer: string | null;
}> {
  const db = await getDb();
  if (!db) return {
    totalDeals: 0,
    appointmentsThisMonth: 0,
    offersAcceptedThisMonth: 0,
    averageScore: null,
    topPerformer: null,
  };

  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  // Get total deals (offers accepted all time)
  const totalDealsResult = await db
    .select({ count: sql<number>`count(*)` })
    .from(calls)
    .where(eq(calls.callOutcome, "offer_accepted"));
  const totalDeals = totalDealsResult[0]?.count || 0;

  // Get appointments this month
  const appointmentsResult = await db
    .select({ count: sql<number>`count(*)` })
    .from(calls)
    .where(
      and(
        eq(calls.callOutcome, "appointment_set"),
        gte(calls.createdAt, startOfMonth)
      )
    );
  const appointmentsThisMonth = appointmentsResult[0]?.count || 0;

  // Get offers accepted this month
  const offersResult = await db
    .select({ count: sql<number>`count(*)` })
    .from(calls)
    .where(
      and(
        eq(calls.callOutcome, "offer_accepted"),
        gte(calls.createdAt, startOfMonth)
      )
    );
  const offersAcceptedThisMonth = offersResult[0]?.count || 0;

  // Get average score
  const avgScoreResult = await db
    .select({ avg: sql<number>`AVG(${callGrades.overallScore})` })
    .from(callGrades);
  const averageScore = avgScoreResult[0]?.avg || null;

  // Get top performer this month
  const topPerformerResult = await db
    .select({
      name: teamMembers.name,
      avgScore: sql<number>`AVG(${callGrades.overallScore})`,
    })
    .from(callGrades)
    .innerJoin(calls, eq(callGrades.callId, calls.id))
    .innerJoin(teamMembers, eq(calls.teamMemberId, teamMembers.id))
    .where(gte(calls.createdAt, startOfMonth))
    .groupBy(teamMembers.id)
    .orderBy(desc(sql`AVG(${callGrades.overallScore})`))
    .limit(1);
  const topPerformer = topPerformerResult[0]?.name || null;

  return {
    totalDeals,
    appointmentsThisMonth,
    offersAcceptedThisMonth,
    averageScore,
    topPerformer,
  };
}

/**
 * Get interesting call stories for content creator posts
 * Finds calls with notable situations, objections handled, or unique scenarios
 */
export async function getInterestingCallStories(limit: number = 10): Promise<Array<{
  id: number;
  transcript: string | null;
  contactName: string | null;
  strengths: string | null;
  coachingTips: string | null;
  overallScore: string | null;
}>> {
  const db = await getDb();
  if (!db) return [];

  // Get high-scoring calls with good stories
  const result = await db
    .select({
      id: calls.id,
      transcript: calls.transcript,
      contactName: calls.contactName,
      strengths: callGrades.strengths,
      coachingTips: callGrades.coachingTips,
      overallScore: callGrades.overallScore,
    })
    .from(calls)
    .innerJoin(callGrades, eq(calls.id, callGrades.callId))
    .where(
      and(
        eq(calls.classification, "conversation"),
        eq(calls.status, "completed"),
        gte(callGrades.overallScore, "70")
      )
    )
    .orderBy(desc(callGrades.overallScore))
    .limit(limit);

  return result.map(r => ({
    ...r,
    strengths: r.strengths as string | null,
    coachingTips: r.coachingTips as string | null,
  }));
}
