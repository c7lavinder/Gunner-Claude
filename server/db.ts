import { eq, desc, and, gte, lte, sql, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2";
import { 
  InsertUser, users, calls, callGrades, teamMembers, performanceMetrics, 
  InsertCall, InsertCallGrade, InsertTeamMember, Call, CallGrade, TeamMember,
  trainingMaterials, aiFeedback, gradingRules, teamTrainingItems,
  InsertTrainingMaterial, InsertAIFeedback, InsertGradingRule,
  TrainingMaterial, AIFeedback, GradingRule,
  TeamTrainingItem, InsertTeamTrainingItem,
  brandAssets, socialPosts, contentIdeas, brandProfile,
  InsertBrandAsset, InsertSocialPost, InsertContentIdea,
  BrandAsset, SocialPost, ContentIdea, BrandProfile, InsertBrandProfile,
  teamAssignments, TeamAssignment, InsertTeamAssignment,
  emailsSent, InsertEmailSent, EmailSent, tenants, tenantRubrics
} from "../drizzle/schema";
import { ENV } from './_core/env';

let _db: ReturnType<typeof drizzle> | null = null;
let _pool: mysql.Pool | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      // S17: Use connection pool instead of single connection
      _pool = mysql.createPool({
        uri: process.env.DATABASE_URL,
        connectionLimit: 15,
        waitForConnections: true,
        queueLimit: 0, // unlimited queue (connections wait instead of failing)
        enableKeepAlive: true,
        keepAliveInitialDelay: 30000,
      });
      _db = drizzle(_pool);
      console.log("[Database] Connection pool created (limit: 10)");
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

/**
 * Reset the DB connection pool - call this on ECONNRESET or similar errors
 * so the next getDb() creates a fresh connection.
 */
export function resetDbConnection() {
  console.warn("[Database] Resetting connection pool due to connection error");
  _db = null;
}

/**
 * Retry wrapper for DB operations that may fail due to transient connection issues.
 * Retries once after resetting the connection pool on ECONNRESET-type errors.
 */
export async function withDbRetry<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error: any) {
    const isTransient = error?.cause?.code === 'ECONNRESET' 
      || error?.message?.includes('ECONNRESET')
      || error?.message?.includes('Connection lost')
      || error?.message?.includes('PROTOCOL_CONNECTION_LOST');
    if (isTransient) {
      console.warn("[Database] Transient error detected, retrying with fresh connection...");
      resetDbConnection();
      // Re-initialize and retry once
      await getDb();
      return await operation();
    }
    throw error;
  }
}

// ============ USER FUNCTIONS ============

