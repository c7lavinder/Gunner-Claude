import { eq, desc, and, gte, lte, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { 
  InsertUser, users, calls, callGrades, teamMembers, performanceMetrics, 
  InsertCall, InsertCallGrade, InsertTeamMember, Call, CallGrade, TeamMember,
  trainingMaterials, aiFeedback, gradingRules,
  InsertTrainingMaterial, InsertAIFeedback, InsertGradingRule,
  TrainingMaterial, AIFeedback, GradingRule
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

      return {
        teamMember: member,
        totalCalls: memberCalls.length,
        gradedCalls: gradedCalls.length,
        skippedCalls: skippedCalls.length,
        averageScore: validGrades.length > 0 ? totalScore / validGrades.length : 0,
        gradeDistribution,
      };
    })
  );

  return leaderboard.sort((a, b) => b.averageScore - a.averageScore);
}

// ============ ANALYTICS FUNCTIONS ============

export async function getCallStats(): Promise<{
  totalCalls: number;
  gradedCalls: number;
  skippedCalls: number;
  pendingCalls: number;
  averageScore: number;
  callsToday: number;
  callsThisWeek: number;
  gradedToday: number;
  skippedToday: number;
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
    classificationBreakdown: {
      conversation: 0,
      voicemail: 0,
      no_answer: 0,
      callback_request: 0,
      wrong_number: 0,
      too_short: 0,
    },
  };

  const allCalls = await db.select().from(calls);
  const gradedCalls = allCalls.filter(c => c.status === "completed" && c.classification === "conversation");
  const skippedCalls = allCalls.filter(c => c.status === "skipped");
  const pendingCalls = allCalls.filter(c => c.status === "pending" || c.status === "transcribing" || c.status === "classifying" || c.status === "grading");

  // Only count grades from graded conversations
  const grades = await db.select().from(callGrades);
  const totalScore = grades.reduce((sum, g) => sum + (parseFloat(g.overallScore || "0")), 0);
  const averageScore = grades.length > 0 ? totalScore / grades.length : 0;

  const now = new Date();
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
