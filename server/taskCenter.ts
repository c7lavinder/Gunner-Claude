/**
 * Task Center Service
 * 
 * Fetches tasks per-contact from GHL (using the contacts.readonly scope),
 * enriches them with grouping and team member names, and provides
 * contact context for the Lead Command Center page.
 * 
 * Uses an in-memory cache with 5-minute TTL to avoid hammering the GHL API
 * on every page load / auto-refresh.
 */

import {
  getCredentialsForTenant,
  ghlFetch,
  getTasksForContact,
} from "./ghlActions";
import { getDb } from "./db";
import { calls, callGrades, teamMembers } from "../drizzle/schema";
import { eq, and, desc, isNotNull, sql } from "drizzle-orm";

// ─── TYPES ──────────────────────────────────────────────

export interface GHLTask {
  id: string;
  title: string;
  body?: string;
  assignedTo: string; // GHL user ID
  dueDate: string; // ISO date string
  completed: boolean;
  contactId: string;
  contactName?: string;
  contactPhone?: string;
  contactEmail?: string;
}

export interface TaskWithContext extends GHLTask {
  overdueDays: number;
  group: "overdue" | "today" | "upcoming";
  assignedMemberName?: string;
}

export interface TaskContactContext {
  contactId: string;
  contactName: string;
  contactPhone: string;
  contactEmail: string;
  recentNotes: Array<{ id: string; body: string; dateAdded: string }>;
  lastCallSummary: string | null;
  lastCallDate: string | null;
  lastCallGrade: string | null;
  lastCallId: number | null;
}

// ─── TASK CACHE ────────────────────────────────────────

interface CachedTaskResult {
  tasks: GHLTask[];
  fetchedAt: number;
}

const taskCache = new Map<string, CachedTaskResult>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

function getCacheKey(tenantId: number, assignedTo?: string[]): string {
  const assignedKey = assignedTo ? assignedTo.sort().join(",") : "all";
  return `${tenantId}:${assignedKey}`;
}

function getCachedTasks(key: string): GHLTask[] | null {
  const cached = taskCache.get(key);
  if (!cached) return null;
  if (Date.now() - cached.fetchedAt > CACHE_TTL_MS) {
    taskCache.delete(key);
    return null;
  }
  return cached.tasks;
}

// ─── TASK SEARCH ────────────────────────────────────────

/**
 * Fetch tasks across all contacts for a tenant.
 * 
 * Strategy:
 * 1. Use GHL POST /contacts/search to get recently updated contacts (broad pool)
 * 2. Also include contacts from our calls DB (ensures we cover active leads)
 * 3. Fetch tasks for each unique contact in parallel (batches of 10)
 * 4. Cache for 5 minutes to avoid excessive API calls
 * 
 * The GHL location has ~14k contacts. We scan the 500 most recently updated
 * ones plus any contacts with call history in Gunner. This gives broad
 * coverage without hitting API rate limits.
 */
export async function searchLocationTasks(
  tenantId: number,
  options: {
    assignedTo?: string[];
    completed?: boolean;
    query?: string;
    limit?: number;
    skip?: number;
  } = {}
): Promise<GHLTask[]> {
  const creds = await getCredentialsForTenant(tenantId);
  if (!creds) throw new Error("No GHL credentials configured");

  // Check cache first (use a single cache key per tenant for the full set)
  const cacheKey = `tasks:${tenantId}`;
  const cached = getCachedTasks(cacheKey);
  if (cached) {
    console.log(`[TaskCenter] Returning ${cached.length} cached tasks for tenant ${tenantId}`);
    return applyTaskFilters(cached, options);
  }

  try {
    // Step 1: Get recently updated contacts from GHL (broad pool)
    const ghlContactIds = await getRecentGHLContactIds(creds, 500);
    console.log(`[TaskCenter] Got ${ghlContactIds.size} contacts from GHL search (tenant ${tenantId})`);

    // Step 2: Also get contacts from our calls DB
    const dbContactIds = await getCallsDBContactIds(tenantId, 200);
    console.log(`[TaskCenter] Got ${dbContactIds.length} contacts from calls DB (tenant ${tenantId})`);

    // Merge into a unique set
    for (const id of dbContactIds) {
      ghlContactIds.add(id);
    }

    const allContactIds = Array.from(ghlContactIds);
    console.log(`[TaskCenter] Total unique contacts to scan: ${allContactIds.length}`);

    if (allContactIds.length === 0) {
      return [];
    }

    // Step 3: Fetch tasks for all contacts in parallel batches
    const allTasks: GHLTask[] = [];
    const BATCH_SIZE = 15;

    for (let i = 0; i < allContactIds.length; i += BATCH_SIZE) {
      const batch = allContactIds.slice(i, i + BATCH_SIZE);
      const batchResults = await Promise.all(
        batch.map(async (contactId) => {
          try {
            const tasks = await getTasksForContact(tenantId, contactId);
            return tasks.map((t: any) => ({
              id: t.id,
              title: t.title || "Untitled Task",
              body: t.body || "",
              assignedTo: t.assignedTo || "",
              dueDate: t.dueDate || "",
              completed: !!t.completed,
              contactId,
              contactName: "",
              contactPhone: "",
              contactEmail: "",
            }));
          } catch (error: any) {
            // Silently skip contacts that fail (deleted, etc.)
            return [];
          }
        })
      );

      for (const tasks of batchResults) {
        allTasks.push(...tasks);
      }
    }

    console.log(`[TaskCenter] Fetched ${allTasks.length} total tasks from ${allContactIds.length} contacts`);

    // Cache ALL tasks (before filtering)
    taskCache.set(cacheKey, { tasks: allTasks, fetchedAt: Date.now() });

    return applyTaskFilters(allTasks, options);
  } catch (error: any) {
    console.error("[TaskCenter] searchLocationTasks error:", error?.message || error);
    return [];
  }
}