export async function upsertUser(user: InsertUser): Promise<{ id: number; openId: string; email: string | null } | null> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return null;
  }

  try {
    // IMPORTANT: Check if user with this email already exists (prevents duplicates from different auth methods)
    if (user.email) {
      const [existingByEmail] = await db.select().from(users).where(eq(users.email, user.email)).limit(1);
      if (existingByEmail && existingByEmail.openId !== user.openId) {
        // User exists with different openId - just update lastSignedIn and return existing user
        // DO NOT change their openId or role - preserve their existing account
        console.log(`[Database] Found existing user by email ${user.email} with openId ${existingByEmail.openId}, keeping existing account`);
        await db.update(users)
          .set({ 
            lastSignedIn: new Date(),
          })
          .where(eq(users.id, existingByEmail.id));
        return { id: existingByEmail.id, openId: existingByEmail.openId, email: existingByEmail.email };
      }
    }

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
    
    // Return the user
    const [result] = await db.select({ id: users.id, openId: users.openId, email: users.email }).from(users).where(eq(users.openId, user.openId)).limit(1);
    return result || null;
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

export async function getTeamMembers(tenantId?: number): Promise<(TeamMember & { user?: { profilePicture: string | null } | null })[]> {
  const db = await getDb();
  if (!db) return [];

  const conditions = [eq(teamMembers.isActive, "true")];
  if (tenantId) {
    conditions.push(eq(teamMembers.tenantId, tenantId));
  }

  const members = await db.select().from(teamMembers).where(and(...conditions));
  
  // Fetch user data for profile pictures
  const membersWithUsers = await Promise.all(members.map(async (member) => {
    if (member.userId) {
      const [user] = await db.select({ profilePicture: users.profilePicture }).from(users).where(eq(users.id, member.userId));
      return { ...member, user: user || null };
    }
    return { ...member, user: null };
  }));
  
  return membersWithUsers;
}

export async function getTeamMemberById(id: number): Promise<TeamMember | null> {
  const db = await getDb();
  if (!db) return null;

  const result = await db.select().from(teamMembers).where(eq(teamMembers.id, id)).limit(1);
  return result[0] || null;
}

export async function getTeamMemberByName(name: string, tenantId?: number): Promise<TeamMember | null> {
  const db = await getDb();
  if (!db) return null;

  const conditions = [eq(teamMembers.name, name)];
  if (tenantId) {
    conditions.push(eq(teamMembers.tenantId, tenantId));
  }
  const result = await db.select().from(teamMembers).where(and(...conditions)).limit(1);
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

export async function getCallByBatchDialerId(batchDialerCallId: number): Promise<Call | null> {
  const db = await getDb();
  if (!db) return null;

  const result = await db.select().from(calls).where(eq(calls.batchDialerCallId, batchDialerCallId)).limit(1);
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
  includeArchived?: boolean; // Default false - exclude archived calls
  tenantId?: number; // For multi-tenant filtering
}): Promise<Call[]> {
  const db = await getDb();
  if (!db) return [];

  let query = db.select().from(calls);
  
  const conditions = [];
  
  // Exclude archived calls by default
  if (!options.includeArchived) {
    conditions.push(eq(calls.isArchived, "false"));
  }
  
  // Filter by tenant if provided
  if (options.tenantId) {
    conditions.push(eq(calls.tenantId, options.tenantId));
  }
  
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

export async function getRecentCalls(limit: number = 20, includeArchived: boolean = false, tenantId?: number): Promise<Call[]> {
  const db = await getDb();
  if (!db) return [];

  const conditions = [];
  
  if (!includeArchived) {
    conditions.push(eq(calls.isArchived, "false"));
  }
  
  if (tenantId) {
    conditions.push(eq(calls.tenantId, tenantId));
  }

  let query = db.select().from(calls);
  
  if (conditions.length > 0) {
    query = query.where(and(...conditions)) as any;
  }

  return await query
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
  tenantId?: number;
  startDate?: string; // ISO date string
  endDate?: string; // ISO date string
  callTypes?: string[];
  outcomes?: string[];
  statuses?: string[];
  directions?: string[];
  scoreRanges?: string[];
  teamMembers?: string[];
  allowedTeamMemberIds?: number[] | 'all'; // Permission-based scoping
}): Promise<{ items: Array<Call & { grade: CallGrade | null }>; total: number }> {
  const db = await getDb();
  if (!db) return { items: [], total: 0 };

  const conditions = [];
  conditions.push(eq(calls.isArchived, "false"));

  if (options.tenantId) {
    conditions.push(eq(calls.tenantId, options.tenantId));
  }
  if (options.teamMemberId) {
    conditions.push(eq(calls.teamMemberId, options.teamMemberId));
  }
  if (options.startDate) {
    conditions.push(gte(calls.createdAt, new Date(options.startDate)));
  }
  if (options.endDate) {
    conditions.push(lte(calls.createdAt, new Date(options.endDate)));
  }
  if (options.callTypes && options.callTypes.length > 0) {
    conditions.push(inArray(calls.callType, options.callTypes as any));
  }
  if (options.outcomes && options.outcomes.length > 0) {
    conditions.push(inArray(calls.callOutcome, options.outcomes as any));
  }
  if (options.statuses && options.statuses.length > 0) {
    conditions.push(inArray(calls.status, options.statuses as any));
  }
  if (options.directions && options.directions.length > 0) {
    conditions.push(inArray(calls.callDirection, options.directions as any));
  }
  if (options.teamMembers && options.teamMembers.length > 0) {
    conditions.push(inArray(calls.teamMemberName, options.teamMembers as any));
  }

  // Apply permission-based scoping: restrict to allowed team member IDs
  if (options.allowedTeamMemberIds && options.allowedTeamMemberIds !== 'all') {
    if (options.allowedTeamMemberIds.length === 0) {
      return { items: [], total: 0 }; // No access
    }
    conditions.push(inArray(calls.teamMemberId, options.allowedTeamMemberIds));
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  // Get total count
  const countResult = await db.select({ count: sql<number>`count(*)` }).from(calls).where(whereClause);
  const total = Number(countResult[0]?.count || 0);

  // Get paginated calls
  const callsList = await db.select().from(calls)
    .where(whereClause)
    .orderBy(desc(calls.createdAt))
    .limit(options.limit || 25)
    .offset(options.offset || 0);

  const result = await Promise.all(
    callsList.map(async (call) => {
      const grade = await getCallGradeByCallId(call.id);
      return { ...call, grade };
    })
  );

  return { items: result, total };
}

// ============ LEADERBOARD FUNCTIONS ============

export async function getLeaderboardData(tenantId?: number, dateRange?: "today" | "week" | "month" | "ytd" | "all"): Promise<Array<{
  teamMember: TeamMember;
  totalCalls: number;
  gradedCalls: number;
  skippedCalls: number;
  averageScore: number;
  appointmentsSet: number;
  offerCallsCompleted: number;
  abScoredCalls: number;
  gradeDistribution: { A: number; B: number; C: number; D: number; F: number };
}>> {
  const db = await getDb();
  if (!db) return [];

  const members = await getTeamMembers(tenantId);
  
  // Calculate date range start using CST timezone (matching getCallStats)
  let rangeStart: Date | null = null;
  if (dateRange && dateRange !== 'all') {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Chicago',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    const getStartOfDayCST = (date: Date): Date => {
      const parts = formatter.formatToParts(date);
      const year = parseInt(parts.find(p => p.type === 'year')!.value);
      const month = parseInt(parts.find(p => p.type === 'month')!.value) - 1;
      const day = parseInt(parts.find(p => p.type === 'day')!.value);
      return new Date(Date.UTC(year, month, day, 6, 0, 0, 0));
    };
    switch (dateRange) {
      case 'today':
        rangeStart = getStartOfDayCST(now);
        break;
      case 'week': {
        const weekAgo = new Date(now);
        weekAgo.setDate(weekAgo.getDate() - 7);
        rangeStart = getStartOfDayCST(weekAgo);
        break;
      }
      case 'month': {
        const monthAgo = new Date(now);
        monthAgo.setMonth(monthAgo.getMonth() - 1);
        rangeStart = getStartOfDayCST(monthAgo);
        break;
      }
      case 'ytd': {
        const ytdFormatter = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', year: 'numeric' });
        const ytdParts = ytdFormatter.formatToParts(now);
        const ytdYear = parseInt(ytdParts.find(p => p.type === 'year')!.value);
        rangeStart = new Date(Date.UTC(ytdYear, 0, 1, 6, 0, 0, 0));
        break;
      }
    }
  }

  const leaderboard = await Promise.all(
    members.map(async (member) => {
      // Get all non-archived calls for this member (tenant-scoped)
      const callConditions = [
        eq(calls.teamMemberId, member.id),
        eq(calls.isArchived, "false")
      ];
      if (tenantId) {
        callConditions.push(eq(calls.tenantId, tenantId));
      }
      if (rangeStart) {
        callConditions.push(gte(calls.createdAt, rangeStart));
      }
      const memberCalls = await db.select().from(calls)
        .where(and(...callConditions));
      
      // Only count completed (graded) calls for leaderboard (conversation + admin_call both get AI-scored)
      const gradedCalls = memberCalls.filter(c => c.status === "completed" && (c.classification === "conversation" || c.classification === "admin_call"));
      const skippedCalls = memberCalls.filter(c => c.status === "skipped");
      
      // Count appointments and offer calls completed
      const appointmentsSet = memberCalls.filter(c => c.callOutcome === "appointment_set").length;
      const offerCallsCompleted = gradedCalls.filter(c => c.callType === "offer").length;
      
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
        offerCallsCompleted,
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
  viewableTeamMemberIds?: number[] | 'all'; // Permission-based filtering
  tenantId?: number; // Multi-tenant filtering
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
  offerCallsCompleted: number;
  classificationBreakdown: {
    conversation: number;
    admin_call: number;
    voicemail: number;
    no_answer: number;
    callback_request: number;
    wrong_number: number;
    too_short: number;
  };
  // Extended analytics
  averageCallDuration: number; // in seconds
  gradeDistribution: {
    A: number;
    B: number;
    C: number;
    D: number;
    F: number;
  };
  teamMemberScores: Array<{
    memberId: number;
    memberName: string;
    averageScore: number;
    totalGraded: number;
    gradeDistribution: { A: number; B: number; C: number; D: number; F: number };
  }>;
  // Trend data
  weeklyTrends: Array<{
    weekStart: string; // ISO date string
    averageScore: number;
    totalCalls: number;
    gradedCalls: number;
  }>;
  teamMemberTrends: Array<{
    memberId: number;
    memberName: string;
    weeklyScores: Array<{
      weekStart: string;
      averageScore: number;
      callCount: number;
    }>;
  }>;
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
    offerCallsCompleted: 0,
    classificationBreakdown: {
      conversation: 0,
      admin_call: 0,
      voicemail: 0,
      no_answer: 0,
      callback_request: 0,
      wrong_number: 0,
      too_short: 0,
    },
    averageCallDuration: 0,
    gradeDistribution: { A: 0, B: 0, C: 0, D: 0, F: 0 },
    teamMemberScores: [],
    weeklyTrends: [],
    teamMemberTrends: [],
  };

  // Calculate date range using CST timezone (Central Standard Time)
  // This ensures date filtering matches the user's local time
  const now = new Date();
  
  // Helper function to get start of day in CST as UTC timestamp
  // CST is UTC-6, so midnight CST = 6:00 AM UTC
  const getStartOfDayCST = (date: Date): Date => {
    // Get the date components in CST timezone using Intl.DateTimeFormat
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Chicago',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    const parts = formatter.formatToParts(date);
    const year = parseInt(parts.find(p => p.type === 'year')!.value);
    const month = parseInt(parts.find(p => p.type === 'month')!.value) - 1;
    const day = parseInt(parts.find(p => p.type === 'day')!.value);
    
    // Create midnight CST as UTC: midnight CST = 6:00 AM UTC
    return new Date(Date.UTC(year, month, day, 6, 0, 0, 0));
  };
  
  let startDate: Date | null = null;
  
  switch (options?.dateRange) {
    case "today":
      // Midnight CST today = 6:00 AM UTC today
      startDate = getStartOfDayCST(now);
      break;
    case "week":
      const weekAgo = new Date(now);
      weekAgo.setDate(weekAgo.getDate() - 7);
      startDate = getStartOfDayCST(weekAgo);
      break;
    case "month":
      const monthAgo = new Date(now);
      monthAgo.setMonth(monthAgo.getMonth() - 1);
      startDate = getStartOfDayCST(monthAgo);
      break;
    case "ytd":
      // January 1st of current year at midnight CST
      const ytdFormatter = new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/Chicago',
        year: 'numeric',
      });
      const ytdParts = ytdFormatter.formatToParts(now);
      const ytdYear = parseInt(ytdParts.find(p => p.type === 'year')!.value);
      // Jan 1st midnight CST = Jan 1st 6:00 AM UTC
      startDate = new Date(Date.UTC(ytdYear, 0, 1, 6, 0, 0, 0));
      break;
    case "all":
    default:
      startDate = null;
      break;
  }

  // Get calls with optional date filter (exclude archived calls)
  let allCalls: Call[];
  const baseConditions = [eq(calls.isArchived, "false")];
  
  // Add tenant filter if provided
  if (options?.tenantId) {
    baseConditions.push(eq(calls.tenantId, options.tenantId));
  }
  
  if (startDate) {
    allCalls = await db.select().from(calls).where(
      and(
        gte(calls.createdAt, startDate),
        ...baseConditions
      )
    );
  } else {
    allCalls = await db.select().from(calls).where(and(...baseConditions));
  }
  
  // Apply permission-based filtering if viewableTeamMemberIds is provided
  if (options?.viewableTeamMemberIds && options.viewableTeamMemberIds !== 'all') {
    const viewableIds = options.viewableTeamMemberIds;
    allCalls = allCalls.filter(c => c.teamMemberId && viewableIds.includes(c.teamMemberId));
  }
  
  // Include both conversation and admin_call as "graded" calls (both get AI-scored)
  const gradedCalls = allCalls.filter(c => c.status === "completed" && (c.classification === "conversation" || c.classification === "admin_call"));
  const skippedCalls = allCalls.filter(c => c.status === "skipped");
  const pendingCalls = allCalls.filter(c => c.status === "pending" || c.status === "transcribing" || c.status === "classifying" || c.status === "grading");

  // Only count grades from graded calls within the date range
  const gradedCallIds = gradedCalls.map(c => c.id);
  // Fetch only grades for calls in scope (not entire table) and deduplicate
  const callGradesArr = gradedCallIds.length > 0
    ? await db.select().from(callGrades).where(inArray(callGrades.callId, gradedCallIds))
    : [];
  // Deduplicate: keep only the latest grade per call (highest ID)
  const gradeMap = new Map<number, (typeof callGradesArr)[number]>();
  for (const g of callGradesArr) {
    const existing = gradeMap.get(g.callId);
    if (!existing || g.id > existing.id) {
      gradeMap.set(g.callId, g);
    }
  }
  const grades = Array.from(gradeMap.values());
  const totalScore = grades.reduce((sum, g) => sum + (parseFloat(g.overallScore || "0")), 0);
  const averageScore = grades.length > 0 ? totalScore / grades.length : 0;

  // Use CST-aware dates for today/week counts to match the main date range filter
  const todayStartCST = getStartOfDayCST(now);
  const weekStartCST = new Date(todayStartCST);
  weekStartCST.setDate(weekStartCST.getDate() - 7);

  const callsToday = allCalls.filter(c => c.createdAt >= todayStartCST).length;
  const callsThisWeek = allCalls.filter(c => c.createdAt >= weekStartCST).length;
  const gradedToday = gradedCalls.filter(c => c.createdAt >= todayStartCST).length;
  const skippedToday = skippedCalls.filter(c => c.createdAt >= todayStartCST).length;

  // Classification breakdown
  const classificationBreakdown = {
    conversation: allCalls.filter(c => c.classification === "conversation").length,
    admin_call: allCalls.filter(c => c.classification === "admin_call").length,
    voicemail: allCalls.filter(c => c.classification === "voicemail").length,
    no_answer: allCalls.filter(c => c.classification === "no_answer").length,
    callback_request: allCalls.filter(c => c.classification === "callback_request").length,
    wrong_number: allCalls.filter(c => c.classification === "wrong_number").length,
    too_short: allCalls.filter(c => c.classification === "too_short").length,
  };

  // Count outcomes
  const appointmentsSet = allCalls.filter(c => c.callOutcome === "appointment_set").length;
  // Count completed offer calls (calls by acquisition managers)
  const offerCallsCompleted = gradedCalls.filter(c => c.callType === "offer").length;

  // Calculate average call duration for graded calls
  const gradedCallDurations = gradedCalls.filter(c => c.duration).map(c => c.duration || 0);
  const averageCallDuration = gradedCallDurations.length > 0 
    ? gradedCallDurations.reduce((sum, d) => sum + d, 0) / gradedCallDurations.length 
    : 0;

  // Calculate grade distribution
  const gradeDistribution = { A: 0, B: 0, C: 0, D: 0, F: 0 };
  for (const grade of grades) {
    const score = parseFloat(grade.overallScore || "0");
    if (score >= 90) gradeDistribution.A++;
    else if (score >= 80) gradeDistribution.B++;
    else if (score >= 70) gradeDistribution.C++;
    else if (score >= 60) gradeDistribution.D++;
    else gradeDistribution.F++;
  }

  // Calculate team member scores (tenant-scoped)
  const members = await getTeamMembers(options?.tenantId);
  const teamMemberScores = members.map(member => {
    const memberCalls = gradedCalls.filter(c => c.teamMemberId === member.id);
    const memberGrades = grades.filter(g => memberCalls.some(c => c.id === g.callId));
    const memberTotalScore = memberGrades.reduce((sum, g) => sum + parseFloat(g.overallScore || "0"), 0);
    const memberAvgScore = memberGrades.length > 0 ? memberTotalScore / memberGrades.length : 0;
    
    const memberGradeDistribution = { A: 0, B: 0, C: 0, D: 0, F: 0 };
    for (const grade of memberGrades) {
      const score = parseFloat(grade.overallScore || "0");
      if (score >= 90) memberGradeDistribution.A++;
      else if (score >= 80) memberGradeDistribution.B++;
      else if (score >= 70) memberGradeDistribution.C++;
      else if (score >= 60) memberGradeDistribution.D++;
      else memberGradeDistribution.F++;
    }
    
    return {
      memberId: member.id,
      memberName: member.name,
      averageScore: memberAvgScore,
      totalGraded: memberGrades.length,
      gradeDistribution: memberGradeDistribution,
    };
  });

  // Calculate weekly trends (last 12 weeks)
  const weeklyTrends: Array<{
    weekStart: string;
    averageScore: number;
    totalCalls: number;
    gradedCalls: number;
  }> = [];
  
  // Get all calls and grades for trend calculation (ignore date filter for trends, but apply tenant filter)
  let allCallsForTrends: Call[];
  const trendConditions = [eq(calls.isArchived, "false")];
  if (options?.tenantId) {
    trendConditions.push(eq(calls.tenantId, options.tenantId));
  }
  allCallsForTrends = await db.select().from(calls).where(and(...trendConditions));
  
  // Get grades scoped to these calls and deduplicate
  const trendGradedCallIds = allCallsForTrends
    .filter(c => c.status === "completed" && (c.classification === "conversation" || c.classification === "admin_call"))
    .map(c => c.id);
  const allGradesForTrendsRaw = trendGradedCallIds.length > 0
    ? await db.select().from(callGrades).where(inArray(callGrades.callId, trendGradedCallIds))
    : [];
  // Deduplicate: keep only the latest grade per call
  const trendGradeMap = new Map<number, (typeof allGradesForTrendsRaw)[number]>();
  for (const g of allGradesForTrendsRaw) {
    const existing = trendGradeMap.get(g.callId);
    if (!existing || g.id > existing.id) {
      trendGradeMap.set(g.callId, g);
    }
  }
  const allGradesForTrends = Array.from(trendGradeMap.values());
  
  for (let i = 11; i >= 0; i--) {
    const weekStart = new Date(now);
    weekStart.setDate(weekStart.getDate() - (i * 7) - weekStart.getDay());
    weekStart.setHours(0, 0, 0, 0);
    
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 7);
    
    const weekCalls = allCallsForTrends.filter(c => 
      c.createdAt >= weekStart && c.createdAt < weekEnd
    );
    const weekGradedCalls = weekCalls.filter(c => 
      c.status === "completed" && (c.classification === "conversation" || c.classification === "admin_call")
    );
    const weekGrades = allGradesForTrends.filter(g => 
      weekGradedCalls.some(c => c.id === g.callId)
    );
    
    const weekTotalScore = weekGrades.reduce((sum, g) => sum + parseFloat(g.overallScore || "0"), 0);
    const weekAvgScore = weekGrades.length > 0 ? weekTotalScore / weekGrades.length : 0;
    
    weeklyTrends.push({
      weekStart: weekStart.toISOString().split('T')[0],
      averageScore: Math.round(weekAvgScore * 10) / 10,
      totalCalls: weekCalls.length,
      gradedCalls: weekGradedCalls.length,
    });
  }

  // Calculate team member trends (last 12 weeks per member)
  const teamMemberTrends = members.map(member => {
    const memberWeeklyScores: Array<{
      weekStart: string;
      averageScore: number;
      callCount: number;
    }> = [];
    
    for (let i = 11; i >= 0; i--) {
      const weekStart = new Date(now);
      weekStart.setDate(weekStart.getDate() - (i * 7) - weekStart.getDay());
      weekStart.setHours(0, 0, 0, 0);
      
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekEnd.getDate() + 7);
      
      const memberWeekCalls = allCallsForTrends.filter(c => 
        c.teamMemberId === member.id && 
        c.createdAt >= weekStart && 
        c.createdAt < weekEnd &&
        c.status === "completed" && 
        (c.classification === "conversation" || c.classification === "admin_call")
      );
      const memberWeekGrades = allGradesForTrends.filter(g => 
        memberWeekCalls.some(c => c.id === g.callId)
      );
      
      const memberWeekTotalScore = memberWeekGrades.reduce((sum, g) => sum + parseFloat(g.overallScore || "0"), 0);
      const memberWeekAvgScore = memberWeekGrades.length > 0 ? memberWeekTotalScore / memberWeekGrades.length : 0;
      
      memberWeeklyScores.push({
        weekStart: weekStart.toISOString().split('T')[0],
        averageScore: Math.round(memberWeekAvgScore * 10) / 10,
        callCount: memberWeekCalls.length,
      });
    }
    
    return {
      memberId: member.id,
      memberName: member.name,
      weeklyScores: memberWeeklyScores,
    };
  });

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
    offerCallsCompleted,
    classificationBreakdown,
    averageCallDuration,
    gradeDistribution,
    teamMemberScores,
    weeklyTrends,
    teamMemberTrends,
  };
}

