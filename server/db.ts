import { eq, desc, and, gte, lte, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { InsertUser, users, calls, callGrades, teamMembers, performanceMetrics, InsertCall, InsertCallGrade, InsertTeamMember, Call, CallGrade, TeamMember } from "../drizzle/schema";
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
  averageScore: number;
  gradeDistribution: { A: number; B: number; C: number; D: number; F: number };
}>> {
  const db = await getDb();
  if (!db) return [];

  const members = await getTeamMembers();
  
  const leaderboard = await Promise.all(
    members.map(async (member) => {
      const memberCalls = await db.select().from(calls)
        .where(eq(calls.teamMemberId, member.id));
      
      const grades = await Promise.all(
        memberCalls.map(async (call) => {
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
  completedCalls: number;
  pendingCalls: number;
  averageScore: number;
  callsToday: number;
  callsThisWeek: number;
}> {
  const db = await getDb();
  if (!db) return {
    totalCalls: 0,
    completedCalls: 0,
    pendingCalls: 0,
    averageScore: 0,
    callsToday: 0,
    callsThisWeek: 0,
  };

  const allCalls = await db.select().from(calls);
  const completedCalls = allCalls.filter(c => c.status === "completed");
  const pendingCalls = allCalls.filter(c => c.status === "pending");

  const grades = await db.select().from(callGrades);
  const totalScore = grades.reduce((sum, g) => sum + (parseFloat(g.overallScore || "0")), 0);
  const averageScore = grades.length > 0 ? totalScore / grades.length : 0;

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const weekStart = new Date(todayStart);
  weekStart.setDate(weekStart.getDate() - 7);

  const callsToday = allCalls.filter(c => c.createdAt >= todayStart).length;
  const callsThisWeek = allCalls.filter(c => c.createdAt >= weekStart).length;

  return {
    totalCalls: allCalls.length,
    completedCalls: completedCalls.length,
    pendingCalls: pendingCalls.length,
    averageScore,
    callsToday,
    callsThisWeek,
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