/**
 * Apply filters (assignedTo, completed, query) to a task list.
 */
function applyTaskFilters(
  tasks: GHLTask[],
  options: { assignedTo?: string[]; completed?: boolean; query?: string }
): GHLTask[] {
  let filtered = tasks;
  if (options.assignedTo && options.assignedTo.length > 0) {
    filtered = filtered.filter(t => options.assignedTo!.includes(t.assignedTo));
  }
  if (options.completed === false) {
    filtered = filtered.filter(t => !t.completed);
  } else if (options.completed === true) {
    filtered = filtered.filter(t => t.completed);
  }
  if (options.query) {
    const q = options.query.toLowerCase();
    filtered = filtered.filter(t =>
      t.title.toLowerCase().includes(q) ||
      (t.contactName && t.contactName.toLowerCase().includes(q))
    );
  }
  return filtered;
}

/**
 * Get recently updated contact IDs from GHL using POST /contacts/search.
 * Paginates through up to `maxContacts` contacts sorted by most recently updated.
 */
async function getRecentGHLContactIds(
  creds: { apiKey: string; locationId: string },
  maxContacts: number
): Promise<Set<string>> {
  const contactIds = new Set<string>();
  const PAGE_SIZE = 100;
  const maxPages = Math.ceil(maxContacts / PAGE_SIZE);

  for (let page = 1; page <= maxPages; page++) {
    try {
      const data = await ghlFetch(
        creds as any,
        `/contacts/search`,
        "POST",
        {
          locationId: creds.locationId,
          page,
          pageLimit: PAGE_SIZE,
          // Sort by most recently updated to get active contacts first
          sort: { field: "dateUpdated", direction: "desc" },
        }
      );

      const contacts = data.contacts || [];
      for (const c of contacts) {
        if (c.id) contactIds.add(c.id);
      }

      // Stop if we got fewer than a full page (no more results)
      if (contacts.length < PAGE_SIZE) break;
    } catch (error: any) {
      console.warn(`[TaskCenter] GHL contacts/search page ${page} failed:`, error?.message);
      break;
    }
  }

  return contactIds;
}

/**
 * Get contact IDs from our calls database (contacts with call history).
 */
async function getCallsDBContactIds(
  tenantId: number,
  limit: number
): Promise<string[]> {
  const db = await getDb();
  if (!db) return [];

  try {
    const contactRows = await db
      .select({
        ghlContactId: calls.ghlContactId,
      })
      .from(calls)
      .where(
        and(
          eq(calls.tenantId, tenantId),
          isNotNull(calls.ghlContactId)
        )
      )
      .groupBy(calls.ghlContactId)
      .orderBy(desc(sql`MAX(${calls.createdAt})`))
      .limit(limit);

    return contactRows
      .map(r => r.ghlContactId)
      .filter((id): id is string => !!id);
  } catch (error) {
    console.error("[TaskCenter] getCallsDBContactIds error:", error);
    return [];
  }
}

/**
 * Enrich tasks with grouping (overdue/today/upcoming), overdue days,
 * and team member names.
 */
export function enrichTasks(
  tasks: GHLTask[],
  teamMemberMap: Map<string, string> // ghlUserId -> member name
): TaskWithContext[] {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const todayEnd = new Date(todayStart);
  todayEnd.setDate(todayEnd.getDate() + 1);

  return tasks
    .map((task) => {
      const dueDate = task.dueDate ? new Date(task.dueDate) : null;
      let group: "overdue" | "today" | "upcoming" = "upcoming";
      let overdueDays = 0;

      if (dueDate) {
        if (dueDate < todayStart) {
          group = "overdue";
          overdueDays = Math.ceil(
            (todayStart.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24)
          );
        } else if (dueDate < todayEnd) {
          group = "today";
        } else {
          group = "upcoming";
        }
      }

      return {
        ...task,
        overdueDays,
        group,
        assignedMemberName: teamMemberMap.get(task.assignedTo) || undefined,
      };
    })
    .sort((a, b) => {
      // Sort: overdue first (most overdue at top), then today, then upcoming
      const groupOrder = { overdue: 0, today: 1, upcoming: 2 };
      if (groupOrder[a.group] !== groupOrder[b.group]) {
        return groupOrder[a.group] - groupOrder[b.group];
      }
      // Within same group, sort by due date ascending
      const aDate = a.dueDate ? new Date(a.dueDate).getTime() : 0;
      const bDate = b.dueDate ? new Date(b.dueDate).getTime() : 0;
      return aDate - bDate;
    });
}