// ============ SEED DATA ============

export async function seedTeamMembers(): Promise<void> {
  // No-op: team members are now added per-tenant during onboarding.
  // Each tenant configures their own team members via the Team Members page.
  return;
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
  tenantId?: number;
}): Promise<TrainingMaterial[]> {
  const db = await getDb();
  if (!db) return [];

  const conditions = [];
  
  if (options?.activeOnly !== false) {
    conditions.push(eq(trainingMaterials.isActive, "true"));
  }
  if (options?.tenantId) {
    conditions.push(eq(trainingMaterials.tenantId, options.tenantId));
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
  tenantId?: number; // For multi-tenant filtering
}): Promise<AIFeedback[]> {
  const db = await getDb();
  if (!db) return [];

  const conditions = [];
  
  // CRITICAL: Filter by tenant for multi-tenant isolation
  if (options?.tenantId) {
    conditions.push(eq(aiFeedback.tenantId, options.tenantId));
  }
  
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

export async function getPendingFeedbackForGrading(tenantId?: number): Promise<AIFeedback[]> {
  const db = await getDb();
  if (!db) return [];

  const conditions = [eq(aiFeedback.status, "incorporated")];
  if (tenantId) {
    conditions.push(eq(aiFeedback.tenantId, tenantId));
  }

  return await db.select().from(aiFeedback)
    .where(and(...conditions))
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
  tenantId?: number; // For multi-tenant filtering
}): Promise<GradingRule[]> {
  const db = await getDb();
  if (!db) return [];

  const conditions = [];
  
  // CRITICAL: Filter by tenant for multi-tenant isolation
  if (options?.tenantId) {
    conditions.push(eq(gradingRules.tenantId, options.tenantId));
  }
  
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
export async function getGradingContext(callType: "qualification" | "offer" | "lead_generation" | "follow_up" | "seller_callback" | "admin_callback", tenantId?: number): Promise<{
  // Note: callType here maps to the legacy applicableTo values in training materials/rules
  trainingMaterials: TrainingMaterial[];
  gradingRules: GradingRule[];
  recentFeedback: AIFeedback[];
  tenantRubrics: { name: string; description: string | null; criteria: string }[];
}> {
  // follow_up, seller_callback, admin_callback all use lead_manager training context
  const applicableTo = (callType === "qualification" || callType === "follow_up" || callType === "seller_callback" || callType === "admin_callback") ? "lead_manager" : (callType === "offer" ? "acquisition_manager" : "lead_generator");
  
  // Get training materials scoped to tenant
  const materials = await getTrainingMaterials({ activeOnly: true, tenantId });
  const filteredMaterials = materials.filter(m => 
    m.applicableTo === "all" || m.applicableTo === applicableTo
  );

  // Get grading rules scoped to tenant
  const rules = await getGradingRules({ activeOnly: true, tenantId });
  const filteredRules = rules.filter(r => 
    r.applicableTo === "all" || r.applicableTo === applicableTo
  );

  // Get recent incorporated feedback scoped to tenant
  const feedback = await getPendingFeedbackForGrading(tenantId);

  // S13: Fetch tenant-specific rubrics if tenantId is provided
  let tenantRubricsList: { name: string; description: string | null; criteria: string }[] = [];
  if (tenantId) {
    const db = await getDb();
    if (db) {
      const rubrics = await db.select().from(tenantRubrics).where(
        and(
          eq(tenantRubrics.tenantId, tenantId),
          eq(tenantRubrics.isActive, "true")
        )
      );
      tenantRubricsList = rubrics.map(r => ({ name: r.name, description: r.description, criteria: r.criteria }));
    }
  }

  return {
    trainingMaterials: filteredMaterials,
    gradingRules: filteredRules,
    recentFeedback: feedback,
    tenantRubrics: tenantRubricsList,
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
  teamRole?: "lead_manager" | "acquisition_manager" | "lead_generator";
  meetingDate?: Date;
  tenantId?: number; // For multi-tenant filtering
}): Promise<TeamTrainingItem[]> {
  const db = await getDb();
  if (!db) return [];

  // If filtering by teamRole, use the teamRole column directly on teamTrainingItems
  if (options?.teamRole) {
    const conditions = [];
    
    if (options?.tenantId) {
      conditions.push(eq(teamTrainingItems.tenantId, options.tenantId));
    }
    if (options?.itemType) {
      conditions.push(eq(teamTrainingItems.itemType, options.itemType));
    }
    if (options?.status) {
      conditions.push(eq(teamTrainingItems.status, options.status));
    }
    
    conditions.push(eq(teamTrainingItems.teamRole, options.teamRole));
    
    const query = db
      .select()
      .from(teamTrainingItems)
      .where(and(...conditions))
      .orderBy(desc(teamTrainingItems.createdAt));
    
    return await query as any;
  }
  
  // Original logic for non-role filtering
  const conditions = [];
  
  // CRITICAL: Filter by tenant for multi-tenant isolation
  if (options?.tenantId) {
    conditions.push(eq(teamTrainingItems.tenantId, options.tenantId));
  }
  
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

export async function getActiveTrainingItems(tenantId?: number): Promise<{
  skills: TeamTrainingItem[];
  issues: TeamTrainingItem[];
  wins: TeamTrainingItem[];
  agenda: TeamTrainingItem[];
}> {
  const db = await getDb();
  if (!db) return { skills: [], issues: [], wins: [], agenda: [] };

  const conditions = [eq(teamTrainingItems.status, "active")];
  
  // CRITICAL: Filter by tenant for multi-tenant isolation
  if (tenantId) {
    conditions.push(eq(teamTrainingItems.tenantId, tenantId));
  }

  const activeItems = await db.select().from(teamTrainingItems)
    .where(and(...conditions))
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
  tenantId?: number; // For multi-tenant filtering
}): Promise<BrandAsset[]> {
  const db = await getDb();
  if (!db) return [];

  const conditions = [];
  
  // CRITICAL: Filter by tenant for multi-tenant isolation
  if (options?.tenantId) {
    conditions.push(eq(brandAssets.tenantId, options.tenantId));
  }
  
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
  tenantId?: number; // For multi-tenant filtering
}): Promise<SocialPost[]> {
  const db = await getDb();
  if (!db) return [];

  const conditions = [];
  
  // Filter by tenant if provided
  if (options?.tenantId) {
    conditions.push(eq(socialPosts.tenantId, options.tenantId));
  }
  
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
  tenantId?: number; // For multi-tenant filtering
}): Promise<ContentIdea[]> {
  const db = await getDb();
  if (!db) return [];

  const conditions = [];
  
  // CRITICAL: Filter by tenant for multi-tenant isolation
  if (options?.tenantId) {
    conditions.push(eq(contentIdeas.tenantId, options.tenantId));
  }
  
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

export async function getBrandProfile(tenantId?: number): Promise<BrandProfile | null> {
  const db = await getDb();
  if (!db) return null;

  // Filter by tenant if provided
  if (tenantId) {
    const result = await db.select().from(brandProfile).where(eq(brandProfile.tenantId, tenantId)).limit(1);
    return result[0] || null;
  }
  
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
export async function getCallsForContentGeneration(limit: number = 20, tenantId?: number): Promise<Array<{
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

  const conditions = [
    eq(calls.classification, "conversation"),
    eq(calls.status, "completed")
  ];
  
  // Filter by tenant if provided
  if (tenantId) {
    conditions.push(eq(calls.tenantId, tenantId));
  }

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
    .where(and(...conditions))
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
export async function getKPIsForContentGeneration(tenantId?: number): Promise<{
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

  // Get total deals (offers made all time)
  const totalDealsConditions = [eq(calls.callOutcome, "offer_made")];
  if (tenantId) totalDealsConditions.push(eq(calls.tenantId, tenantId));
  
  const totalDealsResult = await db
    .select({ count: sql<number>`count(*)` })
    .from(calls)
    .where(and(...totalDealsConditions));
  const totalDeals = totalDealsResult[0]?.count || 0;

  // Get appointments this month
  const appointmentsConditions = [eq(calls.callOutcome, "appointment_set"), gte(calls.createdAt, startOfMonth)];
  if (tenantId) appointmentsConditions.push(eq(calls.tenantId, tenantId));
  
  const appointmentsResult = await db
    .select({ count: sql<number>`count(*)` })
    .from(calls)
    .where(and(...appointmentsConditions));
  const appointmentsThisMonth = appointmentsResult[0]?.count || 0;

  // Get offers made this month
  const offersConditions = [eq(calls.callOutcome, "offer_made"), gte(calls.createdAt, startOfMonth)];
  if (tenantId) offersConditions.push(eq(calls.tenantId, tenantId));
  
  const offersResult = await db
    .select({ count: sql<number>`count(*)` })
    .from(calls)
    .where(and(...offersConditions));
  const offersAcceptedThisMonth = offersResult[0]?.count || 0;

  // Get average score (join with calls to filter by tenant)
  const avgScoreQuery = db
    .select({ avg: sql<number>`AVG(${callGrades.overallScore})` })
    .from(callGrades)
    .innerJoin(calls, eq(callGrades.callId, calls.id));
  
  const avgScoreResult = tenantId 
    ? await avgScoreQuery.where(eq(calls.tenantId, tenantId))
    : await avgScoreQuery;
  const averageScore = avgScoreResult[0]?.avg || null;

  // Get top performer this month
  const topPerformerConditions = [gte(calls.createdAt, startOfMonth)];
  if (tenantId) topPerformerConditions.push(eq(calls.tenantId, tenantId));
  
  const topPerformerResult = await db
    .select({
      name: teamMembers.name,
      avgScore: sql<number>`AVG(${callGrades.overallScore})`,
    })
    .from(callGrades)
    .innerJoin(calls, eq(callGrades.callId, calls.id))
    .innerJoin(teamMembers, eq(calls.teamMemberId, teamMembers.id))
    .where(and(...topPerformerConditions))
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
export async function getInterestingCallStories(limit: number = 10, tenantId?: number): Promise<Array<{
  id: number;
  transcript: string | null;
  contactName: string | null;
  strengths: string | null;
  coachingTips: string | null;
  overallScore: string | null;
}>> {
  const db = await getDb();
  if (!db) return [];

  // Build conditions for filtering
  const conditions = [
    eq(calls.classification, "conversation"),
    eq(calls.status, "completed"),
    gte(callGrades.overallScore, "70")
  ];
  
  // Filter by tenant if provided
  if (tenantId) {
    conditions.push(eq(calls.tenantId, tenantId));
  }

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
    .where(and(...conditions))
    .orderBy(desc(callGrades.overallScore))
    .limit(limit);

  return result.map(r => ({
    ...r,
    strengths: r.strengths as string | null,
    coachingTips: r.coachingTips as string | null,
  }));
}


// ============ ARCHIVAL FUNCTIONS ============

/**
 * Get all calls including archived ones - for AI training purposes
 * This function fetches transcripts from S3 for archived calls
 */
export async function getAllCallsForTraining(options?: {
  limit?: number;
  includeTranscripts?: boolean;
}): Promise<Array<{
  id: number;
  transcript: string | null;
  transcriptUrl: string | null;
  contactName: string | null;
  teamMemberName: string | null;
  callType: string | null;
  callOutcome: string | null;
  classification: string | null;
  isArchived: string;
  createdAt: Date;
}>> {
  const db = await getDb();
  if (!db) return [];

  const result = await db
    .select({
      id: calls.id,
      transcript: calls.transcript,
      transcriptUrl: calls.transcriptUrl,
      contactName: calls.contactName,
      teamMemberName: calls.teamMemberName,
      callType: calls.callType,
      callOutcome: calls.callOutcome,
      classification: calls.classification,
      isArchived: calls.isArchived,
      createdAt: calls.createdAt,
    })
    .from(calls)
    .where(eq(calls.classification, "conversation"))
    .orderBy(desc(calls.createdAt))
    .limit(options?.limit || 1000);

  return result.map(r => ({
    ...r,
    callType: r.callType as string | null,
    callOutcome: r.callOutcome as string | null,
    classification: r.classification as string | null,
    isArchived: r.isArchived as string,
  }));
}


// ============ TEAM ASSIGNMENT FUNCTIONS ============

export async function getTeamAssignments(tenantId?: number): Promise<TeamAssignment[]> {
  const db = await getDb();
  if (!db) return [];

  // Filter by tenant if tenantId is provided
  if (tenantId) {
    return await db.select().from(teamAssignments).where(eq(teamAssignments.tenantId, tenantId));
  }
  return await db.select().from(teamAssignments);
}

export async function getLeadManagersForAcquisitionManager(acquisitionManagerId: number): Promise<number[]> {
  const db = await getDb();
  if (!db) return [];

  const assignments = await db.select()
    .from(teamAssignments)
    .where(eq(teamAssignments.acquisitionManagerId, acquisitionManagerId));
  
  return assignments.map(a => a.leadManagerId);
}

/**
 * Get Lead Generator IDs assigned to a Lead Manager.
 * In team_assignments, LG→LM assignments use:
 *   leadManagerId = Lead Generator's team member ID
 *   acquisitionManagerId = Lead Manager's team member ID
 */
export async function getLeadGeneratorsForLeadManager(leadManagerTeamMemberId: number): Promise<number[]> {
  const db = await getDb();
  if (!db) return [];

  // LG assignments: acquisitionManagerId = the Lead Manager, leadManagerId = the Lead Generator
  const assignments = await db.select()
    .from(teamAssignments)
    .where(eq(teamAssignments.acquisitionManagerId, leadManagerTeamMemberId));
  
  // Filter to only include actual lead generators by checking teamRole
  const lgIds: number[] = [];
  for (const a of assignments) {
    const member = await db.select().from(teamMembers).where(eq(teamMembers.id, a.leadManagerId)).limit(1);
    if (member[0]?.teamRole === 'lead_generator') {
      lgIds.push(a.leadManagerId);
    }
  }
  return lgIds;
}

export async function assignLeadManagerToAcquisitionManager(
  leadManagerId: number, 
  acquisitionManagerId: number,
  tenantId?: number
): Promise<void> {
  const db = await getDb();
  if (!db) return;

  // Remove existing assignment for this lead manager (within the same tenant)
  if (tenantId) {
    await db.delete(teamAssignments)
      .where(and(
        eq(teamAssignments.leadManagerId, leadManagerId),
        eq(teamAssignments.tenantId, tenantId)
      ));
  } else {
    await db.delete(teamAssignments)
      .where(eq(teamAssignments.leadManagerId, leadManagerId));
  }
  
  // Create new assignment with tenantId
  await db.insert(teamAssignments).values({
    leadManagerId,
    acquisitionManagerId,
    tenantId: tenantId ?? 1,
  });
}
export async function removeLeadManagerAssignment(leadManagerId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;

  await db.delete(teamAssignments)
    .where(eq(teamAssignments.leadManagerId, leadManagerId));
}

// ============ PERMISSION-BASED CALL QUERIES ============

export type UserPermissionContext = {
  teamMemberId?: number;
  teamRole?: 'admin' | 'lead_manager' | 'acquisition_manager' | 'lead_generator';
  userId?: number;
  tenantId?: number; // Required for multi-tenant isolation
};

/**
 * Get calls filtered by user permissions:
 * - Admin: sees all calls
 * - Acquisition Manager: sees own calls + all assigned Lead Manager calls
 * - Lead Manager: sees only own calls
 */
export async function getCallsWithPermissions(
  permissionContext: UserPermissionContext,
  options: {
    status?: string;
    limit?: number;
    offset?: number;
    includeArchived?: boolean;
    startDate?: Date;
    endDate?: Date;
  } = {}
): Promise<Call[]> {
  const db = await getDb();
  if (!db) return [];

  // CRITICAL: Require tenantId for multi-tenant isolation - return empty if not provided
  if (!permissionContext.tenantId) {
    console.warn('[getCallsWithPermissions] No tenantId provided - returning empty for security');
    return [];
  }

  const conditions = [];
  
  // Always filter by tenant for multi-tenant isolation
  conditions.push(eq(calls.tenantId, permissionContext.tenantId));
  
  // Exclude archived calls by default
  if (!options.includeArchived) {
    conditions.push(eq(calls.isArchived, "false"));
  }
  
  if (options.status) {
    conditions.push(eq(calls.status, options.status as any));
  }
  
  if (options.startDate) {
    conditions.push(gte(calls.callTimestamp, options.startDate));
  }
  
  if (options.endDate) {
    conditions.push(lte(calls.callTimestamp, options.endDate));
  }

  // Apply permission-based filtering (within tenant)
  if (permissionContext.teamRole === 'admin' || permissionContext.teamRole === 'super_admin' as any) {
    // Admin/super_admin sees all calls within their tenant - no additional filter
  } else if (permissionContext.teamRole === 'acquisition_manager' && permissionContext.teamMemberId) {
    // Acquisition Manager sees own calls + assigned Lead Manager calls
    const assignedLeadManagers = await getLeadManagersForAcquisitionManager(permissionContext.teamMemberId);
    const allowedTeamMemberIds = [permissionContext.teamMemberId, ...assignedLeadManagers];
    
    if (allowedTeamMemberIds.length > 0) {
      conditions.push(sql`${calls.teamMemberId} IN (${sql.join(allowedTeamMemberIds.map(id => sql`${id}`), sql`, `)})`);
    }
  } else if (permissionContext.teamRole === 'lead_manager' && permissionContext.teamMemberId) {
    // Lead Manager sees own calls + assigned Lead Generator calls
    const assignedLeadGenerators = await getLeadGeneratorsForLeadManager(permissionContext.teamMemberId);
    const allowedTeamMemberIds = [permissionContext.teamMemberId, ...assignedLeadGenerators];
    
    if (allowedTeamMemberIds.length > 0) {
      conditions.push(sql`${calls.teamMemberId} IN (${sql.join(allowedTeamMemberIds.map(id => sql`${id}`), sql`, `)})`);
    }
  } else if (permissionContext.teamRole === 'lead_generator' && permissionContext.teamMemberId) {
    // Lead Generator sees only own calls (same as lead_manager for now)
    conditions.push(eq(calls.teamMemberId, permissionContext.teamMemberId));
  } else if (permissionContext.teamMemberId) {
    // Fallback: if role not set but teamMemberId exists, show only own calls
    conditions.push(eq(calls.teamMemberId, permissionContext.teamMemberId));
  }

  let query = db.select().from(calls);
  
  if (conditions.length > 0) {
    query = query.where(and(...conditions)) as any;
  }

  return await query
    .orderBy(desc(calls.createdAt))
    .limit(options.limit || 50)
    .offset(options.offset || 0);
}

/**
 * Get team member IDs that a user can view based on their permissions
 */
export async function getViewableTeamMemberIds(
  permissionContext: UserPermissionContext
): Promise<number[] | 'all'> {
  if (permissionContext.teamRole === 'admin' || (permissionContext.teamRole as any) === 'super_admin') {
    return 'all';
  }
  
  if (permissionContext.teamRole === 'acquisition_manager' && permissionContext.teamMemberId) {
    const assignedLeadManagers = await getLeadManagersForAcquisitionManager(permissionContext.teamMemberId);
    return [permissionContext.teamMemberId, ...assignedLeadManagers];
  }
  
  if (permissionContext.teamRole === 'lead_manager' && permissionContext.teamMemberId) {
    const assignedLeadGenerators = await getLeadGeneratorsForLeadManager(permissionContext.teamMemberId);
    return [permissionContext.teamMemberId, ...assignedLeadGenerators];
  }
  
  if (permissionContext.teamMemberId) {
    return [permissionContext.teamMemberId];
  }
  
  return [];
}

// ============ TEAM MEMBER MANAGEMENT ============

export async function updateTeamMemberRole(
  teamMemberId: number, 
  teamRole: 'admin' | 'lead_manager' | 'acquisition_manager' | 'lead_generator'
): Promise<void> {
  const db = await getDb();
  if (!db) return;

  await db.update(teamMembers)
    .set({ teamRole })
    .where(eq(teamMembers.id, teamMemberId));
}

export async function getTeamMemberByUserId(userId: number): Promise<TeamMember | null> {
  const db = await getDb();
  if (!db) return null;

  const result = await db.select()
    .from(teamMembers)
    .where(eq(teamMembers.userId, userId))
    .limit(1);
  
  return result[0] || null;
}

export async function linkUserToTeamMember(userId: number, teamMemberId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;

  await db.update(teamMembers)
    .set({ userId })
    .where(eq(teamMembers.id, teamMemberId));
}

export async function getAllUsers(tenantId?: number): Promise<Array<{
  id: number;
  openId: string;
  name: string | null;
  email: string | null;
  role: string;
  teamRole: string | null;
  teamMemberId: number | null;
  createdAt: Date;
  lastSignedIn: Date;
}>> {
  const db = await getDb();
  if (!db) return [];

  // Get users filtered by tenant if tenantId is provided
  const allUsers = tenantId 
    ? await db.select().from(users).where(eq(users.tenantId, tenantId)).orderBy(desc(users.lastSignedIn))
    : await db.select().from(users).orderBy(desc(users.lastSignedIn));
  
  // Get team members filtered by tenant if tenantId is provided
  const allTeamMembers = tenantId
    ? await db.select().from(teamMembers).where(eq(teamMembers.tenantId, tenantId))
    : await db.select().from(teamMembers);
  
  return allUsers.map(u => {
    const linkedMember = allTeamMembers.find(tm => tm.userId === u.id);
    return {
      id: u.id,
      openId: u.openId,
      name: u.name,
      email: u.email,
      role: u.role,
      teamRole: u.teamRole,
      teamMemberId: linkedMember?.id || null,
      createdAt: u.createdAt,
      lastSignedIn: u.lastSignedIn,
    };
  });
}

export async function updateUserTeamRole(
  userId: number, 
  teamRole: 'admin' | 'lead_manager' | 'acquisition_manager' | 'lead_generator'
): Promise<void> {
  const db = await getDb();
  if (!db) return;

  await db.update(users)
    .set({ teamRole })
    .where(eq(users.id, userId));
}


// ============ EMAIL SENT TRACKING ============

export async function getEmailSentRecord(userId: number, emailId: string): Promise<EmailSent | null> {
  const db = await getDb();
  if (!db) return null;

  const result = await db.select()
    .from(emailsSent)
    .where(and(eq(emailsSent.userId, userId), eq(emailsSent.emailId, emailId)))
    .limit(1);
  
  return result[0] || null;
}

export async function recordEmailSent(userId: number, emailId: string, loopsEventId?: string): Promise<void> {
  const db = await getDb();
  if (!db) return;

  await db.insert(emailsSent).values({
    userId,
    emailId,
    loopsEventId,
    status: "sent",
  });
}

export async function getEmailsSentToUser(userId: number): Promise<EmailSent[]> {
  const db = await getDb();
  if (!db) return [];

  return await db.select()
    .from(emailsSent)
    .where(eq(emailsSent.userId, userId))
    .orderBy(desc(emailsSent.sentAt));
}

// ============ EMAIL SEQUENCE JOB HELPERS ============

interface UserForEmailSequence {
  id: number;
  email: string;
  name: string | null;
  createdAt: Date;
  tenantId: number;
  tenantName: string;
  callsGraded: number;
  isSubscribed: boolean;
  trialEndsAt: Date | null;
  planType: string | null;
}

export async function getUsersForEmailSequence(): Promise<UserForEmailSequence[]> {
  const db = await getDb();
  if (!db) return [];

  // Get all users with their tenant info
  const usersWithTenants = await db.select({
    id: users.id,
    email: users.email,
    name: users.name,
    createdAt: users.createdAt,
    tenantId: users.tenantId,
    tenantName: tenants.name,
    trialEndsAt: tenants.trialEndsAt,
    subscriptionTier: tenants.subscriptionTier,
    subscriptionStatus: tenants.subscriptionStatus,
  })
  .from(users)
  .leftJoin(tenants, eq(users.tenantId, tenants.id))
  .where(sql`${users.email} IS NOT NULL AND ${users.tenantId} IS NOT NULL`);

  // Get call counts for each user's tenant
  const result: UserForEmailSequence[] = [];
  
  for (const user of usersWithTenants) {
    if (!user.email || !user.tenantId) continue;

    // Count graded calls for this tenant
    const callCountResult = await db.select({ count: sql<number>`COUNT(*)` })
      .from(calls)
      .where(sql`${calls.tenantId} = ${user.tenantId} AND ${calls.status} = 'graded'`);
    
    const callsGraded = callCountResult[0]?.count || 0;
    const isSubscribed = user.subscriptionTier !== "trial" && user.subscriptionStatus === "active";
    
    result.push({
      id: user.id,
      email: user.email,
      name: user.name,
      createdAt: user.createdAt,
      tenantId: user.tenantId,
      tenantName: user.tenantName || "Unknown",
      callsGraded,
      isSubscribed,
      trialEndsAt: user.trialEndsAt,
      planType: user.subscriptionTier,
    });
  }

  return result;
}
