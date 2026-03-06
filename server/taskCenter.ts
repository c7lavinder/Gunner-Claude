/**
 * Task Center Service
 * 
 * Uses the GHL location-level task search API (POST /locations/:locationId/tasks/search)
 * to fetch ALL pending tasks in a single paginated call. This endpoint returns
 * contact names and assignee details inline, making it fast and reliable.
 * 
 * Requires the `locations/tasks.readonly` OAuth scope.
 * 
 * Uses an in-memory cache with 5-minute TTL to avoid hammering the GHL API
 * on every page load / auto-refresh.
 */

import {
  getCredentialsForTenant,
  ghlFetch,
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
  contactAddress?: string;
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

function getCachedTasks(key: string): GHLTask[] | null {
  const cached = taskCache.get(key);
  if (!cached) return null;
  if (Date.now() - cached.fetchedAt > CACHE_TTL_MS) {
    taskCache.delete(key);
    return null;
  }
  return cached.tasks;
}

/**
 * Clear the task cache for a tenant so the next fetch pulls fresh data from GHL.
 */
export function clearTaskCache(tenantId: number): void {
  const keysToDelete: string[] = [];
  const allKeys = Array.from(taskCache.keys());
  for (const key of allKeys) {
    if (key.startsWith(`tasks:${tenantId}`)) {
      keysToDelete.push(key);
    }
  }
  for (const key of keysToDelete) {
    taskCache.delete(key);
  }
  console.log(`[TaskCenter] Cleared ${keysToDelete.length} cache entries for tenant ${tenantId}`);
}

// ─── CONTACT ADDRESS CACHE ─────────────────────────────
// The location task search API returns contactDetails with firstName/lastName
// but NOT the address. We cache addresses from GHL contacts/search to enrich tasks.

interface ContactCacheEntry {
  address: string;
  phone: string;
  email: string;
}
const contactInfoCache = new Map<string, ContactCacheEntry>(); // contactId -> { address, phone, email }
let contactInfoCacheFetchedAt = 0;
const CONTACT_INFO_CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

/**
 * Bulk-fetch contact addresses from GHL contacts/search and cache them.
 * Only re-fetches if the cache is stale.
 */
async function ensureContactInfoCache(
  creds: { apiKey: string; locationId: string }
): Promise<void> {
  if (Date.now() - contactInfoCacheFetchedAt < CONTACT_INFO_CACHE_TTL_MS && contactInfoCache.size > 0) {
    return; // Cache is still fresh
  }

  console.log("[TaskCenter] Refreshing contact info cache from GHL contacts/search...");
  const PAGE_SIZE = 100;
  const MAX_PAGES = 20; // Up to 2000 contacts

  for (let page = 1; page <= MAX_PAGES; page++) {
    try {
      const data = await ghlFetch(
        creds as any,
        `/contacts/search`,
        "POST",
        {
          locationId: creds.locationId,
          page,
          pageLimit: PAGE_SIZE,
          sort: [{ field: "dateUpdated", direction: "desc" }],
        }
      );

      const contacts = data.contacts || [];
      for (const c of contacts) {
        if (c.id) {
          const addressParts = [c.address, c.city, c.state, c.postalCode].filter(Boolean);
          contactInfoCache.set(c.id, {
            address: addressParts.join(", "),
            phone: c.phone || "",
            email: c.email || "",
          });
        }
      }

      if (contacts.length < PAGE_SIZE) break;
    } catch (error: any) {
      console.warn(`[TaskCenter] Contact info cache page ${page} failed:`, error?.message);
      break;
    }
  }

  contactInfoCacheFetchedAt = Date.now();
  console.log(`[TaskCenter] Contact info cache refreshed: ${contactInfoCache.size} contacts`);
}

// ─── TASK SEARCH ────────────────────────────────────────

/**
 * Fetch ALL pending tasks for a tenant using the GHL location-level task search API.
 * 
 * POST /locations/:locationId/tasks/search
 * 
 * This endpoint returns tasks with contactDetails (firstName, lastName) and
 * assignedToUserDetails inline. It supports cursor-based pagination via searchAfter.
 * 
 * Typical response time: ~1-2 seconds for 250+ tasks.
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

  // Check cache first
  const cacheKey = `tasks:${tenantId}`;
  const cached = getCachedTasks(cacheKey);
  if (cached) {
    console.log(`[TaskCenter] Returning ${cached.length} cached tasks for tenant ${tenantId}`);
    return applyTaskFilters(cached, options);
  }

  try {
    // Fetch all pending tasks from GHL location-level API
    const allTasks: GHLTask[] = [];
    let searchAfter: number[] | null = null;
    const PAGE_SIZE = 100;
    const MAX_PAGES = 20; // Safety limit: up to 2000 tasks

    for (let page = 0; page < MAX_PAGES; page++) {
      const body: any = { completed: false, limit: PAGE_SIZE };
      if (searchAfter) body.searchAfter = searchAfter;

      const data = await ghlFetch(
        creds as any,
        `/locations/${creds.locationId}/tasks/search`,
        "POST",
        body
      );

      const tasks = data.tasks || [];

      for (const t of tasks) {
        const firstName = t.contactDetails?.firstName || "";
        const lastName = t.contactDetails?.lastName || "";
        const contactName = `${firstName} ${lastName}`.trim();

        allTasks.push({
          id: t._id || t.id,
          title: t.title || "Untitled Task",
          body: t.body || "",
          assignedTo: t.assignedTo || "",
          dueDate: t.dueDate || "",
          completed: !!t.completed,
          contactId: t.contactId || "",
          contactName: contactName
            ? contactName.split(" ").map((w: string) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(" ")
            : "",
          contactPhone: "",
          contactEmail: "",
          contactAddress: "", // Will be enriched from address cache below
        });
      }

      // Check if there are more pages
      if (tasks.length < PAGE_SIZE) break;

      const lastTask = tasks[tasks.length - 1];
      if (lastTask?.searchAfter) {
        searchAfter = lastTask.searchAfter;
      } else {
        break;
      }
    }

    console.log(`[TaskCenter] Fetched ${allTasks.length} pending tasks from GHL location API (tenant ${tenantId})`);

    // Enrich tasks with contact info (address, phone, email) from cache
    try {
      await ensureContactInfoCache(creds);
      for (const task of allTasks) {
        if (task.contactId && contactInfoCache.has(task.contactId)) {
          const info = contactInfoCache.get(task.contactId)!;
          task.contactAddress = info.address;
          task.contactPhone = info.phone;
          task.contactEmail = info.email;
        }
      }
    } catch (err: any) {
      console.warn("[TaskCenter] Contact info enrichment failed (non-fatal):", err?.message);
    }

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
      (t.contactName && t.contactName.toLowerCase().includes(q)) ||
      (t.contactAddress && t.contactAddress.toLowerCase().includes(q))
    );
  }
  return filtered;
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
): Promise<Array<{ id: number; name: string; ghlUserId: string | null; teamRole: string; lcPhones: string | null; lcPhone: string | null }>> {
  const db = await getDb();
  if (!db) return [];

  try {
    const members = await db
      .select({
        id: teamMembers.id,
        name: teamMembers.name,
        ghlUserId: teamMembers.ghlUserId,
        teamRole: teamMembers.teamRole,
        lcPhones: teamMembers.lcPhones,
        lcPhone: teamMembers.lcPhone,
      })
      .from(teamMembers)
      .where(eq(teamMembers.tenantId, tenantId));

    return members.map((m) => ({
      id: m.id,
      name: m.name,
      ghlUserId: m.ghlUserId,
      teamRole: m.teamRole,
      lcPhones: m.lcPhones ?? null,
      lcPhone: m.lcPhone ?? null,
    }));
  } catch (error) {
    console.error("[TaskCenter] getTeamMembersForFilter error:", error);
    return [];
  }
}