// ─── CONTACT CONTEXT ────────────────────────────────────

/**
 * Get contact notes from GHL
 */
export async function getContactNotes(
  tenantId: number,
  contactId: string,
  limit: number = 5
): Promise<Array<{ id: string; body: string; dateAdded: string }>> {
  const creds = await getCredentialsForTenant(tenantId);
  if (!creds) return [];

  try {
    const data = await ghlFetch(
      creds,
      `/contacts/${contactId}/notes`,
      "GET"
    );
    const notes = data.notes || [];
    return notes
      .slice(0, limit)
      .map((n: any) => ({
        id: n.id,
        body: n.body || "",
        dateAdded: n.dateAdded || n.createdAt || "",
      }));
  } catch (error) {
    console.error("[TaskCenter] getContactNotes error:", error);
    return [];
  }
}

/**
 * Get the last graded call summary for a contact from Gunner's database.
 */
export async function getLastCallSummary(
  tenantId: number,
  ghlContactId: string
): Promise<{
  summary: string | null;
  callDate: string | null;
  grade: string | null;
  callId: number | null;
} | null> {
  const db = await getDb();
  if (!db) return null;

  try {
    const result = await db
      .select({
        callId: calls.id,
        createdAt: calls.createdAt,
        summary: callGrades.summary,
        grade: callGrades.overallGrade,
      })
      .from(calls)
      .leftJoin(callGrades, eq(callGrades.callId, calls.id))
      .where(
        and(
          eq(calls.tenantId, tenantId),
          eq(calls.ghlContactId, ghlContactId),
          eq(calls.status, "completed")
        )
      )
      .orderBy(desc(calls.createdAt))
      .limit(1);

    if (result.length === 0) return null;

    const row = result[0];
    return {
      summary: row.summary || null,
      callDate: row.createdAt ? row.createdAt.toISOString() : null,
      grade: row.grade || null,
      callId: row.callId,
    };
  } catch (error) {
    console.error("[TaskCenter] getLastCallSummary error:", error);
    return null;
  }
}

/**
 * Get full context for a task's contact: notes, last call summary, contact details.
 */
export async function getTaskContactContext(
  tenantId: number,
  contactId: string
): Promise<TaskContactContext> {
  const { getContact } = await import("./ghlActions");

  // Fetch in parallel
  const [contact, notes, lastCall] = await Promise.all([
    getContact(tenantId, contactId),
    getContactNotes(tenantId, contactId, 5),
    getLastCallSummary(tenantId, contactId),
  ]);

  return {
    contactId,
    contactName: contact?.name || "Unknown",
    contactPhone: contact?.phone || "",
    contactEmail: contact?.email || "",
    recentNotes: notes,
    lastCallSummary: lastCall?.summary || null,
    lastCallDate: lastCall?.callDate || null,
    lastCallGrade: lastCall?.grade || null,
    lastCallId: lastCall?.callId || null,
  };
}

// ─── TEAM MEMBER MAPPING ────────────────────────────────

/**
 * Build a map of GHL user ID -> team member name for a tenant.
 */
export async function getTeamMemberGhlMap(
  tenantId: number
): Promise<Map<string, string>> {
  const db = await getDb();
  if (!db) return new Map();

  try {
    const members = await db
      .select({
        id: teamMembers.id,
        name: teamMembers.name,
        ghlUserId: teamMembers.ghlUserId,
      })
      .from(teamMembers)
      .where(
        and(
          eq(teamMembers.tenantId, tenantId),
          isNotNull(teamMembers.ghlUserId)
        )
      );

    const map = new Map<string, string>();
    for (const m of members) {
      if (m.ghlUserId) {
        map.set(m.ghlUserId, m.name);
      }
    }
    return map;
  } catch (error) {
    console.error("[TaskCenter] getTeamMemberGhlMap error:", error);
    return new Map();
  }
}

/**
 * Get the list of team members with their GHL user IDs for the filter dropdown.
 */
export async function getTeamMembersForFilter(
  tenantId: number
): Promise<Array<{ id: number; name: string; ghlUserId: string | null }>> {
  const db = await getDb();
  if (!db) return [];

  try {
    const members = await db
      .select({
        id: teamMembers.id,
        name: teamMembers.name,
        ghlUserId: teamMembers.ghlUserId,
      })
      .from(teamMembers)
      .where(eq(teamMembers.tenantId, tenantId));

    return members.map((m) => ({
      id: m.id,
      name: m.name,
      ghlUserId: m.ghlUserId,
    }));
  } catch (error) {
    console.error("[TaskCenter] getTeamMembersForFilter error:", error);
    return [];
  }
}
